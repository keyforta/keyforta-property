import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrate.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("PostgreSQL actor membership resolution integration", () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const databaseName = `keyforta_membership_resolution_${process.pid}`;
  const databaseUrl = testDatabaseUrl ? new URL(testDatabaseUrl) : undefined;
  if (databaseUrl) databaseUrl.pathname = `/${databaseName}`;
  const pool = new Pool({ connectionString: databaseUrl?.toString() });
  const runtimeDatabaseUrl = databaseUrl ? new URL(databaseUrl) : undefined;
  if (runtimeDatabaseUrl) {
    runtimeDatabaseUrl.username = "keyforta_test_runtime";
    runtimeDatabaseUrl.password = "synthetic-test-runtime-password";
  }
  const runtimePool = new Pool({ connectionString: runtimeDatabaseUrl?.toString() });
  let client: PoolClient;
  let runtimeClient: PoolClient;

  beforeAll(async () => {
    await adminPool.query(`create database ${databaseName}`);
    client = await pool.connect();
    await applyMigrations(client);
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'keyforta_test_runtime') then
          create role keyforta_test_runtime login password 'synthetic-test-runtime-password'
            nosuperuser nocreatedb nocreaterole noinherit;
        end if;
      end
      $$;
      alter role keyforta_test_runtime login password 'synthetic-test-runtime-password' noinherit;
      grant keyforta_runtime to keyforta_test_runtime;

      insert into app.organizations (id, name) values
        ('00000000-0000-4000-8000-000000000970', 'Synthetic membership org A'),
        ('00000000-0000-4000-8000-000000000971', 'Synthetic membership org B');
      insert into app.users (id, external_subject, display_name) values
        ('00000000-0000-4000-8000-000000000980', 'synthetic-membership-landlord', 'Synthetic Membership Landlord'),
        ('00000000-0000-4000-8000-000000000981', 'synthetic-membership-none', 'Synthetic Membership None')
      on conflict (external_subject) do update set display_name = excluded.display_name;
      insert into app.memberships (organization_id, user_id, role, active) values
        ('00000000-0000-4000-8000-000000000970', '00000000-0000-4000-8000-000000000980', 'landlord', true),
        ('00000000-0000-4000-8000-000000000971', '00000000-0000-4000-8000-000000000980', 'manager', false);
    `);
    runtimeClient = await runtimePool.connect();
  });

  afterAll(async () => {
    runtimeClient?.release();
    client?.release();
    await runtimePool.end();
    await pool.end();
    await adminPool.query(`drop database if exists ${databaseName} with (force)`);
    await adminPool.end();
  });

  async function resolveMemberships(subject: string) {
    await runtimeClient.query("begin");
    await runtimeClient.query("set local role keyforta_runtime");
    try {
      const result = await runtimeClient.query(
        "select * from app.resolve_actor_memberships($1)",
        [subject],
      );
      await runtimeClient.query("commit");
      return result;
    } catch (error) {
      await runtimeClient.query("rollback");
      throw error;
    }
  }

  it("resolves only active memberships for a subject with one organization", async () => {
    const result = await resolveMemberships("synthetic-membership-landlord");

    expect(result.rows).toEqual([
      {
        organization_id: "00000000-0000-4000-8000-000000000970",
        role: "landlord",
        actor_id: "00000000-0000-4000-8000-000000000980",
      },
    ]);
  });

  it("returns an empty result for a subject with no memberships", async () => {
    const result = await resolveMemberships("synthetic-membership-none");

    expect(result.rows).toEqual([]);
  });

  it("returns an empty result for an unknown subject", async () => {
    const result = await resolveMemberships("synthetic-membership-unknown");

    expect(result.rows).toEqual([]);
  });

  it("never leaks another organization's membership for the same subject's inactive record", async () => {
    const result = await resolveMemberships("synthetic-membership-landlord");

    const organizationIds = result.rows.map((row) => row.organization_id);
    expect(organizationIds).not.toContain("00000000-0000-4000-8000-000000000971");
  });
});
