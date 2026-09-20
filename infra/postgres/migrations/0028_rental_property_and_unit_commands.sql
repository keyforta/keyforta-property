begin;

-- Implements REQ-032 (Property), REQ-033 (Unit), REQ-034 (pricing and
-- availability history), and REQ-036 (versioning, archive, provenance) from
-- docs/product/RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md.
--
-- REQ-035 (PublicListing creation, publication, and media) is intentionally
-- NOT implemented here: PROP-019 requires new PublicListing creation,
-- publication, republication, and image mutation to remain rejected until a
-- separately approved media-activation requirement exists. No such approval
-- is recorded, so this migration only ever mutates an existing listing's
-- status to `withdrawn` as a side effect of archiving its Unit or Property
-- (a safety guard, not new publication authority).

create function app.actor_is_active_landlord(
  requested_organization_id uuid,
  requested_actor_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app
as $$
  select exists (
    select 1
    from app.memberships
    where organization_id = requested_organization_id
      and user_id = requested_actor_id
      and role = 'landlord'
      and active
      and effective_from <= transaction_timestamp()
      and (effective_to is null or transaction_timestamp() < effective_to)
  )
$$;

create function app.actor_can_manage_property(
  requested_organization_id uuid,
  requested_property_id uuid,
  requested_actor_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app
as $$
  select
    app.actor_is_active_landlord(requested_organization_id, requested_actor_id)
    or exists (
      select 1
      from app.manager_property_assignments as assignment
      join app.memberships as membership
        on membership.organization_id = assignment.organization_id
        and membership.user_id = assignment.manager_user_id
      where assignment.organization_id = requested_organization_id
        and assignment.property_id = requested_property_id
        and assignment.manager_user_id = requested_actor_id
        and assignment.revoked_at is null
        and membership.role in ('landlord', 'manager')
        and membership.active
        and membership.effective_from <= transaction_timestamp()
        and (
          membership.effective_to is null
          or transaction_timestamp() < membership.effective_to
        )
    )
$$;

create function app.record_rental_inventory_event(
  requested_organization_id uuid,
  requested_aggregate_type text,
  requested_aggregate_id uuid,
  requested_aggregate_version integer,
  requested_actor_id uuid,
  requested_correlation_id text,
  requested_action text,
  requested_reason text,
  requested_source text
) returns void
language sql
security definer
set search_path = pg_catalog, app
as $$
  insert into app.rental_inventory_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    actor_id, correlation_id, action, reason, source
  ) values (
    requested_organization_id, requested_aggregate_type, requested_aggregate_id,
    requested_aggregate_version, requested_actor_id, requested_correlation_id,
    requested_action, requested_reason, requested_source
  )
$$;

-- Implements the PROP-014 idempotency-key replay requirement for the two
-- Property/Unit creation commands: within one actor and operation, replaying
-- the same idempotency key with the same payload returns the original
-- creation result instead of creating a duplicate record, while reusing the
-- key with a different payload is rejected as a conflict. Update commands
-- (pricing, availability, archive) are already protected against duplicate
-- application on retry by their `requested_expected_version` guard: a retry
-- of an already-applied mutation finds a stale version and is rejected.
--
-- Concurrent claims of the same (organization, actor, operation,
-- idempotency_key) are serialized rather than racing: resolve first tries to
-- insert a `result = null` placeholder row (the unique primary key makes a
-- concurrent insert of the same key block until the first attempt commits or
-- rolls back), then locks and re-reads that row with `for update`. A caller
-- that observes a null `result` owns the claim and must call
-- `record_rental_inventory_creation_replay` (an update, not an insert) before
-- committing; a caller that observes a populated `result` is a genuine
-- replay and returns it without re-running the business logic. If the
-- claiming transaction rolls back (for example a validation failure), its
-- placeholder row rolls back with it, so a retry can claim the key again.
create table app.rental_inventory_creation_replays (
  organization_id uuid not null references app.organizations(id),
  actor_id uuid not null references app.users(id),
  operation text not null check (char_length(btrim(operation)) between 1 and 64),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 128),
  payload_hash text not null check (char_length(payload_hash) = 64),
  result jsonb,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (organization_id, actor_id, operation, idempotency_key)
);

create function app.resolve_rental_inventory_creation_replay(
  requested_organization_id uuid,
  requested_actor_id uuid,
  requested_operation text,
  requested_idempotency_key text,
  requested_payload jsonb,
  out replay_result jsonb,
  out is_replay boolean
)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  existing app.rental_inventory_creation_replays%rowtype;
  payload_hash text := encode(public.digest(requested_payload::text, 'sha256'), 'hex');
begin
  insert into app.rental_inventory_creation_replays (
    organization_id, actor_id, operation, idempotency_key, payload_hash, result
  ) values (
    requested_organization_id, requested_actor_id, requested_operation,
    requested_idempotency_key, payload_hash, null
  )
  on conflict (organization_id, actor_id, operation, idempotency_key) do nothing;

  select * into existing
  from app.rental_inventory_creation_replays
  where organization_id = requested_organization_id
    and actor_id = requested_actor_id
    and operation = requested_operation
    and idempotency_key = requested_idempotency_key
  for update;

  if existing.payload_hash <> payload_hash then
    raise exception 'the idempotency key was already used with a different payload'
      using errcode = '23505';
  end if;

  if existing.result is null then
    replay_result := null;
    is_replay := false;
    return;
  end if;

  replay_result := existing.result;
  is_replay := true;
end
$$;

create function app.record_rental_inventory_creation_replay(
  requested_organization_id uuid,
  requested_actor_id uuid,
  requested_operation text,
  requested_idempotency_key text,
  requested_payload jsonb,
  requested_result jsonb
) returns void
language sql
security definer
set search_path = pg_catalog, app
as $$
  update app.rental_inventory_creation_replays
  set result = requested_result
  where organization_id = requested_organization_id
    and actor_id = requested_actor_id
    and operation = requested_operation
    and idempotency_key = requested_idempotency_key
$$;

create function app.create_rental_property(
  requested_name text,
  requested_property_type text,
  requested_address jsonb,
  requested_time_zone text,
  requested_jurisdiction_code text,
  requested_unit_label text,
  requested_unit_canonical_label text,
  requested_unit_type text,
  requested_unit_bedrooms smallint,
  requested_unit_bathrooms smallint,
  requested_unit_area_square_meters integer,
  requested_unit_floor_label text,
  requested_unit_furnishing_status text,
  requested_idempotency_key text,
  requested_correlation_id text,
  requested_source text
) returns table (
  property_id uuid,
  property_version integer,
  unit_id uuid,
  unit_version integer
)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := coalesce(requested_correlation_id, nullif(current_setting('app.correlation_id', true), ''));
  created_property app.properties%rowtype;
  created_unit app.units%rowtype;
  payload jsonb;
  replay record;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  if not app.actor_is_active_landlord(organization, actor) then
    raise exception 'only an active landlord may create a Property' using errcode = '42501';
  end if;

  payload := jsonb_build_object(
    'name', requested_name, 'propertyType', requested_property_type,
    'address', requested_address, 'timeZone', requested_time_zone,
    'jurisdictionCode', requested_jurisdiction_code,
    'unitLabel', requested_unit_label, 'unitType', requested_unit_type,
    'unitBedrooms', requested_unit_bedrooms, 'unitBathrooms', requested_unit_bathrooms,
    'unitAreaSquareMeters', requested_unit_area_square_meters,
    'unitFloorLabel', requested_unit_floor_label,
    'unitFurnishingStatus', requested_unit_furnishing_status
  );

  select * into replay from app.resolve_rental_inventory_creation_replay(
    organization, actor, 'create_rental_property', requested_idempotency_key, payload
  );

  if replay.is_replay then
    property_id := (replay.replay_result ->> 'propertyId')::uuid;
    property_version := (replay.replay_result ->> 'propertyVersion')::integer;
    unit_id := (replay.replay_result ->> 'unitId')::uuid;
    unit_version := (replay.replay_result ->> 'unitVersion')::integer;
    return next;
    return;
  end if;

  insert into app.properties (
    organization_id, name, property_type, address, time_zone, jurisdiction_code,
    verification_status, publication_status, version
  ) values (
    organization, requested_name, requested_property_type, requested_address,
    requested_time_zone, requested_jurisdiction_code, 'not_started', 'draft', 1
  ) returning * into created_property;

  insert into app.units (
    organization_id, property_id, label, canonical_label, unit_type, bedrooms,
    bathrooms, area_square_meters, floor_label, furnishing_status,
    availability_status, publication_status, version
  ) values (
    organization, created_property.id, requested_unit_label,
    requested_unit_canonical_label, requested_unit_type, requested_unit_bedrooms,
    requested_unit_bathrooms, requested_unit_area_square_meters,
    requested_unit_floor_label, requested_unit_furnishing_status,
    'unavailable', 'draft', 1
  ) returning * into created_unit;

  insert into app.unit_availability_versions (
    organization_id, unit_id, status, reason_code, effective_from, created_by,
    correlation_id, source
  ) values (
    organization, created_unit.id, 'unavailable', 'not_yet_available',
    transaction_timestamp(), actor, correlation, requested_source
  );

  perform app.record_rental_inventory_event(
    organization, 'property', created_property.id, created_property.version,
    actor, correlation, 'property.created', null, requested_source
  );
  perform app.record_rental_inventory_event(
    organization, 'unit', created_unit.id, created_unit.version, actor,
    correlation, 'unit.created', null, requested_source
  );

  property_id := created_property.id;
  property_version := created_property.version;
  unit_id := created_unit.id;
  unit_version := created_unit.version;

  perform app.record_rental_inventory_creation_replay(
    organization, actor, 'create_rental_property', requested_idempotency_key, payload,
    jsonb_build_object(
      'propertyId', property_id, 'propertyVersion', property_version,
      'unitId', unit_id, 'unitVersion', unit_version
    )
  );

  return next;
end
$$;

create function app.add_rental_unit(
  requested_property_id uuid,
  requested_label text,
  requested_canonical_label text,
  requested_unit_type text,
  requested_bedrooms smallint,
  requested_bathrooms smallint,
  requested_area_square_meters integer,
  requested_floor_label text,
  requested_furnishing_status text,
  requested_idempotency_key text,
  requested_correlation_id text,
  requested_source text
) returns table (unit_id uuid, unit_version integer)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := coalesce(requested_correlation_id, nullif(current_setting('app.correlation_id', true), ''));
  property_record app.properties%rowtype;
  created_unit app.units%rowtype;
  payload jsonb;
  replay record;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  select * into property_record
  from app.properties
  where organization_id = organization and id = requested_property_id
  for update;

  if not found or property_record.archived_at is not null then
    raise exception 'the requested Property was not found' using errcode = 'P0002';
  end if;

  if not app.actor_can_manage_property(organization, requested_property_id, actor) then
    raise exception 'the actor is not authorized to manage this Property' using errcode = '42501';
  end if;

  payload := jsonb_build_object(
    'propertyId', requested_property_id, 'label', requested_label,
    'unitType', requested_unit_type, 'bedrooms', requested_bedrooms,
    'bathrooms', requested_bathrooms, 'areaSquareMeters', requested_area_square_meters,
    'floorLabel', requested_floor_label, 'furnishingStatus', requested_furnishing_status
  );

  select * into replay from app.resolve_rental_inventory_creation_replay(
    organization, actor, 'add_rental_unit', requested_idempotency_key, payload
  );

  if replay.is_replay then
    unit_id := (replay.replay_result ->> 'unitId')::uuid;
    unit_version := (replay.replay_result ->> 'unitVersion')::integer;
    return next;
    return;
  end if;

  insert into app.units (
    organization_id, property_id, label, canonical_label, unit_type, bedrooms,
    bathrooms, area_square_meters, floor_label, furnishing_status,
    availability_status, publication_status, version
  ) values (
    organization, requested_property_id, requested_label,
    requested_canonical_label, requested_unit_type, requested_bedrooms,
    requested_bathrooms, requested_area_square_meters, requested_floor_label,
    requested_furnishing_status, 'unavailable', 'draft', 1
  ) returning * into created_unit;

  insert into app.unit_availability_versions (
    organization_id, unit_id, status, reason_code, effective_from, created_by,
    correlation_id, source
  ) values (
    organization, created_unit.id, 'unavailable', 'not_yet_available',
    transaction_timestamp(), actor, correlation, requested_source
  );

  perform app.record_rental_inventory_event(
    organization, 'unit', created_unit.id, created_unit.version, actor,
    correlation, 'unit.created', null, requested_source
  );

  unit_id := created_unit.id;
  unit_version := created_unit.version;

  perform app.record_rental_inventory_creation_replay(
    organization, actor, 'add_rental_unit', requested_idempotency_key, payload,
    jsonb_build_object('unitId', unit_id, 'unitVersion', unit_version)
  );

  return next;
end
$$;

create function app.set_unit_pricing(
  requested_unit_id uuid,
  requested_amount_minor bigint,
  requested_currency char(3),
  requested_effective_from timestamptz,
  requested_expected_version integer,
  requested_idempotency_key text,
  requested_correlation_id text,
  requested_source text
) returns table (pricing_version_id uuid, unit_version integer)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := coalesce(requested_correlation_id, nullif(current_setting('app.correlation_id', true), ''));
  unit_record app.units%rowtype;
  new_id uuid;
  payload jsonb;
  replay record;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  -- Idempotency-key replay (PROP-014): resolved before the expected-version
  -- guard below, so a retry of an already-applied mutation returns the
  -- original result instead of being rejected as a stale-version conflict
  -- once the Unit's version has advanced.
  payload := jsonb_build_object(
    'unitId', requested_unit_id, 'amountMinor', requested_amount_minor,
    'currency', requested_currency, 'effectiveFrom', requested_effective_from,
    'expectedVersion', requested_expected_version
  );

  select * into replay from app.resolve_rental_inventory_creation_replay(
    organization, actor, 'set_unit_pricing', requested_idempotency_key, payload
  );

  if replay.is_replay then
    pricing_version_id := (replay.replay_result ->> 'pricingVersionId')::uuid;
    unit_version := (replay.replay_result ->> 'unitVersion')::integer;
    return next;
    return;
  end if;

  select * into unit_record
  from app.units
  where organization_id = organization and id = requested_unit_id
  for update;

  if not found or unit_record.archived_at is not null then
    raise exception 'the requested Unit was not found' using errcode = 'P0002';
  end if;

  if not app.actor_can_manage_property(organization, unit_record.property_id, actor) then
    raise exception 'the actor is not authorized to manage this Unit' using errcode = '42501';
  end if;

  if unit_record.version <> requested_expected_version then
    raise exception 'the supplied version is stale' using errcode = '40001';
  end if;

  update app.unit_pricing_versions
  set effective_to = requested_effective_from
  where organization_id = organization
    and unit_id = requested_unit_id
    and effective_to is null;

  insert into app.unit_pricing_versions (
    organization_id, unit_id, amount_minor, currency, billing_period,
    effective_from, created_by, correlation_id, source
  ) values (
    organization, requested_unit_id, requested_amount_minor, requested_currency,
    'month', requested_effective_from, actor, correlation, requested_source
  ) returning id into new_id;

    update app.units
  set version = version + 1, updated_at = transaction_timestamp()
  where organization_id = organization and id = requested_unit_id
  returning version into unit_version;

  perform app.record_rental_inventory_event(
    organization, 'pricing_version', new_id, 1, actor, correlation,
    'pricing.set', null, requested_source
  );

  pricing_version_id := new_id;

  perform app.record_rental_inventory_creation_replay(
    organization, actor, 'set_unit_pricing', requested_idempotency_key, payload,
    jsonb_build_object('pricingVersionId', pricing_version_id, 'unitVersion', unit_version)
  );

  return next;
end
$$;

create function app.set_unit_availability(
  requested_unit_id uuid,
  requested_status text,
  requested_reason_code text,
  requested_effective_from timestamptz,
  requested_expected_version integer,
  requested_idempotency_key text,
  requested_correlation_id text,
  requested_source text
) returns table (availability_version_id uuid, unit_version integer)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := coalesce(requested_correlation_id, nullif(current_setting('app.correlation_id', true), ''));
  unit_record app.units%rowtype;
  new_id uuid;
  is_occupied boolean;
  derived_status text;
  payload jsonb;
  replay record;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  -- Idempotency-key replay (PROP-014): see set_unit_pricing above for the
  -- rationale for resolving before the expected-version guard.
  payload := jsonb_build_object(
    'unitId', requested_unit_id, 'status', requested_status,
    'reasonCode', requested_reason_code, 'effectiveFrom', requested_effective_from,
    'expectedVersion', requested_expected_version
  );

  select * into replay from app.resolve_rental_inventory_creation_replay(
    organization, actor, 'set_unit_availability', requested_idempotency_key, payload
  );

  if replay.is_replay then
    availability_version_id := (replay.replay_result ->> 'availabilityVersionId')::uuid;
    unit_version := (replay.replay_result ->> 'unitVersion')::integer;
    return next;
    return;
  end if;

  select * into unit_record
  from app.units
  where organization_id = organization and id = requested_unit_id
  for update;

  if not found or unit_record.archived_at is not null then
    raise exception 'the requested Unit was not found' using errcode = 'P0002';
  end if;

  if not app.actor_can_manage_property(organization, unit_record.property_id, actor) then
    raise exception 'the actor is not authorized to manage this Unit' using errcode = '42501';
  end if;

  if unit_record.version <> requested_expected_version then
    raise exception 'the supplied version is stale' using errcode = '40001';
  end if;

  update app.unit_availability_versions
  set effective_to = requested_effective_from
  where organization_id = organization
    and unit_id = requested_unit_id
    and effective_to is null;

  insert into app.unit_availability_versions (
    organization_id, unit_id, status, reason_code, effective_from, created_by,
    correlation_id, source
  ) values (
    organization, requested_unit_id, requested_status, requested_reason_code,
    requested_effective_from, actor, correlation, requested_source
  ) returning id into new_id;

  select exists (
    select 1 from app.leases
    where organization_id = organization and unit_id = requested_unit_id
      and accepted_at is not null and archived_at is null
  ) into is_occupied;

  derived_status := case when is_occupied then 'occupied' else requested_status end;

  update app.units
  set availability_status = derived_status,
      version = version + 1,
      updated_at = transaction_timestamp()
  where organization_id = organization and id = requested_unit_id
  returning version into unit_version;

  perform app.record_rental_inventory_event(
    organization, 'availability_version', new_id, 1, actor, correlation,
    'availability.set', null, requested_source
  );

  availability_version_id := new_id;

  perform app.record_rental_inventory_creation_replay(
    organization, actor, 'set_unit_availability', requested_idempotency_key, payload,
    jsonb_build_object('availabilityVersionId', availability_version_id, 'unitVersion', unit_version)
  );

  return next;
end
$$;

create function app.archive_rental_unit(
  requested_unit_id uuid,
  requested_reason text,
  requested_expected_version integer,
  requested_idempotency_key text,
  requested_correlation_id text,
  requested_source text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := coalesce(requested_correlation_id, nullif(current_setting('app.correlation_id', true), ''));
  unit_record app.units%rowtype;
  active_unit_count integer;
  blocking_lease_count integer;
  payload jsonb;
  replay record;
  archived boolean;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  -- Idempotency-key replay (PROP-014): resolved before the Unit lookup
  -- below, because after a successful archive the Unit is treated as
  -- not-found (archived_at is not null); without this, a retry would raise
  -- P0002 instead of returning the original true/false result.
  payload := jsonb_build_object(
    'unitId', requested_unit_id, 'reason', requested_reason,
    'expectedVersion', requested_expected_version
  );

  select * into replay from app.resolve_rental_inventory_creation_replay(
    organization, actor, 'archive_rental_unit', requested_idempotency_key, payload
  );

  if replay.is_replay then
    return (replay.replay_result ->> 'archived')::boolean;
  end if;

  select * into unit_record
  from app.units
  where organization_id = organization and id = requested_unit_id
  for update;

  if not found or unit_record.archived_at is not null then
    raise exception 'the requested Unit was not found' using errcode = 'P0002';
  end if;

  if not app.actor_can_manage_property(organization, unit_record.property_id, actor) then
    raise exception 'the actor is not authorized to manage this Unit' using errcode = '42501';
  end if;

  if unit_record.version <> requested_expected_version then
    raise exception 'the supplied version is stale' using errcode = '40001';
  end if;

  -- Lock the parent Property so a concurrent archive of a sibling Unit on
  -- the same Property cannot also observe (and act on) the pre-archive
  -- active-Unit count: whichever transaction locks the Property first
  -- serializes against the other, which then re-counts after the first
  -- commits.
  perform 1 from app.properties
  where organization_id = organization and id = unit_record.property_id
  for update;

  select count(*) into active_unit_count
  from app.units
  where organization_id = organization
    and property_id = unit_record.property_id
    and archived_at is null;

  if active_unit_count <= 1 then
    archived := false;
  else
    select count(*) into blocking_lease_count
    from app.leases
    where organization_id = organization and unit_id = requested_unit_id
      and archived_at is null;

    if blocking_lease_count > 0 then
      archived := false;
    else
      update app.public_listings
      set status = 'withdrawn', withdrawn_at = transaction_timestamp(),
          version = version + 1, updated_at = transaction_timestamp()
      where organization_id = organization and unit_id = requested_unit_id and status = 'published';

      -- History rows are append-only (a trigger rejects DELETE and any
      -- UPDATE other than closing effective_to from null), so a
      -- not-yet-started (future-dated) interval cannot be removed; it is
      -- closed at the instant after its own effective_from, which satisfies
      -- the half-open interval constraint (effective_to > effective_from)
      -- while leaving no open interval once the Unit is archived.
      update app.unit_availability_versions
      set effective_to = case
        when effective_from > clock_timestamp() then effective_from + interval '1 microsecond'
        else clock_timestamp()
      end
      where organization_id = organization
        and unit_id = requested_unit_id
        and effective_to is null;

      update app.units
      set archived_at = transaction_timestamp(), archived_by = actor,
          archive_reason = requested_reason, publication_status = 'archived',
          version = version + 1, updated_at = transaction_timestamp()
      where organization_id = organization and id = requested_unit_id;

      perform app.record_rental_inventory_event(
        organization, 'unit', requested_unit_id, unit_record.version + 1, actor,
        correlation, 'unit.archived', requested_reason, requested_source
      );

      archived := true;
    end if;
  end if;

  perform app.record_rental_inventory_creation_replay(
    organization, actor, 'archive_rental_unit', requested_idempotency_key, payload,
    jsonb_build_object('archived', archived)
  );

  return archived;
end
$$;

create function app.archive_rental_property(
  requested_property_id uuid,
  requested_reason text,
  requested_expected_version integer,
  requested_idempotency_key text,
  requested_correlation_id text,
  requested_source text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := coalesce(requested_correlation_id, nullif(current_setting('app.correlation_id', true), ''));
  property_record app.properties%rowtype;
  blocking_lease_count integer;
  unit_row app.units%rowtype;
  payload jsonb;
  replay record;
  archived boolean;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  -- Idempotency-key replay (PROP-014): resolved before the Property lookup
  -- below, because after a successful archive the Property is treated as
  -- not-found (archived_at is not null); without this, a retry would raise
  -- P0002 instead of returning the original true/false result.
  payload := jsonb_build_object(
    'propertyId', requested_property_id, 'reason', requested_reason,
    'expectedVersion', requested_expected_version
  );

  select * into replay from app.resolve_rental_inventory_creation_replay(
    organization, actor, 'archive_rental_property', requested_idempotency_key, payload
  );

  if replay.is_replay then
    return (replay.replay_result ->> 'archived')::boolean;
  end if;

  select * into property_record
  from app.properties
  where organization_id = organization and id = requested_property_id
  for update;

  if not found or property_record.archived_at is not null then
    raise exception 'the requested Property was not found' using errcode = 'P0002';
  end if;

  if not app.actor_can_manage_property(organization, requested_property_id, actor) then
    raise exception 'the actor is not authorized to manage this Property' using errcode = '42501';
  end if;

  if property_record.version <> requested_expected_version then
    raise exception 'the supplied version is stale' using errcode = '40001';
  end if;

  -- Lock every non-archived Unit of this Property before checking for
  -- blocking leases, so a concurrent create_lease_draft call (which locks
  -- the same Unit row before inserting) cannot create a new lease on one
  -- of these Units between this check and the archive below.
  perform 1 from app.units
  where organization_id = organization
    and property_id = requested_property_id
    and archived_at is null
  for update;

  select count(*) into blocking_lease_count
  from app.leases as lease
  join app.units as unit
    on unit.organization_id = lease.organization_id and unit.id = lease.unit_id
  where unit.organization_id = organization and unit.property_id = requested_property_id
    and lease.archived_at is null;

  if blocking_lease_count > 0 then
    archived := false;
  else
    update app.public_listings
    set status = 'withdrawn', withdrawn_at = transaction_timestamp(),
        version = version + 1, updated_at = transaction_timestamp()
    where organization_id = organization
      and property_id = requested_property_id
      and status = 'published';

    -- History rows are append-only (see archive_rental_unit for the
    -- trigger rationale): close each open interval at `now`, or at the
    -- instant after its own effective_from if it has not started yet, so
    -- no open interval remains once every Unit is archived.
    update app.unit_availability_versions as availability
    set effective_to = case
      when availability.effective_from > clock_timestamp()
        then availability.effective_from + interval '1 microsecond'
      else clock_timestamp()
    end
    from app.units as unit
    where unit.organization_id = organization
      and unit.property_id = requested_property_id
      and availability.organization_id = unit.organization_id
      and availability.unit_id = unit.id
      and availability.effective_to is null;

    for unit_row in
      select * from app.units
      where organization_id = organization
        and property_id = requested_property_id
        and archived_at is null
      for update
    loop
      update app.units
      set archived_at = transaction_timestamp(), archived_by = actor,
          archive_reason = requested_reason, publication_status = 'archived',
          version = version + 1, updated_at = transaction_timestamp()
      where organization_id = organization and id = unit_row.id
      returning version into unit_row.version;

      perform app.record_rental_inventory_event(
        organization, 'unit', unit_row.id, unit_row.version, actor,
        correlation, 'unit.archived', requested_reason, requested_source
      );
    end loop;

    update app.properties
    set archived_at = transaction_timestamp(), archived_by = actor,
        archive_reason = requested_reason, publication_status = 'archived',
        version = version + 1, updated_at = transaction_timestamp()
    where organization_id = organization and id = requested_property_id;

    perform app.record_rental_inventory_event(
      organization, 'property', requested_property_id, property_record.version + 1,
      actor, correlation, 'property.archived', requested_reason, requested_source
    );

    archived := true;
  end if;

  perform app.record_rental_inventory_creation_replay(
    organization, actor, 'archive_rental_property', requested_idempotency_key, payload,
    jsonb_build_object('archived', archived)
  );

  return archived;
end
$$;

revoke all on function app.actor_is_active_landlord(uuid, uuid) from public;
revoke all on function app.actor_can_manage_property(uuid, uuid, uuid) from public;
revoke all on function app.record_rental_inventory_event(
  uuid, text, uuid, integer, uuid, text, text, text, text
) from public;
revoke all on function app.resolve_rental_inventory_creation_replay(
  uuid, uuid, text, text, jsonb
) from public;
revoke all on function app.record_rental_inventory_creation_replay(
  uuid, uuid, text, text, jsonb, jsonb
) from public;
revoke all on table app.rental_inventory_creation_replays from public;
revoke all on function app.create_rental_property(
  text, text, jsonb, text, text, text, text, text, smallint, smallint,
  integer, text, text, text, text, text
) from public;
revoke all on function app.add_rental_unit(
  uuid, text, text, text, smallint, smallint, integer, text, text, text, text, text
) from public;
revoke all on function app.set_unit_pricing(
  uuid, bigint, char(3), timestamptz, integer, text, text, text
) from public;
revoke all on function app.set_unit_availability(
  uuid, text, text, timestamptz, integer, text, text, text
) from public;
revoke all on function app.archive_rental_unit(uuid, text, integer, text, text, text) from public;
revoke all on function app.archive_rental_property(uuid, text, integer, text, text, text) from public;

grant execute on function app.create_rental_property(
  text, text, jsonb, text, text, text, text, text, smallint, smallint,
  integer, text, text, text, text, text
) to keyforta_runtime;
grant execute on function app.add_rental_unit(
  uuid, text, text, text, smallint, smallint, integer, text, text, text, text, text
) to keyforta_runtime;
grant execute on function app.set_unit_pricing(
  uuid, bigint, char(3), timestamptz, integer, text, text, text
) to keyforta_runtime;
grant execute on function app.set_unit_availability(
  uuid, text, text, timestamptz, integer, text, text, text
) to keyforta_runtime;
grant execute on function app.archive_rental_unit(uuid, text, integer, text, text, text) to keyforta_runtime;
grant execute on function app.archive_rental_property(uuid, text, integer, text, text, text) to keyforta_runtime;

-- Superseding definition of app.create_lease_draft (currently defined by
-- migration 0012_lease_provenance.sql, which replaced the original
-- 0006_create_lease_drafts.sql version). The prior version did not lock the
-- target Unit row, so a lease could be drafted concurrently with (and
-- after) archive_rental_unit/archive_rental_property had already checked
-- for blocking leases and started archiving, leaving an archived Unit with
-- a non-archived lease. Locking the Unit row here participates in the same
-- row lock that the archive commands take, so the two paths are
-- serialized against each other; whichever runs first wins the race and
-- the other observes the up-to-date archived_at/lease state.
create or replace function app.create_lease_draft(
  requested_unit_id uuid,
  requested_tenant_user_id uuid,
  requested_currency char(3),
  requested_base_rent_minor bigint,
  requested_starts_on date,
  requested_source_type app.lease_source_type,
  requested_application_id uuid,
  requested_external_justification text
) returns app.leases
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := nullif(current_setting('app.correlation_id', true), '');
  unit_record app.units%rowtype;
  created_lease app.leases%rowtype;
begin
  if organization is null or actor is null or correlation is null or not exists (
    select 1 from app.memberships
    where organization_id = organization
      and user_id = actor
      and role = 'landlord'
      and active
  ) then
    raise exception 'landlord context is required';
  end if;
  if requested_base_rent_minor <= 0 then
    raise exception 'base rent must be positive';
  end if;

  select * into unit_record
  from app.units
  where organization_id = organization and id = requested_unit_id
  for update;

  if not found or unit_record.archived_at is not null then
    return null;
  end if;

  if not exists (
    select 1 from app.memberships
    where organization_id = organization
      and user_id = requested_tenant_user_id
      and role = 'tenant'
      and active
  ) then
    return null;
  end if;
  if exists (
    select 1 from app.leases
    where organization_id = organization and unit_id = requested_unit_id
  ) then
    return null;
  end if;

  if requested_source_type = 'platform_application' then
    perform 1
    from app.tenant_applications
    where organization_id = organization
      and id = requested_application_id
      and tenant_user_id = requested_tenant_user_id
      and status = 'approved'
    for update;
    if not found or exists (
      select 1 from app.leases
      where organization_id = organization
        and application_id = requested_application_id
    ) then
      return null;
    end if;
  elsif requested_source_type <> 'external'
    or length(trim(coalesce(requested_external_justification, ''))) not between 10 and 1000
  then
    return null;
  end if;

  insert into app.leases (
    organization_id, unit_id, tenant_user_id, currency,
    base_rent_minor, starts_on, accepted_at, source_type,
    application_id, external_justification
  ) values (
    organization, requested_unit_id, requested_tenant_user_id,
    requested_currency, requested_base_rent_minor, requested_starts_on, null,
    requested_source_type, requested_application_id,
    case when requested_source_type = 'external'
      then trim(requested_external_justification) else null end
  ) returning * into created_lease;

  insert into app.audit_events (
    organization_id, actor_id, correlation_id, action, entity_type, entity_id
  ) values (
    organization, actor, correlation, 'lease.draft_created', 'lease', created_lease.id
  );

  return created_lease;
end
$$;

create function app.list_rental_properties_for_actor()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  is_landlord boolean;
  result jsonb;
begin
  if organization is null or actor is null then
    raise exception 'trusted request context is required';
  end if;

  is_landlord := app.actor_is_active_landlord(organization, actor);

  select coalesce(jsonb_agg(property_row order by property_row ->> 'name'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'propertyType', p.property_type,
      'address', p.address,
      'timeZone', p.time_zone,
      'jurisdictionCode', p.jurisdiction_code,
      'verificationStatus', p.verification_status,
      'publicationStatus', p.publication_status,
      'version', p.version,
      'archivedAt', p.archived_at,
      'units', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', u.id,
          'label', u.label,
          'unitType', u.unit_type,
          'bedrooms', u.bedrooms,
          'bathrooms', u.bathrooms,
          'areaSquareMeters', u.area_square_meters,
          'floorLabel', u.floor_label,
          'furnishingStatus', u.furnishing_status,
          'availabilityStatus', u.availability_status,
          'publicationStatus', u.publication_status,
          'version', u.version,
          'archivedAt', u.archived_at
        ) order by u.label), '[]'::jsonb)
        from app.units u
        where u.property_id = p.id and u.organization_id = organization
          and u.archived_at is null
      )
    ) as property_row
    from app.properties p
    where p.organization_id = organization
      and p.archived_at is null
      and (
        is_landlord
        or exists (
          select 1
          from app.manager_property_assignments a
          join app.memberships m
            on m.organization_id = a.organization_id
            and m.user_id = a.manager_user_id
          where a.organization_id = organization
            and a.property_id = p.id
            and a.manager_user_id = actor
            and a.revoked_at is null
            and m.role in ('landlord', 'manager')
            and m.active
            and m.effective_from <= transaction_timestamp()
            and (m.effective_to is null or transaction_timestamp() < m.effective_to)
        )
      )
  ) properties_with_units;

  return result;
end
$$;

revoke all on function app.list_rental_properties_for_actor() from public;
grant execute on function app.list_rental_properties_for_actor() to keyforta_runtime;

create function app.runtime_schema_v0028_ready()
returns boolean
language sql
stable
set search_path = pg_catalog, app
as $$
  select true
$$;

revoke all on function app.runtime_schema_v0028_ready() from public;
grant execute on function app.runtime_schema_v0028_ready() to keyforta_runtime;

commit;
