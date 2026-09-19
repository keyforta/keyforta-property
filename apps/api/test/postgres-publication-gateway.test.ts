import { describe, expect, it } from "vitest";

import type { DatabaseClient, DatabaseSession } from "../src/database.js";
import { createPostgresPublicListingPublicationGateway } from "../src/properties/publication-gateway.js";
import { createPostgresInventoryGateway } from "../src/properties/inventory-gateway.js";

describe("PostgreSQL public listing publication gateway", () => {
  it.each([
    [true, true],
    [false, false],
  ] as const)("resolves the actor and sets publication=%s in one transaction", async (published, changed) => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const session: DatabaseSession = {
      async query(text, parameters = []) {
        queries.push({ parameters, text });
        if (text.includes("resolve_actor") || text.includes("resolve_platform_actor")) {
          return { rows: [{ actor_id: "00000000-0000-4000-8000-000000000940" }] };
        }
        return text.includes("set_public_listing_publication")
          ? { rows: [{ changed }] }
          : { rows: [] };
      },
    };
    let transactions = 0;
    const client: DatabaseClient = {
      query: session.query,
      async transaction(operation) {
        transactions += 1;
        return operation(session);
      },
    };
    const gateway = createPostgresPublicListingPublicationGateway(client);

    await expect(gateway.setPublication({
      correlationId: "publication-request-01",
      listingId: "00000000-0000-4000-8000-000000000930",
      organizationId: "00000000-0000-4000-8000-000000000900",
      published,
      subject: "synthetic-landlord-a",
    })).resolves.toBe(changed);

    expect(transactions).toBe(1);
    expect(queries).toEqual([
      {
        parameters: [
          "synthetic-landlord-a",
          "00000000-0000-4000-8000-000000000900",
        ],
        text: expect.stringContaining("app.resolve_actor"),
      },
      {
        parameters: ["publication-request-01"],
        text: expect.stringContaining("app.correlation_id"),
      },
      {
        parameters: [
          "00000000-0000-4000-8000-000000000930",
          published,
        ],
        text: expect.stringContaining("app.set_public_listing_publication"),
      },
    ]);
  });

  it("denies an organization with no active membership without attempting mutation", async () => {
    const queries: string[] = [];
    const session: DatabaseSession = {
      async query(text) {
        queries.push(text);
        return { rows: [] };
      },
    };
    const gateway = createPostgresPublicListingPublicationGateway({
      query: session.query,
      transaction: (operation) => operation(session),
    });

    await expect(gateway.setPublication({
      correlationId: "publication-request-denied",
      listingId: "00000000-0000-4000-8000-000000000930",
      organizationId: "00000000-0000-4000-8000-000000000901",
      published: true,
      subject: "synthetic-landlord-a",
    })).resolves.toBe(false);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("app.resolve_actor");
  });

  it("activates jurisdiction policy and verification through correlated runtime commands", async () => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const session: DatabaseSession = {
      async query(text, parameters = []) {
        queries.push({ parameters, text });
        if (text.includes("resolve_actor") || text.includes("resolve_platform_actor")) {
          return { rows: [{ actor_id: "00000000-0000-4000-8000-000000000940" }] };
        }
        if (text.includes("activate_jurisdiction_policy")) {
          return {
            rows: [{
              activation_id: "00000000-0000-4000-8000-000000000960",
              jurisdiction_code: "CD-KN",
              policy_key: "property_verification",
              policy_version_id: "00000000-0000-4000-8000-000000000961",
              version: 1,
            }],
          };
        }
        if (text.includes("set_property_verification_status")) {
          return {
            rows: [{
              property_id: "00000000-0000-4000-8000-000000000910",
              verification_status: "verified",
            }],
          };
        }
        return { rows: [] };
      },
    };
    const client: DatabaseClient = {
      query: session.query,
      async transaction(operation) {
        return operation(session);
      },
    };
    const gateway = createPostgresInventoryGateway(client);

    await expect(gateway.activateJurisdictionPolicy({
      correlationId: "policy-activation-01",
      effectiveFrom: "2026-09-18T00:00:00.000Z",
      jurisdictionCode: "CD-KN",
      ownerApproval: {
        approvedByUserId: "00000000-0000-4000-8000-000000000940",
        sourceReference: "issue-79",
      },
      policyKey: "property_verification",
      requiresCounselApproval: false,
      rulePayload: {},
      subject: "synthetic-admin",
      version: 1,
    })).resolves.toEqual({
      activationId: "00000000-0000-4000-8000-000000000960",
      jurisdictionCode: "CD-KN",
      policyKey: "property_verification",
      policyVersionId: "00000000-0000-4000-8000-000000000961",
      version: 1,
    });

    await expect(gateway.setPropertyVerificationStatus({
      correlationId: "property-verify-01",
      propertyId: "00000000-0000-4000-8000-000000000910",
      status: "verified",
      subject: "synthetic-admin",
    })).resolves.toEqual({
      propertyId: "00000000-0000-4000-8000-000000000910",
      status: "verified",
    });

    expect(queries.some(({ text }) => text.includes("activate_jurisdiction_policy"))).toBe(true);
    expect(queries.some(({ text }) => text.includes("set_property_verification_status"))).toBe(true);
  });
});