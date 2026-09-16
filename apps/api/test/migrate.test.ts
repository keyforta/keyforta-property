import { afterEach, describe, expect, it, vi } from "vitest";

import { mapRuntimePrincipal } from "../src/migrate.js";

describe("mapRuntimePrincipal", () => {
  afterEach(() => {
    delete process.env.DATABASE_RUNTIME_PRINCIPAL;
    delete process.env.DATABASE_RUNTIME_PRINCIPAL_ID;
  });

  it("queries the Azure principal list by its rolname column", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });

    await mapRuntimePrincipal({ query } as never);

    expect(query.mock.calls[0]?.[0]).toContain("where rolname = $1");
    expect(query.mock.calls[0]?.[0]).not.toContain("rolename");
  });
});