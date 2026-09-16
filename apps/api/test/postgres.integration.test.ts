import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigration, applyMigrations } from "../src/migrate.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("PostgreSQL public discovery integration", () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  const runtimeDatabaseUrl = testDatabaseUrl
    ? new URL(testDatabaseUrl)
    : undefined;
  if (runtimeDatabaseUrl) {
    runtimeDatabaseUrl.username = "keyforta_test_runtime";
    runtimeDatabaseUrl.password = "synthetic-test-runtime-password";
  }
  const runtimePool = new Pool({
    connectionString: runtimeDatabaseUrl?.toString(),
  });
  let client: PoolClient;
  let runtimeClient: PoolClient;

  beforeAll(async () => {
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

      delete from app.public_listing_inquiries
      where organization_id in (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000901'
      );
      delete from app.public_listings
      where organization_id in (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000901'
      );
      delete from app.units
      where organization_id in (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000901'
      );
      delete from app.properties
      where organization_id in (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000901'
      );
      delete from app.memberships
      where organization_id in (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000901'
      );
      delete from app.organizations
      where id in (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000901'
      );

      insert into app.organizations (id, name) values
        ('00000000-0000-4000-8000-000000000900', 'Synthetic organization A'),
        ('00000000-0000-4000-8000-000000000901', 'Synthetic organization B');
      insert into app.properties (id, organization_id, name, address) values
        ('00000000-0000-4000-8000-000000000910', '00000000-0000-4000-8000-000000000900', 'Synthetic A', 'Private A'),
        ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000901', 'Synthetic B', 'Private B');
      insert into app.units (id, organization_id, property_id, label) values
        ('00000000-0000-4000-8000-000000000920', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000910', 'Published'),
        ('00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000910', 'Draft'),
        ('00000000-0000-4000-8000-000000000922', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000911', 'Published');
      insert into app.public_listings (
        id, organization_id, unit_id, slug, title, summary, city, district,
        bedrooms, bathrooms, monthly_rent_minor, currency, available_from,
        image_urls, status, published_at, created_at
      ) values
        ('00000000-0000-4000-8000-000000000930', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000920', 'published-org-a', 'Published organization A', 'Synthetic published listing for organization A.', 'Kinshasa', 'Gombe', 2, 1, 40000, 'USD', '2026-10-01', array['/a.jpg'], 'published', '2026-09-02T00:00:00Z', '2026-08-01T00:00:00Z'),
        ('00000000-0000-4000-8000-000000000931', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000921', 'draft-org-a', 'Draft organization A', 'Synthetic draft listing that must remain private.', 'Kinshasa', 'Gombe', 2, 1, 30000, 'USD', '2026-10-01', array['/draft.jpg'], 'draft', null, '2026-08-03T00:00:00Z'),
        ('00000000-0000-4000-8000-000000000932', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000922', 'published-org-b', 'Published organization B', 'Synthetic published listing for organization B.', 'Kinshasa', 'Limete', 3, 2, 60000, 'USD', '2026-10-01', array['/b.jpg'], 'published', '2026-09-01T00:00:00Z', '2026-08-02T00:00:00Z');
    `);
    runtimeClient = await runtimePool.connect();
  }, 30_000);

  afterAll(async () => {
    runtimeClient?.release();
    client?.release();
    await runtimePool.end();
    await pool.end();
  });

  it("applies every migration and reruns without changing the ledger", async () => {
    await applyMigrations(client);
    const result = await client.query<{ count: string }>(
      "select count(*)::text as count from app.schema_migrations",
    );
    expect(result.rows[0]?.count).toBe("15");
  });

  it("maps users to parties without inventing legal or consent facts", async () => {
    const result = await client.query<{
      party_id: string;
      preferred_name: string;
    }>(`
      insert into app.users (id, external_subject, display_name)
      values (
        '00000000-0000-4000-8000-000000000940',
        'synthetic-policy-owner',
        'Synthetic Policy Owner'
      )
      on conflict (external_subject) do update
        set display_name = excluded.display_name
      returning party_id::text, display_name as preferred_name
    `);
    const party = await client.query<{
      jurisdiction_code: string | null;
      preferred_name: string;
    }>(`
      select organizations.jurisdiction_code, parties.preferred_name
      from app.users
      join app.parties on parties.id = users.party_id
      cross join app.organizations
      where users.id = '00000000-0000-4000-8000-000000000940'
        and organizations.id = '00000000-0000-4000-8000-000000000900'
    `);

    expect(result.rows[0]?.party_id).toBe(
      "00000000-0000-4000-8000-000000000940",
    );
    expect(party.rows[0]).toEqual({
      jurisdiction_code: null,
      preferred_name: "Synthetic Policy Owner",
    });
  });

  it("denies actor resolution across organization memberships", async () => {
    await client.query(`
      insert into app.users (id, external_subject, display_name)
      values (
        '00000000-0000-4000-8000-000000000941',
        'synthetic-organization-b-member',
        'Synthetic Organization B Member'
      )
      on conflict (external_subject) do update
        set display_name = excluded.display_name;
      insert into app.memberships (organization_id, user_id, role, active)
      values (
        '00000000-0000-4000-8000-000000000901',
        '00000000-0000-4000-8000-000000000941',
        'tenant',
        true
      )
      on conflict (organization_id, user_id) do update
        set role = excluded.role, active = true;
    `);

    await runtimeClient.query("begin");
    await runtimeClient.query("set local role keyforta_runtime");
    try {
      const ownOrganization = await runtimeClient.query(
        "select * from app.resolve_actor($1, $2)",
        [
          "synthetic-organization-b-member",
          "00000000-0000-4000-8000-000000000901",
        ],
      );
      const otherOrganization = await runtimeClient.query(
        "select * from app.resolve_actor($1, $2)",
        [
          "synthetic-organization-b-member",
          "00000000-0000-4000-8000-000000000900",
        ],
      );
      await runtimeClient.query("commit");

      expect(ownOrganization.rowCount).toBe(1);
      expect(otherOrganization.rowCount).toBe(0);
    } catch (error) {
      await runtimeClient.query("rollback");
      throw error;
    }
  });

  it("fails closed until a counsel-required policy has valid evidence", async () => {
    const policyKey = `synthetic_lease_execution_${Date.now()}`;
    const resolvePolicy = async (requestedAt: string) => {
      await runtimeClient.query("begin");
      await runtimeClient.query("set local role keyforta_runtime");
      try {
        const result = await runtimeClient.query<{
          policy_key: string;
          rule_payload: { enabled: boolean };
          version: number;
        }>("select * from app.resolve_active_jurisdiction_policy($1, $2, $3)", [
          policyKey,
          "CD-TEST",
          requestedAt,
        ]);
        await runtimeClient.query("commit");
        return result;
      } catch (error) {
        await runtimeClient.query("rollback");
        throw error;
      }
    };

    await expect(
      runtimeClient.query("select * from app.jurisdiction_policy_versions"),
    ).rejects.toThrow(/permission denied/);

    const missing = await resolvePolicy("2026-09-16T00:00:00Z");
    expect(missing.rowCount).toBe(0);

    const policy = await client.query<{ id: string }>(
      `
      insert into app.jurisdiction_policy_versions (
        policy_key, jurisdiction_code, version, rule_payload,
        requires_counsel_approval, created_by_user_id
      ) values (
        $1, 'CD-TEST', 1, '{"enabled":true}'::jsonb, true,
        '00000000-0000-4000-8000-000000000940'
      ) returning id::text
    `,
      [policyKey],
    );
    const ownerEvidence = await client.query<{ id: string }>(`
      insert into app.policy_approval_evidence (
        policy_version_id, approval_role, approved_by_user_id,
        source_reference
      ) values (
        '${policy.rows[0]!.id}', 'policy_owner',
        '00000000-0000-4000-8000-000000000940',
        'synthetic-owner-approval'
      ) returning id::text
    `);

    await expect(
      client.query(
        "select app.activate_jurisdiction_policy($1, $2, $3, $4, $5, $6, $7)",
        [
          policy.rows[0]!.id,
          ownerEvidence.rows[0]!.id,
          null,
          "2026-09-16T00:00:00Z",
          null,
          "00000000-0000-4000-8000-000000000940",
          "synthetic-owner-only",
        ],
      ),
    ).rejects.toThrow(/qualified counsel approval is required/);

    const counselEvidence = await client.query<{ id: string }>(`
      insert into app.policy_approval_evidence (
        policy_version_id, approval_role, approved_by_user_id,
        source_reference
      ) values (
        '${policy.rows[0]!.id}', 'qualified_counsel',
        '00000000-0000-4000-8000-000000000940',
        'synthetic-counsel-approval'
      ) returning id::text
    `);
    await client.query(
      "select app.activate_jurisdiction_policy($1, $2, $3, $4, $5, $6, $7)",
      [
        policy.rows[0]!.id,
        ownerEvidence.rows[0]!.id,
        counselEvidence.rows[0]!.id,
        "2026-09-16T00:00:00Z",
        "2026-09-18T00:00:00Z",
        "00000000-0000-4000-8000-000000000940",
        "synthetic-fully-approved",
      ],
    );

    const active = await resolvePolicy("2026-09-17T00:00:00Z");
    expect(active.rows).toEqual([
      {
        policy_key: policyKey,
        rule_payload: { enabled: true },
        version: 1,
      },
    ]);

    const expired = await resolvePolicy("2026-09-18T00:00:00Z");
    expect(expired.rowCount).toBe(0);

    await client.query(
      `insert into app.policy_approval_revocations (
        approval_evidence_id, revoked_by_user_id, reason, correlation_id
      ) values ($1, $2, $3, $4)`,
      [
        counselEvidence.rows[0]!.id,
        "00000000-0000-4000-8000-000000000940",
        "Synthetic counsel evidence withdrawn",
        "synthetic-revocation",
      ],
    );
    const revoked = await resolvePolicy("2026-09-17T00:00:00Z");
    expect(revoked.rowCount).toBe(0);

    await expect(
      client.query(
        "update app.jurisdiction_policy_versions set version = 2 where id = $1",
        [policy.rows[0]!.id],
      ),
    ).rejects.toThrow(/governance history is immutable/);
  });

  it("rolls back both DDL and the ledger when a migration fails", async () => {
    await expect(
      applyMigration(
        client,
        "9999_interrupted_probe.sql",
        "begin;\ncreate table app.interrupted_probe (id integer);\nselect 1 / 0;\ncommit;",
      ),
    ).rejects.toThrow();
    const result = await client.query<{
      applied: boolean;
      relation: string | null;
    }>(`
      select
        to_regclass('app.interrupted_probe')::text as relation,
        exists (
          select 1 from app.schema_migrations
          where version = '9999_interrupted_probe.sql'
        ) as applied
    `);
    expect(result.rows[0]).toEqual({ applied: false, relation: null });
  });

  it("denies direct table reads and exposes only published listings", async () => {
    await expect(
      runtimeClient.query("select id from app.public_listings"),
    ).rejects.toThrow(/permission denied/);

    await runtimeClient.query("begin");
    await runtimeClient.query("set local role keyforta_runtime");
    let result;
    try {
      result = await runtimeClient.query<{ slug: string }>(
        "select slug from app.list_public_listings(null, null, null)",
      );
      await runtimeClient.query("commit");
    } catch (error) {
      await runtimeClient.query("rollback");
      throw error;
    }
    expect(result.rows.map(({ slug }) => slug)).toEqual([
      "published-org-b",
      "published-org-a",
    ]);
  });

  it("derives inquiry organization from the listing and suppresses duplicates", async () => {
    for (const correlationId of ["integration-1", "integration-2"]) {
      await runtimeClient.query("begin");
      await runtimeClient.query("set local role keyforta_runtime");
      try {
        await runtimeClient.query(
          "select set_config('app.organization_id', $1, true)",
          ["00000000-0000-4000-8000-000000000900"],
        );
        const result = await runtimeClient.query<{ accepted: boolean }>(
          `select app.create_public_listing_inquiry(
            $1, $2, $3, $4, $5, $6, $7, $8
          ) as accepted`,
          [
            "published-org-b",
            "Synthetic Visitor",
            "visitor@example.test",
            null,
            null,
            "Synthetic inquiry",
            "en",
            correlationId,
          ],
        );
        await runtimeClient.query("commit");
        expect(result.rows[0]?.accepted).toBe(true);
      } catch (error) {
        await runtimeClient.query("rollback");
        throw error;
      }
    }

    const result = await client.query<{ count: string; organization_id: string }>(`
      select count(*)::text as count, organization_id::text
      from app.public_listing_inquiries
      where listing_id = '00000000-0000-4000-8000-000000000932'
        and email = 'visitor@example.test'
      group by organization_id
    `);
    expect(result.rows[0]).toEqual({
      count: "1",
      organization_id: "00000000-0000-4000-8000-000000000901",
    });
  });
});