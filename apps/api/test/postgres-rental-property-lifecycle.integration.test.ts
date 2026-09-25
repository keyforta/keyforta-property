import { createHash } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicListingListEnvelopeSchema } from "@keyforta/contracts";

import { applyMigrations } from "../src/migrate.js";
import { createRuntimeDatabaseClient } from "../src/database.js";
import {
  createPostgresRentalInventoryCommandGateway,
  RentalInventoryAuthorizationError,
  RentalInventoryConflictError,
  RentalInventoryNotFoundError,
} from "../src/properties/inventory-command-gateway.js";
import { createPostgresPublicListingPublicationGateway } from "../src/properties/publication-gateway.js";
import { createPostgresPublicListingMediaGateway } from "../src/properties/media-gateway.js";
import { ensureTestRuntimeRole } from "./support/ensure-test-runtime-role.js";

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
  // This suite races several concurrent sessions against `pool`/`runtimePool`
  // (see the "never leaves ..." tests below). `drop database ... with
  // (force)` in afterAll can terminate a backend a fraction of a second
  // after `pool.end()`/`runtimePool.end()` already began closing it,
  // otherwise surfacing as an unhandled client "error" event that crashes
  // the whole test run instead of being scoped to this file's teardown.
  pool.on("error", () => {});
  runtimePool.on("error", () => {});
  let client: PoolClient;

  beforeAll(async () => {
    await adminPool.query(`create database ${databaseName}`);
    client = await pool.connect();
    await applyMigrations(client);
    await ensureTestRuntimeRole(client);
    await client.query(`
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

  const publicationGateway = () => createPostgresPublicListingPublicationGateway(
    createRuntimeDatabaseClient(runtimePool),
  );

  const mediaGateway = () => createPostgresPublicListingMediaGateway(
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

  // Each Property has exactly one active manager_property_assignments row at
  // a time (a partial unique index enforces this): app.create_rental_property
  // now auto-assigns the creating landlord (closing the REQ-037 auto-publish
  // gap), so re-assigning a different manager afterward must go through the
  // real command (which revokes the prior assignment) rather than a raw
  // insert, or it collides with that unique constraint.
  const assignManager = async (
    propertyId: string,
    managerSubject: string,
    actingLandlordSubject: string,
    correlationId: string,
  ) => {
    const session = await pool.connect();
    try {
      await session.query("begin");
      await session.query("select * from app.resolve_actor($1, $2)", [
        actingLandlordSubject,
        organizationA,
      ]);
      await session.query("select set_config('app.correlation_id', $1, true)", [correlationId]);
      const manager = await session.query(
        "select id from app.users where external_subject = $1",
        [managerSubject],
      );
      await session.query(
        "select app.set_manager_property_assignment($1, $2, true)",
        [propertyId, manager.rows[0].id],
      );
      await session.query("commit");
    } finally {
      session.release();
    }
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

  it("auto-assigns the creating landlord to their new Property, closing the REQ-037 auto-publish gap", async () => {
    const created = await gateway().createRentalProperty({
      address,
      correlationId: "corr-create-self-assign",
      firstUnit,
      idempotencyKey: "idem-create-self-assign",
      name: "Synthetic Self-Assigned Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    expect(created?.propertyId).toBeTruthy();

    // No manual `insert into app.manager_property_assignments` here, unlike
    // the other tests in this file: the assignment (and its matching
    // "assigned" event row) must now be created automatically by
    // app.create_rental_property itself.
    const assignment = await client.query<{
      revoked_at: string | null;
    }>(
      `select manager_property_assignments.revoked_at
        from app.manager_property_assignments
        join app.users on users.id = manager_property_assignments.manager_user_id
        where manager_property_assignments.organization_id = $1
          and manager_property_assignments.property_id = $2
          and users.external_subject = $3`,
      [organizationA, created!.propertyId, landlordSubject],
    );
    expect(assignment.rows).toHaveLength(1);
    expect(assignment.rows[0]?.revoked_at).toBeNull();

    const assignmentEvent = await client.query<{ action: string }>(
      `select manager_property_assignment_events.action
        from app.manager_property_assignment_events
        join app.users on users.id = manager_property_assignment_events.manager_user_id
        where manager_property_assignment_events.organization_id = $1
          and manager_property_assignment_events.property_id = $2
          and users.external_subject = $3`,
      [organizationA, created!.propertyId, landlordSubject],
    );
    expect(assignmentEvent.rows).toHaveLength(1);
    expect(assignmentEvent.rows[0]?.action).toBe("assigned");
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
    await assignManager(propertyId, assignedManagerSubject, landlordSubject, "corr-lifecycle-assign");


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

    await assignManager(propertyId, assignedManagerSubject, landlordSubject, "corr-deactivated-manager-assign");

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

  it("denies replaying a cached mutation after the actor's authorization has been revoked", async () => {
    const propertyGateway = gateway();
    const created = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-revoked-replay-create",
      firstUnit,
      idempotencyKey: "idem-revoked-replay-create",
      name: "Synthetic Revoked Replay Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    expect(propertyId).toBeTruthy();
    if (!propertyId) throw new Error("expected a created Property");

    await assignManager(propertyId, assignedManagerSubject, landlordSubject, "corr-revoked-replay-assign");

    const pricingCommand = {
      amountMinor: 210_000,
      correlationId: "corr-revoked-replay-pricing",
      idempotencyKey: "idem-revoked-replay-pricing",
      currency: "USD",
      effectiveFrom: new Date().toISOString(),
      expectedVersion: created!.unitVersion,
      organizationId: organizationA,
      source: "test",
      subject: assignedManagerSubject,
      unitId: created!.unitId,
    };
    const firstPricing = await propertyGateway.setUnitPricing(pricingCommand);
    expect(firstPricing?.pricingVersionId).toBeTruthy();

    // Revoke only the manager's assignment to this specific Property after
    // the mutation has already succeeded and been recorded for
    // idempotency-key replay. The manager's membership stays active (and
    // `app.resolve_actor` keeps succeeding for them), so this isolates the
    // per-Property authorization check inside `set_unit_pricing` itself
    // rather than the outer actor-resolution gate.
    await client.query(
      `update app.manager_property_assignments set revoked_at = now()
       where organization_id = $1 and property_id = $2
         and manager_user_id = (select id from app.users where external_subject = $3)`,
      [organizationA, propertyId, assignedManagerSubject],
    );

    // Replaying the exact same idempotency key and payload must still be
    // authorized against the actor's *current* standing: a manager whose
    // property assignment has been revoked cannot resurrect a cached
    // result they are no longer authorized to see.
    await expect(propertyGateway.setUnitPricing({
      ...pricingCommand,
      correlationId: "corr-revoked-replay-pricing-attempt",
    })).rejects.toThrow(RentalInventoryAuthorizationError);

    // Re-assign so it doesn't affect other tests sharing this database.
    await client.query(
      `update app.manager_property_assignments set revoked_at = null
       where organization_id = $1 and property_id = $2
         and manager_user_id = (select id from app.users where external_subject = $3)`,
      [organizationA, propertyId, assignedManagerSubject],
    );
  });

  it("blocks archiving a Unit or Property whose recorded occupancy state is occupied even without a matching non-archived lease", async () => {
    const propertyGateway = gateway();
    const created = await propertyGateway.createRentalProperty({
      address,
      correlationId: "corr-occupied-guard-create",
      firstUnit,
      idempotencyKey: "idem-occupied-guard-create",
      name: "Synthetic Occupied Guard Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    expect(propertyId).toBeTruthy();
    if (!propertyId) throw new Error("expected a created Property");
    if (!created?.unitId) throw new Error("expected a created Unit");

    const secondUnit = await propertyGateway.addRentalUnit({
      correlationId: "corr-occupied-guard-second-unit",
      idempotencyKey: "idem-occupied-guard-second-unit",
      organizationId: organizationA,
      propertyId,
      source: "test",
      subject: landlordSubject,
      unit: { ...firstUnit, label: "Occupied Guard Second Unit" },
    });
    expect(secondUnit?.unitId).toBeTruthy();
    if (!secondUnit?.unitId) throw new Error("expected a second created Unit");

    // Simulate an occupancy state recorded independently of (or left stale
    // relative to) the leases table, by setting the Unit's authoritative
    // availability_status directly: no lease row exists for either Unit.
    await client.query(
      `update app.units set availability_status = 'occupied'
       where organization_id = $1 and id = $2`,
      [organizationA, secondUnit.unitId],
    );

    const unitArchiveAttempt = await propertyGateway.archiveRentalUnit({
      correlationId: "corr-occupied-guard-unit-archive",
      idempotencyKey: "idem-occupied-guard-unit-archive",
      expectedVersion: secondUnit.unitVersion,
      organizationId: organizationA,
      reason: "attempting to archive an occupied unit",
      source: "test",
      subject: landlordSubject,
      unitId: secondUnit.unitId,
    });
    expect(unitArchiveAttempt).toBe(false);

    const propertyArchiveAttempt = await propertyGateway.archiveRentalProperty({
      correlationId: "corr-occupied-guard-property-archive",
      idempotencyKey: "idem-occupied-guard-property-archive",
      expectedVersion: created.propertyVersion,
      organizationId: organizationA,
      propertyId,
      reason: "attempting to archive a property with an occupied unit",
      source: "test",
      subject: landlordSubject,
    });
    expect(propertyArchiveAttempt).toBe(false);
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

    await assignManager(
      managerAssigned!.propertyId,
      assignedManagerSubject,
      landlordSubject,
      "corr-visibility-assign",
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

  it("scopes the public-listing portfolio feed to the actor's own manageable listings (issue #114)", async () => {
    const landlordManaged = await gateway().createRentalProperty({
      address,
      correlationId: "corr-listing-feed-create-landlord",
      firstUnit: { ...firstUnit, label: "Landlord-Managed Unit" },
      idempotencyKey: "idem-listing-feed-create-landlord",
      name: "Synthetic Landlord-Managed Listing Feed Property",
      organizationId: organizationA,
      propertyType: "single_family",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const managerManaged = await gateway().createRentalProperty({
      address,
      correlationId: "corr-listing-feed-create-manager",
      firstUnit: { ...firstUnit, label: "Manager-Managed Unit" },
      idempotencyKey: "idem-listing-feed-create-manager",
      name: "Synthetic Manager-Managed Listing Feed Property",
      organizationId: organizationA,
      propertyType: "single_family",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    expect(landlordManaged?.propertyId).toBeTruthy();
    expect(managerManaged?.propertyId).toBeTruthy();

    // No `create public listing` command exists yet (REQ-035/PROP-019 gate
    // new listing creation until media activation is approved); these are
    // pre-launch synthetic fixture rows, the same kind #114 describes as the
    // only listings that exist today.
    const landlordListing = await client.query(
      `insert into app.public_listings (organization_id, property_id, unit_id, status)
       values ($1, $2, $3, 'draft')
       returning id`,
      [organizationA, landlordManaged!.propertyId, landlordManaged!.unitId],
    );
    const landlordListingId = landlordListing.rows[0].id as string;
    const managerListing = await client.query(
      `insert into app.public_listings (organization_id, property_id, unit_id, status)
       values ($1, $2, $3, 'draft')
       returning id`,
      [organizationA, managerManaged!.propertyId, managerManaged!.unitId],
    );
    const managerListingId = managerListing.rows[0].id as string;

    // app.create_rental_property now auto-assigns the creating landlord to
    // `landlordManaged` (closing the REQ-037 auto-publish gap), so only the
    // manager needs an explicit assignment here, via the real command (not a
    // raw insert) so it also writes the matching
    // manager_property_assignment_events "assigned" event that
    // app.set_public_listing_publication (and now this feed) require. Each
    // property has exactly one active assignment at a time (assigning the
    // manager to `managerManaged` does not disturb the landlord's own
    // assignment to `landlordManaged`, a different property).
    const assignmentSession = await pool.connect();
    try {
      await assignmentSession.query("begin");
      await assignmentSession.query("select * from app.resolve_actor($1, $2)", [
        landlordSubject,
        organizationA,
      ]);
      await assignmentSession.query(
        "select set_config('app.correlation_id', $1, true)",
        ["corr-listing-feed-assign"],
      );
      const manager = await assignmentSession.query(
        "select id from app.users where external_subject = $1",
        [assignedManagerSubject],
      );
      const managerAssigned = await assignmentSession.query<{ changed: boolean }>(
        "select app.set_manager_property_assignment($1, $2, true) as changed",
        [managerManaged!.propertyId, manager.rows[0].id],
      );
      expect(managerAssigned.rows[0]?.changed).toBe(true);
      await assignmentSession.query("commit");
    } finally {
      assignmentSession.release();
    }

    const landlordFeed = await publicationGateway().listForActor({
      correlationId: "corr-listing-feed-landlord",
      organizationId: organizationA,
      subject: landlordSubject,
    });
    const landlordFeedIds = landlordFeed.map((item) => item.id);
    expect(landlordFeedIds).toContain(landlordListingId);
    // Org ownership alone does not grant listing-publication authority
    // (matching app.set_public_listing_publication in migration 0023): the
    // landlord is not assigned to the manager-managed property, so it must
    // not appear in their feed even though they own the organization.
    expect(landlordFeedIds).not.toContain(managerListingId);

    const assignedManagerFeed = await publicationGateway().listForActor({
      correlationId: "corr-listing-feed-assigned-manager",
      organizationId: organizationA,
      subject: assignedManagerSubject,
    });
    const assignedManagerFeedIds = assignedManagerFeed.map((item) => item.id);
    expect(assignedManagerFeedIds).toContain(managerListingId);
    expect(assignedManagerFeedIds).not.toContain(landlordListingId);

    const unassignedManagerFeed = await publicationGateway().listForActor({
      correlationId: "corr-listing-feed-unassigned-manager",
      organizationId: organizationA,
      subject: unassignedManagerSubject,
    });
    const unassignedManagerFeedIds = unassignedManagerFeed.map((item) => item.id);
    expect(unassignedManagerFeedIds).not.toContain(landlordListingId);
    expect(unassignedManagerFeedIds).not.toContain(managerListingId);

    await expect(publicationGateway().listForActor({
      correlationId: "corr-listing-feed-cross-org",
      organizationId: organizationA,
      subject: crossOrgSubject,
    })).rejects.toThrow(RentalInventoryAuthorizationError);
  });

  it("surfaces a landlord's own listing in the portfolio feed via their auto-created assignment, without disturbing an unrelated assigned manager's feed", async () => {
    // create_public_listing authorizes an active landlord unconditionally
    // (app.actor_can_manage_property), unlike a manager who must already
    // hold a manager_property_assignments row. Regression coverage for the
    // original Copilot review finding (the landlord must see their own
    // listing in the feed) plus the REQ-037 auto-publish gap fix: property
    // creation itself now auto-assigns the creating landlord (so the row
    // this test now expects wasn't there before that fix), and
    // create_public_listing must still not create a second, redundant
    // assignment on top of it.
    const unassignedProperty = await gateway().createRentalProperty({
      address,
      correlationId: "corr-listing-feed-unassigned-create",
      firstUnit: { ...firstUnit, label: "Unassigned-Property Unit" },
      idempotencyKey: "idem-listing-feed-unassigned-create",
      name: "Synthetic Unassigned Listing Feed Property",
      organizationId: organizationA,
      propertyType: "single_family",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    expect(unassignedProperty?.propertyId).toBeTruthy();

    const autoAssignmentRow = await client.query(
      "select count(*)::int as count from app.manager_property_assignments where organization_id = $1 and property_id = $2 and revoked_at is null",
      [organizationA, unassignedProperty!.propertyId],
    );
    expect(autoAssignmentRow.rows[0].count).toBe(1);


    const listing = await gateway().createPublicListing({
      attestationAccepted: true,
      correlationId: "corr-listing-feed-unassigned-listing",
      idempotencyKey: "idem-listing-feed-unassigned-listing",
      imageUrls: ["https://images.test/unassigned.jpg"],
      organizationId: organizationA,
      source: "test",
      subject: landlordSubject,
      summary: "A quiet unit awaiting its first manager assignment.",
      title: "Unassigned-property listing",
      unitId: unassignedProperty!.unitId,
    });
    expect(listing?.listingId).toBeTruthy();

    // create_public_listing must not create a second, redundant assignment
    // on top of the one already created by property creation.
    const stillOneAssignmentRow = await client.query(
      "select count(*)::int as count from app.manager_property_assignments where organization_id = $1 and property_id = $2 and revoked_at is null",
      [organizationA, unassignedProperty!.propertyId],
    );
    expect(stillOneAssignmentRow.rows[0].count).toBe(1);

    const landlordFeed = await publicationGateway().listForActor({
      correlationId: "corr-listing-feed-unassigned-landlord",
      organizationId: organizationA,
      subject: landlordSubject,
    });
    expect(landlordFeed.map((item) => item.id)).toContain(listing!.listingId);

    const unassignedManagerFeed = await publicationGateway().listForActor({
      correlationId: "corr-listing-feed-unassigned-manager-check",
      organizationId: organizationA,
      subject: unassignedManagerSubject,
    });
    expect(unassignedManagerFeed.map((item) => item.id)).not.toContain(listing!.listingId);
  });

  it("keeps the portfolio feed within the wire-contract length bounds for maximum-length property/unit/address fields (issue #114)", async () => {
    // properties.name <= 160, units.label <= 80, address.commune/city <= 160
    // (migration 0022 check constraints). title = name + " — " (3) + label;
    // note = commune + ", " (2) + city. Both must fit publicListingSummarySchema
    // (packages/contracts/src/index.js) at the true maximum, or the feed
    // response fails to parse (500) for otherwise-valid data.
    const maxName = "N".repeat(160);
    const maxLabel = "U".repeat(80);
    const maxCommune = "C".repeat(160);
    const maxCity = "K".repeat(160);
    const maxAddress = { ...address, city: maxCity, commune: maxCommune };

    const maxLengthProperty = await gateway().createRentalProperty({
      address: maxAddress,
      correlationId: "corr-listing-feed-max-length-create",
      firstUnit: { ...firstUnit, label: maxLabel },
      idempotencyKey: "idem-listing-feed-max-length-create",
      name: maxName,
      organizationId: organizationA,
      propertyType: "single_family",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    expect(maxLengthProperty?.propertyId).toBeTruthy();

    await client.query(
      `insert into app.public_listings (organization_id, property_id, unit_id, status)
       values ($1, $2, $3, 'draft')`,
      [organizationA, maxLengthProperty!.propertyId, maxLengthProperty!.unitId],
    );

    // app.create_rental_property already auto-assigned the creating
    // landlord to this Property (closing the REQ-037 auto-publish gap), so
    // no explicit assignment step is needed here anymore.

    const feed = await publicationGateway().listForActor({
      correlationId: "corr-listing-feed-max-length",
      organizationId: organizationA,
      subject: landlordSubject,
    });
    const summary = feed.find((item) => item.title.startsWith(maxName));
    expect(summary).toBeTruthy();
    expect(summary!.title.length).toBeLessThanOrEqual(243);
    expect(summary!.note.length).toBeLessThanOrEqual(322);
    expect(() => publicListingListEnvelopeSchema.parse({
      items: feed,
      meta: { requestId: "corr-listing-feed-max-length" },
    })).not.toThrow();
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

  it("does not deadlock when a Unit archive races a Property archive on the same Property", async () => {
    // Regression test: archive_rental_unit previously locked the Unit row
    // before the parent Property, while archive_rental_property locked the
    // Property before its Units. Two concurrent calls taking opposite lock
    // orders on the same rows can deadlock instead of serializing, which
    // PostgreSQL reports as a 40P01 error. Note that archiving a Property
    // cascades to archive all of its Units, so a legitimate outcome here is
    // for the Unit-side call to lose the race and be rejected with a
    // business "not found" error (the Unit really was already archived by
    // the Property archive) -- that is expected serialization, not a bug.
    // What must never happen is either side raising a raw 40P01 deadlock.
    const created = await gateway().createRentalProperty({
      address,
      correlationId: "corr-deadlock-order-create",
      firstUnit,
      idempotencyKey: "idem-deadlock-order-create",
      name: "Synthetic Deadlock Order Property",
      organizationId: organizationA,
      propertyType: "apartment_building",
      source: "test",
      subject: landlordSubject,
      timeZone: "Africa/Kinshasa",
    });
    const propertyId = created?.propertyId;
    if (!propertyId) throw new Error("expected a created Property");

    const results = await Promise.allSettled([
      gateway().archiveRentalUnit({
        correlationId: "corr-deadlock-order-unit",
        idempotencyKey: "idem-deadlock-order-unit",
        expectedVersion: created!.unitVersion,
        organizationId: organizationA,
        reason: "deadlock order regression: unit side",
        source: "test",
        subject: landlordSubject,
        unitId: created!.unitId,
      }),
      gateway().archiveRentalProperty({
        correlationId: "corr-deadlock-order-property",
        idempotencyKey: "idem-deadlock-order-property",
        expectedVersion: created!.propertyVersion,
        organizationId: organizationA,
        propertyId,
        reason: "deadlock order regression: property side",
        source: "test",
        subject: landlordSubject,
      }),
    ]);

    for (const result of results) {
      if (result.status === "rejected" && !(result.reason instanceof RentalInventoryNotFoundError)) {
        throw new Error(
          `expected no deadlock (and no error other than a legitimate not-found race), but got: ${String(result.reason)}`,
        );
      }
    }
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

  describe("PublicListing creation and media review (REQ-037)", () => {
    const createUnitForMediaReview = async (label: string) => {
      const created = await gateway().createRentalProperty({
        address,
        correlationId: `corr-media-review-create-${label}`,
        firstUnit: { ...firstUnit, label },
        idempotencyKey: `idem-media-review-create-${label}`,
        name: `Synthetic Media Review Property ${label}`,
        organizationId: organizationA,
        propertyType: "single_family",
        source: "test",
        subject: landlordSubject,
        timeZone: "Africa/Kinshasa",
      });
      expect(created?.propertyId).toBeTruthy();
      return created!;
    };

    it("lets an active landlord create a PublicListing, flips the Unit to published, and rejects a duplicate", async () => {
      const created = await createUnitForMediaReview("media-a");

      const listing = await gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-listing-create",
        idempotencyKey: "idem-listing-create",
        imageUrls: ["https://images.test/a.jpg", "https://images.test/b.jpg"],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit media-a",
        unitId: created.unitId,
      });
      expect(listing?.listingId).toBeTruthy();
      expect(listing?.unitId).toBe(created.unitId);

      const unitRow = await client.query(
        "select publication_status from app.units where id = $1",
        [created.unitId],
      );
      expect(unitRow.rows[0].publication_status).toBe("published");

      const listingRow = await client.query(
        "select status, media_review_status from app.public_listings where id = $1",
        [listing!.listingId],
      );
      expect(listingRow.rows[0].status).toBe("draft");
      expect(listingRow.rows[0].media_review_status).toBe("pending");

      await expect(gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-listing-create-duplicate",
        idempotencyKey: "idem-listing-create-duplicate",
        imageUrls: ["https://images.test/c.jpg"],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A second attempt at the same unit.",
        title: "Duplicate listing attempt",
        unitId: created.unitId,
      })).rejects.toThrow(RentalInventoryConflictError);
    });

    it("rejects PublicListing creation from an actor without manage authority over the Property", async () => {
      const created = await createUnitForMediaReview("media-cross-org");

      await expect(gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-listing-create-cross-org",
        idempotencyKey: "idem-listing-create-cross-org",
        imageUrls: ["https://images.test/a.jpg"],
        organizationId: organizationA,
        source: "test",
        subject: unassignedManagerSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Cross-org creation attempt",
        unitId: created.unitId,
      })).rejects.toThrow(RentalInventoryAuthorizationError);
    });

    it("rejects a PublicListing payload with an invalid image URL", async () => {
      const created = await createUnitForMediaReview("media-invalid-url");

      await expect(gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-listing-create-invalid-url",
        idempotencyKey: "idem-listing-create-invalid-url",
        imageUrls: ["not-a-url"],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Invalid image URL attempt",
        unitId: created.unitId,
      })).rejects.toThrow(RentalInventoryConflictError);
    });

    it("rejects PublicListing creation (REQ-037/PROP-025) when the landlord has not accepted the image-rights attestation", async () => {
      const created = await createUnitForMediaReview("media-no-attestation");

      await expect(gateway().createPublicListing({
        attestationAccepted: false,
        correlationId: "corr-listing-create-no-attestation",
        idempotencyKey: "idem-listing-create-no-attestation",
        imageUrls: ["https://images.test/a.jpg"],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Unattested creation attempt",
        unitId: created.unitId,
      })).rejects.toThrow(RentalInventoryConflictError);

      const unitRow = await client.query(
        "select publication_status from app.units where id = $1",
        [created.unitId],
      );
      expect(unitRow.rows[0].publication_status).not.toBe("published");

      const listingRow = await client.query(
        "select count(*)::int as count from app.public_listings where unit_id = $1",
        [created.unitId],
      );
      expect(listingRow.rows[0].count).toBe(0);
    });

    it("edits a draft PublicListing, resets it to pending review, and rejects a stale version", async () => {
      const created = await createUnitForMediaReview("media-edit");
      const listing = await gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-listing-edit-create",
        idempotencyKey: "idem-listing-edit-create",
        imageUrls: ["https://images.test/a.jpg"],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit media-edit",
        unitId: created.unitId,
      });

      const edited = await gateway().updatePublicListingDraft({
        correlationId: "corr-listing-edit",
        expectedVersion: listing!.listingVersion,
        imageUrls: ["https://images.test/a.jpg", "https://images.test/b.jpg"],
        listingId: listing!.listingId,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "An updated summary describing the unit in more detail.",
        title: "Riverside apartment — Unit media-edit (updated)",
      });
      expect(edited?.listingVersion).toBe(listing!.listingVersion + 1);

      await expect(gateway().updatePublicListingDraft({
        correlationId: "corr-listing-edit-stale",
        expectedVersion: listing!.listingVersion,
        imageUrls: ["https://images.test/a.jpg"],
        listingId: listing!.listingId,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A stale-version edit attempt that must be rejected.",
        title: "Stale edit attempt",
      })).rejects.toThrow(RentalInventoryConflictError);
    });

    it("blocks publication until a platform administrator approves media review, and surfaces the listing in the pending-review queue", async () => {
      const created = await createUnitForMediaReview("media-approve");
      const listing = await gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-listing-approve-create",
        idempotencyKey: "idem-listing-approve-create",
        imageUrls: ["https://images.test/a.jpg"],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit media-approve",
        unitId: created.unitId,
      });

      // Publication additionally requires an active manager-property
      // assignment (recorded via app.set_manager_property_assignment, not a
      // raw insert) plus current pricing and availability, mirroring
      // app.set_public_listing_publication's existing (unchanged) gates.
      const assignmentSession = await pool.connect();
      try {
        await assignmentSession.query("begin");
        await assignmentSession.query("select * from app.resolve_actor($1, $2)", [
          landlordSubject,
          organizationA,
        ]);
        await assignmentSession.query(
          "select set_config('app.correlation_id', $1, true)",
          ["corr-listing-approve-assign"],
        );
        const landlord = await assignmentSession.query(
          "select id from app.users where external_subject = $1",
          [landlordSubject],
        );
        await assignmentSession.query(
          "select app.set_manager_property_assignment($1, $2, true) as changed",
          [created.propertyId, landlord.rows[0].id],
        );
        await assignmentSession.query("commit");
      } finally {
        assignmentSession.release();
      }

      const pricing = await gateway().setUnitPricing({
        amountMinor: 150_000,
        correlationId: "corr-listing-approve-pricing",
        idempotencyKey: "idem-listing-approve-pricing",
        currency: "USD",
        effectiveFrom: new Date().toISOString(),
        expectedVersion: listing!.unitVersion,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        unitId: created.unitId,
      });
      const availability = await gateway().setUnitAvailability({
        correlationId: "corr-listing-approve-availability",
        idempotencyKey: "idem-listing-approve-availability",
        effectiveFrom: new Date().toISOString(),
        expectedVersion: pricing!.unitVersion,
        organizationId: organizationA,
        source: "test",
        status: "available",
        subject: landlordSubject,
        unitId: created.unitId,
      });
      expect(availability?.availabilityVersionId).toBeTruthy();

      const pendingQueue = await publicationGateway().listPendingMediaReview();
      expect(pendingQueue.map((item) => item.listingId)).toContain(listing!.listingId);

      const blockedPublish = await publicationGateway().setPublication({
        correlationId: "corr-listing-approve-publish-blocked",
        listingId: listing!.listingId,
        organizationId: organizationA,
        published: true,
        subject: landlordSubject,
      });
      expect(blockedPublish).toBe(false);

      const decision = await publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-listing-approve-decision",
        decision: "approved",
        listingId: listing!.listingId,
        reviewerObjectId: "00000000-0000-4000-8000-000000000970",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      });
      expect(decision?.mediaReviewStatus).toBe("approved");

      // REQ-037's user outcome requires the listing to publish
      // automatically once approved -- no separate manual publish command
      // is needed, and reissuing one is now a no-op (already published).
      const landlordFeedAfterApproval = await publicationGateway().listForActor({
        correlationId: "corr-listing-approve-feed",
        organizationId: organizationA,
        subject: landlordSubject,
      });
      const publishedListing = landlordFeedAfterApproval.find(
        (item) => item.id === listing!.listingId,
      );
      expect(publishedListing?.status).toBe("published");
      expect(publishedListing?.mediaReviewStatus).toBe("approved");

      const republish = await publicationGateway().setPublication({
        correlationId: "corr-listing-approve-publish-already",
        listingId: listing!.listingId,
        organizationId: organizationA,
        published: true,
        subject: landlordSubject,
      });
      expect(republish).toBe(false);

      const afterApproval = await publicationGateway().listPendingMediaReview();
      expect(afterApproval.map((item) => item.listingId)).not.toContain(listing!.listingId);
    });

    it("rejects a media-review decision without notes, and records rejection notes when provided", async () => {
      const created = await createUnitForMediaReview("media-reject");
      const listing = await gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-listing-reject-create",
        idempotencyKey: "idem-listing-reject-create",
        imageUrls: ["https://images.test/a.jpg"],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit media-reject",
        unitId: created.unitId,
      });

      await expect(publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-listing-reject-no-notes",
        decision: "rejected",
        listingId: listing!.listingId,
        reviewerObjectId: "00000000-0000-4000-8000-000000000971",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      })).rejects.toThrow();

      const decision = await publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-listing-reject-with-notes",
        decision: "rejected",
        listingId: listing!.listingId,
        notes: "The exterior photo does not match the listed address.",
        reviewerObjectId: "00000000-0000-4000-8000-000000000971",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      });
      expect(decision?.mediaReviewStatus).toBe("rejected");

      const listingRow = await client.query(
        "select status, media_review_status, media_review_notes from app.public_listings where id = $1",
        [listing!.listingId],
      );
      expect(listingRow.rows[0].status).toBe("draft");
      expect(listingRow.rows[0].media_review_status).toBe("rejected");
      expect(listingRow.rows[0].media_review_notes).toBe(
        "The exterior photo does not match the listed address.",
      );
    });
  });

  describe("PublicListing uploaded media (REQ-038)", () => {
    const createUnitForUpload = async (label: string) => {
      const created = await gateway().createRentalProperty({
        address,
        correlationId: `corr-media-upload-create-${label}`,
        firstUnit: { ...firstUnit, label },
        idempotencyKey: `idem-media-upload-create-${label}`,
        name: `Synthetic Media Upload Property ${label}`,
        organizationId: organizationA,
        propertyType: "single_family",
        source: "test",
        subject: landlordSubject,
        timeZone: "Africa/Kinshasa",
      });
      expect(created?.propertyId).toBeTruthy();
      return created!;
    };

    const createDraftListing = async (label: string) => {
      const created = await createUnitForUpload(label);
      const listing = await gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: `corr-media-upload-listing-create-${label}`,
        idempotencyKey: `idem-media-upload-listing-create-${label}`,
        imageUrls: [],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: `Riverside apartment — Unit ${label}`,
        unitId: created.unitId,
      });
      expect(listing?.listingId).toBeTruthy();
      return { property: created, listing: listing! };
    };

    const jpegBytes = (sizeBytes: number) => Buffer.alloc(sizeBytes, 7);
    const contentHashOf = (content: Buffer) => createHash("sha256").update(content).digest("hex");

    const uploadImage = (
      listingId: string,
      subject: string,
      overrides: Partial<{ room: string; mediaType: string; sizeBytes: number; content: Buffer }> = {},
    ) => {
      const content = overrides.content ?? jpegBytes(overrides.sizeBytes ?? 1024);
      return mediaGateway().uploadImage({
        content,
        contentHash: contentHashOf(content),
        correlationId: `corr-media-upload-${listingId}-${subject}-${Math.random()}`,
        listingId,
        mediaType: overrides.mediaType ?? "image/jpeg",
        organizationId: organizationA,
        room: overrides.room ?? "kitchen",
        sizeBytes: overrides.content ? overrides.content.length : (overrides.sizeBytes ?? 1024),
        source: "test",
        subject,
      });
    };

    it("uploads an image onto a draft listing, resets an approved review to pending, and repeats on delete (PROP-029/PROP-030)", async () => {
      const { listing } = await createDraftListing("upload-reset");

      const approved = await publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-media-upload-reset-approve-1",
        decision: "approved",
        listingId: listing.listingId,
        reviewerObjectId: "00000000-0000-4000-8000-000000000972",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      });
      expect(approved?.mediaReviewStatus).toBe("approved");

      const uploaded = await uploadImage(listing.listingId, landlordSubject, { room: "kitchen" });
      expect(uploaded?.imageId).toBeTruthy();
      expect(uploaded?.listingVersion).toBeGreaterThan(listing.listingVersion);

      const afterUpload = await client.query(
        "select media_review_status from app.public_listings where id = $1",
        [listing.listingId],
      );
      expect(afterUpload.rows[0].media_review_status).toBe("pending");

      // Each image row carries exactly one room tag from the closed list
      // (PROP-030); confirm it round-trips through the metadata-only list.
      const images = await mediaGateway().listImages({
        listingId: listing.listingId,
        organizationId: organizationA,
        subject: landlordSubject,
      });
      expect(images).toHaveLength(1);
      expect(images[0]?.room).toBe("kitchen");

      const reapproved = await publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-media-upload-reset-approve-2",
        decision: "approved",
        listingId: listing.listingId,
        reviewerObjectId: "00000000-0000-4000-8000-000000000972",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      });
      expect(reapproved?.mediaReviewStatus).toBe("approved");

      // Deleting (and, per the documented model, re-uploading with a new
      // room tag) is the supported path for "changing" an image's room
      // (PROP-030); the delete alone must reset review to pending, exactly
      // like the legacy imageUrls edit path (PROP-029).
      const deleted = await mediaGateway().deleteImage({
        correlationId: "corr-media-upload-reset-delete",
        imageId: uploaded!.imageId,
        listingId: listing.listingId,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
      });
      expect(deleted?.listingId).toBe(listing.listingId);

      const afterDelete = await client.query(
        "select media_review_status from app.public_listings where id = $1",
        [listing.listingId],
      );
      expect(afterDelete.rows[0].media_review_status).toBe("pending");
    });

    // REQ-038 decision 4: deleted images are retained (soft-deleted) for
    // recovery until purge, not hard-deleted; this asserts the row still
    // exists with deleted_at set, and is excluded from the count/list paths
    // that gate the upload cap and public gallery.
    it("soft-deletes an image, retaining its row for recovery while excluding it from counts and listings (REQ-038 decision 4)", async () => {
      const { listing } = await createDraftListing("soft-delete");
      const uploaded = await uploadImage(listing.listingId, landlordSubject, { room: "kitchen" });
      expect(uploaded?.imageId).toBeTruthy();

      await mediaGateway().deleteImage({
        correlationId: "corr-media-soft-delete",
        imageId: uploaded!.imageId,
        listingId: listing.listingId,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
      });

      const row = await client.query(
        "select deleted_at from app.public_listing_images where id = $1",
        [uploaded!.imageId],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].deleted_at).not.toBeNull();

      const count = await client.query(
        "select count(*)::int as count from app.public_listing_images where public_listing_id = $1 and deleted_at is null",
        [listing.listingId],
      );
      expect(count.rows[0].count).toBe(0);

      const remainingImages = await mediaGateway().listImages({
        listingId: listing.listingId,
        organizationId: organizationA,
        subject: landlordSubject,
      });
      expect(remainingImages).toHaveLength(0);

      // A fresh upload after a soft-deleted row must not collide on
      // position/count logic that forgot the deleted_at filter.
      const reuploaded = await uploadImage(listing.listingId, landlordSubject, { room: "kitchen" });
      expect(reuploaded?.imageId).toBeTruthy();
      expect(reuploaded?.imageId).not.toBe(uploaded!.imageId);
    });

    it("denies (nondisclosing) upload/delete/list attempts from an actor without an active listing-manager assignment (PROP-027)", async () => {
      const { listing } = await createDraftListing("cross-org-upload");
      const uploaded = await uploadImage(listing.listingId, landlordSubject);
      expect(uploaded?.imageId).toBeTruthy();

      await expect(uploadImage(listing.listingId, unassignedManagerSubject))
        .rejects.toThrow(RentalInventoryAuthorizationError);
      await expect(uploadImage(listing.listingId, crossOrgSubject))
        .rejects.toThrow(RentalInventoryAuthorizationError);

      await expect(mediaGateway().deleteImage({
        correlationId: "corr-media-upload-cross-org-delete-unassigned",
        imageId: uploaded!.imageId,
        listingId: listing.listingId,
        organizationId: organizationA,
        source: "test",
        subject: unassignedManagerSubject,
      })).rejects.toThrow(RentalInventoryAuthorizationError);
      await expect(mediaGateway().deleteImage({
        correlationId: "corr-media-upload-cross-org-delete-crossorg",
        imageId: uploaded!.imageId,
        listingId: listing.listingId,
        organizationId: organizationA,
        source: "test",
        subject: crossOrgSubject,
      })).rejects.toThrow(RentalInventoryAuthorizationError);

      await expect(mediaGateway().listImages({
        listingId: listing.listingId,
        organizationId: organizationA,
        subject: unassignedManagerSubject,
      })).rejects.toThrow(RentalInventoryAuthorizationError);

      // No partial state: the image the assigned landlord uploaded must
      // still be exactly the only row, untouched by the denied attempts.
      const remaining = await client.query(
        "select count(*)::int as count from app.public_listing_images where public_listing_id = $1",
        [listing.listingId],
      );
      expect(remaining.rows[0].count).toBe(1);
    });

    it("rejects an oversized upload with no partial state (PROP-028)", async () => {
      const { listing } = await createDraftListing("oversized");

      await expect(uploadImage(listing.listingId, landlordSubject, { sizeBytes: 10_485_761 }))
        .rejects.toThrow(RentalInventoryConflictError);

      const rows = await client.query(
        "select count(*)::int as count from app.public_listing_images where public_listing_id = $1",
        [listing.listingId],
      );
      expect(rows.rows[0].count).toBe(0);
      const listingRow = await client.query(
        "select version from app.public_listings where id = $1",
        [listing.listingId],
      );
      expect(listingRow.rows[0].version).toBe(listing.listingVersion);
    });

    it("rejects an upload with an unsupported media type with no partial state (PROP-028)", async () => {
      const { listing } = await createDraftListing("wrong-media-type");

      await expect(uploadImage(listing.listingId, landlordSubject, { mediaType: "image/gif" }))
        .rejects.toThrow(RentalInventoryConflictError);

      const rows = await client.query(
        "select count(*)::int as count from app.public_listing_images where public_listing_id = $1",
        [listing.listingId],
      );
      expect(rows.rows[0].count).toBe(0);
    });

    it("rejects an upload missing a valid room tag with no partial state (PROP-028/PROP-030)", async () => {
      const { listing } = await createDraftListing("no-room");

      await expect(uploadImage(listing.listingId, landlordSubject, { room: "office" }))
        .rejects.toThrow(RentalInventoryConflictError);

      const rows = await client.query(
        "select count(*)::int as count from app.public_listing_images where public_listing_id = $1",
        [listing.listingId],
      );
      expect(rows.rows[0].count).toBe(0);
    });

    it("rejects an upload once the combined 1-10 image cap is reached, with no partial state (PROP-028)", async () => {
      const { listing } = await createDraftListing("cap");

      for (let index = 0; index < 10; index += 1) {
        const uploaded = await uploadImage(listing.listingId, landlordSubject, { room: "other" });
        expect(uploaded?.imageId).toBeTruthy();
      }

      await expect(uploadImage(listing.listingId, landlordSubject, { room: "other" }))
        .rejects.toThrow(RentalInventoryConflictError);

      const rows = await client.query(
        "select count(*)::int as count from app.public_listing_images where public_listing_id = $1",
        [listing.listingId],
      );
      expect(rows.rows[0].count).toBe(10);
    });

    it("groups a published listing's images by room, omitting empty rooms, and serves scan-gated content only for eligible listings (PROP-031)", async () => {
      const { property, listing } = await createDraftListing("gallery");

      const kitchenOne = await uploadImage(listing.listingId, landlordSubject, { room: "kitchen" });
      const kitchenTwo = await uploadImage(listing.listingId, landlordSubject, { room: "kitchen" });
      const exterior = await uploadImage(listing.listingId, landlordSubject, { room: "exterior" });

      // Not yet published: the public, anonymous read path must return
      // nothing, and the raw bytes must not be servable either.
      await expect(mediaGateway().listPublicImagesByRoom(listing.listingId)).resolves.toEqual([]);
      await expect(
        mediaGateway().getPublicImageContent(listing.listingId, kitchenOne!.imageId),
      ).resolves.toBeUndefined();

      await assignManager(property.propertyId, assignedManagerSubject, landlordSubject, "corr-media-gallery-assign");
      const pricing = await gateway().setUnitPricing({
        amountMinor: 175_000,
        correlationId: "corr-media-gallery-pricing",
        idempotencyKey: "idem-media-gallery-pricing",
        currency: "USD",
        effectiveFrom: new Date().toISOString(),
        expectedVersion: listing.unitVersion,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        unitId: property.unitId,
      });
      await gateway().setUnitAvailability({
        correlationId: "corr-media-gallery-availability",
        idempotencyKey: "idem-media-gallery-availability",
        effectiveFrom: new Date().toISOString(),
        expectedVersion: pricing!.unitVersion,
        organizationId: organizationA,
        source: "test",
        status: "available",
        subject: landlordSubject,
        unitId: property.unitId,
      });

      const approved = await publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-media-gallery-approve",
        decision: "approved",
        listingId: listing.listingId,
        reviewerObjectId: "00000000-0000-4000-8000-000000000973",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      });
      expect(approved?.mediaReviewStatus).toBe("approved");

      const publishedRow = await client.query(
        "select status from app.public_listings where id = $1",
        [listing.listingId],
      );
      expect(publishedRow.rows[0].status).toBe("published");

      const byRoom = await mediaGateway().listPublicImagesByRoom(listing.listingId);
      const rooms = new Set(byRoom.map((image) => image.room));
      expect(rooms).toEqual(new Set(["kitchen", "exterior"]));
      expect(byRoom.filter((image) => image.room === "kitchen")).toHaveLength(2);
      expect(byRoom.filter((image) => image.room === "exterior")).toHaveLength(1);
      // Rooms with zero images (e.g. "bathroom") never appear.
      expect(rooms.has("bathroom")).toBe(false);

      const content = await mediaGateway().getPublicImageContent(listing.listingId, exterior!.imageId);
      expect(content?.mediaType).toBe("image/jpeg");
      expect(content?.content.equals(jpegBytes(1024))).toBe(true);

      await expect(
        mediaGateway().getPublicImageContent(listing.listingId, "00000000-0000-4000-8000-00000000abcd"),
      ).resolves.toBeUndefined();
    });

    // Migration 0033 fix: before this, an uploaded image was reachable by
    // neither the public route (requires published) nor any admin route
    // (none existed), so a platform administrator reviewing a REQ-038
    // upload-based listing could never actually see the image they were
    // approving/rejecting.
    it("surfaces uploaded images to the media-review queue and serves their bytes only while pending (fixes the REQ-038 review-visibility gap)", async () => {
      const { listing } = await createDraftListing("review-visibility");
      const uploaded = await uploadImage(listing.listingId, landlordSubject, { room: "living" });
      expect(uploaded?.imageId).toBeTruthy();

      const pending = await publicationGateway().listPendingMediaReview();
      const found = pending.find((review) => review.listingId === listing.listingId);
      expect(found?.uploadedImages).toEqual([
        { imageId: uploaded!.imageId, mediaType: "image/jpeg", position: 0, room: "living" },
      ]);

      const reviewContent = await mediaGateway().getReviewImageContent(listing.listingId, uploaded!.imageId);
      expect(reviewContent?.mediaType).toBe("image/jpeg");
      expect(reviewContent?.content.equals(jpegBytes(1024))).toBe(true);

      // The public route must still 404 pre-publish: this route is a
      // narrower, review-only addition, not a second public path.
      await expect(
        mediaGateway().getPublicImageContent(listing.listingId, uploaded!.imageId),
      ).resolves.toBeUndefined();

      const approved = await publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-media-review-visibility-approve",
        decision: "approved",
        listingId: listing.listingId,
        reviewerObjectId: "00000000-0000-4000-8000-000000000974",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      });
      expect(approved?.mediaReviewStatus).toBe("approved");

      // Once approved (and therefore published, and no longer pending),
      // the review-only route must stop serving it -- it is not a
      // permanent second public image-serving path.
      await expect(
        mediaGateway().getReviewImageContent(listing.listingId, uploaded!.imageId),
      ).resolves.toBeUndefined();

      const noLongerPending = await publicationGateway().listPendingMediaReview();
      expect(noLongerPending.some((review) => review.listingId === listing.listingId)).toBe(false);
    });

    // REQ-039: a landlord who withdraws a published listing must still be
    // able to add/replace/remove images before republishing (the Product
    // Owner reported being permanently stuck with the images approved at
    // first publish). Republish still requires media re-review, exactly
    // like a first-time draft publish (media_review_status resets to
    // 'pending' on every successful upload/delete, unchanged from draft).
    it("allows uploading and deleting images on a withdrawn listing, resetting media review to pending before republish (REQ-039)", async () => {
      const created = await createUnitForUpload("withdrawn-media-edit");
      const listing = await gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-media-withdrawn-listing-create",
        idempotencyKey: "idem-media-withdrawn-listing-create",
        imageUrls: [],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit withdrawn-media-edit",
        unitId: created.unitId,
      });
      expect(listing?.listingId).toBeTruthy();

      const pricing = await gateway().setUnitPricing({
        amountMinor: 150_000,
        correlationId: "corr-media-withdrawn-pricing",
        idempotencyKey: "idem-media-withdrawn-pricing",
        currency: "USD",
        effectiveFrom: new Date().toISOString(),
        expectedVersion: listing!.unitVersion,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        unitId: created.unitId,
      });
      await gateway().setUnitAvailability({
        correlationId: "corr-media-withdrawn-availability",
        idempotencyKey: "idem-media-withdrawn-availability",
        effectiveFrom: new Date().toISOString(),
        expectedVersion: pricing!.unitVersion,
        organizationId: organizationA,
        source: "test",
        status: "available",
        subject: landlordSubject,
        unitId: created.unitId,
      });

      // Auto-publish-on-approval (REQ-037) additionally requires at least
      // one image already present at approval time.
      const firstImage = await uploadImage(listing!.listingId, landlordSubject, { room: "kitchen" });
      expect(firstImage?.imageId).toBeTruthy();

      // Approving media review auto-publishes the listing (REQ-037).
      const approved = await publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-media-withdrawn-approve",
        decision: "approved",
        listingId: listing!.listingId,
        reviewerObjectId: "00000000-0000-4000-8000-000000000980",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      });
      expect(approved?.mediaReviewStatus).toBe("approved");

      const withdrawn = await publicationGateway().setPublication({
        correlationId: "corr-media-withdrawn-withdraw",
        listingId: listing!.listingId,
        organizationId: organizationA,
        published: false,
        subject: landlordSubject,
      });
      expect(withdrawn).toBe(true);

      const statusRow = await client.query(
        "select status from app.public_listings where id = $1",
        [listing!.listingId],
      );
      expect(statusRow.rows[0].status).toBe("withdrawn");

      const uploaded = await uploadImage(listing!.listingId, landlordSubject, { room: "bedroom" });
      expect(uploaded?.imageId).toBeTruthy();

      const afterUpload = await client.query(
        "select media_review_status from app.public_listings where id = $1",
        [listing!.listingId],
      );
      expect(afterUpload.rows[0].media_review_status).toBe("pending");

      const deleted = await mediaGateway().deleteImage({
        correlationId: "corr-media-withdrawn-delete",
        imageId: uploaded!.imageId,
        listingId: listing!.listingId,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
      });
      expect(deleted?.listingId).toBe(listing!.listingId);
    });

    it("denies (nondisclosing) upload/delete attempts on a withdrawn listing from an actor without an active listing-manager assignment (REQ-039/PROP-027)", async () => {
      const created = await createUnitForUpload("withdrawn-media-cross-org");
      const listing = await gateway().createPublicListing({
        attestationAccepted: true,
        correlationId: "corr-media-withdrawn-cross-org-create",
        idempotencyKey: "idem-media-withdrawn-cross-org-create",
        imageUrls: [],
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        summary: "A bright two-bedroom unit close to transit.",
        title: "Riverside apartment — Unit withdrawn-media-cross-org",
        unitId: created.unitId,
      });
      const pricing = await gateway().setUnitPricing({
        amountMinor: 150_000,
        correlationId: "corr-media-withdrawn-cross-org-pricing",
        idempotencyKey: "idem-media-withdrawn-cross-org-pricing",
        currency: "USD",
        effectiveFrom: new Date().toISOString(),
        expectedVersion: listing!.unitVersion,
        organizationId: organizationA,
        source: "test",
        subject: landlordSubject,
        unitId: created.unitId,
      });
      await gateway().setUnitAvailability({
        correlationId: "corr-media-withdrawn-cross-org-availability",
        idempotencyKey: "idem-media-withdrawn-cross-org-availability",
        effectiveFrom: new Date().toISOString(),
        expectedVersion: pricing!.unitVersion,
        organizationId: organizationA,
        source: "test",
        status: "available",
        subject: landlordSubject,
        unitId: created.unitId,
      });
      const firstImage = await uploadImage(listing!.listingId, landlordSubject, { room: "kitchen" });
      expect(firstImage?.imageId).toBeTruthy();
      await publicationGateway().reviewPublicListingMedia({
        correlationId: "corr-media-withdrawn-cross-org-approve",
        decision: "approved",
        listingId: listing!.listingId,
        reviewerObjectId: "00000000-0000-4000-8000-000000000981",
        reviewerSubject: "synthetic-platform-admin",
        source: "test",
      });
      const withdrawn = await publicationGateway().setPublication({
        correlationId: "corr-media-withdrawn-cross-org-withdraw",
        listingId: listing!.listingId,
        organizationId: organizationA,
        published: false,
        subject: landlordSubject,
      });
      expect(withdrawn).toBe(true);

      await expect(uploadImage(listing!.listingId, unassignedManagerSubject, { room: "bedroom" }))
        .rejects.toThrow(RentalInventoryAuthorizationError);

      const rows = await client.query(
        "select count(*)::int as count from app.public_listing_images where public_listing_id = $1",
        [listing!.listingId],
      );
      expect(rows.rows[0].count).toBe(1);
    });
  });
});
