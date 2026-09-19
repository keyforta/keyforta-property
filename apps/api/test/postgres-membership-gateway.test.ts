import { describe, expect, it } from "vitest";

import { createPostgresMembershipLookupGateway } from "../src/identity/membership-gateway.js";

describe("PostgreSQL membership lookup gateway", () => {
  it("resolves memberships via app.resolve_actor_memberships within a transaction", async () => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const gateway = createPostgresMembershipLookupGateway({
      async query() {
        throw new Error("unexpected direct query outside transaction");
      },
      async transaction(operation) {
        return operation({
          async query(text, parameters = []) {
            queries.push({ parameters, text });
            return {
              rows: [
                {
                  organization_id: "00000000-0000-4000-8000-000000000900",
                  role: "landlord",
                },
              ],
            };
          },
        });
      },
    });

    const memberships = await gateway.lookupMemberships({
      subject: "synthetic-landlord",
    });

    expect(queries).toEqual([{
      parameters: ["synthetic-landlord"],
      text: "select * from app.resolve_actor_memberships($1)",
    }]);
    expect(memberships).toEqual([{
      organizationId: "00000000-0000-4000-8000-000000000900",
      role: "landlord",
    }]);
  });

  it("returns an empty array for a subject with no active memberships", async () => {
    const gateway = createPostgresMembershipLookupGateway({
      async query() {
        throw new Error("unexpected direct query outside transaction");
      },
      async transaction(operation) {
        return operation({
          async query() {
            return { rows: [] };
          },
        });
      },
    });

    const memberships = await gateway.lookupMemberships({
      subject: "synthetic-nobody",
    });

    expect(memberships).toEqual([]);
  });
});
