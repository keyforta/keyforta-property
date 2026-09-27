import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  return {
    ...actual,
    readdir: vi.fn(),
    readFile: vi.fn(),
  };
});

import { readdir, readFile } from "node:fs/promises";

import { applyMigration, applyMigrations, mapRuntimePrincipal } from "../src/migrate.js";

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

describe("applyMigration", () => {
  it("skips a migration already recorded with a matching checksum", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [
        {
          checksum:
            "f4a525df3250aa1aeae9daba925646d8d2e626b8a31e92ee986a8cb1f7f6a425",
        },
      ],
    });
    const client = { query } as unknown as PoolClient;

    const applied = await applyMigration(client, "0001_baseline.sql", "begin;\nselect 1;\ncommit;");

    expect(applied).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("throws on a checksum mismatch for an already-applied migration", async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ checksum: "stale" }],
    });
    const client = { query } as unknown as PoolClient;

    await expect(
      applyMigration(client, "0001_baseline.sql", "begin;\nselect 1;\ncommit;"),
    ).rejects.toThrow("Applied migration checksum mismatch: 0001_baseline.sql");
  });

  it("applies and records a new migration inside its own transaction", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;

    const applied = await applyMigration(client, "0001_baseline.sql", "begin;\nselect 1;\ncommit;");

    expect(applied).toBe(true);
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      "select checksum from app.schema_migrations where version = $1",
      "begin",
      "select 1;",
      "insert into app.schema_migrations (version, checksum) values ($1, $2)",
      "commit",
    ]);
  });

  it("rolls back and rethrows if applying the migration content fails", async () => {
    const migrationError = new Error("syntax error");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(migrationError)
      .mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;

    await expect(
      applyMigration(client, "0001_baseline.sql", "begin;\nselect 1;\ncommit;"),
    ).rejects.toBe(migrationError);
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      "select checksum from app.schema_migrations where version = $1",
      "begin",
      "select 1;",
      "rollback",
    ]);
  });

  it("requires the begin/commit transaction envelope", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const client = { query } as unknown as PoolClient;

    await expect(
      applyMigration(client, "0001_baseline.sql", "select 1;"),
    ).rejects.toThrow("Migration must use the required transaction envelope: 0001_baseline.sql");
  });
});

describe("applyMigrations", () => {
  afterEach(() => {
    mockReaddir.mockReset();
    mockReadFile.mockReset();
  });

  it("refuses to apply the baseline against a database with a pre-squash ledger", async () => {
    mockReaddir.mockResolvedValue(["0001_baseline.sql"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // create schema
      .mockResolvedValueOnce({ rows: [] }) // create table
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
      .mockResolvedValueOnce({
        rows: [
          { version: "0012_some_pre_squash_migration.sql" },
          { version: "0036_media_review_admin_rls_policies.sql" },
        ],
      }) // select version from app.schema_migrations
      .mockResolvedValue({ rows: [] }); // pg_advisory_unlock in finally
    const client = { query } as unknown as PoolClient;

    await expect(applyMigrations(client)).rejects.toThrow(
      "Refusing to apply 0001_baseline.sql: this database already has 2 migration(s) recorded",
    );
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(query.mock.calls.at(-1)?.[0]).toContain("pg_advisory_unlock");
  });

  it("applies the baseline normally when the ledger is empty (fresh database)", async () => {
    mockReaddir.mockResolvedValue(["0001_baseline.sql"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    mockReadFile.mockResolvedValue("begin;\nselect 1;\ncommit;");
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;

    await expect(applyMigrations(client)).resolves.toBeUndefined();
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining("0001_baseline.sql"),
      "utf8",
    );
  });

  it("applies the baseline normally when the ledger already records it (rerun/upgrade)", async () => {
    mockReaddir.mockResolvedValue(["0001_baseline.sql"] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);
    mockReadFile.mockResolvedValue("begin;\nselect 1;\ncommit;");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // create schema
      .mockResolvedValueOnce({ rows: [] }) // create table
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
      .mockResolvedValueOnce({ rows: [{ version: "0001_baseline.sql" }] }) // ledger select
      .mockResolvedValue({
        rows: [
          {
            checksum:
              "f4a525df3250aa1aeae9daba925646d8d2e626b8a31e92ee986a8cb1f7f6a425",
          },
        ],
      });
    const client = { query } as unknown as PoolClient;

    await expect(applyMigrations(client)).resolves.toBeUndefined();
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
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ rows: [] });

    await mapRuntimePrincipal({ query } as never);

    expect(query.mock.calls[0]?.[0]).toContain("pg_advisory_lock");
    expect(query.mock.calls[1]?.[0]).toContain("pg_catalog.pg_seclabel");
    expect(query.mock.calls[1]?.[0]).not.toContain("pgaadauth_list_principals");
    expect(query.mock.calls[1]?.[0]).toContain("where rolname = $1");
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
      expect.stringContaining("pg_advisory_lock"),
      expect.stringContaining("pg_catalog.pg_seclabel"),
      expect.stringContaining("pg_catalog.pg_roles"),
      "begin",
      'create role "keyforta-api" login',
      'security label for "pgaadauth" on role "keyforta-api" is \'aadauth,oid=00000000-0000-0000-0000-000000000001,type=service\'',
      "commit",
      expect.stringContaining("pg_advisory_unlock"),
      'alter role "keyforta-api" noinherit',
      'grant keyforta_runtime to "keyforta-api"',
    ]);
    expect(query.mock.calls.flatMap((call) => call[0])).not.toContain(
      "pgaadauth_create_principal_with_oid",
    );
  });

  it("labels an already-existing runtime role instead of failing with 'already exists'", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
      .mockResolvedValueOnce({ rows: [] }) // seclabel select: no pgaadauth label yet
      .mockResolvedValueOnce({ rows: [{ exists: true }] }) // role already exists (e.g. Azure-provisioned)
      .mockResolvedValue({ rows: [] });

    await mapRuntimePrincipal({ query } as never);

    const calls = query.mock.calls.map((call) => call[0]);
    expect(calls).toEqual([
      expect.stringContaining("pg_advisory_lock"),
      expect.stringContaining("pg_catalog.pg_seclabel"),
      expect.stringContaining("pg_catalog.pg_roles"),
      "begin",
      'security label for "pgaadauth" on role "keyforta-api" is \'aadauth,oid=00000000-0000-0000-0000-000000000001,type=service\'',
      "commit",
      expect.stringContaining("pg_advisory_unlock"),
      'alter role "keyforta-api" noinherit',
      'grant keyforta_runtime to "keyforta-api"',
    ]);
    expect(calls).not.toContain('create role "keyforta-api" login');
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

  it("rolls back runtime role creation when security labeling fails, releasing the advisory lock", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const labelError = new Error("security label failed");
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
      .mockResolvedValueOnce({ rows: [] }) // seclabel select
      .mockResolvedValueOnce({ rows: [] }) // pg_roles exists check
      .mockResolvedValueOnce({ rows: [] }) // begin
      .mockResolvedValueOnce({ rows: [] }) // create role
      .mockRejectedValueOnce(labelError) // security label
      .mockResolvedValue({ rows: [] }); // rollback, pg_advisory_unlock

    await expect(mapRuntimePrincipal({ query } as never)).rejects.toBe(labelError);
    expect(query.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining("pg_advisory_lock"),
      expect.stringContaining("pg_catalog.pg_seclabel"),
      expect.stringContaining("pg_catalog.pg_roles"),
      "begin",
      'create role "keyforta-api" login',
      expect.stringContaining('security label for "pgaadauth"'),
      "rollback",
      expect.stringContaining("pg_advisory_unlock"),
    ]);
  });

  it("accepts an existing security label for the configured service principal", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
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

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls.flatMap((call) => call[0])).not.toContain(
      "pgaadauth_create_principal_with_oid",
    );
  });

  it("rejects an existing security label for a different principal, releasing the advisory lock", async () => {
    process.env.DATABASE_RUNTIME_PRINCIPAL = "keyforta-api";
    process.env.DATABASE_RUNTIME_PRINCIPAL_ID = "00000000-0000-0000-0000-000000000001";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // pg_advisory_lock
      .mockResolvedValueOnce({
        rows: [
          {
            label:
              "aadauth,oid=00000000-0000-0000-0000-000000000002,type=service",
          },
        ],
      })
      .mockResolvedValue({ rows: [] }); // pg_advisory_unlock

    await expect(mapRuntimePrincipal({ query } as never)).rejects.toThrow(
      "does not match the configured managed identity",
    );
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2]?.[0]).toContain("pg_advisory_unlock");
  });
});