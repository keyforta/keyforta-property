import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrate.js";
import { createRuntimeDatabaseClient } from "../src/database.js";
import {
  createPostgresRentalInventoryCommandGateway,
  RentalInventoryAuthorizationError,
  RentalInventoryConflictError,
} from "../src/properties/inventory-command-gateway.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

const organizationA = "00000000-0000-4000-8000-000000000a00";
const organizationB = "00000000-0000-4000-8000-000000000a01";
const landlordSubject = "synthetic-rental-landlord";
const assignedManagerSubject = "synthetic-rental-manager-assigned";
const unassignedManagerSubject = "synthetic-rental-manager-unassigned";
const crossOrgSubject = "synthetic-rental-cross-org";

const firstUnit = {
  bathrooms: 1,
  bedrooms: 2,
  furnishingStatus: "unfurnished",
  label: "Unit A",
  unitType: "apartment" as const,
};

describePostgres("PostgreSQL rental property and unit lifecycle integration", () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const databaseName = `keyforta_rental_lifecycle_${process.pid}`;
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
        ('${organizationA}', 'Synthetic rental org A'),
        ('${organizationB}', 'Synthetic rental org B');
      insert into app.users (id, external_subject, display_name) values
        (gen_random_uuid(), '${landlordSubject}', 'Synthetic Landlord'),
        (gen_random_uuid(), '${assignedManagerSubject}', 'Synthetic Assigned Manager'),
        (gen_random_uuid(), '${unassignedManagerSubject}', 'Synthetic Unassigned Manager'),
        (gen_random_uuid(), '${crossOrgSubject}', 'Synthetic Cross-Org Landlord')
      on conflict (external_subject) do update set display_name = excluded.display_name;
      insert into app.memberships (organization_id, user_id, role, active)
      select '${organizationA}', id, 'landlord', true from app.users where external_subject = '${landlordSubject}';
      insert into app.memberships (organization_id, user_id, role, active)
      select '${organizationA}', id, 'manager', true from app.users where external_subject = '${assignedManagerSubject}';
      insert into app.memberships (organization_id, user_id, role, active)
      select '${organizationA}', id, 'manager', true from app.users where external_subject = '${unassignedManagerSubject}';
      insert into app.memberships (organization_id, user_id, role, active)
      select '${organizationB}', id, 'landlord', true from app.users where external_subject = '${crossOrgSubject}';
    `);
  });

  afterAll(async () => {
    client?.release();
    await runtimePool.end();
    await pool.end();
    await adminPool.query(`drop database if exists ${databaseName} with (force)`);
    await adminPool.end();
  });

  const gateway = () => createPostgresRentalInventoryCommandGateway(
    createRuntimeDatabaseClient(runtimePool),
  );

  const address = {
    avenueOrStreet: "Avenue de la Paix",
    city: "Kinshasa",
    commune: "Gombe",
    countryCode: "CD",
    number: "10",
    province: "Kinshasa",
    quartier: "Gombe",
  };

  it("lets an active landlord create a Property with its first Unit", async () => {
    const created = await gateway().createRentalProperty({
      address,
      correlationId: "corr-create-1",
      firstUnit,
      name: "Synthetic Property One",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });

    expect(created?.propertyId).toBeTruthy();
    expect(created?.unitId).toBeTruthy();
    expect(created?.propertyVersion).toBe(1);
    expect(created?.unitVersion).toBe(1);
  });

  it("rejects Property creation from an actor who is not an active landlord", async () => {
    await expect(gateway().createRentalProperty({
      address,
      correlationId: "corr-create-2",
      firstUnit,
      name: "Synthetic Property Two",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: assignedManagerSubject,
      timeZone: "Africa/Kinshasa",
    })).rejects.toThrow(RentalInventoryAuthorizationError);
  });

  it("supports the full add-unit, pricing, availability, and archive lifecycle with authorization and conflict guards", async () => {
    const propertyGateway = gateway();
    const created = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-lifecycle-create",
      firstUnit,
      name: "Synthetic Lifecycle Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    expect(propertyId).toBeTruthy();
    if (!propertyId) throw new Error("expected a created Property");

    // Assign the manager to the Property so per-property authorization can be exercised.
    await client.query(
      `insert into app.manager_property_assignments (
        organization_id, property_id, manager_user_id, assigned_by_user_id
      ) select $1, $2, u.id, l.id
        from app.users u, app.users l
        where u.external_subject = $3 and l.external_subject = $4`,
      [organizationA, propertyId, assignedManagerSubject, landlordSubject],
    );

    // Unassigned manager cannot add a Unit to this Property.
    await expect(gateway().addRentalUnit({
      correlationId: "corr-add-unit-denied",
      organizationId: organizationA,
      propertyId,
      source: "test",
      subject: unassignedManagerSubject,
      unit: { ...firstUnit, label: "Unit B" },
    })).rejects.toThrow(RentalInventoryAuthorizationError);

    // Assigned manager can add a second Unit.
    const secondUnit = await gateway().addRentalUnit({
      correlationId: "corr-add-unit",
      organizationId: organizationA,
      propertyId,
      source: "test",
      subject: assignedManagerSubject,
      unit: { ...firstUnit, label: "Unit B" },
    });
    expect(secondUnit?.unitId).toBeTruthy();

    // Duplicate canonical labels are rejected as a conflict.
    await expect(gateway().addRentalUnit({
      correlationId: "corr-add-unit-duplicate",
      organizationId: organizationA,
      propertyId,
      source: "test",
      subject: landlordSubject,
      unit: { ...firstUnit, label: "unit a" },
    })).rejects.toThrow(RentalInventoryConflictError);

    // Pricing can be set on the second Unit.
    const pricing = await gateway().setUnitPricing({
      amountMinor: 150_000,
      correlationId: "corr-pricing",
      currency: "USD",
      effectiveFrom: new Date().toISOString(),
      organizationId: organizationA,
      source: "test",
      subject: landlordSubject,
      unitId: secondUnit!.unitId,
    });
    expect(pricing?.pricingVersionId).toBeTruthy();

    // Availability can be set on the second Unit.
    const availability = await gateway().setUnitAvailability({
      correlationId: "corr-availability",
      effectiveFrom: new Date().toISOString(),
      organizationId: organizationA,
      source: "test",
      status: "available",
      subject: landlordSubject,
      unitId: secondUnit!.unitId,
    });
    expect(availability?.availabilityVersionId).toBeTruthy();

    // Cross-organization actors cannot see or archive this Property's Units:
    // organization-scoping means the Unit is simply not found, so the command
    // resolves to `false` rather than disclosing its existence.
    const crossOrgArchiveAttempt = await gateway().archiveRentalUnit({
      correlationId: "corr-archive-cross-org",
      organizationId: organizationB,
      reason: "cross-organization attempt",
      source: "test",
      subject: crossOrgSubject,
      unitId: secondUnit!.unitId,
    });
    expect(crossOrgArchiveAttempt).toBe(false);

    // Archiving the first Unit succeeds while a second active Unit remains.
    const firstUnitArchived = await gateway().archiveRentalUnit({
      correlationId: "corr-archive-first-unit",
      organizationId: organizationA,
      reason: "consolidating inventory",
      source: "test",
      subject: landlordSubject,
      unitId: created!.unitId,
    });
    expect(firstUnitArchived).toBe(true);

    // Archiving the last remaining active Unit on the Property is rejected:
    // the SQL guard resolves to `false` rather than raising.
    const lastUnitArchiveAttempt = await gateway().archiveRentalUnit({
      correlationId: "corr-archive-last-unit",
      organizationId: organizationA,
      reason: "attempting to archive the only remaining unit",
      source: "test",
      subject: landlordSubject,
      unitId: secondUnit!.unitId,
    });
    expect(lastUnitArchiveAttempt).toBe(false);

    // The Property (with its one remaining Unit) can be archived with a reason.
    const propertyArchived = await gateway().archiveRentalProperty({
      correlationId: "corr-archive-property",
      organizationId: organizationA,
      propertyId,
      reason: "portfolio wind-down",
      source: "test",
      subject: landlordSubject,
    });
    expect(propertyArchived).toBe(true);
  });

  it("lists only the Properties and Units visible to the requesting actor", async () => {
    const propertyGateway = gateway();
    const landlordOnly = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-visibility-landlord-only",
      firstUnit: { ...firstUnit, label: "Landlord Only Unit" },
      name: "Landlord Only Property",
      organizationId: organizationA,
      propertyType: "single_family",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const managerAssigned = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-visibility-manager-assigned",
      firstUnit: { ...firstUnit, label: "Manager Assigned Unit" },
      name: "Manager Assigned Property",
      organizationId: organizationA,
      propertyType: "single_family",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    expect(landlordOnly?.propertyId).toBeTruthy();
    expect(managerAssigned?.propertyId).toBeTruthy();

    await client.query(
      `insert into app.manager_property_assignments (
        organization_id, property_id, manager_user_id, assigned_by_user_id
      ) select $1, $2, u.id, l.id
        from app.users u, app.users l
        where u.external_subject = $3 and l.external_subject = $4`,
      [organizationA, managerAssigned!.propertyId, assignedManagerSubject, landlordSubject],
    );

    const landlordView = await gateway().listRentalProperties({
      correlationId: "corr-list-landlord",
      organizationId: organizationA,
      subject: landlordSubject,
    });
    const landlordVisibleIds = landlordView.map((property) => property.id);
    expect(landlordVisibleIds).toContain(landlordOnly!.propertyId);
    expect(landlordVisibleIds).toContain(managerAssigned!.propertyId);

    const managerView = await gateway().listRentalProperties({
      correlationId: "corr-list-manager",
      organizationId: organizationA,
      subject: assignedManagerSubject,
    });
    const managerVisibleIds = managerView.map((property) => property.id);
    expect(managerVisibleIds).toContain(managerAssigned!.propertyId);
    expect(managerVisibleIds).not.toContain(landlordOnly!.propertyId);

    const unassignedManagerView = await gateway().listRentalProperties({
      correlationId: "corr-list-unassigned-manager",
      organizationId: organizationA,
      subject: unassignedManagerSubject,
    });
    expect(unassignedManagerView.map((property) => property.id)).not.toContain(
      managerAssigned!.propertyId,
    );
  });
});
