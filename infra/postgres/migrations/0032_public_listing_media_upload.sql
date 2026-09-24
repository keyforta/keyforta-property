begin;

-- Implements REQ-038 (landlord-uploaded, KEYFORTA-hosted listing media) from
-- docs/product/REQ-038-listing-media-upload.md, approved by the Product
-- Owner (2026-09-22, re-confirmed 2026-09-22) to supersede REQ-037's "no
-- file upload / no KEYFORTA-hosted media storage" exclusion. Per the
-- Product Owner's re-confirmed decision 2, image bytes are stored in
-- PostgreSQL as an interim MVP shortcut (bytea + metadata) behind this
-- migration's functions, which act as the storage-gateway boundary: a
-- future real Blob Storage backend can replace the table access below
-- without changing the function signatures the API layer calls, so no
-- API/contract redesign is required when that infrastructure project ships.
--
-- REQ-037's other rules (manual review gate, attestation requirement, 1-10
-- image cap, media_review_status transitions, amenities exclusion) remain
-- unchanged. The pre-existing `requested_image_urls` jsonb path
-- (app.create_public_listing / app.update_public_listing_draft /
-- app.validate_public_listing_media_payload, migration 0030) is left in
-- place at the SQL layer rather than removed -- REQ-038 explicitly allows
-- this ("You do not have to delete the old requested_image_urls JSONB path
-- from the SQL layer if that's lower risk") -- but its lower bound is
-- relaxed from 1 to 0 URLs so a listing can be created with zero URLs and
-- have its images supplied entirely through the new upload commands below,
-- since the API layer no longer offers URL entry as an input path for
-- new/edited listings (see the accompanying API/contracts changes). The
-- combined 1-10 image cap and "at least one image before publish" rule are
-- now enforced across *both* mechanisms together (URL count + uploaded
-- image row count), so a listing may not exceed 10 images in total and may
-- not publish with zero images total.

-- Stores uploaded image bytes and metadata, one row per image, each
-- tagged with exactly one room from the closed list (decision 8). Multiple
-- images may share a room tag (REQ-038 scope). `content_hash` is a sha256
-- hex digest computed by the API layer for integrity/dedup purposes; it is
-- not currently used to reject duplicate uploads (no such rule exists in
-- REQ-038), only recorded for future use.
create table app.public_listing_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  public_listing_id uuid not null,
  room text not null
    check (room in ('exterior', 'living', 'kitchen', 'bathroom', 'bedroom', 'dining', 'other')),
  media_type text not null check (media_type in ('image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  content bytea not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  -- REQ-038 decision 4: images follow the same soft-delete/retention
  -- behavior as other interim-stored records (retained for recovery, not
  -- hard-deleted, until a separate purge process runs); every read path
  -- below filters `deleted_at is null`.
  deleted_at timestamptz,
  foreign key (organization_id, public_listing_id)
    references app.public_listings(organization_id, id),
  unique (organization_id, id)
);

create index public_listing_images_listing_idx
  on app.public_listing_images (organization_id, public_listing_id, position, id);

alter table app.public_listing_images enable row level security;
alter table app.public_listing_images force row level security;

-- Same pattern as app.public_listings (0022/0023): an authenticated,
-- organization-scoped session may only see/mutate its own organization's
-- image rows, and (mirroring the `published_listing_read` policy that lets
-- the public site read an eligible published app.public_listings row
-- without an organization session) any session may read an image row that
-- belongs to a currently eligible published listing, so the scan-gated
-- public image-serving route (decision 6) can work without a bearer
-- credential.
create policy organization_isolation on app.public_listing_images
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

create policy published_listing_image_read on app.public_listing_images for select
  using (app.runtime_public_listing_is_eligible(public_listing_id));

-- Direct table access is not granted to keyforta_runtime (matching the
-- app.public_listings / app.public_listing_media_review_events pattern);
-- every read/write goes through a security-definer function below so the
-- authorization and review-reset rules cannot be bypassed by a raw query.
revoke all on app.public_listing_images from keyforta_runtime;

-- Shared count/shape validation for an upload, used by
-- app.upload_public_listing_image before insert. Room/media-type/size are
-- also enforced by table check constraints as a backstop, but this gives a
-- single, clear error message for each rule (PROP-028).
create function app.validate_public_listing_image_upload(
  requested_room text,
  requested_media_type text,
  requested_size_bytes integer
) returns void
language plpgsql
as $$
begin
  if requested_room is null or requested_room not in
    ('exterior', 'living', 'kitchen', 'bathroom', 'bedroom', 'dining', 'other') then
    raise exception 'a room tag is required and must be one of the approved categories'
      using errcode = '23514';
  end if;
  if requested_media_type is null or requested_media_type not in ('image/jpeg', 'image/png') then
    raise exception 'only JPEG or PNG images may be uploaded' using errcode = '23514';
  end if;
  if requested_size_bytes is null or requested_size_bytes < 1 or requested_size_bytes > 10485760 then
    raise exception 'an uploaded image must be between 1 byte and 10 MB' using errcode = '23514';
  end if;
end
$$;

-- Total image count across both mechanisms (legacy URL array + uploaded
-- rows) for a single listing, used to enforce the combined 1-10 cap.
create function app.count_public_listing_images(
  requested_organization_id uuid,
  requested_listing_id uuid
) returns integer
language sql
stable
security definer
set search_path = pg_catalog, app
as $$
  select
    coalesce((
      select jsonb_array_length(listing.snapshot -> 'projection' -> 'imageUrls')
      from app.public_listings as listing
      where listing.organization_id = requested_organization_id
        and listing.id = requested_listing_id
    ), 0)
    + coalesce((
      select count(*)::integer
      from app.public_listing_images as image
      where image.organization_id = requested_organization_id
        and image.public_listing_id = requested_listing_id
        and image.deleted_at is null
    ), 0)
$$;

-- Uploads one image onto a draft PublicListing. Mirrors
-- app.update_public_listing_draft's authorization guard (active
-- listing-manager assignment, same-organization, draft-only) and its
-- "editing resets media review to pending" rule (PROP-029); malware
-- scanning itself happens in the API layer before this function is ever
-- called (decision 3), so a scan rejection never reaches here and never
-- partially persists (PROP-028).
create function app.upload_public_listing_image(
  requested_listing_id uuid,
  requested_room text,
  requested_media_type text,
  requested_size_bytes integer,
  requested_content bytea,
  requested_content_hash text,
  requested_correlation_id text,
  requested_source text
) returns table (
  image_id uuid,
  listing_id uuid,
  listing_version integer,
  image_position integer
)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := coalesce(requested_correlation_id, nullif(current_setting('app.correlation_id', true), ''));
  listing app.public_listings%rowtype;
  existing_count integer;
  next_position integer;
  inserted app.public_listing_images%rowtype;
  updated_version integer;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  perform app.validate_public_listing_image_upload(
    requested_room, requested_media_type, requested_size_bytes
  );

  if requested_content is null or octet_length(requested_content) <> requested_size_bytes then
    raise exception 'the uploaded image content does not match the declared size' using errcode = '23514';
  end if;

  select * into listing
  from app.public_listings
  where organization_id = organization and id = requested_listing_id
  for update;

  if not found then
    return;
  end if;

  if not app.actor_can_manage_property(organization, listing.property_id, actor) then
    raise exception 'only an active listing-manager assignment may upload media for this PublicListing'
      using errcode = '42501';
  end if;

  if listing.status <> 'draft' then
    raise exception 'only a draft PublicListing may receive uploaded images' using errcode = '23514';
  end if;

  select app.count_public_listing_images(organization, requested_listing_id) into existing_count;
  if existing_count >= 10 then
    raise exception 'a PublicListing may have at most 10 images' using errcode = '23514';
  end if;

  select coalesce(max(position) + 1, 0) into next_position
  from app.public_listing_images
  where organization_id = organization and public_listing_id = requested_listing_id and deleted_at is null;

  insert into app.public_listing_images (
    organization_id, public_listing_id, room, media_type, size_bytes, content,
    content_hash, position
  ) values (
    organization, requested_listing_id, requested_room, requested_media_type,
    requested_size_bytes, requested_content, requested_content_hash, next_position
  ) returning * into inserted;

  update app.public_listings
  set media_review_status = 'pending',
      media_reviewed_at = null,
      media_reviewer_subject = null,
      media_reviewer_object_id = null,
      media_review_notes = null,
      version = version + 1,
      updated_at = transaction_timestamp()
  where id = listing.id
  returning version into updated_version;

  perform app.record_rental_inventory_event(
    organization, 'public_listing', listing.id, updated_version,
    actor, correlation, 'listing.image_uploaded',
    'An image was uploaded and the listing resubmitted for media review',
    requested_source
  );

  image_id := inserted.id;
  listing_id := listing.id;
  listing_version := updated_version;
  image_position := inserted.position;
  return next;
end
$$;

-- Cheap existence+authorization precheck the runtime API calls before
-- decoding base64 content or invoking the malware scanner (Copilot review
-- finding on PR #131: without this, an authenticated actor who is not an
-- active listing-manager for the listing could repeatedly trigger the
-- expensive decode+scan path before being rejected, a resource-exhaustion
-- risk). Mirrors the same existence/authorization checks as the top of
-- app.upload_public_listing_image, but performs no writes; the full upload
-- function still re-checks authorization itself as defense in depth.
create function app.actor_can_upload_public_listing_image(
  requested_listing_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  listing app.public_listings%rowtype;
begin
  if organization is null or actor is null then
    raise exception 'trusted request context is required';
  end if;

  select * into listing
  from app.public_listings
  where organization_id = organization and id = requested_listing_id;

  if not found then
    return false;
  end if;

  return app.actor_can_manage_property(organization, listing.property_id, actor);
end
$$;

-- Deletes one uploaded image from a draft PublicListing. Same
-- authorization/draft-only/review-reset rules as upload above (PROP-030:
-- deleting and re-uploading with a new room tag is the supported path for
-- "changing" an image's room tag, since this data model treats each image
-- row as immutable content+room together).
create function app.delete_public_listing_image(
  requested_listing_id uuid,
  requested_image_id uuid,
  requested_correlation_id text,
  requested_source text
) returns table (
  listing_id uuid,
  listing_version integer
)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := coalesce(requested_correlation_id, nullif(current_setting('app.correlation_id', true), ''));
  listing app.public_listings%rowtype;
  delete_count integer;
  updated_version integer;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  select * into listing
  from app.public_listings
  where organization_id = organization and id = requested_listing_id
  for update;

  if not found then
    return;
  end if;

  if not app.actor_can_manage_property(organization, listing.property_id, actor) then
    raise exception 'only an active listing-manager assignment may delete media for this PublicListing'
      using errcode = '42501';
  end if;

  if listing.status <> 'draft' then
    raise exception 'only a draft PublicListing may have images removed' using errcode = '23514';
  end if;

  -- Soft-delete only (REQ-038 decision 4): the row and its bytes are
  -- retained for recovery until a separate purge process runs, never
  -- hard-deleted here. Every active-image read path filters
  -- `deleted_at is null`.
  update app.public_listing_images
  set deleted_at = transaction_timestamp()
  where organization_id = organization
    and public_listing_id = requested_listing_id
    and id = requested_image_id
    and deleted_at is null;
  get diagnostics delete_count = row_count;

  if delete_count = 0 then
    return;
  end if;

  update app.public_listings
  set media_review_status = 'pending',
      media_reviewed_at = null,
      media_reviewer_subject = null,
      media_reviewer_object_id = null,
      media_review_notes = null,
      version = version + 1,
      updated_at = transaction_timestamp()
  where id = listing.id
  returning version into updated_version;

  perform app.record_rental_inventory_event(
    organization, 'public_listing', listing.id, updated_version,
    actor, correlation, 'listing.image_deleted',
    'An image was deleted and the listing resubmitted for media review',
    requested_source
  );

  listing_id := listing.id;
  listing_version := updated_version;
  return next;
end
$$;

-- Read-only image list for the portal edit form (metadata only, never raw
-- bytes) -- authorized the same way as the draft-edit commands above.
create function app.list_public_listing_images_for_actor(
  requested_listing_id uuid
) returns table (
  image_id uuid,
  room text,
  media_type text,
  size_bytes integer,
  image_position integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  listing app.public_listings%rowtype;
begin
  if organization is null or actor is null then
    raise exception 'trusted request context is required';
  end if;

  select * into listing
  from app.public_listings
  where organization_id = organization and id = requested_listing_id;

  if not found then
    return;
  end if;

  if not app.actor_can_manage_property(organization, listing.property_id, actor) then
    raise exception 'only an active listing-manager assignment may view media for this PublicListing'
      using errcode = '42501';
  end if;

  return query
  select image.id, image.room, image.media_type, image.size_bytes, image.position as image_position, image.created_at
  from app.public_listing_images as image
  where image.organization_id = organization and image.public_listing_id = requested_listing_id
    and image.deleted_at is null
  order by image.position, image.id;
end
$$;

-- Public, scan-gated read path (decision 6/PROP-031): every uploaded image
-- of a currently eligible *published* listing, grouped by room, so the
-- public-web UI can render an "All photos" view plus one tab per room that
-- has at least one image (rooms with zero images are simply absent from
-- this result, matching PROP-031). No organization session is required
-- (mirrors app.get_public_listing / app.list_public_listings_page), and no
-- image of a draft/withdrawn listing is ever returned because
-- app.runtime_public_listing_is_eligible already requires `status =
-- 'published'`.
create function app.list_public_listing_images_by_room(
  requested_listing_id uuid
) returns table (
  image_id uuid,
  room text,
  image_position integer
)
language sql
stable
security definer
set search_path = pg_catalog, app
as $$
  select image.id, image.room, image.position as image_position
  from app.public_listing_images as image
  where image.public_listing_id = requested_listing_id
    and image.deleted_at is null
    and app.runtime_public_listing_is_eligible(requested_listing_id)
  order by image.room, image.position, image.id
$$;

-- Serves the actual bytes for one image of an eligible published listing
-- (never a raw/directly link-shareable storage URL -- the API route below
-- is the only public-facing address for this content, per decision 6).
create function app.get_public_listing_image_content(
  requested_listing_id uuid,
  requested_image_id uuid
) returns table (
  media_type text,
  content bytea
)
language sql
stable
security definer
set search_path = pg_catalog, app
as $$
  select image.media_type, image.content
  from app.public_listing_images as image
  where image.public_listing_id = requested_listing_id
    and image.id = requested_image_id
    and image.deleted_at is null
    and app.runtime_public_listing_is_eligible(requested_listing_id)
$$;

-- Loosens the legacy URL-count floor from 1 to 0 (REQ-038 decision 1: the
-- upload flow replaces URL entry as the API's input path for new/edited
-- listings, so a listing created via the API now typically starts with
-- zero URLs and receives its images entirely through
-- app.upload_public_listing_image afterward). The upper bound of 10 and
-- every other rule (https-only, uniqueness, length) are unchanged.
create or replace function app.validate_public_listing_media_payload(
  requested_title text,
  requested_summary text,
  requested_image_urls jsonb
) returns void
language plpgsql
as $$
declare
  url_count integer;
  distinct_url_count integer;
  invalid_url_count integer;
begin
  if requested_title is null or char_length(btrim(requested_title)) not between 3 and 140 then
    raise exception 'a listing title between 3 and 140 characters is required' using errcode = '23514';
  end if;
  if requested_summary is null or char_length(btrim(requested_summary)) not between 10 and 4000 then
    raise exception 'a listing summary between 10 and 4000 characters is required' using errcode = '23514';
  end if;
  if requested_image_urls is null or jsonb_typeof(requested_image_urls) <> 'array' then
    raise exception 'imageUrls must be a JSON array' using errcode = '23514';
  end if;

  select count(*) into url_count from jsonb_array_elements_text(requested_image_urls);
  select count(distinct value) into distinct_url_count from jsonb_array_elements_text(requested_image_urls);
  select count(*) into invalid_url_count
  from jsonb_array_elements_text(requested_image_urls) as value
  where value !~ '^https://\S+$' or char_length(value) > 2048;

  if url_count > 10 then
    raise exception 'a listing may have at most 10 image URLs' using errcode = '23514';
  end if;
  if distinct_url_count <> url_count then
    raise exception 'image URLs must be unique' using errcode = '23514';
  end if;
  if invalid_url_count > 0 then
    raise exception 'every image URL must be an https:// URL of at most 2048 characters'
      using errcode = '23514';
  end if;
end
$$;

-- Both the manual publish command and the auto-publish-on-approval path
-- must require at least one image *in total* (URL array + uploaded rows),
-- not just a non-empty URL array, now that uploads are the primary path.

create or replace function app.set_public_listing_publication(
  requested_listing_id uuid,
  requested_published boolean
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := nullif(current_setting('app.correlation_id', true), '');
  listing app.public_listings%rowtype;
  assignment_event_id uuid;
  property_record app.properties%rowtype;
  unit_record app.units%rowtype;
  current_pricing record;
  current_availability record;
  listing_snapshot jsonb;
  event_action text;
  total_image_count integer;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  select candidate.* into listing
  from app.public_listings as candidate
  where candidate.id = requested_listing_id
    and candidate.organization_id = organization
  for update of candidate;

  if not found then
    return false;
  end if;

  select event.id into assignment_event_id
  from app.manager_property_assignment_events as event
  join app.memberships as membership
    on membership.organization_id = event.organization_id
   and membership.user_id = event.manager_user_id
  join app.manager_property_assignments as assignment
    on assignment.organization_id = event.organization_id
   and assignment.property_id = event.property_id
   and assignment.manager_user_id = event.manager_user_id
   and assignment.assigned_at = event.occurred_at
   and assignment.revoked_at is null
  where event.organization_id = organization
    and event.property_id = listing.property_id
    and event.manager_user_id = actor
    and event.action = 'assigned'
    and membership.role in ('landlord', 'manager')
    and membership.active
    and membership.effective_from <= transaction_timestamp()
    and (membership.effective_to is null or transaction_timestamp() < membership.effective_to)
  order by event.occurred_at desc, event.id desc
  limit 1;

  if assignment_event_id is null then
    return false;
  end if;

  if requested_published then
    if listing.status = 'published' then
      return false;
    end if;

    select * into property_record
    from app.properties
    where organization_id = organization
      and id = listing.property_id;
    select * into unit_record
    from app.units
    where organization_id = organization
      and id = listing.unit_id
      and property_id = listing.property_id;

    if not found
      or property_record.archived_at is not null
      or property_record.verification_status in ('rejected', 'expired', 'suspended')
      or property_record.publication_status not in ('draft', 'pending_review', 'paused')
      or unit_record.archived_at is not null
      or unit_record.publication_status <> 'published' then
      return false;
    end if;

    select pricing.id, pricing.amount_minor, pricing.currency into current_pricing
    from app.unit_pricing_versions as pricing
    where pricing.organization_id = organization
      and pricing.unit_id = listing.unit_id
      and pricing.effective_from <= transaction_timestamp()
      and (pricing.effective_to is null or transaction_timestamp() < pricing.effective_to)
    order by pricing.effective_from desc, pricing.id desc
    limit 1;

    select availability.id, availability.status, availability.effective_from into current_availability
    from app.unit_availability_versions as availability
    where availability.organization_id = organization
      and availability.unit_id = listing.unit_id
      and availability.effective_from <= transaction_timestamp()
      and (availability.effective_to is null or transaction_timestamp() < availability.effective_to)
    order by availability.effective_from desc, availability.id desc
    limit 1;

    if current_pricing.id is null or current_availability.id is null or current_availability.status <> 'available' then
      return false;
    end if;

    select app.count_public_listing_images(organization, listing.id) into total_image_count;
    if total_image_count < 1 then
      return false;
    end if;
    if listing.media_review_status <> 'approved' then
      return false;
    end if;

    listing_snapshot := jsonb_build_object(
      'propertyId', listing.property_id,
      'propertyVersion', property_record.version,
      'unitId', listing.unit_id,
      'unitVersion', unit_record.version,
      'pricingVersionId', current_pricing.id,
      'availabilityVersionId', current_availability.id,
      'projection', jsonb_build_object(
        'id', listing.id::text,
        'name', coalesce(listing.title, property_record.name || ' — ' || unit_record.label),
        'summary', coalesce(listing.snapshot -> 'projection' ->> 'summary', property_record.name || ' listing'),
        'city', property_record.address ->> 'city',
        'district', property_record.address ->> 'quartier',
        'bedrooms', unit_record.bedrooms,
        'bathrooms', unit_record.bathrooms,
        'monthlyRentMinor', current_pricing.amount_minor::text,
        'currency', current_pricing.currency,
        'availableFrom', (current_availability.effective_from at time zone 'UTC')::date,
        'amenities', coalesce(listing.snapshot -> 'projection' -> 'amenities', '[]'::jsonb),
        'imageUrls', coalesce(listing.snapshot -> 'projection' -> 'imageUrls', '[]'::jsonb),
        'areaSquareMeters', unit_record.area_square_meters
      )
    );

    update app.public_listings
    set status = 'published',
        snapshot = listing_snapshot,
        version = version + 1,
        published_at = transaction_timestamp(),
        withdrawn_at = null,
        updated_at = transaction_timestamp()
    where id = listing.id;
    event_action := 'published';
  else
    if listing.status <> 'published' then
      return false;
    end if;

    update app.public_listings
    set status = 'withdrawn',
        version = version + 1,
        withdrawn_at = transaction_timestamp(),
        updated_at = transaction_timestamp()
    where id = listing.id;
    event_action := 'withdrawn';
  end if;

  insert into app.public_listing_publication_events (
    organization_id, listing_id, property_id, unit_id, actor_id,
    manager_assignment_event_id, manager_assignment_action, listing_version,
    correlation_id, action, source, occurred_at
  ) values (
    organization, listing.id, listing.property_id, listing.unit_id, actor,
    assignment_event_id, 'assigned', listing.version + 1,
    correlation, event_action, 'runtime_api', transaction_timestamp()
  );

  return true;
end
$$;

-- Same total-image-count change applied to the auto-publish-on-approval
-- path inside app.review_public_listing_media (0030): re-declared here in
-- full because CREATE OR REPLACE cannot add/remove OUT parameters and this
-- function's signature is unchanged, only the eligibility check inside it.
create or replace function app.review_public_listing_media(
  requested_listing_id uuid,
  requested_decision text,
  requested_reviewer_subject text,
  requested_reviewer_object_id uuid,
  requested_notes text,
  requested_correlation_id text,
  requested_source text
) returns table (
  listing_id uuid,
  media_review_status text
)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  listing app.public_listings%rowtype;
  updated_version integer;
  assignment_manager_id uuid;
  assignment_event_id uuid;
  property_record app.properties%rowtype;
  unit_record app.units%rowtype;
  current_pricing record;
  current_availability record;
  listing_snapshot jsonb;
  total_image_count integer;
begin
  if requested_decision not in ('approved', 'rejected') then
    raise exception 'invalid media review decision';
  end if;
  if requested_decision = 'rejected'
    and (requested_notes is null or char_length(btrim(requested_notes)) < 1) then
    raise exception 'rejecting a listing requires reviewer notes' using errcode = '23514';
  end if;

  select * into listing
  from app.public_listings
  where id = requested_listing_id
  for update;

  if not found or listing.status <> 'draft' or listing.media_review_status <> 'pending' then
    return;
  end if;

  update app.public_listings
  set media_review_status = requested_decision,
      media_reviewed_at = transaction_timestamp(),
      media_reviewer_subject = requested_reviewer_subject,
      media_reviewer_object_id = requested_reviewer_object_id,
      media_review_notes = requested_notes,
      version = version + 1,
      updated_at = transaction_timestamp()
  where id = listing.id
  returning id, version into listing_id, updated_version;

  insert into app.public_listing_media_review_events (
    organization_id, listing_id, listing_version, reviewer_subject, reviewer_object_id,
    decision, notes, correlation_id, source
  ) values (
    listing.organization_id, listing.id, updated_version, requested_reviewer_subject,
    requested_reviewer_object_id, requested_decision, requested_notes, requested_correlation_id,
    requested_source
  );

  if requested_decision = 'approved' then
    select assignment.manager_user_id into assignment_manager_id
    from app.manager_property_assignments as assignment
    join app.memberships as membership
      on membership.organization_id = assignment.organization_id
     and membership.user_id = assignment.manager_user_id
    where assignment.organization_id = listing.organization_id
      and assignment.property_id = listing.property_id
      and assignment.revoked_at is null
      and membership.role in ('landlord', 'manager')
      and membership.active
      and membership.effective_from <= transaction_timestamp()
      and (
        membership.effective_to is null
        or transaction_timestamp() < membership.effective_to
      )
    limit 1;

    if assignment_manager_id is not null then
      select event.id into assignment_event_id
      from app.manager_property_assignment_events as event
      where event.organization_id = listing.organization_id
        and event.property_id = listing.property_id
        and event.manager_user_id = assignment_manager_id
        and event.action = 'assigned'
      order by event.occurred_at desc, event.id desc
      limit 1;
    end if;

    if assignment_manager_id is not null and assignment_event_id is not null then
      select * into property_record
      from app.properties
      where organization_id = listing.organization_id
        and id = listing.property_id;
      select * into unit_record
      from app.units
      where organization_id = listing.organization_id
        and id = listing.unit_id
        and property_id = listing.property_id;

      if found
        and property_record.archived_at is null
        and property_record.verification_status not in ('rejected', 'expired', 'suspended')
        and property_record.publication_status in ('draft', 'pending_review', 'paused')
        and unit_record.archived_at is null
        and unit_record.publication_status = 'published' then

        select pricing.id, pricing.amount_minor, pricing.currency into current_pricing
        from app.unit_pricing_versions as pricing
        where pricing.organization_id = listing.organization_id
          and pricing.unit_id = listing.unit_id
          and pricing.effective_from <= transaction_timestamp()
          and (pricing.effective_to is null or transaction_timestamp() < pricing.effective_to)
        order by pricing.effective_from desc, pricing.id desc
        limit 1;

        select availability.id, availability.status, availability.effective_from
          into current_availability
        from app.unit_availability_versions as availability
        where availability.organization_id = listing.organization_id
          and availability.unit_id = listing.unit_id
          and availability.effective_from <= transaction_timestamp()
          and (availability.effective_to is null or transaction_timestamp() < availability.effective_to)
        order by availability.effective_from desc, availability.id desc
        limit 1;

        select app.count_public_listing_images(listing.organization_id, listing.id) into total_image_count;

        if current_pricing.id is not null
          and current_availability.id is not null
          and current_availability.status = 'available'
          and total_image_count >= 1 then

          listing_snapshot := jsonb_build_object(
            'propertyId', listing.property_id,
            'propertyVersion', property_record.version,
            'unitId', listing.unit_id,
            'unitVersion', unit_record.version,
            'pricingVersionId', current_pricing.id,
            'availabilityVersionId', current_availability.id,
            'projection', jsonb_build_object(
              'id', listing.id::text,
              'name', coalesce(listing.title, property_record.name || ' — ' || unit_record.label),
              'summary', coalesce(listing.snapshot -> 'projection' ->> 'summary', property_record.name || ' listing'),
              'city', property_record.address ->> 'city',
              'district', property_record.address ->> 'quartier',
              'bedrooms', unit_record.bedrooms,
              'bathrooms', unit_record.bathrooms,
              'monthlyRentMinor', current_pricing.amount_minor::text,
              'currency', current_pricing.currency,
              'availableFrom', (current_availability.effective_from at time zone 'UTC')::date,
              'amenities', coalesce(listing.snapshot -> 'projection' -> 'amenities', '[]'::jsonb),
              'imageUrls', coalesce(listing.snapshot -> 'projection' -> 'imageUrls', '[]'::jsonb),
              'areaSquareMeters', unit_record.area_square_meters
            )
          );

          update app.public_listings
          set status = 'published',
              snapshot = listing_snapshot,
              version = version + 1,
              published_at = transaction_timestamp(),
              withdrawn_at = null,
              updated_at = transaction_timestamp()
          where id = listing.id
          returning version into updated_version;

          insert into app.public_listing_publication_events (
            organization_id, listing_id, property_id, unit_id, actor_id,
            manager_assignment_event_id, manager_assignment_action, listing_version,
            correlation_id, action, source, occurred_at
          ) values (
            listing.organization_id, listing.id, listing.property_id, listing.unit_id,
            assignment_manager_id, assignment_event_id, 'assigned', updated_version,
            requested_correlation_id, 'published', requested_source, transaction_timestamp()
          );
        end if;
      end if;
    end if;
  end if;

  media_review_status := requested_decision;
  return next;
end
$$;

alter function app.review_public_listing_media(uuid, text, text, uuid, text, text, text)
  owner to keyforta_media_review_admin;
grant select on app.public_listing_images to keyforta_media_review_admin;
-- app.review_public_listing_media (owned by keyforta_media_review_admin, a
-- BYPASSRLS non-login role, see migration 0030) now calls
-- app.count_public_listing_images internally to decide whether the
-- combined URL+upload image total meets the "at least one image" gate
-- before auto-publishing on approval.
grant execute on function app.count_public_listing_images(uuid, uuid) to keyforta_media_review_admin;

revoke all on function app.validate_public_listing_image_upload(text, text, integer) from public;
revoke all on function app.count_public_listing_images(uuid, uuid) from public;
revoke all on function app.upload_public_listing_image(uuid, text, text, integer, bytea, text, text, text) from public;
revoke all on function app.actor_can_upload_public_listing_image(uuid) from public;
revoke all on function app.delete_public_listing_image(uuid, uuid, text, text) from public;
revoke all on function app.list_public_listing_images_for_actor(uuid) from public;
revoke all on function app.list_public_listing_images_by_room(uuid) from public;
revoke all on function app.get_public_listing_image_content(uuid, uuid) from public;

grant execute on function app.validate_public_listing_image_upload(text, text, integer) to keyforta_runtime;
grant execute on function app.count_public_listing_images(uuid, uuid) to keyforta_runtime;
grant execute on function app.upload_public_listing_image(uuid, text, text, integer, bytea, text, text, text) to keyforta_runtime;
grant execute on function app.actor_can_upload_public_listing_image(uuid) to keyforta_runtime;
grant execute on function app.delete_public_listing_image(uuid, uuid, text, text) to keyforta_runtime;
grant execute on function app.list_public_listing_images_for_actor(uuid) to keyforta_runtime;
grant execute on function app.list_public_listing_images_by_room(uuid) to keyforta_runtime;
grant execute on function app.get_public_listing_image_content(uuid, uuid) to keyforta_runtime;

commit;
