import { describe, expect, it } from "vitest";

import { createPostgresLandlordOnboardingGateway } from "../src/onboarding/gateway.js";

const applicationRow = {
  applicant_name: "Ada Landlord",
  applicant_object_id: "00000000-0000-4000-8000-000000000701",
  applicant_subject: "private-subject",
  decided_at: null,
  decision_reason: null,
  id: "00000000-0000-4000-8000-000000000801",
  proposed_organization_name: "Ada Estates",
  status: "pending" as const,
  submitted_at: new Date("2026-09-16T12:00:00.000Z"),
};

describe("PostgreSQL landlord onboarding gateway", () => {
  it("submits verified identity and maps only the review projection", async () => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const gateway = createPostgresLandlordOnboardingGateway({
      async query(text, parameters = []) {
        queries.push({ parameters, text });
        return { rows: [applicationRow] };
      },
      async transaction() {
        throw new Error("unexpected transaction");
      },
    });

    const application = await gateway.submit({
      applicantName: "Ada Landlord",
      applicantObjectId: "00000000-0000-4000-8000-000000000701",
      applicantSubject: "synthetic-applicant",
      correlationId: "onboard-submit-01",
      proposedOrganizationName: "Ada Estates",
    });

    expect(queries).toEqual([{
      parameters: [
        "synthetic-applicant",
        "00000000-0000-4000-8000-000000000701",
        "Ada Landlord",
        "Ada Estates",
        "onboard-submit-01",
      ],
      text: "select * from app.submit_landlord_onboarding_application($1, $2, $3, $4, $5)",
    }]);
    expect(application).toEqual({
      applicantName: "Ada Landlord",
      decidedAt: null,
      decisionReason: null,
      id: applicationRow.id,
      proposedOrganizationName: "Ada Estates",
      status: "pending",
      submittedAt: "2026-09-16T12:00:00.000Z",
    });
    expect(application).not.toHaveProperty("applicant_subject");
    expect(application).not.toHaveProperty("applicant_object_id");
  });

  it("returns undefined when a submit or decision is not accepted", async () => {
    const gateway = createPostgresLandlordOnboardingGateway({
      async query() {
        return { rows: [] };
      },
      async transaction() {
        throw new Error("unexpected transaction");
      },
    });

    await expect(gateway.submit({
      applicantName: "Ada Landlord",
      applicantObjectId: "00000000-0000-4000-8000-000000000701",
      applicantSubject: "synthetic-applicant",
      correlationId: "onboard-submit-duplicate",
      proposedOrganizationName: "Ada Estates",
    })).resolves.toBeUndefined();
    await expect(gateway.decide({
      administratorObjectId: "00000000-0000-4000-8000-000000000702",
      administratorSubject: "synthetic-admin",
      applicationId: applicationRow.id,
      correlationId: "onboard-decision-replay",
      decision: "approved",
      reason: "Verified pilot applicant.",
    })).resolves.toBeUndefined();
  });
});