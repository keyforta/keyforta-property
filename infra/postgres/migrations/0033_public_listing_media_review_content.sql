begin;

-- Fixes a gap discovered while finishing REQ-038 (landlord-uploaded,
-- KEYFORTA-hosted listing media): migration 0032 added
-- app.upload_public_listing_image and friends, but never gave a platform
-- administrator any way to actually see an uploaded image before deciding
-- app.review_public_listing_media's approve/reject outcome.
-- app.get_public_listing_image_content (0032) only serves bytes for a
-- listing that already passes app.runtime_public_listing_is_eligible,
-- which requires `status = 'published'` -- but a listing cannot publish
-- until its media review is approved, so every uploaded image was
-- unreachable at exactly the moment (`media_review_status = 'pending'`)
-- a reviewer needed to look at it. This migration closes that gap without
-- touching REQ-038's decisions on storage, scanning, or the review gate
-- itself.

-- Extends the pending-review queue (0030) with the uploaded-image metadata
-- (id, room, media type, position) reviewers need to know an image exists
-- and to request its bytes via the new function below. The legacy
-- `image_urls` column (still populated from the JSONB snapshot for
-- REQ-037-era listings) is unchanged. Changing the return shape requires
-- dropping the old function first; CREATE OR REPLACE cannot alter a
-- function's result columns.
drop function app.list_public_listings_pending_media_review();

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
        ),
        '[]'::jsonb
      ),
      l.created_at
    from app.public_listings l
    join app.organizations o on o.id = l.organization_id
    join app.properties p on p.organization_id = l.organization_id and p.id = l.property_id
    join app.units u on u.organization_id = l.organization_id and u.id = l.unit_id
    where l.status = 'draft' and l.media_review_status = 'pending'
    order by l.created_at, l.id;
$$;

alter function app.list_public_listings_pending_media_review() owner to keyforta_media_review_admin;
revoke all on function app.list_public_listings_pending_media_review() from public;
grant execute on function app.list_public_listings_pending_media_review() to keyforta_runtime;

-- Serves the raw bytes of one uploaded image for review purposes only: the
-- listing must still be awaiting media review (`media_review_status =
-- 'pending'`). This is intentionally narrower than the public, scan-gated
-- `app.get_public_listing_image_content` (0032) -- it never serves an
-- image for a published, withdrawn, approved-but-not-yet-published, or
-- rejected listing, so it cannot become a second public image-serving path
-- once REQ-038's decision 6 boundary applies. Owned by
-- keyforta_media_review_admin (BYPASSRLS, same as
-- app.list_public_listings_pending_media_review and
-- app.review_public_listing_media) so it can read any organization's
-- pending image regardless of RLS.
create function app.get_public_listing_image_content_for_review(
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
    and listing.status = 'draft'
    and listing.media_review_status = 'pending'
$$;

alter function app.get_public_listing_image_content_for_review(uuid, uuid)
  owner to keyforta_media_review_admin;
revoke all on function app.get_public_listing_image_content_for_review(uuid, uuid) from public;
grant execute on function app.get_public_listing_image_content_for_review(uuid, uuid) to keyforta_runtime;

commit;
