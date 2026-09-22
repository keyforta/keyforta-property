begin;

-- Fixes the gap logged in docs/engineering/REQUIREMENTS_GAPS.md
-- ("Manager/landlord self-assignment for auto-publish eligibility"): REQ-037's
-- `app.review_public_listing_media` / `app.set_public_listing_publication`
-- (migration 0030) both require an active `app.manager_property_assignments`
-- row (plus its matching `app.manager_property_assignment_events` row) for
-- the acting landlord/manager before a PublicListing can auto-publish on
-- media approval. `app.set_manager_property_assignment` (migration 0017)
-- already supports a landlord self-assigning to a property in their own
-- organization, but no product flow ever called it, so a landlord who
-- creates and owns a Property directly (the common pilot case, with no
-- delegated manager) could never get a PublicListing to auto-publish.
--
-- This redefines `app.create_rental_property` (0028) to self-assign the
-- creating landlord to the Property they just created, in the same
-- transaction, immediately after the insert. This does not change the
-- function's signature, return shape, authorization guard, replay
-- semantics, or event recording — it only adds one additional effect.
create or replace function app.create_rental_property(
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

  -- Self-assign the creating landlord to their new Property so that
  -- app.set_public_listing_publication's assignment guard is satisfied
  -- without any additional manual step. `set_manager_property_assignment`
  -- re-checks that `actor` is an active landlord in `organization` (already
  -- just verified above) and inserts both the assignment row and its
  -- matching assignment-event row.
  perform app.set_manager_property_assignment(created_property.id, actor, true);

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

commit;
