# Minimal media activation & PublicListing creation (proposal)

**Status: DRAFT — awaiting Product Owner approval.** This document is not an
approved requirement. No contract, migration, API route, or UI referenced
below may be implemented until the Product Owner explicitly approves this
scope (or an amended version of it), per REQ-035 / PROP-019 in
[RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md](RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md)
and the repository's requirements-change approval gate (`AGENTS.md`).

## User outcome

As a landlord or assigned manager who has already set a Unit's pricing and
availability, I want to create a PublicListing for that Unit using image
links I already host elsewhere, so that qualified renters can see and inquire
about it on the public site — without KEYFORTA hosting, uploading, or
processing any new media file.

## Why this is blocked today (sources)

- **REQ-035** (`RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md:220-244`):
  "Amenities and new media records are deferred from the core v1
  implementation... New PublicListing creation and publication remain
  disabled until the source profiles are complete and the media activation
  requirement is approved and implemented."
- **PROP-019** (same file, acceptance table): "Before media activation, new
  PublicListing creation, publication, republication, and image mutation are
  rejected without partial state or snapshot changes."
- **`docs/engineering/REQUIREMENTS_GAPS.md`** ("Property and inventory entity
  depth" row): records amenities and new-media-activation as still
  separately gated, distinct from the already-resolved Property/Unit
  inventory scope (REQ-032–REQ-036).
- Confirmed by code inspection: `infra/postgres/migrations/0022`/`0023`
  define `app.public_listings` and `app.set_public_listing_publication`
  (publish/withdraw only), but **no command anywhere creates a new
  `app.public_listings` row**, and no command sets `app.units.publication_status`
  to `'published'` — both are intentionally absent, not an oversight.

## Proposed scope — in

- **REQ-037 (proposed):** A landlord or assigned manager with an active
  listing-manager assignment for the property may create exactly one
  PublicListing per eligible Unit, supplying:
  - a free-text `summary` (marketing description), and
  - 1–10 externally hosted `https://` image URLs (no file upload; KEYFORTA
    stores only the URL strings, never the image bytes).
  The command creates the listing in `draft` status. Publishing continues to
  use the existing, **unchanged** `app.set_public_listing_publication`
  command and its existing PROP-012 eligibility guards (current pricing,
  available status, Unit/Property `publication_status = 'published'`,
  verification, active listing-manager assignment, ≥1 image URL).
- Amenities remain **excluded** — every listing's `amenities` stays `[]`;
  this proposal does not introduce an amenities catalogue.
- Each submitted image URL requires the landlord to affirmatively attest (a
  checkbox, exact wording open decision #3 below) that they own or hold
  rights to link the image, and that it does not depict any tenant,
  identifiable person, or their personal/accommodation data.

## Explicit exclusions (still deferred, unchanged from REQ-035)

- File upload or KEYFORTA-hosted media storage of any kind.
- Automated or human moderation/scanning of linked image content.
- Amenities catalogue.
- Anti-hotlink protection, derivative-image generation, or cache
  invalidation for third-party-hosted images.
- Any takedown workflow beyond withdrawing the entire listing.
- Any KEYFORTA claim or SLA about third-party image availability, rights, or
  content accuracy.

## Acceptance criteria (if approved)

- **AC1:** An actor without an active listing-manager assignment for the
  Unit's property cannot create a listing (403, matching the existing REQ-003
  v2 / PROP-010 authority model); the action is not shown in the UI either.
- **AC2:** Creating a listing for a Unit that already has a `public_listings`
  row is rejected with a clear "listing already exists" error (backed by the
  existing `unique (organization_id, unit_id)` constraint) — no silent
  overwrite.
- **AC3:** Submitting zero image URLs, more than 10, or any non-`https://`
  URL is rejected client- and server-side with no partial listing created.
- **AC4:** A newly created listing is `draft` and does not appear in any
  public projection until explicitly published via the existing, unchanged
  publish command.
- **AC5:** Publish still enforces the existing `imageUrls` non-empty check
  (`app.set_public_listing_publication`) and all other PROP-012 guards —
  this proposal supplies the data those guards already expect; it does not
  weaken or bypass any of them.
- **AC6:** Withdrawing/archiving the Unit or Property still cascades to
  withdraw its listing exactly as PROP-016 already specifies (unchanged).
- **AC7:** Cross-organization and unauthenticated attempts to create or read
  another organization's draft listing are denied per the existing
  authorization model (PROP-010).

## Risks and open decisions — need your explicit answer

1. **Liability/moderation:** we would display externally hosted images we
   never scan or moderate. Are you comfortable with that for this pilot
   scope, or do you want a minimum manual review step before first publish?
2. **Image cap:** proposing a maximum of 10 URLs per listing — acceptable, or
   a different number?
3. **Attestation wording:** what exact consent/rights checkbox text should
   accompany image-URL submission? I am not authorized to invent legal
   copy.
4. **Unit `publication_status`:** there is currently no command to set a
   Unit's `publication_status` to `'published'` (required by PROP-012 before
   a listing can publish). Should creating the listing also flip it
   automatically, or should that remain a distinct, explicit landlord action
   (and if so, what triggers/gates it)?
5. **Title vs. summary:** the DB snapshot's `projection.name` is
   auto-derived from the Property/Unit name (not landlord-authored). Is a
   single free-text `summary` field sufficient for v1, or do you also want a
   separate landlord-authored `title`?

## Approval

Implementation of any part of this proposal (contracts, migration, API,
portal UI) will not begin until the Product Owner replies confirming this
scope — or an amended version of it — in writing (e.g., a comment on this
file's PR, or a reply referencing this document).
