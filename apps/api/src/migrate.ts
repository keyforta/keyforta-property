import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PoolClient } from "pg";

import { createDatabasePool } from "./database.js";

const migrationDirectory = fileURLToPath(
  new URL("../../../infra/postgres/migrations", import.meta.url),
);
const migrationLockKey = 4_514_670_274;
const runtimeMigrationBoundary = "0036_media_review_admin_rls_policies.sql";

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function assertUuid(value: string, variableName: string): void {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${variableName} must be a valid UUID.`);
  }
}

function unwrapMigration(content: string, fileName: string): string {
  const match = /^begin;\s*\n([\s\S]*)\ncommit;\s*$/.exec(content);
  if (!match?.[1]) {
    throw new Error(`Migration must use the required transaction envelope: ${fileName}`);
  }
  return match[1];
}

// These are the *only* places any migration re-creates, replaces, or drops
// an object already owned by `keyforta_media_review_admin` (everything
// else either needs only plain membership, for `alter ... owner to`, or
// creates a fresh object later reassigned by its own `alter ... owner to`
// statement). PostgreSQL's ownership-equivalence check for `create or
// replace function`/`drop function` (`has_privs_of_role`) requires actual
// *inherited* privilege, not just membership -- but granting the migration
// identity persistent `with inherit true` membership would let *every*
// other SECURITY DEFINER function it owns (there are several, e.g.
// create_public_listing) also satisfy the 0036 policies' `to
// keyforta_media_review_admin` clause for the rest of that identity's
// lifetime, silently widening cross-organization visibility far beyond
// the three intended admin functions. Scoping a `set local role` to
// exactly these statements (transaction-scoped, so it's undone at
// commit/rollback regardless) gets the same ownership-equivalence without
// ever granting inherited privilege at all. Each file lists every such
// statement it contains, applied in order; a file's absence from this map
// means it needs none.
const ownershipElevationStatements: Partial<Record<string, RegExp[]>> = {
  "0032_public_listing_media_upload.sql": [
    /^create or replace function app\.review_public_listing_media\([\s\S]*?\n\$\$;\n/m,
  ],
  "0033_public_listing_media_review_content.sql": [
    /^drop function app\.list_public_listings_pending_media_review\(\);\n/m,
  ],
  "0035_withdrawn_listing_media_review.sql": [
    /^create or replace function app\.review_public_listing_media\([\s\S]*?\n\$\$;\n/m,
    /^create or replace function app\.list_public_listings_pending_media_review\([\s\S]*?\n\$\$;\n/m,
    /^create or replace function app\.get_public_listing_image_content_for_review\([\s\S]*?\n\$\$;\n/m,
  ],
};

function scopeMediaReviewAdminOwnershipStatements(content: string, fileName: string): string {
  const patterns = ownershipElevationStatements[fileName];
  if (!patterns) return content;
  return patterns.reduce((scoped, pattern) => {
    const match = pattern.exec(scoped);
    if (!match) {
      throw new Error(
        `Expected media-review-admin ownership statement not found in ${fileName}; migration content may have changed.`,
      );
    }
    // Must use a replacer *function*, not a replacement string: a string
    // argument to String.replace treats "$$" specially (collapsing it to a
    // literal single "$"), which would corrupt every dollar-quoted function
    // body ("$$ ... $$") in match[0].
    return scoped.replace(
      pattern,
      () => `set local role keyforta_media_review_admin;\n${match[0]}reset role;\n`,
    );
  }, content);
}

async function assertMigrationPreconditions(
  client: PoolClient,
  fileName: string,
): Promise<void> {
  if (fileName === "0017_public_listing_publication_control.sql") {
    const duplicateAssignments = await client.query(`
      select 1
      from app.manager_property_assignments
      where revoked_at is null
      group by organization_id, property_id
      having count(*) > 1
      limit 1
    `);
    if (duplicateAssignments.rows[0]) {
      throw new Error(
        "0017 blocked: revoke duplicate active manager assignments before retrying",
      );
    }
  }

  if (fileName === "0022_rental_inventory_v1.sql") {
    const existingCustomerData = await client.query(`
      select 1
      where exists (select 1 from app.organizations)
        or exists (select 1 from app.users)
        or exists (select 1 from app.parties)
        or exists (select 1 from app.landlord_onboarding_applications)
    `);
    if (existingCustomerData.rows[0]) {
      throw new Error(
        "0022 blocked: database contains organization or customer data; use the separately authorized non-production reset before retrying",
      );
    }
  }

}

export async function applyMigration(
  client: PoolClient,
  fileName: string,
  content: string,
): Promise<boolean> {
  const contentChecksum = checksum(content);
  const applied = await client.query<{ checksum: string }>(
    "select checksum from app.schema_migrations where version = $1",
    [fileName],
  );

  if (applied.rows[0]) {
    if (applied.rows[0].checksum !== contentChecksum) {
      throw new Error(`Applied migration checksum mismatch: ${fileName}`);
    }
    return false;
  }

  await assertMigrationPreconditions(client, fileName);
  await client.query("begin");
  try {
    await client.query(
      scopeMediaReviewAdminOwnershipStatements(unwrapMigration(content, fileName), fileName),
    );
    await client.query(
      "insert into app.schema_migrations (version, checksum) values ($1, $2)",
      [fileName, contentChecksum],
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

// Migration 0030 creates `keyforta_media_review_admin` with BYPASSRLS the
// first time it runs (idempotently skipping re-creation if the role
// already exists). Azure Database for PostgreSQL Flexible Server never
// grants BYPASSRLS to a Microsoft Entra (managed-identity) admin -- only
// Microsoft's internal `azuresu` role ever has it -- so this connection
// can never itself satisfy "only roles with BYPASSRLS may create a role
// with BYPASSRLS" and 0030's own create-role statement always fails with
// a permission-denied error on Azure, regardless of privileges granted to
// the connecting identity. Since migrations are immutable, pre-create the
// role here (without BYPASSRLS) before the migration loop runs, so 0030's
// existence check finds it already present and skips straight to the
// grants. Migration 0036 replaces the lost BYPASSRLS with narrowly scoped,
// additive RLS policies granted `to keyforta_media_review_admin` on each
// table the media-review admin functions touch, preserving the same
// cross-organization visibility the role previously got via BYPASSRLS.
export async function provisionMediaReviewAdminRole(client: PoolClient): Promise<void> {
  // Mirrors 0030's own race-safe existence check: parallel test suites (or
  // concurrent deploys) may race to create this cluster-wide role for the
  // first time, so catch duplicate_object/unique_violation rather than
  // relying solely on the "if not exists" check.
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'keyforta_media_review_admin') then
        create role keyforta_media_review_admin nologin nosuperuser nocreatedb nocreaterole noinherit;
      end if;
    exception
      when duplicate_object or unique_violation then
        null;
    end
    $$;
  `);
  // 0030/0032/0033 also `alter function ... owner to
  // keyforta_media_review_admin`, which PostgreSQL only allows when the
  // connecting role is itself a member of the target role (superuser
  // exempted, which no Azure customer connection ever is). Grant plain
  // membership (not `with inherit true`) to whichever role is actually
  // running migrations in this environment -- this varies per environment
  // (a differently named managed identity in each), so it must be
  // resolved dynamically via current_user rather than hardcoded. Plain
  // membership is deliberately *not* inherited: `alter ... owner to` only
  // ever needs membership, and granting persistent inherited privilege
  // here would let every other SECURITY DEFINER function this identity
  // owns also satisfy the 0036 policies' `to keyforta_media_review_admin`
  // clause for as long as the grant exists, far beyond the three intended
  // admin functions. The statements (in 0032/0033/0035) that actually
  // need ownership-equivalent privilege -- not just membership -- instead
  // use a `set local role` scoped to just those statements (see
  // scopeMediaReviewAdminOwnershipStatements above), which only requires
  // this same plain membership.
  await client.query(`
    do $$
    begin
      execute format('grant keyforta_media_review_admin to %I', current_user);
    exception
      when duplicate_object then
        null;
    end
    $$;
  `);
  // ALTER ... OWNER TO additionally requires the *new* owner to hold
  // CREATE privilege on the object's schema (not just USAGE, which 0030's
  // own grant below provides) -- otherwise "permission denied for schema
  // app". Schema "app" must already exist for this grant to succeed, so
  // this call is deliberately placed after applyMigrations creates it.
  await client.query(`
    do $$
    begin
      if exists (select 1 from pg_namespace where nspname = 'app') then
        grant create on schema app to keyforta_media_review_admin;
      end if;
    end
    $$;
  `);
  // Upgrade path: an environment that ran 0030 *before* this fix shipped
  // (never possible on Azure, since only a BYPASSRLS-holding connection can
  // create a BYPASSRLS role there -- but possible on a local/CI Postgres
  // where migrations run as a superuser) would already have
  // keyforta_media_review_admin with BYPASSRLS set. Migration 0036's
  // additive policies only replace what BYPASSRLS *needs* to be true; the
  // attribute itself is a strictly broader, blanket RLS bypass that must be
  // revoked so the scoped policies are actually the sole source of the
  // role's cross-organization visibility. Only a role that itself holds
  // BYPASSRLS (superuser always does, functionally) may strip it from
  // another role, so this is a no-op -- not an error -- everywhere it can't
  // apply, including every real Azure connection.
  await client.query(`
    do $$
    begin
      if exists (
        select 1 from pg_roles where rolname = 'keyforta_media_review_admin' and rolbypassrls
      ) then
        alter role keyforta_media_review_admin nobypassrls;
      end if;
    exception
      when insufficient_privilege then
        null;
    end
    $$;
  `);
}

export async function applyMigrations(client: PoolClient): Promise<void> {
  await client.query("create schema if not exists app");
  await provisionMediaReviewAdminRole(client);
  await client.query(`
    create table if not exists app.schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
  await client.query("select pg_advisory_lock($1)", [migrationLockKey]);

  try {
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/.test(fileName))
      .sort();

    for (const fileName of migrationFiles) {
      if (fileName > runtimeMigrationBoundary) break;
      const content = await readFile(`${migrationDirectory}/${fileName}`, "utf8");
      if (await applyMigration(client, fileName, content)) {
        console.info(`Applied migration ${fileName}`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [migrationLockKey]);
  }
}

export async function mapRuntimePrincipal(client: PoolClient): Promise<void> {
  const principalName = process.env.DATABASE_RUNTIME_PRINCIPAL;
  const principalId = process.env.DATABASE_RUNTIME_PRINCIPAL_ID;
  if (!principalName && !principalId) return;
  if (!principalName || !principalId) {
    throw new Error(
      "DATABASE_RUNTIME_PRINCIPAL and DATABASE_RUNTIME_PRINCIPAL_ID must be configured together.",
    );
  }
  assertUuid(principalId, "DATABASE_RUNTIME_PRINCIPAL_ID");

  const existing = await client.query<{ label: string }>(
    `select labels.label
     from pg_catalog.pg_roles roles
     join pg_catalog.pg_seclabel labels
       on labels.objoid = roles.oid
      and labels.classoid = 'pg_catalog.pg_authid'::regclass
      and labels.objsubid = 0
     where rolname = $1
       and labels.provider = 'pgaadauth'`,
    [principalName],
  );
  const existingLabel = existing.rows[0]?.label;
  if (existingLabel) {
    const attributes = Object.fromEntries(
      existingLabel.split(",").flatMap((entry) => {
        const separator = entry.indexOf("=");
        return separator === -1
          ? []
          : [[entry.slice(0, separator), entry.slice(separator + 1)]];
      }),
    );
    const existingObjectId = attributes.oid;
    const existingObjectType = attributes.type;
    if (existingObjectId !== principalId || existingObjectType !== "service") {
      throw new Error(
        "The existing PostgreSQL runtime principal does not match the configured managed identity.",
      );
    }
  } else {
    const roleName = quoteIdentifier(principalName);
    // A role with this name can already exist without our pgaadauth label
    // (for example, Azure's own Entra-admin provisioning creates the login
    // role directly). Treat that as "not yet labeled" rather than assuming
    // absence, so labeling is idempotent instead of failing with
    // "role already exists" (SQLSTATE 42710).
    const existingRole = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_catalog.pg_roles where rolname = $1) as exists",
      [principalName],
    );
    const roleAlreadyExists = existingRole.rows[0]?.exists === true;
    await client.query("begin");
    try {
      if (!roleAlreadyExists) {
        await client.query(`create role ${roleName} login`);
      }
      await client.query(
        `security label for "pgaadauth" on role ${roleName} is 'aadauth,oid=${principalId},type=service'`,
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  await client.query(`alter role ${quoteIdentifier(principalName)} noinherit`);
  await client.query(
    `grant keyforta_runtime to ${quoteIdentifier(principalName)}`,
  );
}

async function main(): Promise<void> {
  const pool = createDatabasePool();
  const client = await pool.connect();
  try {
    await applyMigrations(client);
    await mapRuntimePrincipal(client);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}