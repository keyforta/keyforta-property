import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

import {
  applyMigration,
  mapRuntimePrincipal,
  provisionMediaReviewAdminRole,
} from "../src/migrate.js";

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

  it("scopes 0032's re-creation of the already-owned review function with a transaction-local role switch", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;
    const content = [
      "begin;",
      "create or replace function app.review_public_listing_media(",
      "  x uuid",
      ") returns void",
      "language plpgsql",
      "as $$",
      "begin",
      "end",
      "$$;",
      "alter function app.review_public_listing_media(uuid) owner to keyforta_media_review_admin;",
      "commit;",
    ].join("\n");

    await applyMigration(client, "0032_public_listing_media_upload.sql", content);

    const executedSql = query.mock.calls
      .map((call) => call[0] as string)
      .find((sql) => sql.includes("create or replace function"));
    expect(executedSql).toEqual(
      [
        "set local role keyforta_media_review_admin;",
        "create or replace function app.review_public_listing_media(",
        "  x uuid",
        ") returns void",
        "language plpgsql",
        "as $$",
        "begin",
        "end",
        "$$;",
        "reset role;",
        "alter function app.review_public_listing_media(uuid) owner to keyforta_media_review_admin;",
      ].join("\n"),
    );
    // The role switch must wrap only this one statement, not leak into
    // begin/commit or the schema_migrations bookkeeping around it.
    expect(query.mock.calls.map((call) => call[0])).not.toContain(
      "set local role keyforta_media_review_admin",
    );
  });

  it("scopes 0033's drop of the already-owned pending-review-queue function the same way", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;
    const content = [
      "begin;",
      "drop function app.list_public_listings_pending_media_review();",
      "create function app.list_public_listings_pending_media_review() returns void language sql as $$ select $$;",
      "commit;",
    ].join("\n");

    await applyMigration(client, "0033_public_listing_media_review_content.sql", content);

    const executedSql = query.mock.calls
      .map((call) => call[0] as string)
      .find((sql) => sql.includes("drop function"));
    expect(executedSql).toEqual(
      [
        "set local role keyforta_media_review_admin;",
        "drop function app.list_public_listings_pending_media_review();",
        "reset role;",
        "create function app.list_public_listings_pending_media_review() returns void language sql as $$ select $$;",
      ].join("\n"),
    );
  });

  it("fails loudly rather than silently skipping the role switch if 0033's expected statement is missing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;
    const content = "begin;\nselect 1;\ncommit;";

    await expect(
      applyMigration(client, "0033_public_listing_media_review_content.sql", content),
    ).rejects.toThrow("Expected media-review-admin ownership statement not found");
  });

  it("scopes all three of 0035's re-created review functions independently", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;
    const content = [
      "begin;",
      "create or replace function app.review_public_listing_media(",
      "  x uuid",
      ") returns void",
      "language plpgsql",
      "as $$",
      "begin",
      "end",
      "$$;",
      "",
      "create or replace function app.list_public_listings_pending_media_review()",
      "returns void",
      "language sql",
      "as $$",
      "  select",
      "$$;",
      "",
      "create or replace function app.get_public_listing_image_content_for_review(",
      "  x uuid",
      ") returns void",
      "language sql",
      "as $$",
      "  select",
      "$$;",
      "alter function app.get_public_listing_image_content_for_review(uuid) owner to keyforta_media_review_admin;",
      "commit;",
    ].join("\n");

    await applyMigration(client, "0035_withdrawn_listing_media_review.sql", content);

    const executedSql = query.mock.calls
      .map((call) => call[0] as string)
      .find((sql) => sql.includes("create or replace function"));
    const scopedStatementCount = (
      executedSql?.match(/set local role keyforta_media_review_admin;/g) ?? []
    ).length;
    expect(scopedStatementCount).toBe(3);
    expect((executedSql?.match(/reset role;/g) ?? []).length).toBe(3);
    // Each function's own dollar-quoted body must survive intact.
    expect(executedSql).toContain("app.review_public_listing_media(");
    expect(executedSql).toContain("app.list_public_listings_pending_media_review()");
    expect(executedSql).toContain("app.get_public_listing_image_content_for_review(");
  });
});

describe("provisionMediaReviewAdminRole", () => {
  it("creates keyforta_media_review_admin without BYPASSRLS", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;

    await provisionMediaReviewAdminRole(client);

    expect(query).toHaveBeenCalledTimes(4);
    const createStatement = query.mock.calls[0]?.[0] as string;
    expect(createStatement).toContain("keyforta_media_review_admin");
    expect(createStatement).not.toContain("bypassrls");
    expect(createStatement).toContain("duplicate_object");

    const membershipStatement = query.mock.calls[1]?.[0] as string;
    expect(membershipStatement).toContain("grant keyforta_media_review_admin to");
    expect(membershipStatement).not.toContain("with inherit true");

    const schemaCreateStatement = query.mock.calls[2]?.[0] as string;
    expect(schemaCreateStatement).toContain("grant create on schema app to keyforta_media_review_admin");

    const revokeBypassrlsStatement = query.mock.calls[3]?.[0] as string;
    expect(revokeBypassrlsStatement).toContain("rolbypassrls");
    expect(revokeBypassrlsStatement).toContain("alter role keyforta_media_review_admin nobypassrls");
    expect(revokeBypassrlsStatement).toContain("insufficient_privilege");
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