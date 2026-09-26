import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrate.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

/**
 * Regression coverage for the production migration failure this fix
 * unblocks: Azure Database for PostgreSQL Flexible Server never grants
 * BYPASSRLS to a Microsoft Entra (managed-identity) admin -- only
 * Microsoft's internal `azuresu` role ever has it -- so a Postgres role
 * with exactly Azure's real Entra-admin attribute set (login, createdb,
 * createrole, nosuperuser, noinherit; no bypassrls) is used here instead
 * of the ordinary test superuser, to prove migrations actually apply under
 * the real production constraint rather than under CI's superuser
 * Postgres, which silently masks this class of bug entirely.
 */
describePostgres("PostgreSQL media-review-admin privilege redesign", () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const databaseName = `keyforta_media_review_admin_${process.pid}`;
  const restrictedRoleName = `keyforta_azure_admin_sim_${process.pid}`;
  const runtimeRoleName = `keyforta_media_review_test_runtime_${process.pid}`;
  const databaseUrl = testDatabaseUrl ? new URL(testDatabaseUrl) : undefined;
  if (databaseUrl) databaseUrl.pathname = `/${databaseName}`;
  if (databaseUrl) databaseUrl.username = restrictedRoleName;
  if (databaseUrl) databaseUrl.password = "synthetic-azure-admin-sim-password";
  const restrictedPool = new Pool({ connectionString: databaseUrl?.toString() });
  const runtimeDatabaseUrl = databaseUrl ? new URL(databaseUrl) : undefined;
  if (runtimeDatabaseUrl) {
    runtimeDatabaseUrl.username = runtimeRoleName;
    runtimeDatabaseUrl.password = "synthetic-media-review-runtime-password";
  }
  const runtimePool = new Pool({ connectionString: runtimeDatabaseUrl?.toString() });
  // Seeding cross-organization fixture rows needs to bypass FORCE ROW
  // LEVEL SECURITY the same way the ordinary superuser test pools used
  // elsewhere in this suite do -- that is test setup, not part of what
  // this file exercises (the restricted role and runtime role above are
  // reserved for the actual behavior under test).
  const superuserSeedDatabaseUrl = databaseUrl ? new URL(testDatabaseUrl!) : undefined;
  if (superuserSeedDatabaseUrl) superuserSeedDatabaseUrl.pathname = `/${databaseName}`;
  const superuserSeedPool = new Pool({ connectionString: superuserSeedDatabaseUrl?.toString() });
  const organizationA = "00000000-0000-4000-8000-0000000ba00a";
  const organizationB = "00000000-0000-4000-8000-0000000ba00b";
  const propertyA = "00000000-0000-4000-8000-0000000ba10a";
  const propertyB = "00000000-0000-4000-8000-0000000ba10b";
  const unitA = "00000000-0000-4000-8000-0000000ba20a";
  const unitB = "00000000-0000-4000-8000-0000000ba20b";
  const listingA = "00000000-0000-4000-8000-0000000ba30a";
  const listingB = "00000000-0000-4000-8000-0000000ba30b";
  const imageA = "00000000-0000-4000-8000-0000000ba40a";
  const imageB = "00000000-0000-4000-8000-0000000ba40b";
  let restrictedClient: PoolClient;
  let runtimeClient: PoolClient;
  let superuserSeedClient: PoolClient;

  beforeAll(async () => {
    await adminPool.query(`
      drop role if exists ${restrictedRoleName};
      create role ${restrictedRoleName}
        login password 'synthetic-azure-admin-sim-password'
        createdb createrole nosuperuser noinherit;
    `);
    await adminPool.query(
      `create database ${databaseName} owner ${restrictedRoleName}`,
    );
    // In production only one Entra-admin identity ever runs migrations for
    // a given environment, so it always creates (and thus automatically
    // holds ADMIN OPTION on) both this cluster-wide role and
    // `keyforta_runtime` the first time. In this shared test cluster,
    // though, other integration test files that apply migrations through
    // the ordinary superuser pool may race to create those roles first,
    // leaving this restricted role without ADMIN OPTION on roles it didn't
    // create. Bootstrapping that membership here (as the superuser)
    // mirrors what a one-time manual fix would look like for that
    // non-representative edge case, without changing anything
    // `provisionMediaReviewAdminRole` itself does.
    await adminPool.query(`
      do $$
      begin
        if exists (select 1 from pg_roles where rolname = 'keyforta_media_review_admin') then
          execute format('grant keyforta_media_review_admin to %I with admin option', '${restrictedRoleName}');
        end if;
        if exists (select 1 from pg_roles where rolname = 'keyforta_runtime') then
          execute format('grant keyforta_runtime to %I with admin option', '${restrictedRoleName}');
        end if;
      end
      $$;
    `);

    // Applying every migration -- including 0030's un-editable, immutable
    // `create role ... bypassrls` statement -- through this Azure-shaped
    // restricted role is the actual regression: it failed in production
    // (SQLSTATE 42501) before `provisionMediaReviewAdminRole` and migration
    // 0036 existed.
    restrictedClient = await restrictedPool.connect();
    await applyMigrations(restrictedClient);

    // A dedicated, uniquely named runtime login role (rather than the
    // shared `keyforta_test_runtime` other integration test files use)
    // keeps this file's role-membership bootstrapping above isolated from
    // unrelated parallel test files racing to create/alter that same
    // cluster-wide name.
    await restrictedClient.query(`
      drop role if exists ${runtimeRoleName};
      create role ${runtimeRoleName} login password 'synthetic-media-review-runtime-password'
        nosuperuser nocreatedb nocreaterole noinherit;
      grant keyforta_runtime to ${runtimeRoleName};
    `);

    runtimeClient = await runtimePool.connect();
    superuserSeedClient = await superuserSeedPool.connect();

    // node-postgres rejects multiple statements in one parameterized query,
    // so each insert runs as its own single-statement call. Seeding via the
    // superuser connection (rather than restrictedClient) is required
    // because FORCE ROW LEVEL SECURITY blocks even the table owner from
    // inserting fixture rows without BYPASSRLS.
    await superuserSeedClient.query(
      "insert into app.organizations (id, name) values ($1, 'Media review org A'), ($2, 'Media review org B')",
      [organizationA, organizationB],
    );
    await superuserSeedClient.query(
      `insert into app.properties (
         id, organization_id, name, property_type, address, time_zone, verification_status, publication_status
       ) values
         ($1, $3, 'Property A', 'apartment_building', '{"avenueOrStreet":"A","number":"1","quartier":"Q","commune":"C","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}', 'Africa/Kinshasa', 'pending', 'draft'),
         ($2, $4, 'Property B', 'apartment_building', '{"avenueOrStreet":"B","number":"2","quartier":"Q","commune":"C","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}', 'Africa/Kinshasa', 'pending', 'draft')`,
      [propertyA, propertyB, organizationA, organizationB],
    );
    await superuserSeedClient.query(
      `insert into app.units (
         id, organization_id, property_id, label, canonical_label, unit_type, bedrooms, bathrooms, furnishing_status, publication_status, availability_status
       ) values
         ($1, $3, $5, 'Unit A', 'unit-a', 'apartment', 1, 1, 'unfurnished', 'published', 'available'),
         ($2, $4, $6, 'Unit B', 'unit-b', 'apartment', 1, 1, 'unfurnished', 'published', 'available')`,
      [unitA, unitB, organizationA, organizationB, propertyA, propertyB],
    );
    await superuserSeedClient.query(
      `insert into app.public_listings (
         id, organization_id, property_id, unit_id, status, snapshot, created_at, media_review_status
       ) values
         ($1, $3, $5, $7, 'draft', '{"projection":{"summary":"pending review A"}}', now(), 'pending'),
         ($2, $4, $6, $8, 'draft', '{"projection":{"summary":"pending review B"}}', now(), 'pending')`,
      [listingA, listingB, organizationA, organizationB, propertyA, propertyB, unitA, unitB],
    );
    // One image on each organization's listing, so both the
    // same-organization and cross-organization image-read paths
    // (get_public_listing_image_content_for_review) have something
    // concrete to fetch as the runtime role below.
    await superuserSeedClient.query(
      `insert into app.public_listing_images (
         id, organization_id, public_listing_id, room, media_type, size_bytes, content, content_hash, position
       ) values
         ($1, $3, $5, 'living', 'image/png', 4, '\\x89504e47', '${"0".repeat(64)}', 0),
         ($2, $4, $6, 'living', 'image/png', 4, '\\x89504e47', '${"0".repeat(64)}', 0)`,
      [imageA, imageB, organizationA, organizationB, listingA, listingB],
    );
  });

  afterAll(async () => {
    restrictedClient.release();
    runtimeClient.release();
    superuserSeedClient.release();
    await restrictedPool.end();
    await runtimePool.end();
    await superuserSeedPool.end();
    await adminPool.query(`drop database if exists ${databaseName}`);
    // runtimeRoleName's membership grant records restrictedRoleName as the
    // grantor, so it must be dropped first or the role drop below fails
    // with "cannot be dropped because some objects depend on it".
    await adminPool.query(`drop role if exists ${runtimeRoleName}`);
    await adminPool.query(`drop role if exists ${restrictedRoleName}`);
    await adminPool.end();
  });


  it("applies every migration under Azure's exact restricted Entra-admin role attributes", async () => {
    const migrationCount = await restrictedClient.query<{ count: string }>(
      "select count(*)::text as count from app.schema_migrations",
    );
    expect(Number(migrationCount.rows[0]?.count)).toBeGreaterThanOrEqual(36);
  });

  it("transfers ownership of every media-review admin function to keyforta_media_review_admin", async () => {
    const owners = await restrictedClient.query<{ proname: string; owner: string }>(`
      select proname, proowner::regrole::text as owner
      from pg_proc
      where proname in (
        'review_public_listing_media',
        'list_public_listings_pending_media_review',
        'get_public_listing_image_content_for_review'
      )
    `);
    expect(owners.rows).toHaveLength(3);
    for (const row of owners.rows) {
      expect(row.owner).toBe("keyforta_media_review_admin");
    }
  });

  it("still lets the platform-admin console see pending-review listings across every organization", async () => {
    await runtimeClient.query("begin");
    try {
      await runtimeClient.query("set local role keyforta_runtime");
      const pending = await runtimeClient.query<{ listing_id: string }>(
        "select listing_id from app.list_public_listings_pending_media_review()",
      );
      const pendingIds = pending.rows.map((row) => row.listing_id);
      expect(pendingIds).toContain(listingA);
      expect(pendingIds).toContain(listingB);
    } finally {
      await runtimeClient.query("commit");
    }
  });

  it("lets the review mutation path decide on a pending listing in a different organization than the caller's own", async () => {
    await runtimeClient.query("begin");
    try {
      await runtimeClient.query("set local role keyforta_runtime");
      // The caller's own organization context is set to A, but the
      // decision targets listingB (organization B) -- exercising the
      // review mutation exactly as the platform-admin console does
      // (deciding on any organization's pending listing), which only
      // works because app.review_public_listing_media is SECURITY
      // DEFINER, owned by keyforta_media_review_admin, and covered by the
      // 0036 policies rather than the caller's own organization-scoped
      // isolation policies.
      await runtimeClient.query(
        "select set_config('app.organization_id', $1, true)",
        [organizationA],
      );
      const decision = await runtimeClient.query<{
        listing_id: string;
        media_review_status: string;
      }>(
        `select * from app.review_public_listing_media($1, 'rejected', 'reviewer@keyforta.test', $2, 'synthetic rejection notes', 'corr-media-review-test', 'test-suite')`,
        [listingB, organizationB],
      );
      expect(decision.rows).toHaveLength(1);
      expect(decision.rows[0]?.listing_id).toBe(listingB);
      expect(decision.rows[0]?.media_review_status).toBe("rejected");
    } finally {
      await runtimeClient.query("commit");
    }

    // Verified via the superuser seed connection (which bypasses RLS
    // entirely) rather than another runtimeClient query, since ordinary
    // runtime sessions can only read listing rows through organization-
    // scoped policies/functions, not this test's cross-organization
    // assertion.
    const persisted = await superuserSeedClient.query<{ media_review_status: string }>(
      "select media_review_status from app.public_listings where id = $1",
      [listingB],
    );
    expect(persisted.rows[0]?.media_review_status).toBe("rejected");
  });

  it("lets the image-read path fetch a pending image in a different organization than the caller's own", async () => {
    await runtimeClient.query("begin");
    try {
      await runtimeClient.query("set local role keyforta_runtime");
      await runtimeClient.query(
        "select set_config('app.organization_id', $1, true)",
        [organizationB],
      );
      // listingA/imageA (organization A) is used here -- not listingB,
      // which the previous test already moved out of 'pending' review
      // status -- while the caller's own organization context is B, so
      // this still exercises the cross-organization image-read path.
      const content = await runtimeClient.query<{ media_type: string; content: Buffer }>(
        "select media_type, content from app.get_public_listing_image_content_for_review($1, $2)",
        [listingA, imageA],
      );
      expect(content.rows).toHaveLength(1);
      expect(content.rows[0]?.media_type).toBe("image/png");
    } finally {
      await runtimeClient.query("commit");
    }
  });

  it("still denies an ordinary runtime session direct cross-organization mutation of those same tables", async () => {
    await runtimeClient.query("begin");
    try {
      await runtimeClient.query("set local role keyforta_runtime");
      await runtimeClient.query(
        "select set_config('app.organization_id', $1, true)",
        ["00000000-0000-4000-8000-0000000ba00a"],
      );
      // keyforta_runtime never has direct table-level UPDATE on
      // app.public_listings (it must go through a SECURITY DEFINER
      // command function), so this fails on privilege grounds alone,
      // independent of the 0036 media-review-admin policies -- proving
      // ordinary request handling is exactly as restricted as before.
      await expect(
        runtimeClient.query(
          "update app.public_listings set status = 'withdrawn' where organization_id = $1",
          ["00000000-0000-4000-8000-0000000ba00b"],
        ),
      ).rejects.toThrow(/permission denied/);
      await runtimeClient.query("rollback");
    } catch (error) {
      await runtimeClient.query("rollback");
      throw error;
    }
  });

  it("still blocks a role with direct table grants but no media-review-admin membership from seeing another organization's pending listing", async () => {
    // This is the actual RLS boundary the 0036 policies establish: they
    // are scoped `to keyforta_media_review_admin` specifically, not to
    // PUBLIC or every role with a raw table grant. A role that has direct
    // SELECT on app.public_listings but is *not* a member of
    // keyforta_media_review_admin must still be denied visibility by
    // FORCE ROW LEVEL SECURITY, proving the new policies don't
    // accidentally widen access beyond the one role they name.
    const directGrantRoleName = `keyforta_direct_grant_${process.pid}`;
    await adminPool.query(`
      drop role if exists ${directGrantRoleName};
      create role ${directGrantRoleName} login password 'synthetic-direct-grant-password'
        nosuperuser nocreatedb nocreaterole noinherit;
    `);
    // The role above is cluster-wide (created via adminPool, which
    // connects to the base test database), but the GRANT below must run
    // against this test's own per-test database/schema, so it goes
    // through superuserSeedClient instead.
    await superuserSeedClient.query(
      `grant usage on schema app to ${directGrantRoleName}`,
    );
    await superuserSeedClient.query(
      `grant select on app.public_listings to ${directGrantRoleName}`,
    );
    const directGrantDatabaseUrl = databaseUrl ? new URL(databaseUrl) : undefined;
    if (directGrantDatabaseUrl) {
      directGrantDatabaseUrl.username = directGrantRoleName;
      directGrantDatabaseUrl.password = "synthetic-direct-grant-password";
    }
    const directGrantPool = new Pool({ connectionString: directGrantDatabaseUrl?.toString() });
    try {
      const directGrantClient = await directGrantPool.connect();
      try {
        // Even a raw SELECT grant on the table is not enough to see any
        // rows here: PostgreSQL evaluates every RLS policy's USING clause
        // (including the ordinary organization-scoped isolation policy,
        // which calls a helper function this role has no EXECUTE grant
        // on) before returning anything, so the query is denied outright
        // rather than silently returning zero rows -- an even stronger
        // guarantee that this role gains no visibility from the new 0036
        // policies, which are scoped `to keyforta_media_review_admin` and
        // never evaluated for it at all.
        await expect(
          directGrantClient.query("select id from app.public_listings where id = $1", [
            listingB,
          ]),
        ).rejects.toThrow(/permission denied/);
      } finally {
        directGrantClient.release();
      }
    } finally {
      await directGrantPool.end();
      // The GRANT above is an object dependency in this test's own
      // database, so it must be revoked there (via superuserSeedClient)
      // before the cluster-wide role can be dropped (via adminPool).
      await superuserSeedClient.query(
        `revoke select on app.public_listings from ${directGrantRoleName}`,
      );
      await superuserSeedClient.query(
        `revoke usage on schema app from ${directGrantRoleName}`,
      );
      await adminPool.query(`drop role if exists ${directGrantRoleName}`);
    }
  });
});
