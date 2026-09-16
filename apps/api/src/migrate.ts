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

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function unwrapMigration(content: string, fileName: string): string {
  const match = /^begin;\s*\n([\s\S]*)\ncommit;\s*$/.exec(content);
  if (!match?.[1]) {
    throw new Error(`Migration must use the required transaction envelope: ${fileName}`);
  }
  return match[1];
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
      const content = await readFile(`${migrationDirectory}/${fileName}`, "utf8");
      if (await applyMigration(client, fileName, content)) {
        console.info(`Applied migration ${fileName}`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [migrationLockKey]);
  }
}

async function mapRuntimePrincipal(client: PoolClient): Promise<void> {
  const principalName = process.env.DATABASE_RUNTIME_PRINCIPAL;
  const principalId = process.env.DATABASE_RUNTIME_PRINCIPAL_ID;
  if (!principalName && !principalId) return;
  if (!principalName || !principalId) {
    throw new Error(
      "DATABASE_RUNTIME_PRINCIPAL and DATABASE_RUNTIME_PRINCIPAL_ID must be configured together.",
    );
  }

  const existing = await client.query<{ principal: Record<string, unknown> }>(
    `select row_to_json(principal) as principal
     from pg_catalog.pgaadauth_list_principals(false) principal
     where rolename = $1`,
    [principalName],
  );
  const existingPrincipal = existing.rows[0]?.principal;
  if (existingPrincipal) {
    const existingObjectId =
      existingPrincipal.objectId ?? existingPrincipal.objectid;
    const existingObjectType =
      existingPrincipal.principalType ?? existingPrincipal.principaltype;
    if (existingObjectId !== principalId || existingObjectType !== "service") {
      throw new Error(
        "The existing PostgreSQL runtime principal does not match the configured managed identity.",
      );
    }
  } else {
    await client.query(
      "select * from pg_catalog.pgaadauth_create_principal_with_oid($1, $2, 'service', false, false)",
      [principalName, principalId],
    );
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