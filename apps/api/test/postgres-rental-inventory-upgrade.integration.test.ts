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

describePostgres("PostgreSQL 0022 rental-inventory v1.0 initialization", () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const databaseName = `keyforta_inventory_upgrade_${process.pid}`;
  const databaseUrl = testDatabaseUrl ? new URL(testDatabaseUrl) : undefined;
  if (databaseUrl) databaseUrl.pathname = `/${databaseName}`;
  const pool = new Pool({ connectionString: databaseUrl?.toString() });
  let client: PoolClient;

  beforeAll(async () => {
    await adminPool.query(`create database ${databaseName}`);
    client = await pool.connect();
    await client.query(`
      create schema app;
      create table app.schema_migrations (
        version text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationFiles = (await readdir(migrationDirectory))
      .filter((fileName) => /^00(0[1-9]|1[0-9]|2[01])_[a-z0-9_]+\.sql$/.test(fileName))
      .sort();
    for (const fileName of migrationFiles) {
      await applyMigration(
        client,
        fileName,
        await readFile(`${migrationDirectory}/${fileName}`, "utf8"),
      );
    }
  }, 30_000);

  afterAll(async () => {
    client?.release();
    await pool.end();
    await adminPool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
    await adminPool.query(`drop database if exists ${databaseName}`);
    await adminPool.end();
  });

  it("fails closed on existing customer data and initializes an empty v1.0 schema", async () => {
    const fileName = "0022_rental_inventory_v1.sql";
    const migration = await readFile(`${migrationDirectory}/${fileName}`, "utf8");

    await client.query(`
      insert into app.organizations (id, name)
      values ('00000000-0000-4000-8000-000000000c00', 'Existing organization')
    `);

    await expect(applyMigration(client, fileName, migration)).rejects.toThrow(
      /0022 blocked: database contains organization or customer data/,
    );

    const blocked = await client.query<{
      applied: boolean;
      legacy_address_exists: boolean;
      pricing_table_exists: boolean;
    }>(`
      select
        exists (
          select 1 from app.schema_migrations where version = '${fileName}'
        ) as applied,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'app'
            and table_name = 'properties'
            and column_name = 'address'
            and data_type = 'text'
        ) as legacy_address_exists,
        to_regclass('app.unit_pricing_versions') is not null as pricing_table_exists
    `);
    expect(blocked.rows[0]).toEqual({
      applied: false,
      legacy_address_exists: true,
      pricing_table_exists: false,
    });

    await client.query("delete from app.organizations");
    await client.query(`
      create function app.runtime_schema_v0022_ready()
      returns boolean language sql as 'select false'
    `);
    await expect(applyMigration(client, fileName, migration)).rejects.toThrow(
      /runtime_schema_v0022_ready.*already exists/,
    );
    const rolledBack = await client.query<{
      applied: boolean;
      legacy_address_exists: boolean;
      pricing_table_exists: boolean;
    }>(`
      select
        exists (
          select 1 from app.schema_migrations where version = '${fileName}'
        ) as applied,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'app'
            and table_name = 'properties'
            and column_name = 'address'
            and data_type = 'text'
        ) as legacy_address_exists,
        to_regclass('app.unit_pricing_versions') is not null as pricing_table_exists
    `);
    expect(rolledBack.rows[0]).toEqual(blocked.rows[0]);
    await client.query("drop function app.runtime_schema_v0022_ready()");

    await expect(applyMigration(client, fileName, migration)).resolves.toBe(true);
    await expect(applyMigration(client, fileName, migration)).resolves.toBe(false);
    await expect(
      applyMigration(client, fileName, `${migration}\n-- changed`),
    ).rejects.toThrow(/Applied migration checksum mismatch/);

    const initialized = await client.query<{
      applied: boolean;
      address_is_jsonb: boolean;
      canonical_label_required: boolean;
      pricing_table_exists: boolean;
      availability_table_exists: boolean;
      listing_snapshot_is_jsonb: boolean;
      previous_runtime_ready_exists: boolean;
      ready: boolean;
    }>(`
      select
        exists (
          select 1 from app.schema_migrations where version = '${fileName}'
        ) as applied,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'app'
            and table_name = 'properties'
            and column_name = 'address'
            and data_type = 'jsonb'
            and is_nullable = 'NO'
        ) as address_is_jsonb,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'app'
            and table_name = 'units'
            and column_name = 'canonical_label'
            and is_nullable = 'NO'
        ) as canonical_label_required,
        to_regclass('app.unit_pricing_versions') is not null as pricing_table_exists,
        to_regclass('app.unit_availability_versions') is not null as availability_table_exists,
        exists (
          select 1 from information_schema.columns
          where table_schema = 'app'
            and table_name = 'public_listings'
            and column_name = 'snapshot'
            and data_type = 'jsonb'
          ) as listing_snapshot_is_jsonb,
        to_regprocedure('app.runtime_schema_v0021_ready()') is not null
          as previous_runtime_ready_exists,
        app.runtime_schema_v0022_ready() as ready
    `);
    expect(initialized.rows[0]).toEqual({
      applied: true,
      address_is_jsonb: true,
      canonical_label_required: true,
      pricing_table_exists: true,
      availability_table_exists: true,
      listing_snapshot_is_jsonb: true,
      previous_runtime_ready_exists: false,
      ready: true,
    });
  });

  it("enforces strict inventory fields, organization references, and immutable intervals", async () => {
    await client.query(`
      insert into app.organizations (id, name) values
        ('00000000-0000-4000-8000-000000000c10', 'Inventory organization A'),
        ('00000000-0000-4000-8000-000000000c11', 'Inventory organization B');
      insert into app.users (id, external_subject, display_name) values
        ('00000000-0000-4000-8000-000000000c12', 'inventory-actor-a', 'Inventory Actor A'),
        ('00000000-0000-4000-8000-000000000c13', 'inventory-actor-b', 'Inventory Actor B');
      insert into app.memberships (organization_id, user_id, role, active) values
        ('00000000-0000-4000-8000-000000000c10', '00000000-0000-4000-8000-000000000c12', 'landlord', true),
        ('00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-000000000c13', 'landlord', true);
      insert into app.properties (
        id, organization_id, name, property_type, address, time_zone,
        verification_status, publication_status
      ) values
        (
          '00000000-0000-4000-8000-000000000c20',
          '00000000-0000-4000-8000-000000000c10',
          'Gombe Residence', 'apartment_building',
          '{"avenueOrStreet":"Avenue Kasa-Vubu","number":"42","quartier":"Socimat","commune":"Gombe","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}',
          'Africa/Kinshasa', 'pending', 'draft'
        ),
        (
          '00000000-0000-4000-8000-000000000c21',
          '00000000-0000-4000-8000-000000000c10',
          'Limete Residence', 'apartment_building',
          '{"avenueOrStreet":"Boulevard Lumumba","number":"7","quartier":"Industriel","commune":"Limete","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}',
          'Africa/Kinshasa', 'pending', 'draft'
        ),
        (
          '00000000-0000-4000-8000-000000000c22',
          '00000000-0000-4000-8000-000000000c11',
          'Ngaliema Residence', 'single_family',
          '{"avenueOrStreet":"Route de Matadi","number":"9","quartier":"Joli Parc","commune":"Ngaliema","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}',
          'Africa/Kinshasa', 'pending', 'draft'
        );
      insert into app.units (
        id, organization_id, property_id, label, canonical_label, unit_type,
        bedrooms, bathrooms, furnishing_status
      ) values
        (
          '00000000-0000-4000-8000-000000000c30',
          '00000000-0000-4000-8000-000000000c10',
          '00000000-0000-4000-8000-000000000c20',
          'Studio A', 'studio a', 'studio', 0, 1, 'unfurnished'
        ),
        (
          '00000000-0000-4000-8000-000000000c31',
          '00000000-0000-4000-8000-000000000c11',
          '00000000-0000-4000-8000-000000000c22',
          'House B', 'house b', 'house', 3, 2, 'unfurnished'
        );
      insert into app.manager_property_assignments (
        organization_id, property_id, manager_user_id, assigned_by_user_id,
        assigned_at
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c20',
        '00000000-0000-4000-8000-000000000c12',
        '00000000-0000-4000-8000-000000000c12',
        '2026-09-01T00:00:00Z'
      );
      insert into app.manager_property_assignment_events (
        id, organization_id, property_id, manager_user_id, actor_id,
        correlation_id, action, occurred_at
      ) values (
        '00000000-0000-4000-8000-000000000c70',
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c20',
        '00000000-0000-4000-8000-000000000c12',
        '00000000-0000-4000-8000-000000000c12',
        'inventory-test-assignment', 'assigned', '2026-09-01T00:00:00Z'
      )
    `);

    await expect(client.query(`
      insert into app.properties (
        organization_id, name, property_type, address, time_zone,
        verification_status, publication_status
      ) values (
        '00000000-0000-4000-8000-000000000c10', 'Invalid archive',
        'other',
        '{"avenueOrStreet":"A","number":"1","quartier":"Q","commune":"C","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}',
        'Africa/Kinshasa', 'pending', 'archived'
      )
    `)).rejects.toThrow(/properties_archive_metadata_check/);

    await expect(client.query(`
      insert into app.properties (
        organization_id, name, property_type, address, time_zone
      ) values (
        '00000000-0000-4000-8000-000000000c10', 'Invalid address', 'other',
        '{"city":"Kinshasa","countryCode":"CD"}', 'Africa/Kinshasa'
      )
    `)).rejects.toThrow(/properties_address_check/);

    await expect(client.query(`
      insert into app.properties (
        organization_id, name, property_type, address, time_zone
      ) values (
        '00000000-0000-4000-8000-000000000c10', ' Padded name', 'other',
        '{"avenueOrStreet":"A","number":"1","quartier":"Q","commune":"C","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}',
        'Africa/Kinshasa'
      )
    `)).rejects.toThrow(/properties_name_check/);

    await expect(client.query(`
      insert into app.properties (
        organization_id, name, property_type, address, time_zone
      ) values (
        '00000000-0000-4000-8000-000000000c10', 'Invalid zone', 'other',
        '{"avenueOrStreet":"A","number":"1","quartier":"Q","commune":"C","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}',
        'Not/A_Real_Zone'
      )
    `)).rejects.toThrow(/unknown Property time zone/);

    await expect(client.query(`
      insert into app.units (
        organization_id, property_id, label, canonical_label, unit_type,
        bedrooms, bathrooms, furnishing_status
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c20',
        'STUDIO A', 'studio a', 'studio', 0, 1, 'unfurnished'
      )
    `)).rejects.toThrow(/units_lifetime_label_key/);

    await expect(client.query(`
      insert into app.units (
        organization_id, property_id, label, canonical_label, unit_type,
        bedrooms, bathrooms, furnishing_status
      ) values (
        '00000000-0000-4000-8000-000000000c11',
        '00000000-0000-4000-8000-000000000c20',
        'Studio B', 'studio b', 'studio', 0, 1, 'unfurnished'
      )
    `)).rejects.toThrow(/units_organization_property_fkey/);

    await client.query(`
      insert into app.unit_pricing_versions (
        id, organization_id, unit_id, amount_minor, currency, billing_period,
        effective_from, effective_to, created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c40',
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c30',
        40000, 'USD', 'month', '2026-10-01T00:00:00Z',
        null, '00000000-0000-4000-8000-000000000c12',
        'inventory-test', 'manual'
      );
      insert into app.unit_availability_versions (
        id, organization_id, unit_id, status, reason_code, effective_from,
        effective_to, created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c50',
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c30',
        'available', null, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z',
        '00000000-0000-4000-8000-000000000c12', 'inventory-test', 'manual'
      )
    `);

    await expect(client.query(`
      insert into app.unit_pricing_versions (
        organization_id, unit_id, amount_minor, currency, billing_period,
        effective_from, effective_to, created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c30',
        45000, 'USD', 'month', '2026-10-15T00:00:00Z',
        '2026-12-01T00:00:00Z', '00000000-0000-4000-8000-000000000c12',
        'inventory-test-overlap', 'manual'
      )
    `)).rejects.toThrow(/unit_pricing_no_overlap/);

    await expect(client.query(`
      update app.unit_pricing_versions
      set amount_minor = 50000
      where id = '00000000-0000-4000-8000-000000000c40'
    `)).rejects.toThrow(/rental inventory history is immutable/);

    await expect(client.query(`
      insert into app.unit_pricing_versions (
        organization_id, unit_id, amount_minor, currency, billing_period,
        effective_from, created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c11',
        '00000000-0000-4000-8000-000000000c31', 50000, 'USD', 'month',
        'infinity', '00000000-0000-4000-8000-000000000c13',
        'inventory-test-infinity', 'manual'
      )
    `)).rejects.toThrow(/unit_pricing_versions_effective_period_check/);

    await client.query(`
      update app.unit_pricing_versions
      set effective_to = '2026-11-01T00:00:00Z'
      where id = '00000000-0000-4000-8000-000000000c40';
      insert into app.unit_pricing_versions (
        organization_id, unit_id, amount_minor, currency, billing_period,
        effective_from, created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c30', 45000, 'USD', 'month',
        '2026-11-01T00:00:00Z', '00000000-0000-4000-8000-000000000c12',
        'inventory-test-successor', 'manual'
      )
    `);

    await expect(client.query(`
      update app.unit_pricing_versions
      set effective_to = '2026-10-31T00:00:00Z'
      where id = '00000000-0000-4000-8000-000000000c40'
    `)).rejects.toThrow(/rental inventory history is immutable/);

    await expect(client.query(`
      insert into app.unit_availability_versions (
        organization_id, unit_id, status, reason_code, effective_from,
        created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c30',
        'reserved', null, '2026-12-01T00:00:00Z',
        '00000000-0000-4000-8000-000000000c12', 'inventory-test-reserved', 'manual'
      )
    `)).rejects.toThrow(/unit_availability_versions_status_check/);

    await expect(client.query(`
      insert into app.unit_availability_versions (
        organization_id, unit_id, status, reason_code, effective_from,
        created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c30',
        'unavailable', null, '2026-12-01T00:00:00Z',
        '00000000-0000-4000-8000-000000000c12', 'inventory-test-reason', 'manual'
      )
    `)).rejects.toThrow(/unit_availability_versions_reason_check/);

    await expect(client.query(`
      insert into app.unit_availability_versions (
        organization_id, unit_id, status, reason_code, effective_from,
        effective_to, created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c30',
        'available', null, '2026-10-15T00:00:00Z', '2026-12-01T00:00:00Z',
        '00000000-0000-4000-8000-000000000c12', 'inventory-test-availability-overlap', 'manual'
      )
    `)).rejects.toThrow(/unit_availability_no_overlap/);

    await expect(client.query(`
      insert into app.unit_availability_versions (
        organization_id, unit_id, status, reason_code, effective_from,
        effective_to, created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c11',
        '00000000-0000-4000-8000-000000000c31',
        'available', null, '2026-10-01T00:00:00Z', 'infinity',
        '00000000-0000-4000-8000-000000000c13',
        'inventory-test-infinity', 'manual'
      )
    `)).rejects.toThrow(/unit_availability_versions_effective_period_check/);

    await expect(client.query(`
      insert into app.public_listings (
        organization_id, property_id, unit_id
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c21',
        '00000000-0000-4000-8000-000000000c30'
      )
    `)).rejects.toThrow(/public_listings_organization_id_property_id_unit_id_fkey/);

    await client.query(`
      insert into app.public_listings (
        id, organization_id, property_id, unit_id, status, snapshot, published_at
      ) values (
        '00000000-0000-4000-8000-000000000c60',
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c20',
        '00000000-0000-4000-8000-000000000c30',
        'published', '{}', '2026-10-01T00:00:00Z'
      );
      insert into app.public_listing_publication_events (
        organization_id, listing_id, property_id, unit_id, actor_id,
        manager_assignment_event_id, listing_version, correlation_id,
        action, source
      ) values (
        '00000000-0000-4000-8000-000000000c10',
        '00000000-0000-4000-8000-000000000c60',
        '00000000-0000-4000-8000-000000000c20',
        '00000000-0000-4000-8000-000000000c30',
        '00000000-0000-4000-8000-000000000c12',
        '00000000-0000-4000-8000-000000000c70', 1, 'inventory-test-publication',
        'published', 'manual'
      )
    `);

    await client.query("begin");
    try {
      await client.query(
        "select set_config('app.organization_id', '00000000-0000-4000-8000-000000000c10', true)",
      );
      await client.query(
        "select set_config('app.actor_id', '00000000-0000-4000-8000-000000000c12', true)",
      );
      await client.query(
        "select set_config('app.correlation_id', 'inventory-test-reassignment', true)",
      );
      await expect(client.query(`
        select app.set_manager_property_assignment(
          '00000000-0000-4000-8000-000000000c20',
          '00000000-0000-4000-8000-000000000c12', false
        )
      `)).resolves.toBeDefined();
      await expect(client.query(`
        select app.set_manager_property_assignment(
          '00000000-0000-4000-8000-000000000c20',
          '00000000-0000-4000-8000-000000000c12', true
        )
      `)).resolves.toBeDefined();
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    await client.query(`
      insert into app.unit_pricing_versions (
        organization_id, unit_id, amount_minor, currency, billing_period,
        effective_from, created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c11',
        '00000000-0000-4000-8000-000000000c31', 50000, 'USD', 'month',
        '2026-10-01T00:00:00Z', '00000000-0000-4000-8000-000000000c13',
        'inventory-test-b', 'manual'
      );
      insert into app.unit_availability_versions (
        organization_id, unit_id, status, reason_code, effective_from,
        created_by, correlation_id, source
      ) values (
        '00000000-0000-4000-8000-000000000c11',
        '00000000-0000-4000-8000-000000000c31', 'available', null,
        '2026-10-01T00:00:00Z', '00000000-0000-4000-8000-000000000c13',
        'inventory-test-b', 'manual'
      );
      insert into app.public_listings (
        id, organization_id, property_id, unit_id
      ) values (
        '00000000-0000-4000-8000-000000000c61',
        '00000000-0000-4000-8000-000000000c11',
        '00000000-0000-4000-8000-000000000c22',
        '00000000-0000-4000-8000-000000000c31'
      )
    `);

    await expect(client.query(`
      delete from app.public_listing_publication_events
      where listing_id = '00000000-0000-4000-8000-000000000c60'
    `)).rejects.toThrow(/rental inventory history is immutable/);

    for (const tableName of [
      "unit_pricing_versions",
      "unit_availability_versions",
      "public_listing_publication_events",
      "rental_inventory_events",
    ]) {
      await expect(client.query(`truncate app.${tableName}`)).rejects.toThrow(
        /rental inventory history is immutable/,
      );
    }
  }, 15_000);

  it("forces organization isolation and exposes no anonymous publication function", async () => {
    const controls = await client.query<{
      all_rls_forced: boolean;
      public_reader_exists: boolean;
      publication_command_exists: boolean;
      runtime_can_write_properties: boolean;
      runtime_can_write_units: boolean;
      runtime_can_read_publication_events: boolean;
      runtime_can_read_inventory_events: boolean;
    }>(`
      select
        not exists (
          select 1
          from pg_class
          join pg_namespace on pg_namespace.oid = pg_class.relnamespace
          where pg_namespace.nspname = 'app'
            and pg_class.relname = any (array[
              'properties', 'units', 'public_listings',
              'public_listing_publication_events', 'unit_pricing_versions',
              'unit_availability_versions', 'rental_inventory_events'
            ])
            and not pg_class.relforcerowsecurity
        ) as all_rls_forced,
        to_regprocedure('app.get_public_listing(text)') is not null
          or to_regprocedure('app.list_public_listings(text,integer,bigint)') is not null
          or to_regprocedure('app.list_public_listings_page(text,text,integer,bigint,text,text,integer)') is not null
          as public_reader_exists,
        to_regprocedure('app.set_public_listing_publication(uuid,boolean)') is not null
          as publication_command_exists,
        has_table_privilege('keyforta_runtime', 'app.properties', 'INSERT,UPDATE')
          as runtime_can_write_properties,
        has_table_privilege('keyforta_runtime', 'app.units', 'INSERT,UPDATE')
          as runtime_can_write_units,
        has_table_privilege('keyforta_runtime', 'app.public_listing_publication_events', 'SELECT')
          as runtime_can_read_publication_events,
        has_table_privilege('keyforta_runtime', 'app.rental_inventory_events', 'SELECT')
          as runtime_can_read_inventory_events
    `);
    expect(controls.rows[0]).toEqual({
      all_rls_forced: true,
      public_reader_exists: false,
      publication_command_exists: false,
      runtime_can_write_properties: false,
      runtime_can_write_units: false,
      runtime_can_read_publication_events: false,
      runtime_can_read_inventory_events: false,
    });

    await client.query("begin");
    try {
      await client.query("set local role keyforta_runtime");
      await client.query(
        "select set_config('app.organization_id', '00000000-0000-4000-8000-000000000c10', true)",
      );
      const visible = await client.query<{
        properties: string;
        units: string;
        listings: string;
        prices: string;
        availability: string;
      }>(`
        select
          (select count(*)::text from app.properties) as properties,
          (select count(*)::text from app.units) as units,
          (select count(*)::text from app.public_listings) as listings,
          (select count(*)::text from app.unit_pricing_versions) as prices,
          (select count(*)::text from app.unit_availability_versions) as availability
      `);
      expect(visible.rows[0]).toEqual({
        properties: "2",
        units: "1",
        listings: "1",
        prices: "2",
        availability: "1",
      });
    } finally {
      await client.query("rollback");
    }

    await client.query("begin");
    try {
      await client.query("set local role keyforta_runtime");
      const withoutContext = await client.query<{
        properties: string;
        units: string;
        listings: string;
        prices: string;
        availability: string;
      }>(`
        select
          (select count(*)::text from app.properties) as properties,
          (select count(*)::text from app.units) as units,
          (select count(*)::text from app.public_listings) as listings,
          (select count(*)::text from app.unit_pricing_versions) as prices,
          (select count(*)::text from app.unit_availability_versions) as availability
      `);
      expect(withoutContext.rows[0]).toEqual({
        properties: "0",
        units: "0",
        listings: "0",
        prices: "0",
        availability: "0",
      });
    } finally {
      await client.query("rollback");
    }

    await client.query("begin");
    try {
      await client.query("set local role keyforta_runtime");
      await client.query(
        "select set_config('app.organization_id', '00000000-0000-4000-8000-000000000c10', true)",
      );
      await expect(client.query(`
        insert into app.public_listings (
          organization_id, property_id, unit_id
        ) values (
          '00000000-0000-4000-8000-000000000c10',
          '00000000-0000-4000-8000-000000000c20',
          '00000000-0000-4000-8000-000000000c30'
        )
      `)).rejects.toThrow(/permission denied for table public_listings/);
    } finally {
      await client.query("rollback");
    }
  }, 15_000);
});