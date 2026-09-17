import { describe, expect, it } from "vitest";

import type { DatabaseClient, DatabaseSession } from "../src/database.js";
import { createPostgresPublicListingPublicationGateway } from "../src/properties/publication-gateway.js";

describe("PostgreSQL public listing publication gateway", () => {
  it.each([
    [true, true],
    [false, false],
  ] as const)("resolves the actor and sets publication=%s in one transaction", async (published, changed) => {
    const queries: Array<{ parameters: readonly unknown[]; text: string }> = [];
    const session: DatabaseSession = {
      async query(text, parameters = []) {
        queries.push({ parameters, text });
        if (text.includes("resolve_actor")) {
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
});