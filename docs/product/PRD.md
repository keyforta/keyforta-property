# Product Requirements

**Status:** Approved for implementation on 2026-09-16; commercial legal launch remains blocked by the DRC decision register

## Problem

Apartment operations are fragmented across contracts, messages, informal
payment evidence, and memory. Landlord and tenant can disagree because there is
no shared, auditable record of terms, charges, payments, maintenance, and
communication.

## Initial operating outcome

Operate the initial Kinshasa apartments through two complete, reconciled
billing cycles using one secure system.

The public website, tenant portal, manager/admin portal, and landlord portal are
described in the draft [Product Role Use Cases](PILOT_ROLE_USE_CASES.md). That
draft supports this PRD but does not define approved requirements.

An accepted tenant can enter an authenticated access-confirmation workspace.
Lease, payment, receipt, and maintenance views remain unavailable until their
tenant-scoped contracts and authorization tests are implemented.

## Pre-launch v1.0 compatibility policy

KEYFORTA has not launched v1.0 and has no production/customer dataset or
external client version to preserve. Product, contract, API, data, web, test,
and operations work must not add or retain legacy aliases, duplicate payload
shapes, transitional profile states, grandfathered synthetic records, route
redirects, dual-write models, or N-1 application/data behavior solely for
backward compatibility. Existing examples, demonstrations, and synthetic rows
may be removed through an explicit, authorized non-production reset that first
proves no production/customer data is present.

This policy does not authorize rewriting applied migrations or deleting future
production/customer records. Forward-only migration history, immutable business
and audit history, provider-protocol interoperability, security fail-closed
behavior, disaster recovery, and rollback to an artifact proven compatible with
the current schema remain required safety controls rather than backward
compatibility.

## In scope

- Organization, user, role, property, and unit records
- Controlled public listings and visit inquiries
- Invited-tenant applications and explicit human review decisions
- Tenant, co-tenant, guarantor, and contact relationships
- Versioned lease terms and occupancy lifecycle
- Rent, concession, deposit/guarantee/advance, and charge schedules
- Payments, allocations, receipts, reversals, and statements
- Reminders and communication history
- Maintenance request and resolution lifecycle
- Documents, access control, audit, export, and backup
- Read-only, evidence-grounded landlord and tenant assistants

## Out of scope

- Public rental applications and automated reservations
- Autonomous tenant selection, pricing, collection escalation, or eviction
- General ledger, tax filing, payroll, mortgage, or property-sale closing
- Native mobile applications and independent microservices

## Acceptance outcomes

1. All occupied units have an exact active lease version.
2. The approved $400, $350, and $250 scenarios calculate correctly.
3. The three-month refundable guarantee remains separate from the first
   advance-rent allocation.
4. Every payment produces an auditable allocation and receipt.
5. A duplicate payment callback cannot produce a duplicate posting.
6. Tenant and landlord statements agree for every lease.
7. A tenant cannot access another tenant or organization’s data.
8. AI answers about money or leases cite authorized source records or abstain.
9. The system continues core workflows while AI is unavailable.

## Delivery status

Delivery evidence changes more frequently than approved requirements. The
current source-backed summary lives in
[`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md); this PRD remains the
authority for scope, exclusions, and acceptance outcomes.

## Approved capability constraints

- Invited-tenant applications preserve nom, postnom, and prénom as distinct
   required identity fields and avenue/number, quartier, commune, postal code,
   city, and province as distinct current-address fields.
- Application approval or refusal is one append-only human decision with
   required notes. Neither outcome reserves a unit, creates a lease, or moves
   money.
- Application evidence is versioned PDF, JPEG, or PNG up to 10 MB. It remains
   unavailable until the approved malware-scan control reports it clean, and
   every access requires fresh authorization under ADR-006.
- Manager and tenant invitations expire and are revocable. The raw token is
   revealed only at creation; replacing a lost pending link revokes the old
   invitation and reveals a fresh token once. A recipient joins only after
   signing in with the invited email address.
- Portfolio and operational views show the truthful empty state when no records
  exist; they never substitute synthetic records in an authenticated workflow.
- Lease activation is an explicit landlord decision that appends an immutable
   accepted version instead of changing a draft in place.
- Every lease draft records provenance. A referenced KEYFORTA application must
   be human-approved, belong to the same organization and tenant, and remain
   unused by another lease series. Historical or externally concluded leases
   require an explicit landlord justification. Approval never creates,
   reserves, or activates a lease automatically.
