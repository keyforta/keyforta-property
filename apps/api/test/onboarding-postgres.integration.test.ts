import { Pool, type PoolClient, type QueryResult } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrate.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("PostgreSQL landlord onboarding", () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const databaseName = `keyforta_onboarding_${process.pid}`;
  const onboardingDatabaseUrl = testDatabaseUrl ? new URL(testDatabaseUrl) : undefined;
  if (onboardingDatabaseUrl) onboardingDatabaseUrl.pathname = `/${databaseName}`;
  const onboardingPool = new Pool({ connectionString: onboardingDatabaseUrl?.toString() });
  let client: PoolClient;

  async function runtimeQuery<T extends Record<string, unknown>>(
    text: string,
    parameters: readonly unknown[],
  ): Promise<QueryResult<T>> {
    await client.query("begin");
    try {
      await client.query("set local role keyforta_runtime");
      const result = await client.query<T>(text, [...parameters]);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  beforeAll(async () => {
    await adminPool.query(`create database ${databaseName}`);
    client = await onboardingPool.connect();
    await applyMigrations(client);
  }, 30_000);

  afterAll(async () => {
    client?.release();
    await onboardingPool.end();
    await adminPool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
    await adminPool.query(`drop database if exists ${databaseName}`);
    await adminPool.end();
  });

  it("initializes without customer business records", async () => {
    const result = await client.query<{
      memberships: string;
      organizations: string;
      properties: string;
      users: string;
    }>(`
      select
        (select count(*) from app.organizations)::text as organizations,
        (select count(*) from app.users)::text as users,
        (select count(*) from app.memberships)::text as memberships,
        (select count(*) from app.properties)::text as properties
    `);
    expect(result.rows[0]).toEqual({
      memberships: "0",
      organizations: "0",
      properties: "0",
      users: "0",
    });
  });

  it("allows only one pending application for an immutable applicant identity", async () => {
    const parameters = [
      "synthetic-applicant-duplicate",
      "00000000-0000-4000-8000-000000000711",
      "Duplicate Applicant",
      "Duplicate Estates",
      "submit-duplicate-01",
    ];
    const created = await runtimeQuery(
      "select * from app.submit_landlord_onboarding_application($1, $2, $3, $4, $5)",
      parameters,
    );
    const duplicate = await runtimeQuery(
      "select * from app.submit_landlord_onboarding_application($1, $2, $3, $4, $5)",
      [...parameters.slice(0, 4), "submit-duplicate-02"],
    );

    expect(created.rowCount).toBe(1);
    expect(duplicate.rowCount).toBe(0);
    const count = await client.query<{ count: string }>(`
      select count(*)::text as count from app.landlord_onboarding_applications
      where applicant_object_id = '00000000-0000-4000-8000-000000000711'
        and status = 'pending'
    `);
    expect(count.rows[0]?.count).toBe("1");
  });

  it("atomically approves into exactly one organization, user, and active landlord membership", async () => {
    const submitted = await runtimeQuery<{ id: string }>(
      "select id from app.submit_landlord_onboarding_application($1, $2, $3, $4, $5)",
      [
        "synthetic-applicant-approved",
        "00000000-0000-4000-8000-000000000712",
        "Approved Applicant",
        "Approved Estates",
        "submit-approved-01",
      ],
    );
    const id = submitted.rows[0]?.id;
    const decided = await runtimeQuery(
      "select * from app.decide_landlord_onboarding_application($1, $2, $3, $4, $5, $6)",
      [
        id,
        "synthetic-platform-admin",
        "00000000-0000-4000-8000-000000000702",
        "approved",
        "Verified pilot applicant.",
        "approve-01",
      ],
    );

    expect(decided.rowCount).toBe(1);
    const provisioned = await client.query<{
      applicant_object_id: string;
      administrator_object_id: string;
      correlation_id: string;
      membership_count: string;
      organization_count: string;
      outcome: string;
      user_count: string;
    }>(`
      select decision.applicant_object_id::text,
        decision.administrator_object_id::text, decision.correlation_id,
        decision.outcome,
        (select count(*) from app.organizations where id = decision.organization_id)::text as organization_count,
        (select count(*) from app.users where id = decision.user_id)::text as user_count,
        (select count(*) from app.memberships
          where id = decision.membership_id and role = 'landlord' and active)::text as membership_count
      from app.landlord_onboarding_decisions as decision
      where decision.application_id = $1
    `, [id]);
    expect(provisioned.rows[0]).toEqual({
      applicant_object_id: "00000000-0000-4000-8000-000000000712",
      administrator_object_id: "00000000-0000-4000-8000-000000000702",
      correlation_id: "approve-01",
      membership_count: "1",
      organization_count: "1",
      outcome: "approved",
      user_count: "1",
    });

    const replay = await runtimeQuery(
      "select * from app.decide_landlord_onboarding_application($1, $2, $3, $4, $5, $6)",
      [id, "synthetic-platform-admin", "00000000-0000-4000-8000-000000000702",
        "rejected", "Replay must fail.", "approve-replay-01"],
    );
    expect(replay.rowCount).toBe(0);
  });

  it("rejects without provisioning and preserves immutable decision evidence", async () => {
    const submitted = await runtimeQuery<{ id: string }>(
      "select id from app.submit_landlord_onboarding_application($1, $2, $3, $4, $5)",
      [
        "synthetic-applicant-rejected",
        "00000000-0000-4000-8000-000000000713",
        "Rejected Applicant",
        "Rejected Estates",
        "submit-rejected-01",
      ],
    );
    const id = submitted.rows[0]?.id;
    await runtimeQuery(
      "select * from app.decide_landlord_onboarding_application($1, $2, $3, $4, $5, $6)",
      [id, "synthetic-platform-admin", "00000000-0000-4000-8000-000000000702",
        "rejected", "Identity evidence incomplete.", "reject-01"],
    );

    const evidence = await client.query<{
      membership_id: string | null;
      organization_id: string | null;
      outcome: string;
      user_id: string | null;
    }>(`
      select outcome, organization_id, user_id, membership_id
      from app.landlord_onboarding_decisions where application_id = $1
    `, [id]);
    expect(evidence.rows[0]).toEqual({
      membership_id: null,
      organization_id: null,
      outcome: "rejected",
      user_id: null,
    });
    await expect(client.query(
      "update app.landlord_onboarding_decisions set reason = 'changed' where application_id = $1",
      [id],
    )).rejects.toThrow(/immutable/);
  });

  it("rolls back every approval write when decision evidence is invalid", async () => {
    const subject = "synthetic-applicant-rollback";
    const organizationName = "Rollback Estates";
    const submitted = await runtimeQuery<{ id: string }>(
      "select id from app.submit_landlord_onboarding_application($1, $2, $3, $4, $5)",
      [subject, "00000000-0000-4000-8000-000000000714", "Rollback Applicant",
        organizationName, "submit-rollback-01"],
    );
    const id = submitted.rows[0]?.id;

    await expect(runtimeQuery(
      "select * from app.decide_landlord_onboarding_application($1, $2, $3, $4, $5, $6)",
      [id, "synthetic-platform-admin", "00000000-0000-4000-8000-000000000702",
        "approved", "x", "approve-rollback-01"],
    )).rejects.toThrow();

    const state = await client.query<{
      application_status: string;
      memberships: string;
      organizations: string;
      users: string;
    }>(`
      select
        (select status from app.landlord_onboarding_applications where id = $1) as application_status,
        (select count(*) from app.organizations where name = $2)::text as organizations,
        (select count(*) from app.users where external_subject = $3)::text as users,
        (select count(*) from app.memberships
          join app.users on users.id = memberships.user_id
          where users.external_subject = $3)::text as memberships
    `, [id, organizationName, subject]);
    expect(state.rows[0]).toEqual({
      application_status: "pending",
      memberships: "0",
      organizations: "0",
      users: "0",
    });
  });

  it("exposes onboarding tables only through granted functions", async () => {
    await expect(runtimeQuery(
      "select * from app.landlord_onboarding_decisions",
      [],
    )).rejects.toThrow(/permission denied/);
  });
});