begin;

-- REQ-039 follow-up (Copilot review finding on PR #136): 0034 allowed
-- upload/delete media edits on a withdrawn listing and reset
-- media_review_status back to 'pending', but all three admin review
-- paths (the pending-review queue, the review-only image byte reader,
-- and the actual approve/reject decision function) still required
-- listing.status = 'draft'. That left a withdrawn listing's edited media
-- permanently stuck in 'pending' review -- never visible to a reviewer,
-- never approvable, and therefore never republishable, defeating the
-- whole purpose of REQ-039.
--
-- This migration widens those three read/decision paths to also include
-- listing.status = 'withdrawn', with no other behavior change:
-- - app.list_public_listings_pending_media_review and
--   app.get_public_listing_image_content_for_review now surface/serve a
--   withdrawn listing's pending images for review, exactly like a draft
--   listing's.
-- - app.review_public_listing_media now accepts an approve/reject
--   decision for a withdrawn listing's media.
-- Approving a *withdrawn* listing's media does NOT auto-publish it (the
-- pre-existing auto-publish side effect inside review_public_listing_media
-- is now explicitly gated to listing.status = 'draft'): republishing a
-- withdrawn listing still requires an explicit, separate
-- app.set_public_listing_publication(published => true) call, which
-- already requires media_review_status = 'approved' (0032, line 636) --
-- so no new path to publish unreviewed or un-re-confirmed media is
-- introduced, and REQ-039's "must pass the existing manual review gate
-- again before ... republish" decision is preserved end to end.

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

  if not found or listing.status not in ('draft', 'withdrawn') or listing.media_review_status <> 'pending' then
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

    if listing.status = 'draft' and assignment_manager_id is not null and assignment_event_id is not null then
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

create or replace function app.list_public_listings_pending_media_review()
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
  uploaded_images jsonb,
  submitted_at timestamptz
)
language sql
security definer
stable
set search_path = pg_catalog, app
as $$
    select l.id, l.organization_id, o.name, l.unit_id, p.name, u.label,
      l.title, l.snapshot -> 'projection' ->> 'summary',
      coalesce(l.snapshot -> 'projection' -> 'imageUrls', '[]'::jsonb),
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'imageId', img.id,
              'room', img.room,
              'mediaType', img.media_type,
              'position', img.position
            )
            order by img.position, img.id
          )
          from app.public_listing_images as img
          where img.public_listing_id = l.id
            and img.deleted_at is null
        ),
        '[]'::jsonb
      ),
      l.created_at
    from app.public_listings l
    join app.organizations o on o.id = l.organization_id
    join app.properties p on p.organization_id = l.organization_id and p.id = l.property_id
    join app.units u on u.organization_id = l.organization_id and u.id = l.unit_id
    where l.status in ('draft', 'withdrawn') and l.media_review_status = 'pending'
    order by l.created_at, l.id;
$$;

create or replace function app.get_public_listing_image_content_for_review(
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
  join app.public_listings as listing on listing.id = image.public_listing_id
  where image.public_listing_id = requested_listing_id
    and image.id = requested_image_id
    and image.deleted_at is null
    and listing.status in ('draft', 'withdrawn')
    and listing.media_review_status = 'pending'
$$;

commit;
