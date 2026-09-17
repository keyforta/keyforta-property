# Product Implementation Plan

KEYFORTA is delivered through thin, testable vertical slices. Each change must
update requirements, implementation, automated evidence, and operating guidance
together.

This document owns sequencing and exit evidence, not current delivery status.
Use [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) for the single
source-backed status summary.

## Collaboration loop

1. Confirm the business decision and acceptance examples.
2. Implement one coherent outcome on a feature branch.
3. Run `pnpm check` and complete a manual product walkthrough.
4. Review the pull request with the product owner.
5. Merge only after the business behavior is accepted.

## Delivery sequence

### Foundation — Party, relationship, and jurisdiction policy

- Evolve the operational PostgreSQL migration lineage forward without replacing
  or rewriting migrations already recorded in the deployment ledger.
- Add parties and profiles without inferring identity, role, consent, or legal
  facts that are absent from existing records.
- Add immutable, versioned jurisdiction policies, owner/counsel approval
  evidence, and effective activations.
- Resolve policy by jurisdiction and capability with deny-by-default behavior
  when evidence is missing, revoked, expired, or mismatched.
- Keep public discovery and synthetic draft workflows compatible.

**Requirements:** Legal register LEG-001 through LEG-020, PRD security and legal
release boundaries, and the Governance & Audit context.

**Exit evidence:** clean install and forward upgrade pass; prior migration
checksums remain unchanged; counsel-required activation fails without both
owner and counsel evidence; cross-organization access is denied; existing public
discovery tests remain green.

### Current release — Public rental discovery

- Deliver a French-first rental-search homepage and controlled public
  catalogue.
- Publish only approved listing fields; keep organization, unit, exact address,
  tenant, lease, and payment data private.
- Accept visit inquiries without creating an application or reservation.
- Provide synthetic listings only in non-production when PostgreSQL is absent.

**Requirements:** REQ-001, REQ-002, REQ-003, REQ-024, REQ-025, REQ-026, and
REQ-027.

**Release evidence:** public API acceptance tests, PostgreSQL isolation tests,
responsive browser walkthrough, successful `pnpm check`, reviewed pull request,
approved `dev` deployment, smoke tests, and the initial operating-window record.

### Increment 1 — Upfront terms and landlord foundation

- Model three refundable guarantee months separately from one advance-rent
  period.
- Display the three initial units and calculate signing obligations.
- Provide a French-first, mobile-responsive landlord flow using synthetic data.

**Exit evidence:** all three scenarios pass domain and API tests; the owner can
select a unit and inspect the verified signing breakdown in the browser.

### Increment 2 — Persistence and tenant isolation

- Record an ADR for PostgreSQL tenancy and migration strategy.
- Add organizations, memberships, properties, units, and audit context.
- Let landlords create and update properties and units with optimistic
  concurrency, and archive them without deleting historical records.
- Restrict manager portfolio reads to active property assignments and preserve
  correlated audit history when landlords assign or revoke access.
- Let landlords review active managers and assign properties by name from the
  web workspace; never require users to enter internal manager or property IDs.
- Keep manager-property administration usable at portfolio scale with targeted
  manager selection, server-side search, assignment filters, and bounded
  server-side pagination rather than loading or rendering the full
  manager-by-property matrix.
- Route authenticated landlords and managers to distinct server-enforced web
  workspaces through `/workspace`; retain legacy `/pilot` links only as
  compatibility redirects.
- Prove cross-organization isolation with automated tests.

**Exit evidence:** two synthetic organizations cannot read or mutate each
other’s records, even when client-supplied identifiers are manipulated.

### Increment 3 — Identity and leasing

The application provenance, evidence, and invitation details in this increment
remain proposed where they exceed the approved PRD boundary; see the product
authority/application-scope gap before implementation.

- Add landlord and tenant sign-in, invitations, and least-privilege roles.
- Let landlords create an audited lease draft for an unleased unit by selecting
  an active tenant, contractual start date, currency, and exact monthly rent.
  Draft creation must reference a human-approved KEYFORTA application for
  the same tenant, or identify the lease as historical/external with an
  explicit justification. It must never accept or activate the lease
  automatically.
- Create versioned tenant, lease, party, and occupancy records.
- Generate charge schedules from accepted lease versions.

Accepted tenants receive an authenticated access-confirmation workspace. The
tenant portal's lease, payment, receipt, and maintenance data remains
intentionally unavailable until tenant-specific, lease-scoped read contracts
and authorization tests exist.

Invited tenants can submit a structured application, and landlords can record
one audited human review outcome. Application approval does not reserve a unit
or create or activate a lease. A later landlord-created draft may reference an
approved application once; externally concluded and historical leases instead
retain a required provenance justification. Tenants can upload versioned supporting evidence
to private Blob Storage; Defender scan status is visible to tenants and
landlords, and only clean files can be downloaded through the authorized API.

**Exit evidence:** an authorized landlord can create a synthetic lease and its
schedule; a tenant sees only the accepted version for their lease.

### Increment 4 — Payments, ledger, and receipts

- Record manual cash, bank, and mobile-money evidence.
- Post idempotent payments, allocations, reversals, and numbered receipts.
- Produce matching landlord and tenant statements.

**Exit evidence:** full, partial, duplicate, overpayment, and reversal scenarios
reconcile without editing posted financial history.

### Increment 5 — Grounded assistance

- Add read-only landlord and tenant assistant tools.
- Require evidence references for lease and balance answers.
- Evaluate abstention, authorization, and AI-unavailable fallback behavior.

**Exit evidence:** the assistant explains a synthetic balance from authorized
records, cites its evidence, and abstains when evidence or access is missing.

### Increment 6 — Controlled apartment operations

- Import approved apartment and contract data through a reviewed process.
- Operate two complete billing cycles.
- Reconcile system outputs against independently maintained control records.

**Exit evidence:** no unexplained balance difference, duplicate posting, data
isolation breach, or unrecoverable workflow failure during initial operations.
