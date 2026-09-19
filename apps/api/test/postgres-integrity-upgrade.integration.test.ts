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

describePostgres("PostgreSQL 0021 organization-integrity upgrade", () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const databaseName = `keyforta_integrity_upgrade_${process.pid}`;
  const migrationRole = `keyforta_migration_upgrade_${process.pid}`;
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
      .filter((fileName) => /^00(0[1-9]|1[0-9]|20)_[a-z0-9_]+\.sql$/.test(fileName))
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
        ('00000000-0000-4000-8000-000000000b00', 'Synthetic upgrade A'),
        ('00000000-0000-4000-8000-000000000b01', 'Synthetic upgrade B');
      insert into app.properties (
        id, organization_id, name, property_type, address, time_zone, verification_status, publication_status
      ) values
        (
          '00000000-0000-4000-8000-000000000b10',
          '00000000-0000-4000-8000-000000000b00',
          'Synthetic property A', 'apartment_building', '{"avenueOrStreet":"Avenue Colonel Mondjiba","number":"1","quartier":"Ngaliema","commune":"Ngaliema","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}', 'Africa/Kinshasa', 'pending', 'draft'
        ),
        (
          '00000000-0000-4000-8000-000000000b11',
          '00000000-0000-4000-8000-000000000b01',
          'Synthetic property B', 'apartment_building', '{"avenueOrStreet":"Avenue Kasa-Vubu","number":"2","quartier":"Kalamu","commune":"Kalamu","city":"Kinshasa","province":"Kinshasa","countryCode":"CD"}', 'Africa/Kinshasa', 'pending', 'draft'
        );
      insert into app.units (
        id, organization_id, property_id, label,
        publication_status, availability_status
      ) values (
        '00000000-0000-4000-8000-000000000b20',
        '00000000-0000-4000-8000-000000000b00',
        '00000000-0000-4000-8000-000000000b11',
        'Legacy mismatch', 'draft', 'unavailable'
      )
    `);

    await client.query(`
      create role ${migrationRole} nosuperuser nobypassrls;
      grant usage, create on schema app to ${migrationRole};
      alter table app.schema_migrations owner to ${migrationRole};
      alter table app.properties owner to ${migrationRole};
      alter table app.units owner to ${migrationRole};
      alter table app.payments owner to ${migrationRole};
      alter table app.public_listings owner to ${migrationRole};
      alter table app.public_listing_inquiries owner to ${migrationRole};
      alter table app.membership_invitations owner to ${migrationRole};
      alter table app.membership_invitation_tokens owner to ${migrationRole};
      alter table app.memberships owner to ${migrationRole};
      alter table app.landlord_onboarding_decisions owner to ${migrationRole};
      alter table app.tenant_applications owner to ${migrationRole};
      alter table app.tenant_application_reviews owner to ${migrationRole};
      alter table app.tenant_application_documents owner to ${migrationRole};
      alter table app.leases owner to ${migrationRole};
      alter table app.audit_events owner to ${migrationRole}
    `);
  }, 30_000);

  afterAll(async () => {
    client?.release();
    await pool.end();
    await adminPool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
    await adminPool.query(`drop database if exists ${databaseName}`);
    await adminPool.query(`drop role if exists ${migrationRole}`);
    await adminPool.end();
  });

  it("blocks without partial DDL and succeeds after explicit repair", async () => {
    const fileName = "0021_organization_reference_integrity.sql";
    const migration = await readFile(`${migrationDirectory}/${fileName}`, "utf8");

    await client.query(`set role ${migrationRole}`);
    try {
      await expect(applyMigration(client, fileName, migration)).rejects.toThrow(
        /units_organization_property_fkey/,
      );
    } finally {
      await client.query("reset role");
    }

    const blocked = await client.query<{
      applied: boolean;
      legacy_constraint_exists: boolean;
      new_constraint_exists: boolean;
      ready_exists: boolean;
      rls_forced: boolean;
    }>(`
      select
        exists (
          select 1 from app.schema_migrations where version = '${fileName}'
        ) as applied,
        exists (
          select 1 from pg_constraint
          where conrelid = 'app.units'::regclass
            and conname = 'units_property_id_fkey'
        ) as legacy_constraint_exists,
        exists (
          select 1 from pg_constraint
          where conrelid = 'app.units'::regclass
            and conname = 'units_organization_property_fkey'
        ) as new_constraint_exists,
        to_regprocedure('app.runtime_schema_v0021_ready()') is not null as ready_exists,
        (select relforcerowsecurity from pg_class where oid = 'app.units'::regclass) as rls_forced
    `);
    expect(blocked.rows[0]).toEqual({
      applied: false,
      legacy_constraint_exists: true,
      new_constraint_exists: false,
      ready_exists: false,
      rls_forced: true,
    });

    await client.query(`
      update app.units
      set property_id = '00000000-0000-4000-8000-000000000b10'
      where id = '00000000-0000-4000-8000-000000000b20'
    `);

    await client.query(`set role ${migrationRole}`);
    try {
      await expect(applyMigration(client, fileName, migration)).resolves.toBe(true);
    } finally {
      await client.query("reset role");
    }
    const repaired = await client.query<{
      applied: boolean;
      all_rls_forced: boolean;
      property_id: string;
      ready: boolean;
    }>(`
      select
        exists (
          select 1 from app.schema_migrations where version = '${fileName}'
        ) as applied,
        not exists (
          select 1
          from pg_class
          join pg_namespace on pg_namespace.oid = pg_class.relnamespace
          where pg_namespace.nspname = 'app'
            and pg_class.relname = any (array[
              'properties', 'units', 'payments', 'public_listings',
              'public_listing_inquiries', 'membership_invitations', 'memberships',
              'tenant_applications', 'tenant_application_reviews',
              'tenant_application_documents', 'leases', 'audit_events'
            ])
            and not pg_class.relforcerowsecurity
        ) as all_rls_forced,
        units.property_id::text,
        app.runtime_schema_v0021_ready() as ready
      from app.units
      where units.id = '00000000-0000-4000-8000-000000000b20'
    `);
    expect(repaired.rows[0]).toEqual({
      applied: true,
      all_rls_forced: true,
      property_id: "00000000-0000-4000-8000-000000000b10",
      ready: true,
    });
  });
});