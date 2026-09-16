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
defined in [Product Role Use Cases](PILOT_ROLE_USE_CASES.md).

An accepted tenant can enter an authenticated access-confirmation workspace.
Lease, payment, receipt, and maintenance views remain unavailable until their
tenant-scoped contracts and authorization tests are implemented.

## In scope

- Organization, user, role, property, building, and unit records
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

## Implemented product capabilities

- The French-first public website explains KEYFORTA to landlords, managers, and
  tenants and provides a controlled catalogue, listing details, visit inquiries,
  contact, privacy, and secure sign-in paths without exposing private records or
  accepting public rental applications.
- Invited tenants can submit a structured application for human review. Tenant
  identity records preserve nom, postnom, and prénom as distinct required
  fields. Current addresses preserve avenue and number, quartier, commune,
  postal code, city, and province as distinct required fields. A landlord can
  record one append-only approval or refusal with required notes; neither
  outcome reserves a unit, creates a lease, or moves money.
- Invited tenants can upload versioned identity, income, address, and rental
  reference evidence as PDF, JPEG, or PNG files up to 10 MB. Files remain
  unavailable until Microsoft Defender for Storage reports them clean, and all
  access is authorized and proxied by the API.
- Authenticated landlord, manager, and auditor portfolio reads return real
  organization-scoped property, unit, and lease records.
- Tenant roles and identities outside the requested organization cannot read
  the operational portfolio.
- The portfolio dashboard derives unit and contractual-rent summaries from these
  records and does not substitute synthetic records when the portfolio is empty.
- Landlords can create, list, and revoke expiring manager and tenant
  invitations. Recipients join only after signing in with the invited email;
  invitation links reveal their token only at creation. A landlord who loses a
  pending link can replace it, which revokes the old invitation and displays a
  fresh link once.
- Landlords can activate a lease draft explicitly. Activation creates an
  immutable accepted version instead of changing the draft in place.
- Every new lease draft records its provenance. A KEYFORTA application must
  be approved by a human, belong to the same organization and tenant, and be
  unused by another lease series. Historical or externally concluded leases
  remain importable only with an explicit landlord justification. Approval
  never creates, reserves, or activates a lease automatically.
