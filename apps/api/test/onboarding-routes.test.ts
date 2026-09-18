import { afterEach, describe, expect, it } from "vitest";
import {
  landlordOnboardingApplicationEnvelopeSchema,
  landlordOnboardingApplicationListEnvelopeSchema,
} from "@keyforta/contracts";

import { buildApp, isAuthorizedPlatformAdminAction } from "../src/app.js";
import type {
  DecideLandlordOnboardingCommand,
  LandlordOnboardingGateway,
  SubmitLandlordOnboardingCommand,
} from "../src/onboarding/gateway.js";

const adminObjectId = "00000000-0000-4000-8000-000000000702";
const applicantObjectId = "00000000-0000-4000-8000-000000000701";
const applicationId = "00000000-0000-4000-8000-000000000801";
const pendingApplication = {
  applicantName: "Ada Landlord",
  decidedAt: null,
  decisionReason: null,
  id: applicationId,
  proposedOrganizationName: "Ada Estates",
  status: "pending" as const,
  submittedAt: "2026-09-16T12:00:00.000Z",
};
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function dependencies(options: { rejectDecision?: boolean; rejectSubmit?: boolean } = {}) {
  const decisions: DecideLandlordOnboardingCommand[] = [];
  const submissions: SubmitLandlordOnboardingCommand[] = [];
  let listCalls = 0;
  const landlordOnboarding: LandlordOnboardingGateway = {
    async decide(command) {
      decisions.push(command);
      return options.rejectDecision
        ? undefined
        : {
            ...pendingApplication,
            decidedAt: "2026-09-16T12:30:00.000Z",
            decisionReason: command.reason,
            status: command.decision,
          };
    },
    async list() {
      listCalls += 1;
      return [pendingApplication];
    },
    async submit(command) {
      submissions.push(command);
      return options.rejectSubmit ? undefined : pendingApplication;
    },
  };
  return {
    authenticator: {
      async authenticate(authorization: string) {
        if (authorization === "Bearer applicant-token") {
          return { objectId: applicantObjectId, subject: "synthetic-applicant" };
        }
        if (authorization === "Bearer admin-token") {
          return { objectId: adminObjectId, subject: "synthetic-admin" };
        }
        if (authorization === "Bearer outsider-token") {
          return {
            objectId: "00000000-0000-4000-8000-000000000799",
            subject: "synthetic-outsider",
          };
        }
        return undefined;
      },
    },
    decisions,
    get listCalls() { return listCalls; },
    landlordOnboarding,
    platformAdminObjectIds: new Set([adminObjectId]),
    submissions,
  };
}

describe("landlord onboarding routes", () => {
  it("requires authentication before accepting an application", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      payload: {
        applicantName: "Ada Landlord",
        proposedOrganizationName: "Ada Estates",
      },
      url: "/api/v1/landlord-onboarding-applications",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
    expect(configured.submissions).toEqual([]);
  });

  it("submits one application using only verified principal identity", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: "Bearer applicant-token",
        "x-request-id": "onboard-submit-01",
      },
      method: "POST",
      payload: {
        applicantName: "Ada Landlord",
        applicantObjectId: adminObjectId,
        proposedOrganizationName: "Ada Estates",
      },
      url: "/api/v1/landlord-onboarding-applications",
    });

    expect(response.statusCode).toBe(400);
    expect(configured.submissions).toEqual([]);

    const accepted = await app.inject({
      headers: {
        authorization: "Bearer applicant-token",
        "x-request-id": "onboard-submit-02",
      },
      method: "POST",
      payload: {
        applicantName: "Ada Landlord",
        proposedOrganizationName: "Ada Estates",
      },
      url: "/api/v1/landlord-onboarding-applications",
    });
    expect(accepted.statusCode).toBe(201);
    landlordOnboardingApplicationEnvelopeSchema.parse(accepted.json());
    expect(configured.submissions).toEqual([{
      applicantName: "Ada Landlord",
      applicantObjectId,
      applicantSubject: "synthetic-applicant",
      correlationId: "onboard-submit-02",
      proposedOrganizationName: "Ada Estates",
    }]);
    expect(accepted.body).not.toContain("synthetic-applicant");
    expect(accepted.body).not.toContain(applicantObjectId);
  });

  it("returns a conflict for a duplicate pending application", async () => {
    const configured = dependencies({ rejectSubmit: true });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer applicant-token" },
      method: "POST",
      payload: {
        applicantName: "Ada Landlord",
        proposedOrganizationName: "Ada Estates",
      },
      url: "/api/v1/landlord-onboarding-applications",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("PENDING_APPLICATION_EXISTS");
  });

  it("rate limits onboarding submissions by client address before the gateway", async () => {
    const configured = dependencies();
    const app = await buildApp({
      ...configured,
      landlordOnboardingRateLimitMax: 1,
    });
    apps.push(app);

    const first = await app.inject({
      headers: { authorization: "Bearer applicant-token" },
      method: "POST",
      payload: {
        applicantName: "Ada Landlord",
        proposedOrganizationName: "Ada Estates",
      },
      remoteAddress: "203.0.113.10",
      url: "/api/v1/landlord-onboarding-applications",
    });
    const limited = await app.inject({
      headers: { authorization: "Bearer applicant-token" },
      method: "POST",
      payload: {
        applicantName: "Grace Landlord",
        proposedOrganizationName: "Grace Estates",
      },
      remoteAddress: "203.0.113.10",
      url: "/api/v1/landlord-onboarding-applications",
    });

    expect(first.statusCode).toBe(201);
    expect(limited.statusCode).toBe(429);
    expect(configured.submissions).toHaveLength(1);
  });

  it("allows an allowlisted object ID to list and decide without an organization header", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const listed = await app.inject({
      headers: { authorization: "Bearer admin-token" },
      method: "GET",
      url: "/api/v1/landlord-onboarding-applications",
    });
    const decided = await app.inject({
      headers: {
        authorization: "Bearer admin-token",
        "x-request-id": "onboard-approve-01",
      },
      method: "POST",
      payload: { decision: "approved", reason: "Verified pilot applicant." },
      url: `/api/v1/landlord-onboarding-applications/${applicationId}/decision`,
    });

    expect(listed.statusCode).toBe(200);
    landlordOnboardingApplicationListEnvelopeSchema.parse(listed.json());
    expect(listed.json().items).toEqual([pendingApplication]);
    expect(decided.statusCode).toBe(200);
    landlordOnboardingApplicationEnvelopeSchema.parse(decided.json());
    expect(configured.decisions).toEqual([{
      administratorObjectId: adminObjectId,
      administratorSubject: "synthetic-admin",
      applicationId,
      correlationId: "onboard-approve-01",
      decision: "approved",
      reason: "Verified pilot applicant.",
    }]);
  });

  it("supports rejection and fails a replay safely", async () => {
    const configured = dependencies({ rejectDecision: true });
    const app = await buildApp(configured);
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer admin-token" },
      method: "POST",
      payload: { decision: "rejected", reason: "Identity evidence incomplete." },
      url: `/api/v1/landlord-onboarding-applications/${applicationId}/decision`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("APPLICATION_NOT_PENDING");
    expect(configured.decisions[0]?.decision).toBe("rejected");
  });

  it("does not disclose applications to a non-allowlisted identity", async () => {
    const configured = dependencies();
    const app = await buildApp(configured);
    apps.push(app);

    const responses = await Promise.all([
      app.inject({
        headers: { authorization: "Bearer outsider-token" },
        method: "GET",
        url: "/api/v1/landlord-onboarding-applications",
      }),
      app.inject({
        headers: { authorization: "Bearer outsider-token" },
        method: "POST",
        payload: { decision: "approved", reason: "Should not be evaluated." },
        url: `/api/v1/landlord-onboarding-applications/${applicationId}/decision`,
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
      expect(response.body).not.toContain("Ada");
      expect(response.body).not.toContain(applicationId);
    }
    expect(configured.listCalls).toBe(0);
    expect(configured.decisions).toEqual([]);
  });

  it("evaluates review access through the shared authorization module", () => {
    const allowlisted = new Set([adminObjectId]);

    // A principal not on the allowlist is denied by the shared authorization
    // module, distinguishing it from the legacy check below.
    expect(
      isAuthorizedPlatformAdminAction(
        { objectId: applicantObjectId, subject: "synthetic-applicant" },
        "review_onboarding_applications",
        { platformAdminObjectIds: allowlisted },
      ),
    ).toBe(false);

    // An unknown action outside the platform_admin capability set is denied
    // even for an allowlisted identity: the module checks the action, the
    // legacy allowlist-only path (see below) would not.
    expect(
      isAuthorizedPlatformAdminAction(
        { objectId: adminObjectId, subject: "synthetic-admin" },
        "an_action_not_in_the_capability_list",
        { platformAdminObjectIds: allowlisted },
      ),
    ).toBe(false);

    expect(
      isAuthorizedPlatformAdminAction(
        { objectId: adminObjectId, subject: "synthetic-admin" },
        "review_onboarding_applications",
        { platformAdminObjectIds: allowlisted },
      ),
    ).toBe(true);
  });

  it("falls back to the legacy allowlist check when the authorization module is disabled", () => {
    const allowlisted = new Set([adminObjectId]);

    // With the module disabled, an unknown action is still granted for an
    // allowlisted identity: this is the behavioral difference from the
    // enabled path exercised above, proving the flag actually switches
    // implementations rather than being ignored.
    expect(
      isAuthorizedPlatformAdminAction(
        { objectId: adminObjectId, subject: "synthetic-admin" },
        "an_action_not_in_the_capability_list",
        { platformAdminObjectIds: allowlisted, useAuthorizationModule: false },
      ),
    ).toBe(true);

    expect(
      isAuthorizedPlatformAdminAction(
        { objectId: applicantObjectId, subject: "synthetic-applicant" },
        "review_onboarding_applications",
        { platformAdminObjectIds: allowlisted, useAuthorizationModule: false },
      ),
    ).toBe(false);
  });

  it("wires the authorization flag end-to-end through the onboarding-review route", async () => {
    const configured = { ...dependencies(), useAuthorizationModule: false };
    const app = await buildApp(configured);
    apps.push(app);

    const allowlisted = await app.inject({
      headers: { authorization: "Bearer admin-token" },
      method: "GET",
      url: "/api/v1/landlord-onboarding-applications",
    });
    const notAllowlisted = await app.inject({
      headers: { authorization: "Bearer applicant-token" },
      method: "GET",
      url: "/api/v1/landlord-onboarding-applications",
    });

    expect(allowlisted.statusCode).toBe(200);
    expect(notAllowlisted.statusCode).toBe(404);
  });
});
