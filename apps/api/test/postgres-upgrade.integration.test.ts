import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigration } from "../src/migrate.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;
const migrationDirectory = fileURLToPath(
  new URL("../../../infra/postgres/migrations", import.meta.url),
);

describePostgres("PostgreSQL 0015 forward upgrade", () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const databaseName = `keyforta_upgrade_${process.pid}`;
  const upgradeDatabaseUrl = testDatabaseUrl
    ? new URL(testDatabaseUrl)
    : undefined;
  if (upgradeDatabaseUrl) upgradeDatabaseUrl.pathname = `/${databaseName}`;
  const upgradePool = new Pool({ connectionString: upgradeDatabaseUrl?.toString() });
  let client: PoolClient;

  beforeAll(async () => {
    await adminPool.query(`create database ${databaseName}`);
    client = await upgradePool.connect();
    await client.query(`
      create schema app;
      create table app.schema_migrations (
        version text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationFiles = (await readdir(migrationDirectory))
      .filter((fileName) => /^00(0[1-9]|1[0-4])_[a-z0-9_]+\.sql$/.test(fileName))
      .sort();
    for (const fileName of migrationFiles) {
      await applyMigration(
        client,
        fileName,
        await readFile(`${migrationDirectory}/${fileName}`, "utf8"),
      );
    }

    await client.query(`
      insert into app.organizations (id, name) values
        ('00000000-0000-4000-8000-000000000a00', 'Synthetic upgrade organization');
      insert into app.users (id, external_subject, display_name, created_at) values
        ('00000000-0000-4000-8000-000000000a01', 'upgrade-normal', 'Legacy Person', '2026-01-01T00:00:00Z'),
        ('00000000-0000-4000-8000-000000000a02', 'upgrade-blank', '   ', '2026-01-02T00:00:00Z'),
        ('00000000-0000-4000-8000-000000000a03', 'upgrade-long', repeat('L', 201), '2026-01-03T00:00:00Z');
      insert into app.memberships (
        organization_id, user_id, role, active, created_at
      ) values (
        '00000000-0000-4000-8000-000000000a00',
        '00000000-0000-4000-8000-000000000a01',
        'tenant', true, '2026-01-04T00:00:00Z'
      );
    `);

    const migration0015 = "0015_party_and_jurisdiction_policy_foundation.sql";
    await applyMigration(
      client,
      migration0015,
      await readFile(`${migrationDirectory}/${migration0015}`, "utf8"),
    );
  }, 30_000);

  afterAll(async () => {
    client?.release();
    await upgradePool.end();
    await adminPool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
    await adminPool.query(`drop database if exists ${databaseName}`);
    await adminPool.end();
  });

  it("preserves legacy names without inventing party classification", async () => {
    const parties = await client.query<{
      external_subject: string;
      party_type: string | null;
      preferred_name: string;
      profile_name: string;
    }>(`
      select users.external_subject, parties.party_type, parties.preferred_name,
        profiles.display_name as profile_name
      from app.users
      join app.parties on parties.id = users.party_id
      join app.profiles on profiles.party_id = parties.id
      order by users.external_subject
    `);

    expect(parties.rows).toEqual([
      { external_subject: "upgrade-blank", party_type: null, preferred_name: "   ", profile_name: "   " },
      { external_subject: "upgrade-long", party_type: null, preferred_name: "L".repeat(201), profile_name: "L".repeat(201) },
      { external_subject: "upgrade-normal", party_type: null, preferred_name: "Legacy Person", profile_name: "Legacy Person" },
    ]);
  });

  it("retains non-overlapping membership history and rejects overlap", async () => {
    await client.query(`
      update app.memberships
      set active = false, effective_to = '2026-06-01T00:00:00Z'
      where user_id = '00000000-0000-4000-8000-000000000a01';
      insert into app.memberships (
        organization_id, user_id, role, active, effective_from
      ) values (
        '00000000-0000-4000-8000-000000000a00',
        '00000000-0000-4000-8000-000000000a01',
        'manager', true, '2026-06-01T00:00:00Z'
      );
    `);

    const history = await client.query<{ role: string; effective_to: Date | null }>(`
      select role::text, effective_to
      from app.memberships
      where user_id = '00000000-0000-4000-8000-000000000a01'
      order by effective_from
    `);
    expect(history.rows.map(({ role, effective_to }) => [role, effective_to?.toISOString() ?? null])).toEqual([
      ["tenant", "2026-06-01T00:00:00.000Z"],
      ["manager", null],
    ]);

    await expect(client.query(`
      insert into app.memberships (
        organization_id, user_id, role, active, effective_from
      ) values (
        '00000000-0000-4000-8000-000000000a00',
        '00000000-0000-4000-8000-000000000a01',
        'landlord', true, '2026-07-01T00:00:00Z'
      )
    `)).rejects.toThrow(/memberships_no_overlapping_active_periods/);
  });

  it("sets trusted party context on success and clears it on denial", async () => {
    await client.query("begin");
    try {
      const resolved = await client.query<{
        actor_id: string;
        organization_id: string;
        role: string;
      }>("select * from app.resolve_actor($1, $2)", [
        "upgrade-normal",
        "00000000-0000-4000-8000-000000000a00",
      ]);
      expect(resolved.rows).toEqual([{
        actor_id: "00000000-0000-4000-8000-000000000a01",
        organization_id: "00000000-0000-4000-8000-000000000a00",
        role: "manager",
      }]);
      const trustedParty = await client.query<{ party_id: string }>(
        "select current_setting('app.party_id') as party_id",
      );
      expect(trustedParty.rows[0]?.party_id).toBe("00000000-0000-4000-8000-000000000a01");

      const denied = await client.query("select * from app.resolve_actor($1, $2)", [
        "upgrade-normal",
        "00000000-0000-4000-8000-000000000aff",
      ]);
      expect(denied.rowCount).toBe(0);
      const cleared = await client.query<{ party_id: string }>(
        "select current_setting('app.party_id') as party_id",
      );
      expect(cleared.rows[0]?.party_id).toBe("");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
});