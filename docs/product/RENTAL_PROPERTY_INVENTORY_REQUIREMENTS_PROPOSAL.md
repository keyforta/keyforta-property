# Rental Property and Unit Core Profile v1

**Status:** Approved by the Product Owner on 2026-09-17; implementation pending

**Approved requirement IDs:** REQ-032 through REQ-036

## 1. Product outcome

An authorized landlord or delegated manager can maintain complete, trustworthy
rental Property and Unit records for day-to-day operations without exposing
private operational data through the public catalogue. The records become the
authoritative source for rental inventory, pricing, availability, and approved
listing projections while preserving history and organization isolation.

This profile refines the approved PRD scope for organization-owned property,
unit, and controlled public-listing records. It does not authorize runtime,
schema, API, or interface implementation without a separately reviewed change.

## 2. Sources and invariants

This profile is bounded by:

- the rental-operations scope and exclusions in [PRD.md](PRD.md);
- the Property, Unit, and PricingVersion invariants in
  [keyforta-domain-contracts.md](../contracts/keyforta-domain-contracts.md);
- organization isolation in [ADR-002](../adr/ADR-002-organization-isolation.md);
- immutable migration history in
  [ADR-013](../adr/ADR-013-operational-migration-lineage.md);
- public projection isolation in
  [ADR-011](../adr/ADR-011-public-property-discovery-route.md); and
- existing acceptance identifiers `PROP-001` through `PROP-008` in
  [keyforta-acceptance-test-traceability.md](../contracts/keyforta-acceptance-test-traceability.md).

The following invariants are mandatory:

1. A Property belongs to exactly one organization. Every Unit belongs to one
   Property in that same organization.
2. Client-supplied organization, Property, Unit, actor, or assignment IDs never
   establish authority.
3. Money uses integer minor units and an explicit ISO 4217 currency. Binary
   floating point is prohibited. The current OpenAPI runtime wire contract
   remains authoritative for JSON `Money.amountMinor` representation; any
   lossless base-10 string encoding requires a separately approved versioned
   wire contract.
4. Pricing history is effective-dated and append-only. Later pricing never
   changes accepted or signed lease terms.
5. Occupied Units cannot be advertised as available.
6. Ordinary edits cannot publish, verify, archive, or change availability.
   Those changes use named commands with lifecycle guards.
7. Every mutation checks the expected aggregate version and records actor,
   organization, command, target, correlation ID, source, outcome, and time.
8. Public output is a separate allowlisted projection. Authentication never
   widens an anonymous response.
9. Archive preserves lease, occupancy, pricing, publication, assignment, and
   audit history.

## 3. Users and authority

| User | Required outcome | Authority boundary |
| --- | --- | --- |
| Landlord | Maintain organization Property and Unit records and review their history | Active same-organization landlord membership; listing control still requires the active listing-manager assignment |
| Assigned manager | Maintain delegated Property and Unit records and their listings | Active membership and effective assignment to the Property; revocation removes access immediately |
| Tenant | See only tenancy-specific information provided by an approved tenant contract | No portfolio or inventory editing authority |
| Platform administrator | Perform separately approved verification decisions | No default customer-inventory browsing or editing authority |
| Public visitor | Search and inspect eligible rentals | Approved public projection only; no organization-private fields |

Visibility classes used below are authorization requirements:

| Class | Landlord | Assigned manager | Tenant | Verifier | Support | Public |
| --- | --- | --- | --- | --- | --- | --- |
| Public | Yes | Yes | Only through the same public projection | Only through the same public projection | Only through the same public projection | Yes |
| Operational | Same-organization records | Effective assigned scope only | No | Only a reason-coded, target-scoped, expiring verification work item | Only approved, reason-coded, target-scoped, expiring support access | No |
| Restricted | Same-organization records when required for the command | Effective assigned scope when required for the command | No | Only fields explicitly required by the verification work item | Only fields explicitly approved in the support grant | No |
| Security audit | No direct access; customer-safe business-history projection only | No direct access; customer-safe business-history projection only | No | No | Approved security/platform personnel only | No |

Every authenticated data path must test active authority, effective time,
resource relationship, organization context, revocation, and nondisclosing
denial. Platform role names alone never grant customer-record access.

A verifier or support grant is issued only by the separately authorized
platform workflow. It records subject, target, field scope, reason, independent
approver, start, expiry, revocation, and correlation ID; self-approval is
prohibited. The customer-visible access history shows grant purpose, scope,
approver role, access times, and revocation without exposing security metadata.
Every attempted use is audited, and expiry or revocation denies the next access.

## 4. Approved requirements

### REQ-032: Rental Property record

An authorized landlord can create and maintain a private, organization-scoped
Property record. Creation atomically includes the first valid Unit so the
normative one-or-more-Units invariant always holds. An assigned manager can
maintain only Properties within their effective delegated scope.

#### Property field profile

| Field | Required | Validation and ownership | Visibility |
| --- | --- | --- | --- |
| `id` | Server generated | UUID; immutable | Operational |
| `organizationId` | Trusted context | Immutable; never accepted as authority from the body | Restricted |
| `name` | Yes | Trimmed, 1-160 characters | Public only through an approved listing snapshot |
| `propertyType` | Yes | Controlled v1 vocabulary: `apartment_building`, `single_family`, `townhouse`, `mixed_use`, `other` | Operational; public only when approved |
| `address` | Yes | Structured fields defined below | Restricted except approved approximate location |
| `timeZone` | Yes | Valid IANA time-zone identifier | Operational |
| `jurisdictionCode` | Required for verification | Nullable while private draft; selected from an approved policy catalogue; no legal default may be inferred | Restricted |
| `verificationStatus` | Server managed | Named verification commands only | Operational; public claim only after approval |
| `publicationStatus` | Server managed | `draft`, `pending_review`, `published`, `paused`, or `archived`; named inventory-eligibility commands only | Operational |
| `version` | Server managed | Positive integer; incremented by every mutation | Operational |
| `createdAt`, `updatedAt` | Server managed | UTC instants | Operational |
| `archivedAt`, `archivedBy`, `archiveReason` | Conditional | Required together after archive; archive is not deletion | Restricted |

The structured address contains required `avenueOrStreet`, `number`, `quartier`,
`commune`, `city`, `province`, and `countryCode`; `postalCode` is optional because
the approved application contract already permits it to be absent. Each textual
component is trimmed and bounded to 160 characters. `countryCode` is an ISO 3166-1
alpha-2 code. New commands do not create a duplicate raw-address field. A legacy
free-text address retained during migration is Restricted exact-location data;
it is excluded from ordinary reads, search, logs, and public projections and is
kept only until an approved retention rule permits removal.

Coordinates, geocoding, building/floor hierarchy, and multilingual Property
descriptions are excluded from v1 until their provider, precision, provenance,
cost, and privacy rules are approved.

### REQ-033: Rentable Unit record

An active landlord or effectively assigned manager can create and maintain Units
beneath an authorized Property. A Unit label is unique for the lifetime of its
Property after Unicode normalization, trimming, and case folding; archive does
not permit label reuse. Normalization uses Unicode NFC, trims Unicode White_Space
at both ends, and applies locale-independent Unicode default case folding. The
implementation pins and documents one Unicode data version and stores the
canonical key used by the database uniqueness constraint. Length limits count
Unicode code points after normalization.

#### Unit field profile

| Field | Required | Validation and ownership | Visibility |
| --- | --- | --- | --- |
| `id` | Server generated | UUID; immutable | Operational |
| `organizationId` | Trusted context | Must match Property organization | Restricted |
| `propertyId` | Yes | Same-organization Property; immutable after creation | Operational |
| `label` | Yes | Normalized 1-80 code points; lifetime uniqueness within Property | Public only through an approved listing snapshot |
| `unitType` | Yes | Controlled v1 vocabulary: `studio`, `apartment`, `house`, `townhouse`, `commercial`, `other` | Operational; public only when approved |
| `bedrooms` | Yes | Integer, 0-20 | Operational; public only when approved |
| `bathrooms` | Yes | Integer, 1-20 | Operational; public only when approved |
| `areaSquareMeters` | Optional | Integer, 1-100000 | Operational; public only when approved |
| `floorLabel` | Optional | Trimmed, 1-40 characters; descriptive, not a separate aggregate | Operational; public only when approved |
| `furnishingStatus` | Yes | `unfurnished`, `part_furnished`, or `furnished` | Operational; public only when approved |
| `availabilityStatus` | Server managed | `unavailable`, `available`, or `occupied`; named commands only | Operational; public projection exposes eligibility, not private reason |
| `publicationStatus` | Server managed | `draft`, `pending_review`, `published`, `paused`, or `archived`; named inventory-eligibility commands only | Operational |
| `version` | Server managed | Positive integer; incremented by every mutation | Operational |
| `createdAt`, `updatedAt` | Server managed | UTC instants | Operational |
| `archivedAt`, `archivedBy`, `archiveReason` | Conditional | Required together after archive | Restricted |

`bedrooms = 0` is valid for a studio. A maintenance condition is represented by
`unavailable` plus a Restricted reason; it is not a fifth public state.
Accessibility accommodations associated
with a person, access instructions, alarm details, keys, meter identifiers, and
occupant information are not Unit-profile fields.

### REQ-034: Pricing and availability history

Unit asking rent is a preserved sequence of effective-dated PricingVersions.
Each version contains `id`, `organizationId`, `unitId`, `amountMinor`, `currency`,
`billingPeriod`, `effectiveFrom`, optional `effectiveTo`, `createdBy`,
`correlationId`, `source`, and `createdAt`.

- `amountMinor` is a positive 64-bit integer.
- `currency` is an approved uppercase ISO 4217 code.
- v1 `billingPeriod` is `month`.
- Intervals are half-open UTC instants, `[effectiveFrom, effectiveTo)`, and
   `effectiveTo` must be later than `effectiveFrom`.
- Pricing intervals for one Unit cannot overlap; gaps and future versions are
   allowed, and at most one interval contains a given instant.
- Setting a new price atomically sets `effectiveTo` once on the prior open
   version and inserts the new version. Amount, currency, billing period,
   `effectiveFrom`, provenance, and closed `effectiveTo` values are immutable.
- The current asking rent is the version whose interval contains the current
   instant in the Property time zone converted to UTC. Public publication copies
   that exact version into the listing snapshot.
- A public listing uses an approved pricing snapshot. A later private price
  change does not silently alter a published listing or a lease.

For REQ-034 only, this approved profile supersedes the pre-existing target
model and API/event example fields as follows: `unit_pricing_versions.amount_minor`
must be positive, not merely non-negative; `effective_from` and `effective_to`
represent UTC instants rather than calendar dates; and operational PricingVersion
wire/event fields `effectiveFrom` and `effectiveTo` represent the same UTC
instants. The anonymous public `availableFrom` field remains an ISO calendar
date as defined below.

Unit availability intervals use the same half-open interval and one-time closure
rules, never overlap each other, and retain status, reason code, source, actor,
and correlation ID. Lease and occupancy periods are separate authoritative
records and may overlap a previously recorded Unit-availability interval; the
derived current status is `occupied` whenever an occupancy applies, otherwise
the Unit interval applies. Manual commands cannot override occupancy. Automated
or manual reservations are out of scope. Existing persisted `reserved` values
are `legacy_incomplete` and require explicit evidence-backed repair to
`available` or `unavailable`; no inference is allowed.

The public `availableFrom` remains an ISO calendar date. If currently available,
it is today's date in the Property time zone. If temporarily unavailable, it is
the Property-local date containing the first future availability instant. If no
future availability is known, the Unit is ineligible for the current public
contract because that contract requires the date.

Deposits, guarantees, advances, utilities, fees, concessions, and taxes remain
separate lease or charge terms. They are not folded into asking rent.

### REQ-035: PublicListing authority and public visibility

PublicListing is a separately versioned aggregate and the sole authority for
marketing copy, approved public field snapshots, media order, and listing
publication status. Property and Unit `publicationStatus` express inventory
eligibility, not public visibility. Property, Unit, PricingVersion, and
availability remain the authoritative operational facts. `PublishUnitListing`
atomically checks the active listing-manager assignment and all eligibility
guards, creates a versioned snapshot from specifically selected source versions,
changes PublicListing status, and appends publication evidence. A failure commits
none of those effects. Ordinary Property or Unit edits never silently modify a
published snapshot.

Amenities and new media records are deferred from the core v1 implementation.
They require separately approved catalogues and media storage, scanning,
moderation, rights, EXIF/location stripping, derivative isolation, cache
invalidation, takedown, retention, anti-hotlink, cost, and abuse controls.
Person-associated disability or accommodation data is never an amenity.

PublicListing rows already in `published` state at the core-v1 migration baseline
and their current image URLs are grandfathered as read-only compatibility data
and remain publicly readable until withdrawn or otherwise ineligible. Their
image URLs cannot be changed or copied into authoritative media records.
Withdrawal remains available and removes public eligibility immediately. Draft,
reserved, rented, or withdrawn baseline listings cannot publish or republish,
and new PublicListing creation remains disabled, until the source profiles are
complete and the media activation requirement is approved and implemented.

The existing anonymous public-list and detail contracts remain byte-shape
compatible. The mapping is listing `slug` to `id`, listing `title` to `name`,
listing `summary` to `summary`, `district` to both the legacy `address` and
`district` fields, plus `city`, integer `bedrooms`, integer `bathrooms`, optional
integer `areaSquareMeters`, decimal-string `monthlyRentMinor`, `currency`,
`availableFrom`, existing amenity labels, `imageUrls`, and first `imageUrl`.
No private field is rounded, truncated, or substituted to satisfy that mapping;
incompatible inventory is simply ineligible for publication.

Public output never contains exact address components, organization ID,
internal Property or Unit ID, actor or manager identity, occupants, applications,
leases, balances, payments, access instructions, storage keys, provenance,
private media, moderation data, or audit records.

### REQ-036: Versioning, archive, and provenance

Property and Unit updates require the caller's expected version. A stale version
returns a conflict without partial mutation or silent overwrite.

Every accepted mutation stores immutable provenance sufficient to reconstruct
who changed which aggregate, through which named command, from which source,
under which organization and correlation ID, and at what version and time.
Sensitive field values are not copied into general audit payloads.

Landlords and assigned managers receive a customer-safe business-history
projection containing authorized state transitions and display-safe actor,
reason, and time information. They never receive direct access to general
security audit events, internal support/security metadata, raw tokens, request
headers, or restricted field values.

`ArchiveUnit` is an approved explicit command. It rejects the last
active Unit in a non-archived Property and any Unit with an offered, accepted,
signed, or active lease or a current occupancy. Otherwise it withdraws the
listing, closes future availability, and archives the Unit atomically.
`ArchiveProperty` applies the same lease/occupancy guards to every Unit;
otherwise it withdraws all listings and archives the Property and all Units in
one transaction. Archive requires a reason, removes records from active queries,
preserves all historical references, and emits events for every affected
aggregate. Archived records are terminal in v1: update, add-Unit, pricing,
availability, verification, and publication commands are rejected. Restore is
excluded.

## 5. Interaction requirements

The authenticated workspace groups editing into Property overview, Units,
Pricing, Public listing, and History. Saving private data never publishes it.
Publication uses a separate review and command flow.

The experience must provide observable loading, empty, validation, saved,
retryable-error, denied, stale-version conflict, archived, and offline states.
Validation retains entered values, identifies each invalid field, and moves
focus to the first invalid field. A conflict prevents overwrite and offers a
refresh/review path.

At 320, 768, and 1280 CSS pixels and at 200% zoom, all fields and authorized
commands remain reachable without overlap or clipped text. The target is WCAG
2.2 AA. Status is never communicated through color alone. Controls are keyboard
operable, focus is visible and restored to the invoking control after dialogs,
validation focuses the first invalid field, route changes focus the page heading,
and loading, save, error, conflict, and publication results are announced through
the appropriate live region. Evidence includes keyboard-only review and VoiceOver
with Safari in addition to automated browser assertions; selecting additional
accessibility tooling remains governed by its existing requirements gap.

V1 does not authorize autosave, offline mutation queues, or automatic conflict
merging. Offline mode may show already loaded data but must not report an
uncommitted mutation as successful.

## 6. Acceptance criteria

These approved identifiers extend `PROP-001` through `PROP-008` without
renumbering existing evidence.

| ID | Observable acceptance criterion | Required evidence |
| --- | --- | --- |
| PROP-009 | An active landlord atomically creates a private Property and its first valid Unit; organization, versions, actor, correlation, and audit data are server-derived and neither record is public | Contract, API, database, and audit tests |
| PROP-010 | For Property, Unit, pricing, availability, listing, archive, and business-history paths, same-organization authorized access succeeds while absent context, inactive or revoked authority, guessed or cross-organization IDs, tenants, and unscoped platform/support actors receive the approved nondisclosing denial; scoped verifier/support grants prove independent approval, field minimization, customer visibility, expiry, revocation, and audited use | Authorization, API, RLS, grant-lifecycle, and time-controlled tests |
| PROP-011 | A Unit requires a same-organization Property; a duplicate Unicode-normalized, trimmed, case-folded label within that Property is rejected for active and archived history while the same label in another Property is allowed | Domain, database, and Unicode-boundary tests |
| PROP-012 | Publication eligibility evaluates true only when the Property is `complete`, verification is persisted as `verified`, inventory publication is `published`, and it is not archived; the Unit is `complete`, inventory publication is `published`, derived availability is `available`, and it is not archived; a current PricingVersion and approved media exist; and the actor is the active listing manager. Before media activation, publish and republish commands fail regardless of eligibility and leave state and snapshot unchanged | State-machine, authorization, transaction, and public-projection tests |
| PROP-013 | A pricing change closes the prior open `[from,to)` interval once, inserts a non-overlapping integer-minor-unit version, deterministically resolves current and future prices, and leaves prior amounts, published snapshots, and signed lease terms unchanged | Domain, boundary, database, and compatibility tests |
| PROP-014 | An expected-version mismatch loses without overwrite. Within one actor, operation, and request scope, replay of the same idempotency key and payload returns the original result, while reuse with a different payload returns conflict; concurrent losers create no business mutation or success event | API, concurrency, idempotency, outbox, and audit tests |
| PROP-015 | Anonymous list/detail responses contain only the approved projection, regardless of authentication or gateway over-return, and never expose restricted fields | Contract, API, privacy, and browser tests |
| PROP-016 | Unit archive rejects the last active Unit, guarded lease/occupancy states, and every post-archive command. Eligible Unit archive withdraws its listing; eligible Property archive withdraws all listings and archives all Units atomically while preserving historical references | Domain, transition-table, transaction, API, and history tests |
| PROP-017 | From schema 0021, additive upgrade leaves legacy profiles explicitly incomplete and existing public snapshots unchanged; no ambiguous listing value is copied into operational truth; failed migration leaves no ledger or partial DDL; the immediately preceding production-approved application image remains compatible for one deployment rollback window; database correction is forward-only | Migration, N-1 application-rollback, forward-correction, and contract tests |
| PROP-018 | At 320, 768, and 1280 CSS pixels and 200% zoom, the editor exposes loading, empty, validation, retryable error, denied, conflict, saved, archived, and offline states without overlap; keyboard and VoiceOver/Safari evidence verifies focus and announcements | Component, accessibility, and browser tests plus manual evidence |
| PROP-019 | Before media activation, schema upgrade preserves already-published baseline listing read and withdraw behavior through a pre-upgrade published-listing compatibility predicate that still matches when legacy Property and Unit operational fields default to `draft` and `unavailable`, without copying ambiguous listing values into Property or Unit operational truth and with unchanged image URLs; baseline `draft`, `reserved`, `rented`, and `withdrawn` publication or republication, image mutation, and new PublicListing creation are rejected | Contract, API, database migration, N-1 compatibility, and browser regression tests proving a schema-0017 published listing remains list/detail readable and withdrawable after upgrade |
| PROP-020 | Every required field rejects missing, null, whitespace-only, unknown-enum, and above-maximum input; numeric fields accept exact lower/upper bounds and reject values outside them; unknown object fields are rejected | Contract boundary and property-based tests |
| PROP-021 | Unit-availability intervals reject overlap and invalid boundaries; occupancy overrides Unit availability without rewriting it; legacy `reserved` requires explicit repair; `availableFrom` maps to the Property-local date for current/future availability and unknown future availability is ineligible | Domain, database, clock/time-zone, migration, and concurrency tests |
| PROP-022 | Public list, detail, inquiry, cache, export, logs, and telemetry never expose exact address, legacy raw address, internal IDs, occupancy reasons, or security/audit content; customer-safe history exposes only approved display actor/role, purpose, state, reason, and time | API, privacy, logging, export, and browser tests |
| PROP-023 | Public catalogue preserves the existing `limit` range of 1-100, omitted-value default of 20, and response field allowlist. Before external beta, a separately approved abuse-control policy defines distributed enforcement and failure behavior, trusted source derivation and forwarded-header handling, key rotation and retention, privacy boundaries across application and platform telemetry, request-counting and `Retry-After` semantics, enumeration signals, operational ownership, response runbook, rollout stop conditions, and a reversible disable path | Contract compatibility tests plus approved policy, privacy review, load evidence, multi-replica tests, and operational exercise before external beta |

### Requirement-to-acceptance crosswalk

| Requirement | Acceptance IDs |
| --- | --- |
| REQ-032 | PROP-009, PROP-010, PROP-012, PROP-016, PROP-017, PROP-018, PROP-020, PROP-022 |
| REQ-033 | PROP-009, PROP-010, PROP-011, PROP-012, PROP-016, PROP-018, PROP-020, PROP-021 |
| REQ-034 | PROP-010, PROP-012, PROP-013, PROP-014, PROP-017, PROP-018, PROP-020, PROP-021 |
| REQ-035 | PROP-010, PROP-012, PROP-015, PROP-018, PROP-019, PROP-022, PROP-023 |
| REQ-036 | PROP-009, PROP-010, PROP-014, PROP-016, PROP-017, PROP-018, PROP-022 |

## 7. Explicit exclusions

V1 excludes property sales, valuation, mortgages, MLS or channel syndication,
neighborhood datasets, investment analytics, autonomous pricing, automated
reservations, public rental applications, ownership adjudication, native mobile
applications, a persisted Portfolio aggregate, geocoding, utility meters,
building/floor aggregates, and destructive deletion of inventory history.

## 8. Dependencies and rollout constraints

- Implementation requires a versioned shared contract, named API commands,
  authorization matrices, forward-only PostgreSQL migrations, composite
  organization foreign keys, forced RLS, immutable audit/outbox evidence, and
  public-contract compatibility tests.
- Existing `public_listings` data remains a compatibility projection during
  migration. No implementation may silently treat conflicting listing values as
  authoritative Property, Unit, pricing, or address facts.
- The migration records pre-upgrade PublicListing rows with `status = published`
  and non-null `published_at` as the only grandfathered public-read set.
  Grandfathering preserves list/detail and authorized withdraw behavior without
  mutating image URLs or deriving Property/Unit `publicationStatus`,
  `verificationStatus`, or availability from snapshot data. Regression evidence
  must seed a published baseline row that would otherwise become ineligible
  under the new `published`/`available` predicate and prove it remains readable
  and withdrawable after the upgrade; non-published baseline rows remain
  ineligible.
- Schema 0021 is the supported expansion baseline. New typed columns are first
  nullable for existing rows, while new create commands enforce the complete
   profile. Existing rows receive an explicit `legacy_incomplete` repair status
   and remain visible in authorized operational reads; existing published listing
   snapshots remain unchanged. They cannot be newly verified, republished, or
   materially edited until an authorized completion command supplies every
   required field.
- Property and Unit each store server-managed `profileStatus` as
   `legacy_incomplete` or `complete`. `CompleteLegacyPropertyProfile` and
   `CompleteLegacyUnitProfile` require expected version and every missing field;
   each command is atomic for one aggregate. If a legacy Property has no Unit,
   completing it atomically creates its first Unit. Completion cannot change
   lifecycle, verification, listing, pricing, or public state.
- Backfill copies only deterministic values from the owning operational row.
   Listing snapshots never win conflicts and remain public compatibility data.
   The migration emits a bounded repair report containing record IDs and missing
   field codes, never sensitive values. It must not infer address components,
   type, accessibility, amenity, ownership, jurisdiction, or verification claims.
- Required-column constraints are validated only after no `legacy_incomplete`
   rows remain. Every migration is atomic and checksummed. Application rollback
   means deploying the previous compatible image; database rollback means a later
   reviewed forward correction, never reversing an applied migration.
- Media activation requires separately approved storage, malware scanning,
   moderation, rights, private-origin authorization, EXIF/location stripping,
   derivative isolation, delivery, cache invalidation, takedown, anti-hotlink,
   enumeration monitoring, retention, cost, quota, and rate-limit decisions.
- External beta requires an approved public-catalogue abuse-control policy. It
   must preserve the existing `limit` range of 1-100; define measurable burst,
   sustained-rate, and enumeration thresholds; enforce them consistently across
   the deployed replica topology; document privacy-safe source derivation and
   telemetry retention; avoid raw source addresses and high-cardinality metric
   labels; assign an operational owner and runbook; and provide load evidence,
   rollout stop conditions, and a reversible disable path. The current
   per-replica limiter is not evidence of distributed enforcement.
- Property, Unit, legacy raw-address, PricingVersion, availability, business
   history, and future amenity/media records are distinct retention classes.
   Legal holds and immutable financial/lease evidence take precedence. Until
   record-specific periods are approved, no automated deletion or anonymization
   is implemented; ordinary APIs cannot delete history, and the unresolved
   retention gap remains release-visible.
- Before each production schema migration, the migration owner records affected
   row counts, lock and statement timeouts, acceptable latency, abort criteria,
   the verification query, and the reviewed forward-correction path. A migration
   that exceeds an approved threshold aborts without a partial ledger entry.

## 9. Product Owner decision

Product Owner approval on 2026-09-17 confirms:

1. REQ-032 through REQ-036 and PROP-009 through PROP-023 are the v1 requirement
   and acceptance boundary.
2. The Property and Unit field profiles, controlled vocabularies, requiredness,
   validation limits, and visibility classes above are approved.
3. Property creation atomically includes the first valid Unit, preserving the
   normative one-or-more-Units invariant.
4. Unit availability has three v1 states; reservations are out of scope, legacy
   `reserved` values require explicit repair, and occupancy remains authoritative.
5. Existing anonymous public contracts remain stable and use a separately
   approved listing snapshot rather than exposing operational records.
6. Amenities and new media are deferred from core v1. Existing public image URLs
   are grandfathered read-only compatibility data; new publication remains
   disabled until the named media security, privacy, legal, and cost decisions
   are approved and implemented.
7. Verification vocabulary remains governed by its existing requirements gap
   for workflow commands, while the existing persisted `verified` value is the
   only verification state eligible for publication in this profile.
8. `ArchiveUnit`, PublicListing aggregate authority, interval semantics,
   transitional `legacy_incomplete` handling, and customer-safe business history
   amend or clarify the normative domain contract as reflected in the
   authoritative contracts updated with this approval record.

This approval defines product requirements; it does not claim implementation or
supersede the OpenAPI runtime contract or executable schema. Delivery requires
separately reviewed contract, migration, API, interface, and verification work.