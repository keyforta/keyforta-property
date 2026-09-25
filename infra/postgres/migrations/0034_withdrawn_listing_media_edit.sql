begin;

-- REQ-039: a landlord who withdraws a published PublicListing was
-- permanently stuck with whatever images were approved at first publish --
-- app.upload_public_listing_image / app.delete_public_listing_image
-- (migration 0032) only permitted media edits while status = 'draft'.
-- Product Owner decision (2026-09-24, docs/product/REQ-039): allow the
-- same upload/replace/delete operations while status = 'withdrawn', with
-- no other behavior change -- authorization, the 1-10 image cap, and the
-- soft-delete-only rule are unchanged, and every successful upload/delete
-- still resets media_review_status to 'pending', so a withdrawn listing's
-- edited media must pass the existing manual review gate again before
-- app.set_public_listing_publication can republish it (no new path to
-- publish unreviewed media is introduced).

create or replace function app.upload_public_listing_image(
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

  if listing.status not in ('draft', 'withdrawn') then
    raise exception 'only a draft or withdrawn PublicListing may receive uploaded images' using errcode = '23514';
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

create or replace function app.delete_public_listing_image(
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

  if listing.status not in ('draft', 'withdrawn') then
    raise exception 'only a draft or withdrawn PublicListing may have images removed' using errcode = '23514';
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

-- create or replace preserves prior grants/ownership, but re-assert them
-- explicitly for clarity and to guard against any future default change.
revoke all on function app.upload_public_listing_image(uuid, text, text, integer, bytea, text, text, text) from public;
grant execute on function app.upload_public_listing_image(uuid, text, text, integer, bytea, text, text, text) to keyforta_runtime;
revoke all on function app.delete_public_listing_image(uuid, uuid, text, text) from public;
grant execute on function app.delete_public_listing_image(uuid, uuid, text, text) to keyforta_runtime;

commit;
