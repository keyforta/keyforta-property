# REQ-037: Media activation & PublicListing creation

**Status: APPROVED by the Product Owner.** This document is the authoritative
requirement, approved to replace the deferral in REQ-035 / PROP-019 in
[RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md](RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md).
It was drafted per the `define-requirement` procedure, all five open
decisions below were answered directly by the Product Owner, and
implementation may now proceed against this scope.

## User outcome

As a landlord or assigned manager who has already set a Unit's pricing and
availability, I want to create a PublicListing for that Unit — with a title,
summary, and image links I already host elsewhere — submit it for a manual
review, and have it publish automatically once approved, so that qualified
renters can see and inquire about it on the public site, without KEYFORTA
hosting, uploading, or processing any new media file.

## Why this was blocked (sources)

- **REQ-035** (`RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md:220-244`):
  new PublicListing creation and publication remained disabled until a
  separately approved media-activation requirement existed.
- **PROP-019** (same file, acceptance table): before media activation, new
  PublicListing creation, publication, republication, and image mutation
  were rejected without partial state or snapshot changes.
- Confirmed by code inspection: `infra/postgres/migrations/0022`/`0023`
  define `app.public_listings` and `app.set_public_listing_publication`
  (publish/withdraw only); no command created a new `app.public_listings`
  row, and no command set `app.units.publication_status` to `'published'`.

## Product Owner decisions (locked in)

1. **Manual review is required**, not "no moderation." A newly created
   listing cannot publish until a platform administrator has reviewed its
   title, summary, and image URLs and recorded an `approved` decision. A
   `rejected` decision keeps the listing in `draft` with visible reviewer
   notes; the landlord may edit and resubmit for another review.
2. **Image cap: 10** URLs per listing, as proposed.
3. **Attestation wording** (drafted below for landlord acknowledgement,
   required before submission — flagged for final Product Owner wording
   sign-off, but approved to ship as first-draft copy):

   > "I confirm that I own each linked image or hold the rights to display
   > it, that no tenant or other identifiable person appears in any image
   > without their consent, and that KEYFORTA may display these externally
   > hosted image links on the public site until I withdraw this listing."

4. **Unit `publication_status` auto-flip:** creating a PublicListing
   automatically sets the Unit's `publication_status` to `'published'` in
   the same transaction; this is not a separate landlord action.
5. **Both fields:** listings have a landlord-authored `title` (short,
   customer-facing headline) **and** a `summary` (longer marketing
   description) — not a summary-only model.

## Proposed scope — in

- **REQ-037:** A landlord or assigned manager with an active listing-manager
  assignment for the property may create exactly one PublicListing per
  eligible Unit, supplying a `title`, a `summary`, and 1–10 externally
  hosted `https://` image URLs (no file upload; KEYFORTA stores only the URL
  strings, never the image bytes), after affirmatively checking the
  attestation above. The command creates the listing in `draft` status with
  `mediaReviewStatus = 'pending'` and immediately sets the Unit's
  `publication_status` to `'published'`.
- A platform administrator (the existing cross-organization allowlisted
  role used for landlord-onboarding decisions) reviews pending listings and
  records `approved` or `rejected` with optional notes. Publishing
  (`app.set_public_listing_publication`, unchanged otherwise) additionally
  requires `mediaReviewStatus = 'approved'`.
- A landlord/manager may edit a `draft` listing's title, summary, and image
  URLs (for example after a rejection); any edit resets
  `mediaReviewStatus` back to `'pending'` for re-review.
- Amenities remain **excluded** — every listing's `amenities` stays `[]`.

## Explicit exclusions (still deferred)

- File upload or KEYFORTA-hosted media storage of any kind.
- Automated image-content scanning (review is manual, human judgment only).
- Amenities catalogue.
- Anti-hotlink protection, derivative-image generation, or cache
  invalidation for third-party-hosted images.
- Any takedown workflow beyond withdrawing the entire listing.
- Any KEYFORTA claim or SLA about third-party image availability, rights, or
  content accuracy.

## Acceptance criteria

- **PROP-024:** An actor without an active listing-manager assignment for
  the Unit's property cannot create, edit, or read another organization's
  listing (403/404 per the existing PROP-010 nondisclosing-denial model);
  the action is not shown in the UI either.
- **PROP-025:** Creating a listing for a Unit that already has a
  `public_listings` row is rejected with a clear "listing already exists"
  error (backed by the existing `unique (organization_id, unit_id)`
  constraint); submitting zero image URLs, more than 10, any non-`https://`
  URL, or an unchecked attestation is rejected client- and server-side with
  no partial listing created.
- **PROP-026:** Publish is rejected unless `mediaReviewStatus = 'approved'`,
  in addition to every existing PROP-012 guard (current pricing, available
  status, Unit/Property `publication_status = 'published'`, verification,
  active listing-manager assignment, ≥1 image URL); a listing never appears
  in any public projection before that. Only a platform administrator may
  record a review decision (403/404 for any other actor); editing a `draft`
  listing resets it to `pending` re-review. Withdrawing/archiving the Unit
  or Property still cascades to withdraw its listing exactly as PROP-016
  already specifies.

## Traceability

| Requirement | Acceptance criteria | Verification method |
| --- | --- | --- |
| REQ-037 | PROP-024, PROP-025, PROP-026 | Domain, database, authorization, cross-organization isolation, and API contract tests |

