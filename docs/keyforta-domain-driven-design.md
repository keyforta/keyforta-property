# KEYFORTA Domain-Driven Design

**Status:** Canonical domain baseline for MVP implementation; detailed backend handoff in `docs/keyforta-backend-implementation-specification.md`
**Scope:** Multi-organization rental and property-operations platform for apartments, houses, and commercial properties
**Architecture:** Modular monolith first; extract services only when scale, regulation, deployment independence, or ownership justifies it

## 1. Domain vision

KEYFORTA is a trusted operating layer for property relationships. It connects occupants, owners, managers, and service providers through a shared record of properties, units, applications, agreements, money, maintenance, documents, and communication.

The product promise is:

> Rent with clarity. Manage with confidence.

The domain must make three things explicit:

1. Who is allowed to act.
2. Which organization, property, unit, or relationship the action concerns.
3. What evidence and audit history support the result.

Authentication proves identity. Domain authorization decides whether that identity can perform an action on a specific record. Client-side hiding is never a security boundary.

## 2. Business actors and responsibilities

| Actor | Business responsibility | Registration / access rule |
| --- | --- | --- |
| Landlord / owner | Own property records, publish units, invite managers, review financial and operational performance | May self-register and create an organization |
| Tenant / applicant | Discover units, request viewings, submit complete applications, sign agreements, pay, communicate, report maintenance | May self-register; application is always tied to a specific unit |
| Property manager | Operate an owner's delegated portfolio, review applications, coordinate leases, payments, maintenance, and communication | Cannot freely self-join an organization; enters through a landlord invitation |
| Independent maintenance operator | Register capabilities, offer services, respond to assigned jobs, submit quotes and evidence | May self-register; service discovery can span properties, operational access is assignment- and time-bounded |
| Platform administrator | Govern organizations, verification, support access, configuration, reconciliation, and audit | Separate admin app; platform-admin authorization required |
| Applicant / visitor | Browse public inventory and submit an access or viewing request | Anonymous until an authenticated flow is required |

## 3. Product boundaries

The user-facing system is three applications over shared contracts:

| Application | Visibility | Owns |
| --- | --- | --- |
| `public-web` | Anonymous | Discovery, property detail, public trust content, access requests, entry points |
| `portal-web` | Authenticated | Tenant, landlord, manager, and maintenance-operator workflows |
| `admin-web` | Authenticated and privileged | Platform governance and cross-organization administration |

These are application boundaries, not authorization boundaries. The API must enforce all permissions independently.

## 4. Bounded contexts

### 4.1 Identity & Organization context

Owns external identity linkage, profiles, organizations, memberships, invitations, roles, and session-facing claims.

Key concepts:

- `Identity`: external subject from Microsoft Entra External ID.
- `Party`: reusable person or legal entity.
- `Profile`: application-facing representation of a party.
- `Organization`: tenant boundary for business records.
- `Membership`: party-to-organization role with effective dates.
- `Invitation`: signed, expiring invitation to join an organization with a proposed role.

This context does not decide property ownership or assignment access; it supplies identity and organizational membership to policy evaluation.

### 4.2 Party & Relationship context

Owns effective-dated relationships between parties and domain subjects.

Examples:

- landlord owns property;
- landlord delegates management to manager;
- tenant occupies unit through lease;
- operator is eligible to offer a service;
- operator is assigned to a maintenance request.

Relationships have `effectiveFrom`, optional `effectiveTo`, status, source, and audit metadata. Historical relationships are retained.

### 4.3 Property & Inventory context

Owns the physical and commercial inventory hierarchy:

`Portfolio → Property → Unit → Availability / Pricing`

Supports residential apartments, houses, and commercial spaces without changing the core identity of a property or unit.

### 4.4 Leasing & Occupancy context

Owns viewing requests, rental applications, screening decisions, offers, leases, occupants, renewals, move-in, move-out, and occupancy periods.

The application and lease are different aggregates. An application is evidence for a decision; a lease is the contractual occupancy record.

### 4.5 Billing & Ledger context

Owns charges, deposits, discounts, due dates, late fees, credits, adjustments, immutable posted entries, and reversals.

The ledger is authoritative for what is owed. A payment provider is not the ledger.

### 4.6 Payments & Reconciliation context

Owns payment intents, provider references, settlement state, refunds, allocation to charges, reconciliation batches, and exceptions.

It consumes billable charges from Billing and posts financial effects through controlled ledger commands.

### 4.7 Maintenance & Inspection context

Owns maintenance requests, triage, assignment, service offers, quotes, schedules, work execution, inspection, evidence, completion, tenant confirmation, and reopening.

Operator access is limited to necessary data for assigned work and its active access window.

### 4.8 Documents & Communication context

Owns document metadata, versions, access grants, retention state, acknowledgments, conversations, messages, notifications, and delivery status.

Binary files live in private object storage. The domain stores metadata and signed access references, not public file URLs.

### 4.9 Reporting context

Owns read models and metrics such as occupancy, collection rate, arrears, application funnel, maintenance response time, vacancy, and operator performance.

Reports are projections. They do not become a second source of truth.

### 4.10 AI & Automation context

Owns authorized suggestions, classification, summaries, reminders, and workflow assistance.

AI may recommend or draft. It must not bypass authorization, approve an applicant, alter a lease, post money, verify evidence conclusively, or make an irreversible decision without an authorized human command.

### 4.11 Integration context

Owns adapters for identity, email/SMS, payments, storage, maps, analytics, and external verification. Provider-specific identifiers never become domain identifiers.

## 5. Context map

| Upstream context | Downstream context | Relationship |
| --- | --- | --- |
| Identity & Organization | All transactional contexts | Published identity, organization, membership, and invitation facts |
| Party & Relationship | Property, Leasing, Maintenance | Relationship policies determine who may act and what is related |
| Property & Inventory | Public discovery, Leasing, Maintenance, Reporting | Published property/unit facts and availability |
| Leasing & Occupancy | Billing, Documents, Reporting | Approved lease creates occupancy and billable terms |
| Billing & Ledger | Payments, Reporting | Charges and posted balances are consumed downstream |
| Payments & Reconciliation | Billing, Notifications, Reporting | Settlements and allocation results are published |
| Maintenance | Documents, Notifications, Reporting | Lifecycle, assignment, quote, and evidence facts are published |
| Documents & Communication | All contexts | Secure records, messages, acknowledgments, and delivery facts |
| Transactional contexts | Reporting | Events feed projections; reports do not write domain state |
| Integration adapters | Relevant contexts | Anti-corruption layers isolate provider models |

## 6. Shared kernel and ubiquitous language

These terms have one meaning across the system:

| Term | Definition |
| --- | --- |
| Organization | Customer/account boundary that owns business records and data isolation |
| Party | Person or legal entity that can participate in relationships |
| Profile | Role-specific application view of a party |
| Property | Real estate asset or commercial space container |
| Unit | Rentable or serviceable subdivision of a property |
| Application | Versioned tenant submission for one unit |
| Lease | Versioned agreement granting occupancy rights for a unit |
| Charge | Amount assessed against a lease or account |
| Payment | Money received or attempted against one or more charges |
| Service offer | Operator capability and commercial offer discoverable across eligible properties |
| Work order | Authorized maintenance request assigned for execution |
| Access window | Time-bounded permission to view or act on job-related property data |
| Evidence | Document, photo, receipt, note, or observation supporting a claim or completion |
| Posted entry | Immutable financial record that can only be corrected by reversal/replacement |
| Effective-dated | Valid for a defined interval; future and historical values are preserved |

## 7. Aggregate design

### 7.1 Identity & Organization aggregates

#### `Organization`

**Root fields:** `organizationId`, legal name, display name, type, status, default currency, default time zone, contact details, version.

**Commands:** `CreateOrganization`, `UpdateOrganization`, `SuspendOrganization`, `ReactivateOrganization`.

**Invariants:** name and type are valid; suspended organizations cannot create new operational records; all mutations are audited.

#### `Membership`

**Root fields:** `membershipId`, organizationId, partyId, roles, effective interval, status, invitedBy, acceptedAt.

**Commands:** `InviteManager`, `AcceptInvitation`, `ChangeMembershipRole`, `SuspendMembership`, `EndMembership`.

**Invariants:** no overlapping active membership with incompatible primary role; only an authorized landlord or admin can invite a manager; acceptance cannot occur after expiry or revocation.

### 7.2 Property & Inventory aggregates

#### `Property`

**Root fields:** `propertyId`, organizationId, name, property type, address, time zone, ownership relationship, management relationship, verification status, publication status, version.

**Commands:** `CreateProperty`, `UpdateProperty`, `SubmitPropertyForVerification`, `PublishProperty`, `UnpublishProperty`, `ArchiveProperty`, `AssignManager`.

**Invariants:** property belongs to exactly one organization; ownership authority must exist before publication; a manager assignment must be effective-dated; archived properties cannot receive new applications.

#### `Unit`

**Root fields:** `unitId`, propertyId, unit type, label, floor/area, bedroom/bathroom facts where applicable, pricing, availability status, version.

**Commands:** `CreateUnit`, `UpdateUnit`, `SetUnitPricing`, `PublishUnit`, `PauseUnit`, `MarkUnitOccupied`, `MarkUnitVacant`.

**Invariants:** label is unique within a property; monthly rent and currency are valid; occupied units cannot be published as available; pricing changes are effective-dated and do not rewrite signed lease terms.

### 7.3 Leasing & Occupancy aggregates

#### `RentalApplication`

**Root fields:** `applicationId`, organizationId, unitId, applicantPartyId, version number, applicant details, occupants, income, references, requested move-in, documents, consent, status, reviewer, decision reason, version.

**Commands:** `SubmitRentalApplication`, `UpdateApplication`, `RequestApplicationChanges`, `ApproveApplication`, `RejectApplication`, `WithdrawApplication`.

**State:** `draft → submitted_for_manager_review → changes_requested → resubmitted → approved | rejected | withdrawn`.

**Invariants:** one application targets one unit; required fields and consent are complete before submission; only the authorized manager or landlord-delegated manager can decide; approval must verify unit availability and applicant identity status; every version is retained.

#### `Lease`

**Root fields:** `leaseId`, organizationId, unitId, tenant parties, guarantors, term dates, rent, deposit, advance rent, discounts, due day, grace period, late fee, signed terms version, status, occupancy period, version.

**Commands:** `CreateLeaseFromApplication`, `ProposeLeaseTerms`, `AcceptLease`, `SignLease`, `ActivateLease`, `RenewLease`, `TerminateLease`, `RecordMoveIn`, `RecordMoveOut`.

**State:** `draft → offered → accepted → signed → active → ended | terminated`.

**Invariants:** no overlapping active lease for a unit; all monetary terms have currency and effective dates; signed terms are immutable; a lease cannot activate without required parties, signatures/acknowledgments, and unit availability; termination requires reason and effective date.

### 7.4 Billing & Payments aggregates

#### `ChargeSchedule`

**Root fields:** leaseId, recurring rules, due day, grace period, rent, deposit, fee rules, effective intervals, status.

**Commands:** `CreateChargeSchedule`, `GenerateCharges`, `AdjustCharge`, `WaiveCharge`, `CloseSchedule`.

**Invariants:** generated charges are deterministic and idempotent; a posted charge is not edited in place; corrections create reversal/replacement entries.

#### `Payment`

**Root fields:** paymentId, organizationId, payerPartyId, leaseId, allocations, amount, currency, method, provider reference, status, receivedAt, version.

**Commands:** `CreatePaymentIntent`, `RecordPayment`, `AllocatePayment`, `RefundPayment`, `ReversePayment`, `ReconcilePayment`.

**Invariants:** amount is positive; provider callbacks are idempotent; allocation cannot exceed available payment or charge balance; posted effects are immutable; refunds and reversals are auditable.

### 7.5 Maintenance aggregates

#### `ServiceOffer`

**Root fields:** offerId, organization-independent operator profile reference, service categories, coverage, rates, availability, verification status, status, version.

**Commands:** `CreateServiceOffer`, `UpdateServiceOffer`, `PublishServiceOffer`, `PauseServiceOffer`, `WithdrawServiceOffer`.

**Invariants:** operator is verified to the required level; coverage may include any property; publishing an offer grants discoverability only, not property-data access or work authorization.

#### `MaintenanceRequest`

**Root fields:** requestId, organizationId, propertyId, unitId, requesterPartyId, category, priority, description, status, assignment, access window, quote, schedule, evidence references, version.

**Commands:** `SubmitMaintenanceRequest`, `TriageRequest`, `AssignOperator`, `AcceptAssignment`, `ScheduleVisit`, `StartWork`, `CompleteWork`, `ConfirmCompletion`, `ReopenRequest`, `CancelRequest`.

**State:** `submitted → triaged → assigned → accepted → scheduled → in_progress → completed → confirmed`; completed requests may be `reopened` with reason.

**Invariants:** requester must be related to the unit/property; assignment must reference an eligible operator; access window is required before job data is exposed; status transitions are explicit and audited; completion requires a report and evidence requirements appropriate to the category; operator cannot access unrelated portfolio records.

#### `MaintenanceQuote`

**Root fields:** quoteId, maintenanceRequestId, operatorId, labor amount, materials amount, total, currency, validity, status, reviewer, version.

**Commands:** `SubmitQuote`, `RequestQuoteChanges`, `ApproveQuote`, `RejectQuote`, `WithdrawQuote`.

**Invariants:** total equals labor plus materials plus explicitly modeled fees/taxes; only the assigned operator submits; only authorized owner/manager approves; approval is invalid if quote expired or request state changed incompatibly.

### 7.6 Documents & Communication aggregates

#### `DocumentRecord`

**Root fields:** documentId, organizationId, ownerPartyId, related aggregate reference, type, storage key, hash, version, access policy, review status, retention status.

**Commands:** `RegisterDocument`, `UploadDocumentVersion`, `ReviewDocument`, `RequestDocument`, `GrantDocumentAccess`, `RevokeDocumentAccess`, `AcknowledgeDocument`, `ArchiveDocument`.

**Invariants:** new versions do not overwrite prior versions; binary access requires a signed URL; reviewer cannot approve their own prohibited evidence; retention rules prevent premature deletion; sensitive documents are never public.

#### `Conversation`

**Root fields:** conversationId, organizationId, participants, related reference, messages, delivery/read state, status.

**Commands:** `StartConversation`, `SendMessage`, `MarkMessageRead`, `CloseConversation`, `ReportConversation`.

**Invariants:** every participant has a valid relationship to the subject; messages are attributed to an authenticated party; deleted content follows retention policy and audit rules.

## 8. Value objects

Use immutable value objects with validation at construction:

- `OrganizationId`, `PartyId`, `PropertyId`, `UnitId`, `LeaseId`, `ApplicationId`, `MaintenanceRequestId`.
- `EmailAddress`, `PhoneNumber`, `PostalAddress`, `PropertyTimeZone`.
- `Money(amountMinor, currency)`; never use floating-point money in the backend.
- `DateRange`, `EffectiveInterval`, `AccessWindow`, `LeaseTerm`.
- `RentTerms`, `DepositTerms`, `LateFeePolicy`, `DiscountPolicy`.
- `VerificationStatus`, `PublicationStatus`, `OccupancyStatus`.
- `ApplicationStatus`, `LeaseStatus`, `MaintenanceStatus`, `QuoteStatus`.
- `FileReference(storageKey, contentHash, mediaType, size)`.
- `AuditMetadata(actorId, organizationId, action, target, timestamp, origin, correlationId)`.
- `PageCursor`, `SortSpec`, `IdempotencyKey`, `ConcurrencyVersion`.

## 9. Domain services and policies

Use a domain service when a rule crosses aggregate boundaries:

- `PropertyPublicationPolicy`: verifies ownership authority, required property/unit data, and publishability.
- `ManagerDelegationPolicy`: validates landlord-to-manager delegation and effective dates.
- `ApplicationCompletenessPolicy`: validates required fields, consent, documents, and unit state.
- `ApplicationDecisionPolicy`: ensures only an authorized manager/landlord can decide and records reason.
- `LeaseActivationPolicy`: prevents overlapping occupancy and validates signed terms.
- `ChargeGenerationPolicy`: deterministically generates recurring charges for a lease period.
- `PaymentAllocationPolicy`: allocates money without over-application and preserves residual balances.
- `OperatorEligibilityPolicy`: checks profile verification, service category, availability, and organization constraints.
- `MaintenanceAssignmentPolicy`: checks assignment eligibility and creates a time-bounded access window.
- `DocumentAccessPolicy`: resolves relationship-based access for each document request.
- `SupportAccessPolicy`: requires explicit reason, scope, expiry, visibility, and audit trail.
- `AuthorizationPolicy`: evaluates identity, organization, role, relationship, resource, action, and time window.

## 10. Domain events

Events are immutable facts, versioned, and include `eventId`, `eventType`, `schemaVersion`, `organizationId`, `aggregateId`, `aggregateType`, `occurredAt`, `actor`, `correlationId`, and payload.

### Identity events

`OrganizationCreated`, `MembershipInvited`, `MembershipAccepted`, `MembershipSuspended`, `ProfileVerified`.

### Property events

`PropertyCreated`, `PropertySubmittedForVerification`, `PropertyPublished`, `PropertyUnpublished`, `UnitCreated`, `UnitAvailabilityChanged`, `ManagerAssigned`.

### Leasing events

`ViewingRequested`, `RentalApplicationSubmitted`, `ApplicationChangesRequested`, `ApplicationApproved`, `ApplicationRejected`, `LeaseOffered`, `LeaseSigned`, `LeaseActivated`, `LeaseRenewed`, `LeaseEnded`, `OccupancyChanged`.

### Financial events

`ChargeGenerated`, `ChargeAdjusted`, `PaymentIntentCreated`, `PaymentRecorded`, `PaymentAllocated`, `PaymentRefunded`, `PaymentReconciled`, `LedgerEntryPosted`, `LedgerEntryReversed`.

### Maintenance events

`ServiceOfferPublished`, `MaintenanceRequestSubmitted`, `MaintenanceRequestTriaged`, `OperatorAssigned`, `AssignmentAccepted`, `VisitScheduled`, `WorkStarted`, `WorkCompleted`, `EvidenceSubmitted`, `CompletionConfirmed`, `MaintenanceReopened`, `QuoteSubmitted`, `QuoteApproved`, `QuoteRejected`.

### Communication events

`DocumentRegistered`, `DocumentVersionUploaded`, `DocumentReviewed`, `DocumentAccessGranted`, `MessageSent`, `NotificationQueued`, `NotificationDelivered`.

## 11. Core use-case workflows

### 11.1 Landlord onboarding

1. Landlord authenticates with the identity provider.
2. `CreateOrganization` creates the landlord's organization and membership.
3. Landlord creates a property and units.
4. Ownership authority and required documents are submitted for review.
5. Landlord publishes eligible units.
6. Landlord invites a manager with portfolio scope and expiry.
7. Manager accepts the invitation and receives delegated access.

### 11.2 Tenant rental application

1. Tenant selects one published unit.
2. Tenant creates a draft application.
3. Tenant completes identity, contact, household, income, references, move-in, and consent fields.
4. Tenant submits the application.
5. Manager receives a notification and reviews the versioned submission.
6. Manager approves, rejects, or requests changes with a reason.
7. Approval may create a lease offer; it does not itself activate occupancy.

### 11.3 Manager invitation

1. Landlord selects a property or portfolio scope.
2. Landlord creates an expiring invitation.
3. Manager accepts after authentication.
4. Membership and delegated relationship become effective.
5. Invitation acceptance and scope are audited.

### 11.4 Independent operator service offer

1. Operator self-registers and provides services, coverage, availability, and verification evidence.
2. Operator publishes a service offer.
3. Property managers can discover the offer across eligible properties.
4. A manager assigns a specific maintenance request.
5. The system creates a property/job-scoped access window.
6. Operator accepts, quotes, schedules, performs work, and submits evidence.
7. Access expires when the job window closes or assignment ends.

### 11.5 Lease-to-cash

`LeaseActivated → ChargeScheduleCreated → ChargesGenerated → PaymentRecorded → PaymentAllocated → LedgerPosted → ReceiptIssued → ReconciliationCompleted`.

Every transition is idempotent and auditable. Provider callbacks are treated as untrusted input until validated.

## 12. Authorization model

Every request evaluates:

`Authenticated identity + organization membership + role + relationship + resource scope + action + effective time window`

| Role | Allowed baseline |
| --- | --- |
| Tenant | Own applications, leases, charges, payments, documents, messages, notifications, and unit-related maintenance |
| Landlord | Owned organization properties, units, leases, charges, related payments, maintenance, documents, applications, and manager invitations |
| Property manager | Delegated portfolio and participant operations within effective assignment |
| Operator | Own profile/service offers; assigned maintenance records and only necessary property data during access window |
| Platform admin | Explicitly authorized cross-organization operations with elevated audit requirements |

Required security properties:

- organization ID is resolved from trusted identity/membership, never accepted as an unrestricted client selector;
- every object is authorized server-side;
- cross-organization references are rejected;
- support access is explicit, limited, visible, expiring, and audited;
- tenant and operator data is minimized by default;
- authorization tests include broken-object references and expired relationships/windows.

## 13. Persistence model

Use a relational database with organization-scoped tables and explicit foreign keys.

Every business table includes:

`id`, `organization_id`, `created_at`, `updated_at`, `version`, `created_by`, `updated_by`.

Additional requirements:

- unique constraints include `organization_id` where identity is organization-local;
- effective-dated tables prevent invalid overlaps;
- leases, applications, documents, and terms use version tables or append-only revisions;
- financial postings are append-only; corrections use reversal/replacement entries;
- events use an outbox table written in the same transaction as aggregate changes;
- consumers use an inbox/idempotency table;
- private files use object storage plus metadata, hash, retention, and access policy;
- timestamps are UTC; each property retains an IANA time zone for business-day rules;
- reporting uses read models/materialized projections, never ad hoc joins from unbounded request handlers.

Suggested table families:

`organizations`, `identities`, `parties`, `profiles`, `memberships`, `invitations`, `relationships`, `properties`, `units`, `unit_pricing_versions`, `viewing_requests`, `rental_applications`, `rental_application_versions`, `leases`, `lease_term_versions`, `occupancy_periods`, `charges`, `ledger_entries`, `payments`, `payment_allocations`, `reconciliation_batches`, `service_offers`, `maintenance_requests`, `maintenance_assignments`, `maintenance_quotes`, `maintenance_reports`, `documents`, `document_versions`, `document_access_grants`, `conversations`, `messages`, `notifications`, `audit_events`, `outbox_events`, `inbox_messages`, `idempotency_keys`.

## 14. API contract shape

Base path: `/api/v1`. All protected requests use the external identity access token. Responses use:

```json
{ "data": {}, "meta": { "requestId": "..." }, "auditEventId": "..." }
```

List responses use:

```json
{ "items": [], "total": 0, "nextCursor": null }
```

Mutations require `Idempotency-Key` for retryable commands and `If-Match` or a version for updates.

### Identity and onboarding

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/auth/signup/landlords` | Create landlord party, organization, and membership |
| `POST` | `/auth/signup/maintenance-operators` | Create operator profile and verification submission |
| `GET` | `/me` | Return identity, memberships, roles, and active relationship summary |
| `POST` | `/manager-invitations` | Landlord invites manager for a defined scope and expiry |
| `POST` | `/manager-invitations/{id}/accept` | Accept invitation and create membership/relationship |

### Property and inventory

`GET/POST /properties`, `GET/PATCH/DELETE /properties/{id}`, `POST /properties/{id}/publish`, `POST /properties/{id}/archive`, `GET/POST /properties/{id}/units`, `GET/PATCH/DELETE /units/{id}`, `POST /units/{id}/publish`, `POST /units/{id}/availability`.

### Leasing

`GET/POST /units/{id}/viewing-requests`, `GET/PATCH /rental-applications`, `POST /units/{id}/rental-applications`, `GET/PATCH /rental-applications/{id}`, `POST /rental-applications/{id}/request-changes`, `/approve`, `/reject`, `GET/POST /leases`, `GET/PATCH /leases/{id}`, `POST /leases/{id}/offer`, `/sign`, `/activate`, `/renew`, `/terminate`.

### Billing and payments

`GET /leases/{id}/charges`, `POST /leases/{id}/charges/generate`, `PATCH /charges/{id}`, `GET/POST /payments`, `POST /payments/{id}/allocate`, `/refund`, `/reverse`, `GET /reconciliation-batches`, `POST /reconciliation-batches/{id}/close`.

### Maintenance

`GET/POST/PATCH /service-offers`, `POST /service-offers/{id}/publish`, `GET /maintenance/service-offers?propertyId=...`, `GET/POST /maintenance-requests`, `POST /maintenance-requests/{id}/triage`, `/assign`, `/accept`, `/schedule`, `/start`, `/complete`, `/confirm`, `/reopen`, `GET/POST /maintenance-requests/{id}/quotes`, `POST /maintenance-quotes/{id}/approve`, `/reject`, `GET/POST /maintenance-requests/{id}/reports`, `POST /maintenance-reports/{id}/evidence`.

### Documents and communication

`GET/POST /documents`, `POST /documents/{id}/versions`, `POST /documents/{id}/review`, `POST /documents/{id}/access`, `GET/POST /conversations`, `GET/POST /conversations/{id}/messages`, `GET /notifications`, `POST /notifications/{id}/read`.

### Landlord dashboard read model

`GET /landlord/dashboard?organizationId=...` returns a composed read model, not a new source of truth:

```json
{
  "data": {
    "portfolio": { "propertyCount": 0, "unitCount": 0, "occupiedCount": 0, "vacantCount": 0 },
    "financials": { "dueMinor": 0, "collectedMinor": 0, "arrearsMinor": 0, "currency": "USD" },
    "applications": { "submitted": 0, "changesRequested": 0, "approved": 0 },
    "maintenance": { "open": 0, "awaitingQuote": 0, "inProgress": 0, "completedThisPeriod": 0 },
    "recentActivity": []
  }
}
```

The server derives the organization from the authenticated membership. A client-supplied organization filter cannot expand access.

## 15. Error contract

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You are not authorized to perform this action.",
    "details": {},
    "traceId": "..."
  }
}
```

Stable codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `STATE_CONFLICT`, `VERSION_CONFLICT`, `IDEMPOTENCY_REPLAY`, `PAYMENT_PROVIDER_ERROR`, `DOCUMENT_ACCESS_DENIED`, and `RATE_LIMITED`.

## 16. Architecture implementation boundary

Start as a modular monolith:

```text
apps/api
  identity-organization
  party-relationship
  property-inventory
  leasing-occupancy
  billing-ledger
  payments-reconciliation
  maintenance-inspection
  documents-communication
  reporting
  ai-automation
  integrations
```

Each module owns its aggregates, repositories, command handlers, policies, events, and read models. Other modules may use published application commands, queries, and events—not internal tables or aggregate internals.

Extraction candidates later are Payments, Documents, Notifications, and Reporting because of provider coupling, storage/throughput, asynchronous delivery, or read-scale needs. Extraction is not the default MVP goal.

## 17. Testing strategy

Minimum automated coverage:

- value-object validation and money arithmetic;
- aggregate invariant and state-transition tests;
- application completeness and manager-decision authorization;
- landlord invitation expiry, scope, and acceptance;
- no overlapping leases or occupancy periods;
- deterministic charge generation and immutable ledger corrections;
- payment provider idempotency and allocation limits;
- operator service discovery without unauthorized property access;
- assignment-window expiry and broken-object authorization;
- organization isolation on every repository/query;
- outbox/inbox exactly-once effect semantics;
- API contract and authorization matrix tests;
- audit event completeness for every mutation and privileged read.

## 18. Definition of done for a domain feature

A feature is complete only when:

1. Its bounded context and aggregate ownership are identified.
2. Commands, invariants, state transitions, and domain events are documented.
3. Authorization policy covers identity, organization, role, relationship, and time.
4. Persistence constraints protect the invariants.
5. API endpoints and request/response schemas are versioned.
6. Mutations are idempotent, concurrency-safe, and audited.
7. Read models expose the workflow without leaking unrelated data.
8. UI states cover loading, empty, validation, success, failure, and unauthorized cases.
9. Cross-organization and broken-object tests exist.
10. Operational metrics and support/audit behavior are defined.

## 19. Recommended implementation order

1. Identity, organization, party, memberships, invitations, and authorization policy.
2. Property, unit, ownership, management, verification, and publication.
3. Viewing requests and complete unit-specific rental applications.
4. Manager review, lease offers, versioned lease terms, and occupancy.
5. Billing schedules, charges, immutable ledger, payments, and reconciliation.
6. Maintenance requests, operator service offers, assignment windows, quotes, reports, and evidence.
7. Documents, conversations, notifications, and audit search.
8. Reporting read models and landlord dashboard.
9. AI assistance behind authorized tools and human approval gates.
10. Provider integrations, resilience, observability, and selective service extraction.

This document is the domain baseline. Any implementation that changes an invariant, aggregate boundary, role rule, or financial behavior must update this document and the API contract in the same change.

## Appendix A. Supporting domain-model summary

This supporting appendix preserves the former domain-model summary. It does not
alter this document's current authority header or replace the normative domain
contracts.

### Domain Model

#### Structural hierarchy

`Organization → Portfolio → Property → Unit`

#### Initial bounded modules

1. Identity and organization
2. Party and relationship
3. Property and unit
4. Leasing and occupancy
5. Billing and ledger
6. Payments and reconciliation
7. Maintenance and inspection
8. Document and communication
9. Reporting
10. AI orchestration
11. Integration adapters

#### Core invariants

- Organization is the commercial data-isolation boundary.
- A unit cannot have conflicting active occupancy for the same dates unless the
  lease model explicitly permits a shared arrangement.
- An active lease points to one immutable approved terms version.
- A charge schedule is derived from approved terms and retains the derivation
  version.
- Posted ledger entries are immutable and balanced under the defined subledger
  policy.
- AI recommendations are not domain facts until accepted through an authorized
  command.
