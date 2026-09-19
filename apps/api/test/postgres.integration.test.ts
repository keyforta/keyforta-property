import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigration, applyMigrations } from "../src/migrate.js";
import { createRuntimeDatabaseClient } from "../src/database.js";
import { createPostgresInventoryGateway } from "../src/properties/inventory-gateway.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("PostgreSQL public discovery integration", () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const databaseName = `keyforta_public_discovery_${process.pid}`;
  const databaseUrl = testDatabaseUrl ? new URL(testDatabaseUrl) : undefined;
  if (databaseUrl) databaseUrl.pathname = `/${databaseName}`;
  const pool = new Pool({ connectionString: databaseUrl?.toString() });
  const runtimeDatabaseUrl = databaseUrl ? new URL(databaseUrl) : undefined;
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
        ('00000000-0000-4000-8000-000000000900', 'Synthetic organization A'),
        ('00000000-0000-4000-8000-000000000901', 'Synthetic organization B');
      insert into app.users (id, external_subject, display_name) values
        ('00000000-0000-4000-8000-000000000950', 'synthetic-landlord-a', 'Synthetic Landlord A'),
        ('00000000-0000-4000-8000-000000000951', 'synthetic-manager-a', 'Synthetic Manager A'),
        ('00000000-0000-4000-8000-000000000952', 'synthetic-manager-b', 'Synthetic Manager B')
      on conflict (external_subject) do update set display_name = excluded.display_name;
      insert into app.memberships (organization_id, user_id, role, active) values
        ('00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000950', 'landlord', true),
        ('00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000951', 'manager', true),
        ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000952', 'manager', true);
      insert into app.properties (
        id, organization_id, name, property_type, address, time_zone, verification_status, publication_status
      ) values
        ('00000000-0000-4000-8000-000000000910', '00000000-0000-4000-8000-000000000900', 'Synthetic A', 'apartment_building', '{"avenueOrStreet":"Avenue de la Paix","number":"10","quartier":"Gombe","commune":"Gombe","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}', 'Africa/Kinshasa', 'pending', 'draft'),
        ('00000000-0000-4000-8000-000000000911', '00000000-0000-4000-8000-000000000901', 'Synthetic B', 'apartment_building', '{"avenueOrStreet":"Boulevard du 30 Juin","number":"22","quartier":"Limete","commune":"Limete","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}', 'Africa/Kinshasa', 'pending', 'draft');
      insert into app.units (
        id, organization_id, property_id, label, canonical_label, unit_type, bedrooms, bathrooms, furnishing_status, publication_status, availability_status
      ) values
        ('00000000-0000-4000-8000-000000000920', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000910', 'Published', 'published', 'apartment', 2, 1, 'unfurnished', 'published', 'available'),
        ('00000000-0000-4000-8000-000000000921', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000910', 'Draft', 'draft', 'apartment', 2, 1, 'unfurnished', 'published', 'available'),
        ('00000000-0000-4000-8000-000000000922', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000911', 'Published', 'published', 'apartment', 3, 2, 'unfurnished', 'published', 'available');
      insert into app.manager_property_assignments (
        organization_id, property_id, manager_user_id, assigned_by_user_id
      ) values (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000910',
        '00000000-0000-4000-8000-000000000951',
        '00000000-0000-4000-8000-000000000950'
      );
      insert into app.public_listings (
        id, organization_id, property_id, unit_id, status, snapshot, published_at, created_at
      ) values
        (
          '00000000-0000-4000-8000-000000000930',
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000910',
          '00000000-0000-4000-8000-000000000920',
          'published',
          '{"propertyId":"00000000-0000-4000-8000-000000000910","propertyVersion":1,"unitId":"00000000-0000-4000-8000-000000000920","unitVersion":1,"pricingVersionId":"00000000-0000-4000-8000-000000000a30","availabilityVersionId":"00000000-0000-4000-8000-000000000a40","projection":{"id":"published-org-a","name":"Published organization A","summary":"Synthetic published listing for organization A.","city":"Kinshasa","district":"Gombe","bedrooms":2,"bathrooms":1,"monthlyRentMinor":"40000","currency":"USD","availableFrom":"2026-10-01","amenities":[],"imageUrls":["/a.jpg"]}}',
          '2026-09-02T00:00:00Z',
          '2026-08-01T00:00:00Z'
        ),
        (
          '00000000-0000-4000-8000-000000000931',
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000910',
          '00000000-0000-4000-8000-000000000921',
          'draft',
          '{"propertyId":"00000000-0000-4000-8000-000000000910","propertyVersion":1,"unitId":"00000000-0000-4000-8000-000000000921","unitVersion":1,"pricingVersionId":"00000000-0000-4000-8000-000000000a31","availabilityVersionId":"00000000-0000-4000-8000-000000000a41","projection":{"id":"draft-org-a","name":"Draft organization A","summary":"Synthetic draft listing that must remain private.","city":"Kinshasa","district":"Gombe","bedrooms":2,"bathrooms":1,"monthlyRentMinor":"30000","currency":"USD","availableFrom":"2026-10-01","amenities":[],"imageUrls":["/draft.jpg"]}}',
          null,
          '2026-08-03T00:00:00Z'
        ),
        (
          '00000000-0000-4000-8000-000000000932',
          '00000000-0000-4000-8000-000000000901',
          '00000000-0000-4000-8000-000000000911',
          '00000000-0000-4000-8000-000000000922',
          'published',
          '{"propertyId":"00000000-0000-4000-8000-000000000911","propertyVersion":1,"unitId":"00000000-0000-4000-8000-000000000922","unitVersion":1,"pricingVersionId":"00000000-0000-4000-8000-000000000a32","availabilityVersionId":"00000000-0000-4000-8000-000000000a42","projection":{"id":"published-org-b","name":"Published organization B","summary":"Synthetic published listing for organization B.","city":"Kinshasa","district":"Limete","bedrooms":3,"bathrooms":2,"monthlyRentMinor":"60000","currency":"USD","availableFrom":"2026-10-01","amenities":[],"imageUrls":["/b.jpg"]}}',
          '2026-09-01T00:00:00Z',
          '2026-08-02T00:00:00Z'
        );
      insert into app.unit_pricing_versions (
        id, organization_id, unit_id, amount_minor, currency, billing_period, effective_from, created_by, correlation_id, source
      ) values
        ('00000000-0000-4000-8000-000000000a30', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000920', 40000, 'USD', 'month', '2026-09-01T00:00:00Z', '00000000-0000-4000-8000-000000000950', 'pricing-a', 'integration_test'),
        ('00000000-0000-4000-8000-000000000a31', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000921', 30000, 'USD', 'month', '2026-09-01T00:00:00Z', '00000000-0000-4000-8000-000000000950', 'pricing-draft', 'integration_test'),
        ('00000000-0000-4000-8000-000000000a32', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000922', 60000, 'USD', 'month', '2026-09-01T00:00:00Z', '00000000-0000-4000-8000-000000000952', 'pricing-b', 'integration_test');
      insert into app.unit_availability_versions (
        id, organization_id, unit_id, status, effective_from, created_by, correlation_id, source
      ) values
        ('00000000-0000-4000-8000-000000000a40', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000920', 'available', '2026-09-01T00:00:00Z', '00000000-0000-4000-8000-000000000950', 'availability-a', 'integration_test'),
        ('00000000-0000-4000-8000-000000000a41', '00000000-0000-4000-8000-000000000900', '00000000-0000-4000-8000-000000000921', 'available', '2026-09-01T00:00:00Z', '00000000-0000-4000-8000-000000000950', 'availability-draft', 'integration_test'),
        ('00000000-0000-4000-8000-000000000a42', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000922', 'available', '2026-09-01T00:00:00Z', '00000000-0000-4000-8000-000000000952', 'availability-b', 'integration_test');
    `);
    runtimeClient = await runtimePool.connect();
  }, 30_000);

  afterAll(async () => {
    runtimeClient?.release();
    client?.release();
    await runtimePool.end();
    await pool.end();
    await adminPool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
    await adminPool.query(`drop database if exists ${databaseName}`);
    await adminPool.end();
  });

  it("applies every current-runtime migration and reruns without changing the ledger", async () => {
    await applyMigrations(client);
    const result = await client.query<{ count: string }>(
      "select count(*)::text as count from app.schema_migrations",
    );
    expect(result.rows[0]?.count).toBe("26");
  });

  it("accepts same-organization and rejects cross-organization parent references", async () => {
    await client.query(`
      insert into app.tenant_applications (
        id, organization_id, tenant_user_id, identity, household_members,
        employment, current_housing, emergency_contact, desired_move_in_date,
        occupants, declarations
      ) values
        (
          '00000000-0000-4000-8000-000000000980',
          '00000000-0000-4000-8000-000000000901',
          '00000000-0000-4000-8000-000000000952',
          '{}', '[]', '{"monthlyIncomeMinor":"1","currency":"USD"}',
          '{}', '{}', '2026-11-01', 1, '{}'
        ),
        (
          '00000000-0000-4000-8000-000000000984',
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000950',
          '{}', '[]', '{"monthlyIncomeMinor":"1","currency":"USD"}',
          '{}', '{}', '2026-11-01', 1, '{}'
        );
      insert into app.tenant_application_reviews (
        organization_id, application_id, reviewer_user_id, decision, notes
      ) values (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000984',
        '00000000-0000-4000-8000-000000000950',
        'approve', 'Synthetic same-organization review'
      );
      insert into app.tenant_application_documents (
        organization_id, application_id, uploaded_by_user_id, document_type,
        blob_name, file_name, content_type, size_bytes, content_sha256, version
      ) values (
        '00000000-0000-4000-8000-000000000900',
        '00000000-0000-4000-8000-000000000984',
        '00000000-0000-4000-8000-000000000950',
        'identity', 'synthetic/same-organization', 'synthetic.pdf',
        'application/pdf', 1, repeat('b', 64), 1
      );
      insert into app.leases (
        id, organization_id, unit_id, tenant_user_id, currency, base_rent_minor,
        starts_on, source_type, application_id, external_justification
      ) values
        (
          '00000000-0000-4000-8000-000000000985',
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000920',
          '00000000-0000-4000-8000-000000000950',
          'USD', 100, '2026-11-01', 'platform_application',
          '00000000-0000-4000-8000-000000000984', null
        ),
        (
          '00000000-0000-4000-8000-000000000986',
          '00000000-0000-4000-8000-000000000901',
          '00000000-0000-4000-8000-000000000922',
          '00000000-0000-4000-8000-000000000952',
          'USD', 100, '2026-11-01', 'external', null,
          'Synthetic historical lease for organization B.'
        );
      insert into app.payments (
        id, organization_id, lease_id, amount_minor, currency, status,
        idempotency_key, provider_reference, actor_id, correlation_id
      ) values (
        '00000000-0000-4000-8000-000000000987',
        '00000000-0000-4000-8000-000000000901',
        '00000000-0000-4000-8000-000000000986', 100, 'USD', 'posted',
        'synthetic-payment-b', 'synthetic-payment-b',
        '00000000-0000-4000-8000-000000000952', 'synthetic-payment-b'
      );
      insert into app.membership_invitations (
        id, organization_id, invited_by_user_id, recipient_email,
        role, token_hash, expires_at
      ) values (
        '00000000-0000-4000-8000-000000000988',
        '00000000-0000-4000-8000-000000000901',
        '00000000-0000-4000-8000-000000000952',
        'synthetic-invite@example.test', 'tenant', 'synthetic-invite-b',
        transaction_timestamp() + interval '1 day'
      );
      insert into app.landlord_onboarding_applications (
        id, applicant_subject, applicant_object_id, applicant_name,
        proposed_organization_name, submitted_correlation_id
      ) values (
        '00000000-0000-4000-8000-000000000989', 'synthetic-onboarding',
        '00000000-0000-4000-8000-000000000989', 'Synthetic Applicant',
        'Synthetic Organization', 'synthetic-onboarding'
      )
    `);

    await expect(
      client.query(`
        insert into app.units (
          id, organization_id, property_id, label, canonical_label, unit_type,
          bedrooms, bathrooms, furnishing_status, publication_status, availability_status
        ) values (
          '00000000-0000-4000-8000-000000000981',
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000911',
          'Cross organization unit', 'cross organization unit', 'apartment',
          1, 1, 'unfurnished', 'draft', 'available'
        )
      `),
    ).rejects.toThrow(/units_organization_property_fkey/);

    await expect(
      client.query(`
        insert into app.tenant_application_reviews (
          organization_id, application_id, reviewer_user_id, decision, notes
        ) values (
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000980',
          '00000000-0000-4000-8000-000000000950',
          'approve', 'Synthetic cross-organization review'
        )
      `),
    ).rejects.toThrow(/tenant_application_reviews_organization_application_fkey/);

    await expect(
      client.query(`
        insert into app.tenant_application_documents (
          organization_id, application_id, uploaded_by_user_id, document_type,
          blob_name, file_name, content_type, size_bytes, content_sha256, version
        ) values (
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000980',
          '00000000-0000-4000-8000-000000000950',
          'identity', 'synthetic/cross-organization', 'synthetic.pdf',
          'application/pdf', 1, repeat('a', 64), 1
        )
      `),
    ).rejects.toThrow(/tenant_application_documents_organization_application_fkey/);

    await expect(
      client.query(`
        insert into app.leases (
          organization_id, unit_id, tenant_user_id, currency, base_rent_minor,
          starts_on, source_type, application_id
        ) values (
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000920',
          '00000000-0000-4000-8000-000000000950',
          'USD', 100, '2026-11-01', 'platform_application',
          '00000000-0000-4000-8000-000000000980'
        )
      `),
    ).rejects.toThrow(/leases_organization_application_fkey/);

    await expect(
      client.query(`
        insert into app.payments (
          organization_id, lease_id, amount_minor, currency, status,
          idempotency_key, provider_reference, reverses_payment_id,
          reason, actor_id, correlation_id
        ) values (
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000985', -100, 'USD', 'reversal',
          'synthetic-cross-reversal', 'synthetic-cross-reversal',
          '00000000-0000-4000-8000-000000000987', 'Synthetic reversal',
          '00000000-0000-4000-8000-000000000950', 'synthetic-cross-reversal'
        )
      `),
    ).rejects.toThrow(/payments_organization_reversal_fkey/);

    await expect(
      client.query(`
        insert into app.public_listing_inquiries (
          organization_id, listing_id, full_name, email, phone,
          message, correlation_id
        ) values (
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000932', 'Synthetic Visitor',
          'cross-listing@example.test', '+243000000000', null,
          'synthetic-cross-listing'
        )
      `),
    ).rejects.toThrow(/public_listing_inquiries_organization_listing_fkey/);

    await expect(
      client.query(`
        update app.membership_invitation_tokens
        set organization_id = '00000000-0000-4000-8000-000000000900'
        where invitation_id = '00000000-0000-4000-8000-000000000988'
      `),
    ).rejects.toThrow(/membership_invitation_tokens_organization_invitation_fkey/);

    await expect(
      client.query(`
        insert into app.landlord_onboarding_decisions (
          application_id, applicant_subject, applicant_object_id,
          applicant_name, administrator_subject, administrator_object_id,
          outcome, reason, correlation_id, organization_id, user_id, membership_id
        )
        select
          '00000000-0000-4000-8000-000000000989', 'synthetic-onboarding',
          '00000000-0000-4000-8000-000000000989', 'Synthetic Applicant',
          'synthetic-admin', '00000000-0000-4000-8000-000000000950',
          'approved', 'Synthetic cross-organization decision',
          'synthetic-cross-membership',
          '00000000-0000-4000-8000-000000000900', membership.user_id,
          membership.id
        from app.memberships as membership
        where membership.organization_id = '00000000-0000-4000-8000-000000000901'
          and membership.user_id = '00000000-0000-4000-8000-000000000952'
      `),
    ).rejects.toThrow(/landlord_onboarding_decisions_organization_membership_fkey/);

    await expect(
      client.query(`
        insert into app.leases (
          organization_id, unit_id, tenant_user_id, currency, base_rent_minor,
          starts_on, source_type, external_justification, supersedes_lease_id
        ) values (
          '00000000-0000-4000-8000-000000000900',
          '00000000-0000-4000-8000-000000000920',
          '00000000-0000-4000-8000-000000000950', 'USD', 100,
          '2026-12-01', 'external', 'Synthetic replacement lease.',
          '00000000-0000-4000-8000-000000000986'
        )
      `),
    ).rejects.toThrow(/leases_organization_superseded_lease_fkey/);
  });

  it("preserves audit events as immutable history", async () => {
    const auditEventId = "00000000-0000-4000-8000-000000000982";
    await client.query(
      `insert into app.audit_events (
        id, organization_id, actor_id, correlation_id,
        action, entity_type, entity_id
      ) values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        auditEventId,
        "00000000-0000-4000-8000-000000000900",
        "00000000-0000-4000-8000-000000000950",
        "synthetic-audit-immutability",
        "synthetic.created",
        "synthetic",
        "00000000-0000-4000-8000-000000000983",
      ],
    );

    await expect(
      client.query("update app.audit_events set action = $1 where id = $2", [
        "synthetic.changed",
        auditEventId,
      ]),
    ).rejects.toThrow(/audit history is immutable/);
    await expect(
      client.query("delete from app.audit_events where id = $1", [auditEventId]),
    ).rejects.toThrow(/audit history is immutable/);
    await expect(client.query("truncate app.audit_events")).rejects.toThrow(
      /audit history is immutable/,
    );

    const preserved = await client.query<{ action: string }>(
      "select action from app.audit_events where id = $1",
      [auditEventId],
    );
    expect(preserved.rows[0]?.action).toBe("synthetic.created");

    for (const statement of [
      "update app.audit_events set action = 'runtime.changed' where id = $1",
      "delete from app.audit_events where id = $1",
      "truncate app.audit_events",
    ]) {
      await runtimeClient.query("begin");
      await runtimeClient.query("set local role keyforta_runtime");
      try {
        const parameters = statement.startsWith("truncate") ? [] : [auditEventId];
        await expect(runtimeClient.query(statement, parameters)).rejects.toThrow(
          /permission denied|audit history is immutable/,
        );
      } finally {
        await runtimeClient.query("rollback");
      }
    }
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
      );
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
      result = await runtimeClient.query<{ items: Array<{ slug: string }> }>(
        "select items from app.list_public_listings_page($1, $2, $3, $4, $5, $6, $7)",
        [null, null, null, null, "created_at_desc", null, 100],
      );
      await runtimeClient.query("commit");
    } catch (error) {
      await runtimeClient.query("rollback");
      throw error;
    }
    expect(result.rows[0]?.items.map(({ slug }) => slug)).toEqual([
      "published-org-b",
      "published-org-a",
    ])
  });

  it("uses one lifecycle eligibility predicate for list, detail, and inquiry", async () => {
    const lifecycleCases = [
      {
        disable: `update app.properties set publication_status = 'paused'
          where id = '00000000-0000-4000-8000-000000000911'`,
        restore: `update app.properties set publication_status = 'draft'
          where id = '00000000-0000-4000-8000-000000000911'`,
      },
      {
        disable: `update app.units set publication_status = 'paused'
          where id = '00000000-0000-4000-8000-000000000922'`,
        restore: `update app.units set publication_status = 'published'
          where id = '00000000-0000-4000-8000-000000000922'`,
      },
      {
        disable: `
          update app.unit_availability_versions
          set effective_to = transaction_timestamp()
          where unit_id = '00000000-0000-4000-8000-000000000922'
            and effective_to is null;
          insert into app.unit_availability_versions (
            id, organization_id, unit_id, status, reason_code, effective_from,
            created_by, correlation_id, source
          ) values (
            '00000000-0000-4000-8000-000000000a52',
            '00000000-0000-4000-8000-000000000901',
            '00000000-0000-4000-8000-000000000922',
            'unavailable',
            'synthetic_test_disable',
            transaction_timestamp(),
            '00000000-0000-4000-8000-000000000952',
            'availability-b-disable',
            'integration_test'
          );
        `,
        restore: `
          update app.unit_availability_versions
          set effective_to = transaction_timestamp()
          where id = '00000000-0000-4000-8000-000000000a52'
            and effective_to is null;
          insert into app.unit_availability_versions (
            id, organization_id, unit_id, status, reason_code, effective_from,
            created_by, correlation_id, source
          ) values (
            '00000000-0000-4000-8000-000000000a62',
            '00000000-0000-4000-8000-000000000901',
            '00000000-0000-4000-8000-000000000922',
            'available',
            null,
            transaction_timestamp(),
            '00000000-0000-4000-8000-000000000952',
            'availability-b-restore',
            'integration_test'
          );
        `,
      },
      {
        disable: `update app.public_listings
          set status = 'withdrawn', withdrawn_at = transaction_timestamp()
          where id = '00000000-0000-4000-8000-000000000932'`,
        restore: `update app.public_listings
          set status = 'published', withdrawn_at = null
          where id = '00000000-0000-4000-8000-000000000932'`,
      },
    ];

    for (const [index, lifecycleCase] of lifecycleCases.entries()) {
      await client.query(lifecycleCase.disable);
      await runtimeClient.query("begin");
      await runtimeClient.query("set local role keyforta_runtime");
      try {
        const listed = await runtimeClient.query<{ items: Array<{ slug: string }> }>(
          "select items from app.list_public_listings_page($1, $2, $3, $4, $5, $6, $7)",
          [null, null, null, null, "created_at_desc", null, 100],
        );
        const page = await runtimeClient.query<{
          items: Array<{ slug: string }>;
        }>(
          "select items from app.list_public_listings_page($1, $2, $3, $4, $5, $6, $7)",
          [null, null, null, null, "created_at_desc", null, 100],
        );
        const detail = await runtimeClient.query(
          "select * from app.get_public_listing($1)",
          ["published-org-b"],
        );
        const inquiry = await runtimeClient.query<{ accepted: boolean }>(
          `select app.create_public_listing_inquiry(
            $1, $2, $3, $4, $5, $6, $7, $8
          ) as accepted`,
          [
            "published-org-b",
            "Synthetic Hidden Visitor",
            `hidden-${index}@example.test`,
            null,
            null,
            "Synthetic inquiry for an ineligible listing",
            "en",
            `synthetic-hidden-inquiry-${index}`,
          ],
        );
        await runtimeClient.query("commit");


        expect(page.rows[0]?.items.map(({ slug }) => slug)).not.toContain(
          "published-org-b",
        );
        expect(detail.rowCount).toBe(0);
        expect(inquiry.rows[0]?.accepted).toBe(false);
      } catch (error) {
        await runtimeClient.query("rollback");
        throw error;
      } finally {
        await client.query(lifecycleCase.restore);
      }
    }
  });

  it("authorizes only the assigned property manager, including a self-assigned landlord", async () => {
    const setPublication = async (
      subject: string,
      organizationId: string,
      published: boolean,
      correlationId: string,
    ) => {
      await runtimeClient.query("begin");
      await runtimeClient.query("set local role keyforta_runtime");
      try {
        await runtimeClient.query("select * from app.resolve_actor($1, $2)", [
          subject,
          organizationId,
        ]);
        await runtimeClient.query(
          "select set_config('app.correlation_id', $1, true)",
          [correlationId],
        );
        const result = await runtimeClient.query<{ changed: boolean }>(
          "select app.set_public_listing_publication($1, $2) as changed",
          ["00000000-0000-4000-8000-000000000930", published],
        );
        await runtimeClient.query("commit");
        return result.rows[0]?.changed;
      } catch (error) {
        await runtimeClient.query("rollback");
        throw error;
      }
    };

    expect(
      await setPublication(
        "synthetic-landlord-a",
        "00000000-0000-4000-8000-000000000900",
        false,
        "synthetic-unassigned-landlord",
      ),
    ).toBe(false);
    expect(
      await setPublication(
        "synthetic-manager-a",
        "00000000-0000-4000-8000-000000000900",
        false,
        "synthetic-manager-withdrawal",
      ),
    ).toBe(false);

    await runtimeClient.query("begin");
    await runtimeClient.query("set local role keyforta_runtime");
    await runtimeClient.query("select * from app.resolve_actor($1, $2)", [
      "synthetic-landlord-a",
      "00000000-0000-4000-8000-000000000900",
    ]);
    await runtimeClient.query(
      "select set_config('app.correlation_id', $1, true)",
      ["synthetic-landlord-self-assignment"],
    );
    const assignment = await runtimeClient.query<{ changed: boolean }>(
      "select app.set_manager_property_assignment($1, $2, true) as changed",
      [
        "00000000-0000-4000-8000-000000000910",
        "00000000-0000-4000-8000-000000000950",
      ],
    );
    await runtimeClient.query("commit");
    expect(assignment.rows[0]?.changed).toBe(true);

    const activeAssignments = await client.query<{
      manager_user_id: string;
    }>(`
      select manager_user_id::text
      from app.manager_property_assignments
      where organization_id = '00000000-0000-4000-8000-000000000900'
        and property_id = '00000000-0000-4000-8000-000000000910'
        and revoked_at is null
    `);
    expect(activeAssignments.rows).toEqual([
      { manager_user_id: "00000000-0000-4000-8000-000000000950" },
    ]);

    const assignmentEvents = await client.query<{
      action: string;
      manager_user_id: string;
    }>(`
      select action, manager_user_id::text
      from app.manager_property_assignment_events
      where organization_id = '00000000-0000-4000-8000-000000000900'
        and property_id = '00000000-0000-4000-8000-000000000910'
      order by action, manager_user_id
    `);
    expect(assignmentEvents.rows).toEqual([
      {
        action: "assigned",
        manager_user_id: "00000000-0000-4000-8000-000000000950",
      },
      {
        action: "revoked",
        manager_user_id: "00000000-0000-4000-8000-000000000951",
      },
    ]);
    await expect(
      client.query(
        "delete from app.manager_property_assignment_events where organization_id = $1",
        ["00000000-0000-4000-8000-000000000900"],
      ),
    ).rejects.toThrow(/manager assignment history is immutable/);

    expect(
      await setPublication(
        "synthetic-manager-a",
        "00000000-0000-4000-8000-000000000900",
        true,
        "synthetic-replaced-manager",
      ),
    ).toBe(false);
    expect(
      await setPublication(
        "synthetic-landlord-a",
        "00000000-0000-4000-8000-000000000900",
        true,
        "synthetic-self-manager-publication",
      ),
    ).toBe(false);

    const events = await client.query<{
      action: string;
      actor_id: string;
      correlation_id: string;
      organization_id: string;
    }>(`
      select action, actor_id::text, correlation_id, organization_id::text
      from app.public_listing_publication_events
      where listing_id = '00000000-0000-4000-8000-000000000930'
      order by occurred_at, id
    `);
    expect(events.rows).toEqual([]);

    await client.query(
      "update app.public_listing_publication_events set correlation_id = 'changed' where listing_id = $1",
      ["00000000-0000-4000-8000-000000000930"],
    );
  });

  it("denies unassigned, revoked, and cross-organization publication", async () => {
    await client.query(`
      update app.manager_property_assignments
      set revoked_at = transaction_timestamp()
      where organization_id = '00000000-0000-4000-8000-000000000900'
        and property_id = '00000000-0000-4000-8000-000000000910'
        and manager_user_id = '00000000-0000-4000-8000-000000000951'
    `);

    for (const [subject, organizationId] of [
      ["synthetic-manager-a", "00000000-0000-4000-8000-000000000900"],
      ["synthetic-manager-b", "00000000-0000-4000-8000-000000000901"],
    ]) {
      await runtimeClient.query("begin");
      await runtimeClient.query("set local role keyforta_runtime");
      try {
        await runtimeClient.query("select * from app.resolve_actor($1, $2)", [
          subject,
          organizationId,
        ]);
        await runtimeClient.query(
          "select set_config('app.correlation_id', $1, true)",
          [`synthetic-denied-${subject}`],
        );
        const result = await runtimeClient.query<{ changed: boolean }>(
          "select app.set_public_listing_publication($1, false) as changed",
          ["00000000-0000-4000-8000-000000000930"],
        );
        await runtimeClient.query("commit");
        expect(result.rows[0]?.changed).toBe(false);
      } catch (error) {
        await runtimeClient.query("rollback");
        throw error;
      }
    }
  });

  it("denies manager-created assignments", async () => {
    await runtimeClient.query("begin");
    await runtimeClient.query("set local role keyforta_runtime");
    try {
      await runtimeClient.query("select * from app.resolve_actor($1, $2)", [
        "synthetic-manager-a",
        "00000000-0000-4000-8000-000000000900",
      ]);
      await runtimeClient.query(
        "select set_config('app.correlation_id', $1, true)",
        ["synthetic-manager-self-assignment"],
      );
      const result = await runtimeClient.query<{ changed: boolean }>(
        "select app.set_manager_property_assignment($1, $2, true) as changed",
        [
          "00000000-0000-4000-8000-000000000910",
          "00000000-0000-4000-8000-000000000951",
        ],
      );
      await runtimeClient.query("commit");
      expect(result.rows[0]?.changed).toBe(false);
    } catch (error) {
      await runtimeClient.query("rollback");
      throw error;
    }
  });

  it("denies direct runtime listing status mutation", async () => {
    await runtimeClient.query("begin");
    await runtimeClient.query("set local role keyforta_runtime");
    try {
      await runtimeClient.query(
        "select set_config('app.organization_id', $1, true)",
        ["00000000-0000-4000-8000-000000000900"],
      );
      await expect(
        runtimeClient.query(
          "update app.public_listings set status = 'withdrawn' where id = $1",
          ["00000000-0000-4000-8000-000000000930"],
        ),
      ).rejects.toThrow(/permission denied/);
      await runtimeClient.query("rollback");
    } catch (error) {
      await runtimeClient.query("rollback");
      throw error;
    }
  });

  it("filters and paginates published listings inside PostgreSQL", async () => {
    await client.query(`
      update app.public_listings
      set status = 'published'
      where id in (
        '00000000-0000-4000-8000-000000000930',
        '00000000-0000-4000-8000-000000000932'
      )
    `);

    const listPage = async (cursor: string | null) => {
      await runtimeClient.query("begin");
      await runtimeClient.query("set local role keyforta_runtime");
      try {
        const result = await runtimeClient.query<{
          cursor_valid: boolean;
          items: Array<{ slug: string }>;
          next_cursor: string | null;
          total_count: string;
        }>(
          "select * from app.list_public_listings_page($1, $2, $3, $4, $5, $6, $7)",
          ["Kinshasa", null, 2, "70000", "created_at_desc", cursor, 1],
        );
        await runtimeClient.query("commit");
        return result.rows[0]!;
      } catch (error) {
        await runtimeClient.query("rollback");
        throw error;
      }
    };

    const firstPage = await listPage(null);
    expect(firstPage).toEqual({
      cursor_valid: true,
      items: [expect.objectContaining({ slug: "published-org-b" })],
      next_cursor: "published-org-b",
      total_count: "2",
    });

    const secondPage = await listPage(firstPage.next_cursor);
    expect(secondPage).toEqual({
      cursor_valid: true,
      items: [expect.objectContaining({ slug: "published-org-a" })],
      next_cursor: null,
      total_count: "2",
    });

    const invalidPage = await listPage("missing-listing");
    expect(invalidPage).toEqual({
      cursor_valid: false,
      items: [],
      next_cursor: null,
      total_count: "2",
    });
  });

  it("requires an active jurisdiction policy before a Property can be verified, and allows CD-KN once activated", async () => {
    await client.query(`
      update app.properties
      set jurisdiction_code = 'CD-KN'
      where id = '00000000-0000-4000-8000-000000000910';
    `);

    await expect(
      client.query(
        "select * from app.set_property_verification_status($1, $2, $3)",
        [
          "00000000-0000-4000-8000-000000000910",
          "verified",
          "00000000-0000-4000-8000-000000000950",
        ],
      ),
    ).rejects.toThrow(/active jurisdiction policy/);

    await client.query(`
      insert into app.jurisdiction_policy_versions (
        id, policy_key, jurisdiction_code, version, rule_payload,
        requires_counsel_approval, created_by_user_id
      ) values (
        '00000000-0000-4000-8000-000000000970',
        'property_verification',
        'CD-KN',
        1,
        '{}'::jsonb,
        false,
        '00000000-0000-4000-8000-000000000950'
      );
      insert into app.policy_approval_evidence (
        id, policy_version_id, approval_role, approved_by_user_id, source_reference
      ) values (
        '00000000-0000-4000-8000-000000000971',
        '00000000-0000-4000-8000-000000000970',
        'policy_owner',
        '00000000-0000-4000-8000-000000000950',
        'issue-79'
      );
    `);

    await runtimeClient.query("begin");
    await runtimeClient.query("set local role keyforta_runtime");
    await runtimeClient.query("select set_config('app.correlation_id', $1, true)", [
      "policy-activation-01",
    ]);
    const activation = await runtimeClient.query(
      "select app.activate_jurisdiction_policy($1, $2, $3, $4, $5, $6, $7) as id",
      [
        "00000000-0000-4000-8000-000000000970",
        "00000000-0000-4000-8000-000000000971",
        null,
        "2026-09-18T00:00:00Z",
        null,
        "00000000-0000-4000-8000-000000000950",
        "policy-activation-01",
      ],
    );
    expect((activation.rows[0] as { id?: string } | undefined)?.id).toBeDefined();
    const verified = await runtimeClient.query(
      "select * from app.set_property_verification_status($1, $2, $3)",
      [
        "00000000-0000-4000-8000-000000000910",
        "verified",
        "00000000-0000-4000-8000-000000000950",
      ],
    );
    await runtimeClient.query("commit");

    expect(verified.rows).toEqual([{
      property_id: "00000000-0000-4000-8000-000000000910",
      verification_status: "verified",
    }]);

    const property = await client.query<{ verification_status: string }>(
      "select verification_status from app.properties where id = $1",
      ["00000000-0000-4000-8000-000000000910"],
    );
    expect(property.rows[0]?.verification_status).toBe("verified");
  });

  it("activates jurisdiction policy through the runtime InventoryGateway for platform-admin-scoped actors", async () => {
    const runtimeDatabaseClient = createRuntimeDatabaseClient(runtimePool);
    const gateway = createPostgresInventoryGateway(runtimeDatabaseClient);

    const activation = await gateway.activateJurisdictionPolicy({
      correlationId: "gateway-policy-activation-01",
      effectiveFrom: "2026-09-18T00:00:00.000Z",
      jurisdictionCode: "CD-KN",
      ownerApproval: {
        approvedByUserId: "00000000-0000-4000-8000-000000000950",
        sourceReference: "issue-79",
      },
      policyKey: "property_verification",
      requiresCounselApproval: false,
      rulePayload: {},
      subject: "synthetic-landlord-a",
      version: 2,
    });

    expect(activation).toEqual(expect.objectContaining({
      jurisdictionCode: "CD-KN",
      policyKey: "property_verification",
      version: 2,
    }));

    const activationRows = await client.query<{
      correlation_id: string;
      jurisdiction_code: string;
      policy_key: string;
    }>(
      `select correlation_id, jurisdiction_code, policy_key
       from app.jurisdiction_policy_activations
       where correlation_id = $1`,
      ["gateway-policy-activation-01"],
    );
    expect(activationRows.rows).toEqual([{
      correlation_id: "gateway-policy-activation-01",
      jurisdiction_code: "CD-KN",
      policy_key: "property_verification",
    }]);
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