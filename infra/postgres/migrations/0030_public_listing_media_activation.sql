begin;

-- Implements REQ-037 (media activation & PublicListing creation) from
-- docs/product/REQ-037-media-activation-and-public-listing-creation.md,
-- approved by the Product Owner to supersede the REQ-035/PROP-019 deferral
-- recorded in migration 0028's header comment. A landlord or assigned
-- manager may now create a PublicListing (title, summary, 1-10 externally
-- hosted https image URLs), which starts `draft` with `media_review_status
-- = 'pending'` and immediately sets the Unit's `publication_status` to
-- `'published'`. A platform administrator (the same cross-organization
-- allowlisted role used for landlord-onboarding decisions, REQ-028-031)
-- must record an `approved` media-review decision before the existing,
-- otherwise-unchanged `app.set_public_listing_publication` command (0023)
-- will allow the listing to publish. A `rejected` decision keeps the
-- listing in `draft` with visible reviewer notes; editing a draft listing
-- resets it to `pending` for re-review.

alter table app.public_listings
  add column title text,
  add column media_review_status text not null default 'pending'
    check (media_review_status in ('pending', 'approved', 'rejected')),
  add column media_reviewed_at timestamptz,
  add column media_reviewer_subject text,
  add column media_reviewer_object_id uuid,
  add column media_review_notes text
    check (media_review_notes is null or char_length(btrim(media_review_notes)) between 1 and 2000),
  add constraint public_listings_title_check
    check (title is null or char_length(btrim(title)) between 3 and 140);

-- Backfill legacy rows before the media-approval constraint is added: any
-- listing already `published` by migrations 0023/0029 predates this
-- media-review workflow entirely, so it is grandfathered in as `approved`
-- (with a synthetic decision record) rather than being retroactively
-- blocked from remaining published.
update app.public_listings
set media_review_status = 'approved',
    media_reviewed_at = transaction_timestamp(),
    media_reviewer_subject = 'system:migration-0030-backfill',
    media_reviewer_object_id = '00000000-0000-0000-0000-000000000000'
where status = 'published' and media_review_status = 'pending';

alter table app.public_listings
  add constraint public_listings_published_requires_media_approval
    check (status <> 'published' or media_review_status = 'approved'),
  add constraint public_listings_reviewed_at_requires_decision
    check (
      (media_review_status = 'pending' and media_reviewed_at is null)
      or (media_review_status in ('approved', 'rejected') and media_reviewed_at is not null
        and media_reviewer_subject is not null and media_reviewer_object_id is not null)
    );

-- Immutable audit trail of every media-review decision, mirroring the
-- landlord-onboarding-decisions pattern (migration 0018): the reviewer
-- identity is stored directly as subject/object-id columns, not a foreign
-- key to app.users, because platform administrators are cross-organization
-- identities (ADR-002) who may not have an organization-scoped app.users
-- row at all.
create table app.public_listing_media_review_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  listing_id uuid not null,
  listing_version integer not null check (listing_version > 0),
  reviewer_subject text not null check (char_length(btrim(reviewer_subject)) between 1 and 500),
  reviewer_object_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected')),
  notes text check (notes is null or char_length(btrim(notes)) between 1 and 2000),
  correlation_id text not null check (char_length(correlation_id) between 1 and 200),
  source text not null check (char_length(btrim(source)) between 1 and 64),
  decided_at timestamptz not null default transaction_timestamp(),
  foreign key (organization_id, listing_id) references app.public_listings(organization_id, id)
);

create index public_listing_media_review_events_listing
  on app.public_listing_media_review_events (organization_id, listing_id, decided_at);

create function app.reject_public_listing_media_review_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'public listing media review events are immutable';
end
$$;

create trigger public_listing_media_review_events_no_update
  before update on app.public_listing_media_review_events
  for each row execute function app.reject_public_listing_media_review_event_mutation();

create trigger public_listing_media_review_events_no_delete
  before delete on app.public_listing_media_review_events
  for each row execute function app.reject_public_listing_media_review_event_mutation();

alter table app.public_listing_media_review_events enable row level security;
alter table app.public_listing_media_review_events force row level security;

create policy public_listing_media_review_events_isolation
  on app.public_listing_media_review_events
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

-- The platform-admin media-review console (mirroring the cross-organization
-- landlord-onboarding allowlist, REQ-028-031) must read and decide on
-- listings across every organization, not just the caller's own. Rather
-- than trusting a client-supplied organization id, `review_public_listing_media`
-- and `list_public_listings_pending_media_review` set this session-local,
-- transaction-scoped flag themselves (never client-controlled) immediately
-- before, and clear it immediately after, the exact statements that require
-- cross-organization visibility; every other code path leaves it unset, so
-- FORCE ROW LEVEL SECURITY still applies everywhere else.
create policy public_listings_platform_admin_media_review on app.public_listings
  using (current_setting('app.platform_admin_media_review', true) = 'true')
  with check (current_setting('app.platform_admin_media_review', true) = 'true');

create policy public_listing_media_review_events_platform_admin_media_review
  on app.public_listing_media_review_events
  using (current_setting('app.platform_admin_media_review', true) = 'true')
  with check (current_setting('app.platform_admin_media_review', true) = 'true');

revoke all on app.public_listing_media_review_events from keyforta_runtime;
grant select, insert on app.public_listing_media_review_events to keyforta_runtime;

-- Validates the shared title/summary/image-URL payload rules for both
-- create and update-draft commands: 1-10 unique https:// URLs, each within
-- a bounded length, so PROP-025 rejects invalid payloads identically at
-- creation and edit time.
create function app.validate_public_listing_media_payload(
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

  if url_count < 1 or url_count > 10 then
    raise exception 'a listing requires between 1 and 10 image URLs' using errcode = '23514';
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

create function app.create_public_listing(
  requested_unit_id uuid,
  requested_title text,
  requested_summary text,
  requested_image_urls jsonb,
  requested_idempotency_key text,
  requested_correlation_id text,
  requested_source text
) returns table (
  listing_id uuid,
  listing_version integer,
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
  unit_record app.units%rowtype;
  created_listing app.public_listings%rowtype;
  payload jsonb;
  replay record;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  select * into unit_record
  from app.units
  where organization_id = organization
    and id = requested_unit_id
  for update;

  if not found then
    raise exception 'the requested Unit was not found' using errcode = 'P0002';
  end if;

  if not app.actor_can_manage_property(organization, unit_record.property_id, actor) then
    raise exception 'only an active listing-manager assignment may create a PublicListing'
      using errcode = '42501';
  end if;

  if unit_record.archived_at is not null then
    raise exception 'an archived Unit cannot receive a PublicListing' using errcode = '23514';
  end if;

  payload := jsonb_build_object(
    'unitId', requested_unit_id, 'title', requested_title,
    'summary', requested_summary, 'imageUrls', requested_image_urls
  );

  select * into replay from app.resolve_rental_inventory_creation_replay(
    organization, actor, 'create_public_listing', requested_idempotency_key, payload
  );

  if replay.is_replay then
    listing_id := (replay.replay_result ->> 'listingId')::uuid;
    listing_version := (replay.replay_result ->> 'listingVersion')::integer;
    unit_id := (replay.replay_result ->> 'unitId')::uuid;
    unit_version := (replay.replay_result ->> 'unitVersion')::integer;
    return next;
    return;
  end if;

  if exists (
    select 1 from app.public_listings as existing_listing
    where existing_listing.organization_id = organization
      and existing_listing.unit_id = requested_unit_id
  ) then
    raise exception 'a PublicListing already exists for this Unit' using errcode = '23505';
  end if;

  -- actor_can_manage_property authorizes an active landlord even without an
  -- explicit manager_property_assignments row (unlike a manager, who must
  -- already hold one to pass that check). Without also recording an
  -- assignment here, app.list_public_listings_for_actor (which, like the
  -- rest of the portfolio feed, is deliberately scoped to explicit
  -- assignments per issue #114) would never surface the listing back to
  -- that landlord. Self-assigning is a no-op (and harmless) when the actor
  -- is a manager who is already assigned, or already self-assigned.
  perform app.set_manager_property_assignment(unit_record.property_id, actor, true);

  perform app.validate_public_listing_media_payload(
    requested_title, requested_summary, requested_image_urls
  );

  insert into app.public_listings (
    organization_id, property_id, unit_id, status, title, snapshot
  ) values (
    organization, unit_record.property_id, requested_unit_id, 'draft', requested_title,
    jsonb_build_object('projection', jsonb_build_object(
      'title', requested_title, 'summary', requested_summary, 'imageUrls', requested_image_urls
    ))
  ) returning * into created_listing;

  update app.units
  set publication_status = 'published',
      version = version + 1
  where organization_id = organization and id = requested_unit_id
  returning version into unit_version;

  perform app.record_rental_inventory_event(
    organization, 'public_listing', created_listing.id, created_listing.version,
    actor, correlation, 'listing.created', 'PublicListing created and submitted for media review',
    requested_source
  );

  listing_id := created_listing.id;
  listing_version := created_listing.version;
  unit_id := requested_unit_id;

  perform app.record_rental_inventory_creation_replay(
    organization, actor, 'create_public_listing', requested_idempotency_key, payload,
    jsonb_build_object(
      'listingId', listing_id, 'listingVersion', listing_version,
      'unitId', unit_id, 'unitVersion', unit_version
    )
  );

  return next;
end
$$;

create function app.update_public_listing_draft(
  requested_listing_id uuid,
  requested_title text,
  requested_summary text,
  requested_image_urls jsonb,
  requested_expected_version integer,
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
    raise exception 'only an active listing-manager assignment may edit this PublicListing'
      using errcode = '42501';
  end if;

  if listing.status <> 'draft' then
    raise exception 'only a draft PublicListing may be edited' using errcode = '23514';
  end if;

  if listing.version <> requested_expected_version then
    raise exception 'the supplied version is stale' using errcode = '40001';
  end if;

  perform app.validate_public_listing_media_payload(
    requested_title, requested_summary, requested_image_urls
  );

  update app.public_listings
  set title = requested_title,
      media_review_status = 'pending',
      media_reviewed_at = null,
      media_reviewer_subject = null,
      media_reviewer_object_id = null,
      media_review_notes = null,
      snapshot = jsonb_build_object('projection', jsonb_build_object(
        'title', requested_title, 'summary', requested_summary, 'imageUrls', requested_image_urls
      )),
      version = version + 1,
      updated_at = transaction_timestamp()
  where id = listing.id
  returning id, version into listing_id, listing_version;

  perform app.record_rental_inventory_event(
    organization, 'public_listing', listing_id, listing_version,
    actor, correlation, 'listing.updated', 'Draft PublicListing edited and resubmitted for media review',
    requested_source
  );

  return next;
end
$$;

-- Platform-admin-only decision (authorization enforced at the API layer via
-- isAuthorizedPlatformAdminAction, exactly like
-- app.decide_landlord_onboarding_application). No organization/actor
-- context is required here because platform administrators are
-- cross-organization identities that do not carry an organization-scoped
-- session; the API route is the only gate. `app.public_listings` and
-- `app.public_listing_media_review_events` are FORCE ROW LEVEL SECURITY, so
-- the trusted, transaction-scoped `app.platform_admin_media_review` flag is
-- set immediately before, and cleared immediately after, the exact
-- statements that require cross-organization visibility.
create function app.review_public_listing_media(
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
begin
  if requested_decision not in ('approved', 'rejected') then
    raise exception 'invalid media review decision';
  end if;
  if requested_decision = 'rejected'
    and (requested_notes is null or char_length(btrim(requested_notes)) < 1) then
    raise exception 'rejecting a listing requires reviewer notes' using errcode = '23514';
  end if;

  perform set_config('app.platform_admin_media_review', 'true', true);

  select * into listing
  from app.public_listings
  where id = requested_listing_id
  for update;

  if not found or listing.status <> 'draft' or listing.media_review_status <> 'pending' then
    perform set_config('app.platform_admin_media_review', '', true);
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

  perform set_config('app.platform_admin_media_review', '', true);

  media_review_status := requested_decision;
  return next;
end
$$;

-- Read-only queue for the admin media-review console: every listing in
-- `draft` status still awaiting a decision (`media_review_status =
-- 'pending'`), across every organization. `app.public_listings` is FORCE
-- ROW LEVEL SECURITY, so this function briefly sets the same trusted,
-- transaction-scoped cross-organization flag as
-- app.review_public_listing_media around the single query that needs it.
create function app.list_public_listings_pending_media_review()
returns table (
  listing_id uuid,
  organization_id uuid,
  organization_name text,
  unit_id uuid,
  property_name text,
  unit_label text,
  title text,
  summary text,
  image_urls jsonb,
  submitted_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, app
as $$
begin
  perform set_config('app.platform_admin_media_review', 'true', true);

  return query
    select l.id, l.organization_id, o.name, l.unit_id, p.name, u.label,
      l.title, l.snapshot -> 'projection' ->> 'summary',
      coalesce(l.snapshot -> 'projection' -> 'imageUrls', '[]'::jsonb),
      l.created_at
    from app.public_listings l
    join app.organizations o on o.id = l.organization_id
    join app.properties p on p.organization_id = l.organization_id and p.id = l.property_id
    join app.units u on u.organization_id = l.organization_id and u.id = l.unit_id
    where l.status = 'draft' and l.media_review_status = 'pending'
    order by l.created_at, l.id;

  perform set_config('app.platform_admin_media_review', '', true);
end
$$;

-- Extends the read-only portfolio feed (0029) with the fields the portal UI
-- needs to show creation/review state: unitId (so the UI knows which Unit a
-- listing belongs to, and which Units have none yet), mediaReviewStatus,
-- mediaReviewNotes, summary, and imageUrls.
create or replace function app.list_public_listings_for_actor()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  result jsonb;
begin
  if organization is null or actor is null then
    raise exception 'trusted request context is required';
  end if;

  select coalesce(jsonb_agg(listing_row order by listing_row ->> 'title'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', l.id,
      'unitId', l.unit_id,
      'title', coalesce(l.title, p.name || ' — ' || u.label),
      'status', l.status,
      'mediaReviewStatus', l.media_review_status,
      'mediaReviewNotes', l.media_review_notes,
      'summary', l.snapshot -> 'projection' ->> 'summary',
      'imageUrls', coalesce(l.snapshot -> 'projection' -> 'imageUrls', '[]'::jsonb),
      'version', l.version,
      'note', concat_ws(', ', p.address ->> 'commune', p.address ->> 'city')
    ) as listing_row
    from app.public_listings l
    join app.properties p
      on p.organization_id = l.organization_id and p.id = l.property_id
    join app.units u
      on u.organization_id = l.organization_id and u.id = l.unit_id
    where l.organization_id = organization
      and exists (
        select 1
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
          and event.property_id = l.property_id
          and event.manager_user_id = actor
          and event.action = 'assigned'
          and membership.role in ('landlord', 'manager')
          and membership.active
          and membership.effective_from <= transaction_timestamp()
          and (membership.effective_to is null or transaction_timestamp() < membership.effective_to)
        order by event.occurred_at desc, event.id desc
        limit 1
      )
  ) listings;

  return result;
end
$$;

-- Extends the publish command (0023) with the REQ-037 media-review gate and
-- a landlord-authored `title` in the published projection; every other
-- PROP-012 guard is unchanged.
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

    if listing.media_review_status <> 'approved' then
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

    if jsonb_array_length(coalesce(listing_snapshot -> 'projection' -> 'imageUrls', '[]'::jsonb)) < 1 then
      return false;
    end if;

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
    assignment_event_id, 'assigned',
    (select version from app.public_listings where id = listing.id),
    correlation, event_action, 'runtime_api', transaction_timestamp()
  );

  return true;
end
$$;

revoke all on function app.create_public_listing(uuid, text, text, jsonb, text, text, text) from public;
grant execute on function app.create_public_listing(uuid, text, text, jsonb, text, text, text) to keyforta_runtime;
revoke all on function app.update_public_listing_draft(uuid, text, text, jsonb, integer, text, text) from public;
grant execute on function app.update_public_listing_draft(uuid, text, text, jsonb, integer, text, text) to keyforta_runtime;
revoke all on function app.review_public_listing_media(uuid, text, text, uuid, text, text, text) from public;
grant execute on function app.review_public_listing_media(uuid, text, text, uuid, text, text, text) to keyforta_runtime;
revoke all on function app.list_public_listings_pending_media_review() from public;
grant execute on function app.list_public_listings_pending_media_review() to keyforta_runtime;
revoke all on function app.validate_public_listing_media_payload(text, text, jsonb) from public;
grant execute on function app.validate_public_listing_media_payload(text, text, jsonb) to keyforta_runtime;

commit;
