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
const runtimeMigrationBoundary = "0028_rental_property_and_unit_commands.sql";

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
    await client.query(unwrapMigration(content, fileName));
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

export async function applyMigrations(client: PoolClient): Promise<void> {
  await client.query("create schema if not exists app");
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
    await client.query("begin");
    try {
      await client.query(`create role ${roleName} login`);
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