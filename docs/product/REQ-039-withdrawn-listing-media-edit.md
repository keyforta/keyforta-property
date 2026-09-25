# REQ-039: Editing images on a withdrawn PublicListing

**Status: APPROVED by the Product Owner (2026-09-24, live chat).** This
document amends REQ-038 (`docs/product/REQ-038-listing-media-upload.md`),
which never addressed the `withdrawn` PublicListing state. REQ-038's other
rules (manual review gate, attestation requirement, 1–10 image cap, soft
delete, authorization via `actor_can_manage_property`) remain in force
unchanged except where explicitly amended below.

## Why this requirement exists

Discovered while manually testing the local dev environment on 2026-09-24:
the Product Owner withdrew a published listing, then tried to add/replace
its images before republishing, and could not — the portal UI renders the
image manager for any existing listing regardless of status
(`apps/portal-web/src/property-management-panel.jsx` — `ListingImageManager`
is unconditional on `hasListing`, not gated on `isDraft`), but
`app.upload_public_listing_image` / `app.delete_public_listing_image`
(`infra/postgres/migrations/0032_public_listing_media_upload.sql`) reject
any listing whose `status <> 'draft'`, including `withdrawn`. The Product
Owner reported this directly: "I have withdrawn unit but I can't add new
images to them."

## Product Owner decision (locked in, 2026-09-24)

Chosen from three options presented (allow edits while withdrawn / add an
explicit `withdrawn → draft` transition / leave as a known limitation): the
Product Owner selected **allow upload/replace/delete directly while
`public_listings.status = 'withdrawn'`**, in addition to the existing
`'draft'` allowance — the simplest option, since a withdrawn listing's
media is not publicly servable until it is republished, so this does not
change any exposure boundary.

The Product Owner also confirmed re-editing images on a withdrawn listing
should reset `media_review_status` to `'pending'` before republish is
allowed again, mirroring PROP-029's existing draft behavior (REQ-038)
— a landlord/manager should not be able to republish images that were never
reviewed in their edited form.

## Scope

- `app.upload_public_listing_image`, `app.delete_public_listing_image`: the
  `if listing.status <> 'draft' then raise exception ...` guard becomes
  `if listing.status not in ('draft', 'withdrawn') then raise exception ...`.
  No other behavior in these functions changes (authorization check,
  10-image cap, soft-delete-only, `media_review_status` reset to
  `'pending'` on every successful upload/delete) — a withdrawn listing now
  follows the exact same media-edit rules a draft listing already does.
- `app.actor_can_upload_public_listing_image`: unchanged. It already checks
  only `actor_can_manage_property`, not listing status; the portal UI's
  existing "show the image manager whenever a listing exists" behavior
  already matched this function's authorization scope, it was only the
  upload/delete commands that were stricter than the UI implied.
- `app.set_public_listing_publication` (draft/withdrawn → published,
  published → withdrawn): **unchanged.** Republishing a withdrawn listing
  with freshly edited (and now again `'pending'`) media must still pass
  through the existing manual media-review gate
  (`app.review_public_listing_media`) before publication, exactly as a
  first-time draft publish does today — REQ-039 does not create any new
  path to publish unreviewed media.
- No portal-web UI change is required: `ListingImageManager` already
  renders unconditionally once a listing exists; it will simply stop
  receiving a `23514` rejection from the backend when the listing is
  `withdrawn`.

## Amendment (2026-09-24, Copilot review on PR #136)

The first implementation pass (migration `0034`) only widened the
upload/delete guard, per the scope above. GitHub Copilot's automated
review of PR #136 correctly flagged that this left a withdrawn listing's
edited media **permanently unreviewable**: `app.review_public_listing_media`,
`app.list_public_listings_pending_media_review`, and
`app.get_public_listing_image_content_for_review` (all from REQ-037/038,
migrations `0032`/`0033`) still hard-required `status = 'draft'`, so the
reset-to-`pending` media from a withdrawn-listing edit would never surface
to a reviewer, never be approvable, and the listing could never be
republished — defeating the entire purpose of this requirement.

Migration `0035` closes that gap: the three functions above now also
accept `status = 'withdrawn'`. To avoid introducing a new "approve media on
a withdrawn listing and it silently republishes itself" path, the
pre-existing auto-publish side effect inside `review_public_listing_media`
is explicitly restricted to `status = 'draft'` — approving a withdrawn
listing's media leaves it `withdrawn` (now with `media_review_status =
'approved'`), and republishing still requires the landlord/manager's
explicit, separate `app.set_public_listing_publication(published => true)`
call, which already requires `media_review_status = 'approved'`
(unchanged). This preserves the "no new path to publish unreviewed media"
guarantee stated in the Scope section above, end to end through the
withdrawn-edit-review-republish cycle.

## Out of scope

- No explicit `withdrawn → draft` transition function is added (the
  rejected alternative option).
- No change to the 1–10 image cap, soft-delete semantics, attestation
  requirement, or authorization rule.
- No change to `published` listings — images remain immutable while a
  listing is live, unchanged from REQ-038.

## Evidence plan

Per AGENTS.md's before → red → after → green loop: a new integration test
reproduces "uploading/deleting an image on a `withdrawn` listing raises
`23514` today" against the unmodified migration set (red), then the new
migration is added and the same test passes (green), plus authorization and
cross-organization isolation coverage for the same commands.
