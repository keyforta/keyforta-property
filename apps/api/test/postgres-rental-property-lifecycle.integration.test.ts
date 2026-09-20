import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../src/migrate.js";
import { createRuntimeDatabaseClient } from "../src/database.js";
import {
  createPostgresRentalInventoryCommandGateway,
  RentalInventoryAuthorizationError,
  RentalInventoryConflictError,
  RentalInventoryNotFoundError,
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
      idempotencyKey: "idem-create-1",
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
      idempotencyKey: "idem-create-2",
      name: "Synthetic Property Two",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: assignedManagerSubject,
      timeZone: "Africa/Kinshasa",
    })).rejects.toThrow(RentalInventoryAuthorizationError);
  });

  it("replays a Property creation for the same idempotency key and payload instead of creating a duplicate", async () => {
    const propertyGateway = gateway();
    const command = {
      address,
      correlationId: "corr-idempotent-create",
      firstUnit,
      idempotencyKey: "idem-replay-property",
      name: "Synthetic Idempotent Property",
      organizationId: organizationA,
      propertyType: "apartment_building" as const,
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    };

    const first = await propertyGateway.createRentalProperty(command);
    const replay = await propertyGateway.createRentalProperty({
      ...command,
      correlationId: "corr-idempotent-create-replay",
    });

    expect(replay).toEqual(first);

    const propertyCount = await client.query(
      `select count(*)::int as count from app.properties
       where organization_id = $1 and name = $2`,
      [organizationA, command.name],
    );
    expect(propertyCount.rows[0].count).toBe(1);
  });

  it("serializes concurrent Property creations claiming the same idempotency key, creating exactly one Property", async () => {
    const command = {
      address,
      correlationId: "corr-idempotent-concurrent-create",
      firstUnit,
      idempotencyKey: "idem-replay-property-concurrent",
      name: "Synthetic Concurrent Idempotent Property",
      organizationId: organizationA,
      propertyType: "apartment_building" as const,
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    };

    const [first, second] = await Promise.all([
      gateway().createRentalProperty(command),
      gateway().createRentalProperty({
        ...command,
        correlationId: "corr-idempotent-concurrent-create-2",
      }),
    ]);

    expect(first).toEqual(second);

    const propertyCount = await client.query(
      `select count(*)::int as count from app.properties
       where organization_id = $1 and name = $2`,
      [organizationA, command.name],
    );
    expect(propertyCount.rows[0].count).toBe(1);
  });

  it("rejects a Property creation replay that reuses an idempotency key with a different payload", async () => {
    const propertyGateway = gateway();
    await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-idempotent-conflict-create",
      firstUnit,
      idempotencyKey: "idem-replay-property-conflict",
      name: "Synthetic Idempotent Conflict Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });

    await expect(propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-idempotent-conflict-create-2",
      firstUnit,
      idempotencyKey: "idem-replay-property-conflict",
      name: "Synthetic Idempotent Conflict Property Two",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    })).rejects.toThrow(RentalInventoryConflictError);
  });

  it("supports the full add-unit, pricing, availability, and archive lifecycle with authorization and conflict guards", async () => {
    const propertyGateway = gateway();
    const created = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-lifecycle-create",
      firstUnit,
      idempotencyKey: "idem-lifecycle-create",
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
      idempotencyKey: "idem-add-unit-denied",
      organizationId: organizationA,
      propertyId,
      source: "test",
      subject: unassignedManagerSubject,
      unit: { ...firstUnit, label: "Unit B" },
    })).rejects.toThrow(RentalInventoryAuthorizationError);

    // Assigned manager can add a second Unit.
    const secondUnit = await gateway().addRentalUnit({
      correlationId: "corr-add-unit",
      idempotencyKey: "idem-add-unit",
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
      idempotencyKey: "idem-add-unit-duplicate",
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
      idempotencyKey: "idem-pricing",
      currency: "USD",
      effectiveFrom: new Date().toISOString(),
      expectedVersion: secondUnit!.unitVersion,
      organizationId: organizationA,
      source: "test",
      subject: landlordSubject,
      unitId: secondUnit!.unitId,
    });
    expect(pricing?.pricingVersionId).toBeTruthy();
    expect(pricing?.unitVersion).toBe(secondUnit!.unitVersion + 1);

    // A stale expected version is rejected as a conflict without mutating state.
    await expect(gateway().setUnitPricing({
      amountMinor: 175_000,
      correlationId: "corr-pricing-stale",
      idempotencyKey: "idem-pricing-stale",
      currency: "USD",
      effectiveFrom: new Date().toISOString(),
      expectedVersion: secondUnit!.unitVersion,
      organizationId: organizationA,
      source: "test",
      subject: landlordSubject,
      unitId: secondUnit!.unitId,
    })).rejects.toThrow(RentalInventoryConflictError);

    // Availability can be set on the second Unit, using the version returned
    // by the preceding pricing command.
    const availability = await gateway().setUnitAvailability({
      correlationId: "corr-availability",
      idempotencyKey: "idem-availability",
      effectiveFrom: new Date().toISOString(),
      expectedVersion: pricing!.unitVersion,
      organizationId: organizationA,
      source: "test",
      status: "available",
      subject: landlordSubject,
      unitId: secondUnit!.unitId,
    });
    expect(availability?.availabilityVersionId).toBeTruthy();
    expect(availability?.unitVersion).toBe(pricing!.unitVersion + 1);

    // Cross-organization actors cannot see or archive this Property's Units:
    // organization-scoping means the Unit is simply not found, so the command
    // raises a not-found error rather than disclosing its existence.
    await expect(gateway().archiveRentalUnit({
      correlationId: "corr-archive-cross-org",
      idempotencyKey: "idem-archive-cross-org",
      expectedVersion: availability!.unitVersion,
      organizationId: organizationB,
      reason: "cross-organization attempt",
      source: "test",
      subject: crossOrgSubject,
      unitId: secondUnit!.unitId,
    })).rejects.toThrow(RentalInventoryNotFoundError);

    // Archiving the first Unit succeeds while a second active Unit remains.
    const firstUnitArchived = await gateway().archiveRentalUnit({
      correlationId: "corr-archive-first-unit",
      idempotencyKey: "idem-archive-first-unit",
      expectedVersion: created!.unitVersion,
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
      idempotencyKey: "idem-archive-last-unit",
      expectedVersion: availability!.unitVersion,
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
      idempotencyKey: "idem-archive-property",
      expectedVersion: created!.propertyVersion,
      organizationId: organizationA,
      propertyId,
      reason: "portfolio wind-down",
      source: "test",
      subject: landlordSubject,
    });
    expect(propertyArchived).toBe(true);
  });

  it("denies mutation from a manager whose membership has been deactivated even if the assignment remains", async () => {
    const propertyGateway = gateway();
    const created = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-deactivated-manager-create",
      firstUnit,
      idempotencyKey: "idem-deactivated-manager-create",
      name: "Synthetic Deactivated Manager Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    expect(propertyId).toBeTruthy();
    if (!propertyId) throw new Error("expected a created Property");

    await client.query(
      `insert into app.manager_property_assignments (
        organization_id, property_id, manager_user_id, assigned_by_user_id
      ) select $1, $2, u.id, l.id
        from app.users u, app.users l
        where u.external_subject = $3 and l.external_subject = $4`,
      [organizationA, propertyId, assignedManagerSubject, landlordSubject],
    );

    // Deactivate the manager's membership while the assignment row remains.
    await client.query(
      `update app.memberships set active = false
       where organization_id = $1 and role = 'manager'
         and user_id = (select id from app.users where external_subject = $2)`,
      [organizationA, assignedManagerSubject],
    );

    await expect(gateway().setUnitPricing({
      amountMinor: 200_000,
      correlationId: "corr-deactivated-manager-pricing",
      idempotencyKey: "idem-deactivated-manager-pricing",
      currency: "USD",
      effectiveFrom: new Date().toISOString(),
      expectedVersion: created!.unitVersion,
      organizationId: organizationA,
      source: "test",
      subject: assignedManagerSubject,
      unitId: created!.unitId,
    })).rejects.toThrow(RentalInventoryAuthorizationError);

    // Reactivate so it doesn't affect other tests sharing this database.
    await client.query(
      `update app.memberships set active = true
       where organization_id = $1 and role = 'manager'
         and user_id = (select id from app.users where external_subject = $2)`,
      [organizationA, assignedManagerSubject],
    );
  });

  it("archives a Property whose Unit has a future-dated availability interval without violating the half-open interval constraint", async () => {
    const propertyGateway = gateway();
    const created = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-future-availability-create",
      firstUnit,
      idempotencyKey: "idem-future-availability-create",
      name: "Synthetic Future Availability Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    expect(propertyId).toBeTruthy();
    if (!propertyId) throw new Error("expected a created Property");

    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const scheduledAvailability = await gateway().setUnitAvailability({
      correlationId: "corr-future-availability-set",
      idempotencyKey: "idem-future-availability-set",
      effectiveFrom: farFuture,
      expectedVersion: created!.unitVersion,
      organizationId: organizationA,
      source: "test",
      status: "unavailable",
      reasonCode: "scheduled-renovation",
      subject: landlordSubject,
      unitId: created!.unitId,
    });
    expect(scheduledAvailability?.availabilityVersionId).toBeTruthy();

    const propertyArchived = await gateway().archiveRentalProperty({
      correlationId: "corr-future-availability-archive",
      idempotencyKey: "idem-future-availability-archive",
      expectedVersion: created!.propertyVersion,
      organizationId: organizationA,
      propertyId,
      reason: "archiving despite a future-dated availability interval",
      source: "test",
      subject: landlordSubject,
    });
    expect(propertyArchived).toBe(true);

    // No open (still-scheduled) availability interval should remain once the
    // Property (and its Unit) is archived, including intervals that were
    // future-dated at the moment of archiving.
    const openIntervals = await client.query(
      `select count(*)::int as count from app.unit_availability_versions
       where organization_id = $1 and unit_id = $2 and effective_to is null`,
      [organizationA, created!.unitId],
    );
    expect(openIntervals.rows[0].count).toBe(0);
  });

  it("replays an add-Unit command for the same idempotency key and payload instead of creating a duplicate Unit", async () => {
    const propertyGateway = gateway();
    const created = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-idempotent-unit-create",
      firstUnit,
      idempotencyKey: "idem-unit-property-create",
      name: "Synthetic Idempotent Unit Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    expect(propertyId).toBeTruthy();
    if (!propertyId) throw new Error("expected a created Property");

    const command = {
      correlationId: "corr-idempotent-add-unit",
      idempotencyKey: "idem-replay-unit",
      organizationId: organizationA,
      propertyId,
      source: "test",
      subject: landlordSubject,
      unit: { ...firstUnit, label: "Idempotent Unit" },
    };

    const first = await propertyGateway.addRentalUnit(command);
    const replay = await propertyGateway.addRentalUnit({
      ...command,
      correlationId: "corr-idempotent-add-unit-replay",
    });

    expect(replay).toEqual(first);

    const unitCount = await client.query(
      `select count(*)::int as count from app.units
       where organization_id = $1 and property_id = $2 and canonical_label = $3`,
      [organizationA, propertyId, "idempotent unit"],
    );
    expect(unitCount.rows[0].count).toBe(1);

    await expect(propertyGateway.addRentalUnit({
      ...command,
      correlationId: "corr-idempotent-add-unit-conflict",
      unit: { ...firstUnit, label: "Idempotent Unit Two" },
    })).rejects.toThrow(RentalInventoryConflictError);
  });

  it("replays pricing, availability, and archive mutations for the same idempotency key and payload instead of applying them twice", async () => {
    const propertyGateway = gateway();
    const created = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-idempotent-mutation-create",
      firstUnit,
      idempotencyKey: "idem-mutation-property-create",
      name: "Synthetic Idempotent Mutation Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    expect(created?.unitId).toBeTruthy();
    if (!created?.unitId) throw new Error("expected a created Unit");
    const propertyId = created.propertyId;

    const secondUnit = await propertyGateway.addRentalUnit({
      correlationId: "corr-idempotent-mutation-second-unit",
      idempotencyKey: "idem-mutation-second-unit",
      organizationId: organizationA,
      propertyId,
      source: "test",
      subject: landlordSubject,
      unit: { ...firstUnit, label: "Second Unit" },
    });
    expect(secondUnit?.unitId).toBeTruthy();
    if (!secondUnit?.unitId) throw new Error("expected a second created Unit");

    const pricingCommand = {
      amountMinor: 150_000,
      correlationId: "corr-idempotent-pricing",
      idempotencyKey: "idem-replay-pricing",
      currency: "USD",
      effectiveFrom: new Date().toISOString(),
      expectedVersion: created.unitVersion,
      organizationId: organizationA,
      source: "test",
      subject: landlordSubject,
      unitId: created.unitId,
    };
    const firstPricing = await propertyGateway.setUnitPricing(pricingCommand);
    const replayPricing = await propertyGateway.setUnitPricing({
      ...pricingCommand,
      correlationId: "corr-idempotent-pricing-replay",
    });
    expect(replayPricing).toEqual(firstPricing);

    await expect(propertyGateway.setUnitPricing({
      ...pricingCommand,
      amountMinor: 175_000,
      correlationId: "corr-idempotent-pricing-conflict",
    })).rejects.toThrow(RentalInventoryConflictError);

    const availabilityCommand = {
      correlationId: "corr-idempotent-availability",
      idempotencyKey: "idem-replay-availability",
      effectiveFrom: new Date().toISOString(),
      expectedVersion: firstPricing!.unitVersion,
      organizationId: organizationA,
      source: "test",
      status: "available" as const,
      subject: landlordSubject,
      unitId: created.unitId,
    };
    const firstAvailability = await propertyGateway.setUnitAvailability(availabilityCommand);
    const replayAvailability = await propertyGateway.setUnitAvailability({
      ...availabilityCommand,
      correlationId: "corr-idempotent-availability-replay",
    });
    expect(replayAvailability).toEqual(firstAvailability);

    await expect(propertyGateway.setUnitAvailability({
      ...availabilityCommand,
      status: "unavailable",
      correlationId: "corr-idempotent-availability-conflict",
    })).rejects.toThrow(RentalInventoryConflictError);

    const archiveUnitCommand = {
      correlationId: "corr-idempotent-unit-archive",
      idempotencyKey: "idem-replay-unit-archive",
      expectedVersion: secondUnit.unitVersion,
      organizationId: organizationA,
      reason: "consolidating inventory",
      source: "test",
      subject: landlordSubject,
      unitId: secondUnit.unitId,
    };
    const firstUnitArchive = await propertyGateway.archiveRentalUnit(archiveUnitCommand);
    const replayUnitArchive = await propertyGateway.archiveRentalUnit({
      ...archiveUnitCommand,
      correlationId: "corr-idempotent-unit-archive-replay",
    });
    expect(replayUnitArchive).toBe(firstUnitArchive);
    expect(firstUnitArchive).toBe(true);

    await expect(propertyGateway.archiveRentalUnit({
      ...archiveUnitCommand,
      reason: "a different reason",
      correlationId: "corr-idempotent-unit-archive-conflict",
    })).rejects.toThrow(RentalInventoryConflictError);

    const archivePropertyCommand = {
      correlationId: "corr-idempotent-property-archive",
      idempotencyKey: "idem-replay-property-archive",
      expectedVersion: created.propertyVersion,
      organizationId: organizationA,
      propertyId: created.propertyId,
      reason: "portfolio wind-down",
      source: "test",
      subject: landlordSubject,
    };
    const firstPropertyArchive = await propertyGateway.archiveRentalProperty(archivePropertyCommand);
    const replayPropertyArchive = await propertyGateway.archiveRentalProperty({
      ...archivePropertyCommand,
      correlationId: "corr-idempotent-property-archive-replay",
    });
    expect(replayPropertyArchive).toBe(firstPropertyArchive);
    expect(firstPropertyArchive).toBe(true);

    await expect(propertyGateway.archiveRentalProperty({
      ...archivePropertyCommand,
      reason: "a different reason",
      correlationId: "corr-idempotent-property-archive-conflict",
    })).rejects.toThrow(RentalInventoryConflictError);
  });

  it("lists only the Properties and Units visible to the requesting actor", async () => {
    const propertyGateway = gateway();
    const landlordOnly = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-visibility-landlord-only",
      firstUnit: { ...firstUnit, label: "Landlord Only Unit" },
      idempotencyKey: "idem-visibility-landlord-only",
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
      idempotencyKey: "idem-visibility-manager-assigned",
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

  it("never leaves zero active Units when two sibling Units are archived concurrently", async () => {
    const created = await gateway().createRentalProperty({
      address,
      correlationId: "corr-concurrent-archive-create",
      firstUnit,
      idempotencyKey: "idem-concurrent-archive-create",
      name: "Synthetic Concurrent Archive Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    if (!propertyId) throw new Error("expected a created Property");

    const secondUnit = await gateway().addRentalUnit({
      correlationId: "corr-concurrent-archive-add-unit",
      idempotencyKey: "idem-concurrent-archive-add-unit",
      organizationId: organizationA,
      propertyId,
      source: "test",
      subject: landlordSubject,
      unit: { ...firstUnit, label: "Unit B" },
    });
    if (!secondUnit) throw new Error("expected a second Unit");

    const [firstResult, secondResult] = await Promise.all([
      gateway().archiveRentalUnit({
        correlationId: "corr-concurrent-archive-unit-1",
        idempotencyKey: "idem-concurrent-archive-unit-1",
        expectedVersion: created!.unitVersion,
        organizationId: organizationA,
        reason: "concurrent archive race regression",
        source: "test",
        subject: landlordSubject,
        unitId: created!.unitId,
      }),
      gateway().archiveRentalUnit({
        correlationId: "corr-concurrent-archive-unit-2",
        idempotencyKey: "idem-concurrent-archive-unit-2",
        expectedVersion: secondUnit.unitVersion,
        organizationId: organizationA,
        reason: "concurrent archive race regression",
        source: "test",
        subject: landlordSubject,
        unitId: secondUnit.unitId,
      }),
    ]);

    // Exactly one concurrent archive can win: the last-active-Unit guard
    // must observe the other's outcome rather than both proceeding from a
    // stale count of two active Units.
    expect([firstResult, secondResult].filter((result) => result === true)).toHaveLength(1);

    const activeUnitCount = await client.query(
      `select count(*)::int as count from app.units
       where organization_id = $1 and property_id = $2 and archived_at is null`,
      [organizationA, propertyId],
    );
    expect(activeUnitCount.rows[0].count).toBe(1);
  });

  it("never leaves an archived Unit with a non-archived lease when archive races a concurrent lease draft", async () => {
    const tenantSubject = "synthetic-rental-tenant-archive-race";
    await client.query(
      `insert into app.users (id, external_subject, display_name) values
        (gen_random_uuid(), $1, 'Synthetic Archive-Race Tenant')
       on conflict (external_subject) do update set display_name = excluded.display_name`,
      [tenantSubject],
    );
    await client.query(
      `insert into app.memberships (organization_id, user_id, role, active)
       select $1, id, 'tenant', true from app.users where external_subject = $2`,
      [organizationA, tenantSubject],
    );

    const created = await gateway().createRentalProperty({
      address,
      correlationId: "corr-archive-lease-race-create",
      firstUnit,
      idempotencyKey: "idem-archive-lease-race-create",
      name: "Synthetic Archive-Lease Race Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const unitId = created?.unitId;
    if (!unitId) throw new Error("expected a created Unit");

    const createLeaseDraft = async () => {
      const session = await pool.connect();
      try {
        await session.query("begin");
        await session.query("select * from app.resolve_actor($1, $2)", [
          landlordSubject,
          organizationA,
        ]);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          "corr-archive-lease-race-draft",
        ]);
        const tenant = await session.query(
          "select id from app.users where external_subject = $1",
          [tenantSubject],
        );
        const result = await session.query(
          "select * from app.create_lease_draft($1, $2, $3, $4, $5, $6, $7, $8)",
          [
            unitId,
            tenant.rows[0].id,
            "USD",
            150_000,
            new Date().toISOString().slice(0, 10),
            "external",
            null,
            "Bail historique enregistre avant le parcours de candidature synthetique.",
          ],
        );
        await session.query("commit");
        return result.rows[0];
      } catch (error) {
        await session.query("rollback");
        throw error;
      } finally {
        session.release();
      }
    };

    await Promise.all([
      gateway().archiveRentalUnit({
        correlationId: "corr-archive-lease-race-archive",
        idempotencyKey: "idem-archive-lease-race-archive",
        expectedVersion: created!.unitVersion,
        organizationId: organizationA,
        reason: "archive vs. lease-draft race regression",
        source: "test",
        subject: landlordSubject,
        unitId,
      }),
      createLeaseDraft(),
    ]);

    // Whichever transaction commits first, the Unit's lock must serialize the
    // two paths: an archived Unit can never retain a non-archived lease.
    const invariantViolation = await client.query(
      `select count(*)::int as count
       from app.leases as lease
       join app.units as unit
         on unit.organization_id = lease.organization_id and unit.id = lease.unit_id
       where unit.organization_id = $1 and unit.id = $2
         and unit.archived_at is not null and lease.archived_at is null`,
      [organizationA, unitId],
    );
    expect(invariantViolation.rows[0].count).toBe(0);
  });

  it("never leaves an archived Unit with a non-archived lease when Property archive races a concurrent lease draft", async () => {
    const tenantSubject = "synthetic-rental-tenant-property-archive-race";
    await client.query(
      `insert into app.users (id, external_subject, display_name) values
        (gen_random_uuid(), $1, 'Synthetic Property Archive-Race Tenant')
       on conflict (external_subject) do update set display_name = excluded.display_name`,
      [tenantSubject],
    );
    await client.query(
      `insert into app.memberships (organization_id, user_id, role, active)
       select $1, id, 'tenant', true from app.users where external_subject = $2`,
      [organizationA, tenantSubject],
    );

    const created = await gateway().createRentalProperty({
      address,
      correlationId: "corr-property-archive-lease-race-create",
      firstUnit,
      idempotencyKey: "idem-property-archive-lease-race-create",
      name: "Synthetic Property-Archive-Lease Race Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    const unitId = created?.unitId;
    if (!propertyId || !unitId) throw new Error("expected a created Property and Unit");

    const createLeaseDraft = async () => {
      const session = await pool.connect();
      try {
        await session.query("begin");
        await session.query("select * from app.resolve_actor($1, $2)", [
          landlordSubject,
          organizationA,
        ]);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          "corr-property-archive-lease-race-draft",
        ]);
        const tenant = await session.query(
          "select id from app.users where external_subject = $1",
          [tenantSubject],
        );
        const result = await session.query(
          "select * from app.create_lease_draft($1, $2, $3, $4, $5, $6, $7, $8)",
          [
            unitId,
            tenant.rows[0].id,
            "USD",
            150_000,
            new Date().toISOString().slice(0, 10),
            "external",
            null,
            "Bail historique enregistre avant le parcours de candidature synthetique.",
          ],
        );
        await session.query("commit");
        return result.rows[0];
      } catch (error) {
        await session.query("rollback");
        throw error;
      } finally {
        session.release();
      }
    };

    await Promise.all([
      gateway().archiveRentalProperty({
        correlationId: "corr-property-archive-lease-race-archive",
        idempotencyKey: "idem-property-archive-lease-race-archive",
        expectedVersion: created!.propertyVersion,
        organizationId: organizationA,
        propertyId,
        reason: "property archive vs. lease-draft race regression",
        source: "test",
        subject: landlordSubject,
      }),
      createLeaseDraft(),
    ]);

    const invariantViolation = await client.query(
      `select count(*)::int as count
       from app.leases as lease
       join app.units as unit
         on unit.organization_id = lease.organization_id and unit.id = lease.unit_id
       where unit.organization_id = $1 and unit.property_id = $2
         and unit.archived_at is not null and lease.archived_at is null`,
      [organizationA, propertyId],
    );
    expect(invariantViolation.rows[0].count).toBe(0);
  });
});
