import { afterEach, describe, expect, it, vi } from "vitest";

import { mapRuntimePrincipal } from "../src/migrate.js";

describe("mapRuntimePrincipal", () => {
  afterEach(() => {
    delete process.env.DATABASE_RUNTIME_PRINCIPAL;
    delete process.env.DATABASE_RUNTIME_PRINCIPAL_ID;
  });

  it("queries the PostgreSQL security-label catalog by role name", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });

    await mapRuntimePrincipal({ query } as never);

    expect(query.mock.calls[0]?.[0]).toContain("pg_catalog.pg_seclabel");
    expect(query.mock.calls[0]?.[0]).not.toContain("pgaadauth_list_principals");
    expect(query.mock.calls[0]?.[0]).toContain("where rolname = $1");
  });

  it("accepts an existing security label for the configured service principal", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            label:
              "aadauth,oid=00000000-0000-0000-0000-000000000001,type=service",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    await mapRuntimePrincipal({ query } as never);

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.flatMap((call) => call[0])).not.toContain(
      "pgaadauth_create_principal_with_oid",
    );
  });

  it("rejects an existing security label for a different principal", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          label:
            "aadauth,oid=00000000-0000-0000-0000-000000000002,type=service",
        },
      ],
    });

    await expect(mapRuntimePrincipal({ query } as never)).rejects.toThrow(
      "does not match the configured managed identity",
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});