import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

import { applyMigration, mapRuntimePrincipal } from "../src/migrate.js";

describe("applyMigration", () => {
  it("blocks 0017 before its transaction when active assignments are ambiguous", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const client = { query } as unknown as PoolClient;
    const migration = "begin;\nselect true;\ncommit;";

    await expect(
      applyMigration(
        client,
        "0017_public_listing_publication_control.sql",
        migration,
      ),
    ).rejects.toThrow(
      "0017 blocked: revoke duplicate active manager assignments before retrying",
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).not.toHaveBeenCalledWith("begin");
  });
});

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

  it("creates and labels a missing runtime role without optional pgaadauth helpers", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });

    await mapRuntimePrincipal({ query } as never);

    expect(query.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining("pg_catalog.pg_seclabel"),
      "begin",
      'create role "keyforta-api" login',
      'security label for "pgaadauth" on role "keyforta-api" is \'aadauth,oid=00000000-0000-0000-0000-000000000001,type=service\'',
      "commit",
      'alter role "keyforta-api" noinherit',
      'grant keyforta_runtime to "keyforta-api"',
    ]);
    expect(query.mock.calls.flatMap((call) => call[0])).not.toContain(
      "pgaadauth_create_principal_with_oid",
    );
  });

  it("rejects a malformed runtime principal ID before querying PostgreSQL", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "invalid'; drop role keyforta_runtime; --";
    const query = vi.fn();

    await expect(mapRuntimePrincipal({ query } as never)).rejects.toThrow(
      "DATABASE_RUNTIME_PRINCIPAL_ID must be a valid UUID",
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("rolls back runtime role creation when security labeling fails", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const labelError = new Error("security label failed");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(labelError)
      .mockResolvedValueOnce({ rows: [] });

    await expect(mapRuntimePrincipal({ query } as never)).rejects.toBe(labelError);
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining("pg_catalog.pg_seclabel"),
      "begin",
      'create role "keyforta-api" login',
      expect.stringContaining('security label for "pgaadauth"'),
      "rollback",
    ]);
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