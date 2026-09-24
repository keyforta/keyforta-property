# REQ-038: Landlord-uploaded, KEYFORTA-hosted listing media

**Status: APPROVED by the Product Owner (2026-09-22, re-confirmed
2026-09-22).** This document supersedes REQ-037's "no file upload / no
KEYFORTA-hosted media storage" exclusion for listing images. REQ-037's other
rules (manual review gate, attestation requirement, 1–10 image cap,
`mediaReviewStatus` transitions, amenities exclusion) remain in force
unchanged except where explicitly amended below. Implementation may proceed,
following the AGENTS.md engineering loop (before → red → after → green
evidence) per change.

## Why this requirement exists

A user asked whether listing images could be uploaded through the UI instead
of pasted in as externally hosted URLs. REQ-037
(`docs/product/REQ-037-media-activation-and-public-listing-creation.md`),
previously approved by the Product Owner, had required the opposite:
listings used 1–10 externally hosted `https://` image URLs, and explicitly
excluded "File upload or KEYFORTA-hosted media storage of any kind" and
"Automated image-content scanning." This document reverses that specific
exclusion with explicit Product Owner sign-off; it does not silently
reinterpret or unilaterally rewrite REQ-037 — the reversal and every open
decision it required are recorded above.

## User outcome

As a landlord or assigned manager who has already set a Unit's pricing and
availability, I want to upload image files for my listing directly through
the portal, so that I don't need to host images myself on a third-party URL
before I can publish a listing.

## Sources consulted

- `docs/product/REQ-037-media-activation-and-public-listing-creation.md` —
  current approved requirement and its explicit upload exclusion.
- `docs/adr/ADR-010-production-persistence-boundary.md` — private Azure Blob
  Storage (or an approved equivalent) is already the accepted store for
  "document, photo, identity-evidence, and export bytes"; PostgreSQL stores
  only metadata, hashes, versions, retention, and access state. REQ-038 uses
  that existing accepted persistence boundary, not a new one.
- `docs/adr/ADR-009-open-architecture-decisions.md` — "Object storage and
  malware scanning" is listed as a decision required "before Document
  uploads"; it is unclear whether that resolved decision already covers
  listing-photo uploads or whether a distinct malware-scanning/media-pipeline
  decision is needed for this new binary type.
- `infra/README.md` (`Evidence` row, `Data Storage and External Services`
  section) — describes the existing scan-gated Blob adapter built for tenant
  application evidence documents specifically, not listing media.
- `apps/portal-web/src/property-management-panel.jsx` — current
  implementation: `imageUrls` is a free-text, newline-separated URL list
  (`parseImageUrls`), validated only for a non-empty count client-side.

## Product Owner decisions (locked in, 2026-09-22)

1. **Reversal authorization:** Approved. Upload **replaces** URL entry —
   the original request was to implement upload "instead" of the URL field,
   so the Property Management panel's listing image field becomes a file
   upload; the free-text `imageUrls` textarea is removed for new/edited
   listings.
2. **Storage/cost — RE-CONFIRMED (2026-09-22):** REQ-037's assumption that a
   Blob Storage pipeline already existed was wrong (see the discovery note
   below). Decision: use an **interim storage path** — image bytes stored in
   PostgreSQL (as `bytea` plus metadata), explicitly marked as a temporary
   MVP shortcut, behind a storage-gateway interface. Provisioning real Azure
   Blob Storage is deferred to a separate, focused infrastructure project
   (its own ADR + SRE review) so it can later replace the interim backend
   without changing the API contract, domain rules, or UI. No new paid
   service is introduced by this decision.

   *Discovery note:* on starting delegation, `infra/bicep/` was found to
   provision no Storage Account, `apps/api` has no Blob client/gateway, and
   no Document-upload route exists anywhere in this repository — ADR-010/
   `infra/README.md` describe Blob Storage only as an *intended*
   architecture that was never built.
3. **Malware scanning ownership — RE-CONFIRMED (2026-09-22):** since real
   Blob+Defender infrastructure does not exist and is deferred (decision 2),
   scanning is implemented as a **pluggable scanner interface** with a
   no-op stub implementation for now, in every environment (dev/test/CI/
   pilot). When real Blob+Defender infrastructure is later approved and
   built, a real scanner implementation can be swapped in behind the same
   interface without redesigning the upload flow or its tests. No image is
   currently blocked by a scan result; this must be revisited before this
   feature is considered security-complete for a wider production launch.
4. **Retention/deletion:** Listing images follow the same soft-delete
   behavior as other interim-stored records (replaced images are retained
   for recovery, not hard-deleted, until purge). Final record-class-specific
   retention/deletion periods remain governed by the separate, still-open
   "Record-specific retention periods" gap in
   `docs/engineering/REQUIREMENTS_GAPS.md` — this decision does not resolve
   that broader gap.
5. **Size/type/count limits:** JPEG and PNG only, 10 MB max per file, and
   the existing REQ-037 cap of 1–10 images per listing is unchanged.
6. **Public exposure boundary:** Approved. Once a listing publishes
   (`mediaReviewStatus = 'approved'` and all existing PROP-026 publish
   guards pass), its images are servable to any public-site visitor through
   a scan-gated, non-guessable API-served path — never a raw/public Blob
   container URL and never before publish.
7. **Attestation legal wording:** Approved to ship as first-draft copy (the
   adapted wording in "Scope — in" below), flagged the same way REQ-037's
   wording was — final legal polish may follow as a non-blocking copy
   change.
8. **Room category list and grouping behavior:** Approved. The closed list
   is `Exterior`, `Living`, `Kitchen`, `Bathroom`, `Bedroom`, `Dining`,
   `Other` (not extensible per-organization for v1). Multiple images may
   share the same room tag. The public listing page groups/filters
   thumbnails by room tab, matching the Redfin reference screenshot
   (an "All photos" view plus one tab per room category that has at least
   one image).

## Scope — in

- Add a file-upload control to the Property Management panel's listing
  create/edit form, **replacing** the URL textarea (decision 1).
- **Room categorization is required per image:** every uploaded image must
  be tagged with one room from the approved closed list — `Exterior`,
  `Living`, `Kitchen`, `Bathroom`, `Bedroom`, `Dining`, `Other` — before the
  upload is accepted. An image submitted without a room tag is rejected
  client- and server-side, consistent with REQ-037's existing "no partial
  listing created" rule for invalid submissions. Multiple images may share
  a tag. The public listing page groups/filters thumbnails by room tab
  (decision 8).
- Store uploaded image bytes and metadata in PostgreSQL behind a storage-
  gateway interface (interim backend per decision 2), designed so a future
  real Blob Storage backend can be swapped in without changing the API
  contract, domain rules, or UI.
- The API stores/serves images only through its own scan-gated,
  access-controlled endpoint — never a raw, directly link-shareable storage
  URL — consistent with decision 6's public-exposure boundary.
- Malware/content scanning on upload via a pluggable scanner interface,
  currently a no-op stub in every environment pending real Blob+Defender
  infrastructure (decision 3).
- Same landlord-authorship attestation requirement as REQ-037, adapted for
  uploaded content ("I confirm I own or hold the rights to display each
  uploaded image, and that no tenant or other identifiable person appears in
  any image without consent") (decision 7).
- Same manual platform-administrator review gate before publish
  (`mediaReviewStatus`), unchanged from REQ-037.
- JPEG/PNG only, 10 MB max per file, 1–10 images per listing (decision 5).

## Explicit exclusions (unchanged unless the Product Owner revisits them)

- Automated image-content moderation beyond malware/type/size scanning —
  review remains human judgment only, per REQ-037.
- Amenities catalogue — unaffected, still excluded.
- Any change to the manual review gate, attestation requirement, or
  publication authorization rules already established by REQ-037/PROP-024
  through PROP-026.
- Final record-class-specific retention/deletion periods (governed by the
  separate, still-open "Record-specific retention periods" gap).
- Per-organization custom room categories — the closed list above is fixed
  for v1.

## Acceptance criteria

- **PROP-027:** An actor without an active listing-manager assignment for
  the Unit's property cannot upload, replace, or delete media for another
  organization's listing (403/404, nondisclosing-denial model per
  PROP-010/PROP-024).
- **PROP-028:** An upload is rejected — with no partial listing state
  change and no stored bytes — if it fails malware scanning, exceeds the
  10 MB size limit, is not JPEG/PNG, lacks a room-tag selection, or would
  exceed the 10-image cap; the attestation checkbox must be affirmatively
  checked before any upload is accepted.
- **PROP-029:** Publish remains rejected unless `mediaReviewStatus =
  'approved'`, exactly as PROP-026 already requires; uploading or replacing
  an image on a `draft` listing resets it to `'pending'` re-review.
- **PROP-030:** Each stored image record carries exactly one room tag from
  the approved category list; editing an image's room tag after upload
  resets `mediaReviewStatus` to `'pending'`, same as replacing the image.
- **PROP-031:** The public listing projection groups a published listing's
  images by room tab (plus an "All photos" view); a room tab with zero
  images for that listing is not shown.

## UX reference

The user shared a Redfin listing gallery screenshot as the reference for
this experience: an "All photos" grid plus per-room category tabs (Kitchen,
Bathroom, Bedroom, Living, Dining), each thumbnail opening a larger view.
The `design-experience` skill should use this screenshot as its reference
when designing the upload flow and public gallery.

## Risks to monitor during implementation

- **No real malware scanning is active in this interim implementation** —
  the scanner interface is a no-op stub. This must be revisited (real
  Blob+Defender integration) before this feature is considered
  security-complete for a wider production launch beyond the pilot.
- Image bytes stored in PostgreSQL will grow database size faster than a
  dedicated object store would; monitor `bytea` column/table growth and
  plan the Blob-storage migration project before it becomes a cost/
  performance concern.
- Final record-class-specific retention/deletion periods remain governed by
  the separate, still-open "Record-specific retention periods" gap.
- Serving landlord-uploaded images publicly is a materially different
  exposure profile from authenticated tenant-evidence documents;
  implementation must confirm the scan-gated public-serving path
  (decision 6) before any image is reachable pre-review or pre-publish.

## Traceability

| Requirement | Acceptance criteria | Verification method |
| --- | --- | --- |
| REQ-038 | PROP-027, PROP-028, PROP-029, PROP-030, PROP-031 | Domain, database, authorization, cross-organization isolation, malware-scan, and API contract tests |

## Next step

Implemented. Storage/scanning were re-confirmed (2026-09-22) and
implementation followed the AGENTS.md engineering loop across migrations
0032 (upload storage, public serving, room categorization) and 0033
(platform-admin review-content visibility for pending uploads, fixing a
gap where reviewers had no way to see uploaded images before approving or
rejecting them). Any further scanning/storage follow-up (swapping the
no-op malware-scanner stub and PostgreSQL bytea storage for real Azure
Blob Storage + Defender scanning) remains tracked as a separate,
non-blocking infrastructure project per the risk noted above.
