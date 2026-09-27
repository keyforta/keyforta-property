# PostgreSQL migrations

This directory is the canonical, executable database history for KEYFORTA.
See `docs/adr/ADR-013-operational-migration-lineage.md` for the authority
and consequences of that statement, and `infra/README.md` for how the
migration runner/job/roles fit into deployment.

## `0001_baseline.sql`

The current sole migration. It is a one-time, pre-launch consolidation of
the 36 migrations that previously made up this lineage (`0001_initial.sql`
through `0036_media_review_admin_rls_policies.sql`), squashed before any
environment held real tenant data (see ADR-013's 2026-09-27 amendment for
the full rationale, verification method, and consequences).

It contains, in one file:

- **2 roles**: `keyforta_runtime` (the API's own runtime principal) and
  `keyforta_media_review_admin` (the role RLS policies check membership
  against for cross-organization media review), plus a role-provisioning
  prelude that is idempotent and safe to re-run (see the file's own header
  comments for why each block is written the way it is).
- **2 extensions**: `pgcrypto` (UUID generation) and `btree_gist`
  (exclusion constraints used by availability/pricing versioning).
- **35 tables** under the `app` schema (organizations, users, memberships,
  properties/units, leases, payments/ledger, public listings and their
  media, tenant applications, landlord onboarding, jurisdiction policy,
  audit events, and related history/event tables).
- **~70 functions** under `app`, covering command/query RPCs (for example
  `create_rental_property`, `set_unit_pricing`, `list_public_listings_page`,
  `review_public_listing_media`), actor/authorization resolution (for
  example `resolve_actor`, `current_organization_id`,
  `actor_can_manage_property`), and immutability guards on financial and
  governance history (the `reject_*_mutation` trigger functions).
- Row-level security policies and grants scoping every table to the
  correct organization/actor, generated from the pre-squash lineage's
  final RLS state.

Because this is a schema-only `pg_dump` snapshot rather than a sequence of
incremental diffs, the file is dense (~5,000 lines) but is not larger than
the history it replaced (~8,400 lines across 36 files) -- it just contains
the whole schema's final definitions in one place instead of scattering
each object's evolution across many small patches.

## Adding a new migration

Per ADR-013, `0001_baseline.sql` must never be edited again once any
environment has recorded its checksum. All further schema changes are new,
additive, forward-only files named `0002_..._description.sql`,
`0003_..._description.sql`, and so on, each wrapped in the required
`begin; ... commit;` transaction envelope (`migrate.ts` enforces this) and
each proving clean installation, forward upgrade, rerun, RLS, and
cross-organization isolation before merging.
