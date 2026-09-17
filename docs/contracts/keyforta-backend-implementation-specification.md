# KEYFORTA Backend Implementation Specification

**Status:** Production architecture and backend implementation baseline v2.1

**Audience:** Backend engineers, database engineers, QA, security reviewers, and product owners

**Applies to:** The first production backend for KEYFORTA's Kinshasa-first rental and property-operations platform

**Architecture:** Modular monolith first; asynchronous jobs and external integrations behind explicit adapters

This document turns the KEYFORTA domain model into an implementation contract. It is intentionally independent of the current browser mock. The mock may remain unchanged while the backend is implemented separately.

The detailed companion artifacts are:

- [`keyforta-context-map-and-ownership.md`](./keyforta-context-map-and-ownership.md)
- [`keyforta-domain-contracts.md`](./keyforta-domain-contracts.md)
- [`keyforta-api-event-contract.md`](./keyforta-api-event-contract.md)
- [`keyforta-state-machines.md`](./keyforta-state-machines.md)
- [`keyforta-production-data-model.md`](./keyforta-production-data-model.md)
- [`database/`](../database/) — executable PostgreSQL schema/security/seed migrations and backup-retention runbook
- [`keyforta-acceptance-test-traceability.md`](./keyforta-acceptance-test-traceability.md)
- [`keyforta-legal-privacy-decision-register.md`](./keyforta-legal-privacy-decision-register.md)
- [`adr/`](../adr/) — accepted and proposed architecture decision records

## 1. Authority and change control

The following documents form one contract:

1. `docs/contracts/keyforta-domain-driven-design.md` — domain language, contexts, aggregates, invariants, and workflows.
2. `docs/contracts/keyforta-backend-implementation-specification.md` — this document; implementation decisions, persistence, authorization, commands, events, and operational requirements.
3. `docs/contracts/backend-integration-contract.md` — compatibility mapping from the current mock to production API behavior.
4. `docs/openapi.yaml` — machine-readable HTTP surface. It must not contradict this document.

When a conflict is found, stop implementation of the affected behavior and resolve the conflict with a documented decision. A change to an invariant, aggregate boundary, role rule, financial behavior, public API, or event schema requires the affected documents to change in the same pull request.

This specification is ready for backend implementation when the implementation team accepts the explicit assumptions in Section 19. It does not claim that the backend, infrastructure, legal review, payment-provider account, or production operations already exist.

## 2. Product boundary and MVP assumptions

### 2.1 In scope

- Organizations that own or manage properties.
- Properties and rentable units.
- Landlord, tenant, manager, and independent maintenance-operator journeys.
- Public property discovery and unit-specific viewing or rental requests.
- Versioned applications and lease terms.
- Charges, payments, allocations, receipts, and reconciliation records.
- Maintenance requests, operator assignment, quotes, schedules, reports, and evidence.
- Private documents, conversations, notifications, audit history, and read models.
- Human-controlled AI assistance that is read-only or advisory.

### 2.2 Explicitly out of scope for the first backend slice

- Automatic applicant approval or automated legal decisions.
- AI-controlled changes to leases, payments, authorization, or verification status.
- Public access to private documents, maintenance evidence, or tenant information.
- Direct client updates to lifecycle status fields.
- A distributed microservice deployment.
- Treating a payment provider, object store, identity provider, or AI provider as a domain source of truth.

### 2.3 Locked architectural decisions

| Decision | Contract |
| --- | --- |
| Deployment shape | One modular monolith with separate asynchronous job processing where needed. |
| Module boundaries | Each domain module owns its aggregates, tables, repositories, command handlers, policies, and events. |
| Cross-module access | Use public application commands, queries, and published events. Do not read another module's tables directly. |
| Authentication | Validate an external identity-provider access token. The API remains the authorization boundary. |
| Tenant isolation | Every organization-owned record is scoped server-side to the authenticated organization membership. |
| Identifiers | Opaque UUID/ULID-style identifiers; provider identifiers remain in integration records. |
| Money | Integer minor units plus ISO-4217 currency. Never use floating-point arithmetic. |
| Time | Store UTC instants; retain an IANA time zone on each property and organization for local business rules. |
| Lifecycle changes | Use named commands with state-transition validation; do not accept arbitrary status patches. |
| Events | Write domain events to an outbox in the same database transaction as the aggregate change. |
| Retries | Commands and provider callbacks are idempotent. Consumers use inbox/deduplication records. |
| Corrections | Posted financial records are immutable; corrections use reversal and replacement entries. |
| Files | Store binaries in private object storage and domain metadata in the database. |
| System of record | PostgreSQL is authoritative for transactional business state. NoSQL is not required for the MVP. |
| Supporting storage | Private object storage holds binaries; an outbox/worker handles asynchronous propagation; projections are rebuildable. |
| Cache | Cache is optional and non-authoritative. A cache miss or cache loss must not lose or change business state. |
| Search | PostgreSQL search capabilities are the initial default. A dedicated search service requires measured need and an ADR. |

## 3. Module ownership

The backend should use these module names and ownership boundaries. Names may be adapted to the chosen language, but the ownership rules may not be weakened.

| Module | Owns | Does not own |
| --- | --- | --- |
| `identity-organization` | External identity link, party, profile, organization, membership, invitation, role assignment | Property ownership, lease rights, or job assignment |
| `party-relationship` | Effective-dated relationships and relationship-based eligibility | Authentication or arbitrary role grants |
| `property-inventory` | Property, unit, availability, pricing versions, publication | Lease terms or payment balances |
| `leasing-occupancy` | Viewing request, rental application, offer, lease, occupancy period, renewal, move-out | Ledger postings or payment-provider state |
| `billing-ledger` | Charge schedules, charges, ledger accounts, posted entries, reversals, adjustments | Provider settlement status |
| `payments-reconciliation` | Payment intent, received payment, allocation, refund, provider callback, reconciliation exception | Authoritative charge or ledger mutation outside its commands |
| `maintenance-inspection` | Service offer, maintenance request, assignment, access window, quote, report, evidence reference | Unrelated property records or unrestricted operator access |
| `documents-communication` | Document metadata/version, access grant, conversation, message, notification and delivery state | Public authorization decisions |
| `reporting` | Read models, dashboard projections, metric snapshots | Transactional writes or source-of-truth business state |
| `governance-audit` | Audit events, support access grants, policy/configuration history | Silent access or untracked mutations |
| `ai-automation` | Suggestions, summaries, classifications, citations, human-review tasks | Final authorization, approval, posting, or irreversible commands |
| `integrations` | Identity, payment, messaging, storage, verification, and AI adapters | Provider-specific models leaking into domain modules |

## 4. Aggregate catalog and command contract

An aggregate is the transactional consistency boundary. A command is the only supported way to change an aggregate. Every command must identify the actor, organization scope when applicable, target aggregate, correlation ID, idempotency key when retryable, and expected version when concurrency matters.

### 4.1 Identity and organization

#### `Organization`

- **Owns:** legal/display identity, default currency, default time zone, lifecycle status.
- **Commands:** `CreateOrganization`, `UpdateOrganization`, `SuspendOrganization`, `ReactivateOrganization`.
- **Rules:** suspended organizations cannot create new operational records; all mutations are audited; organization identifiers are never accepted as an unrestricted tenant selector.

#### `Membership`

- **Owns:** party membership, role set, effective interval, status, invitation provenance.
- **Commands:** `InviteManager`, `AcceptInvitation`, `ChangeMembershipRole`, `SuspendMembership`, `EndMembership`.
- **Rules:** invitation must be unexpired and unrevoked; role changes require an authorized landlord or platform administrator; effective intervals cannot create conflicting active primary roles.

### 4.2 Property and inventory

#### `Property`

- **Owns:** property identity, address, time zone, organization scope, verification and publication state.
- **Commands:** `CreateProperty`, `UpdateProperty`, `SubmitPropertyForVerification`, `PublishProperty`, `UnpublishProperty`, `ArchiveProperty`, `AssignManager`.
- **Rules:** a property belongs to one organization and contains units; publication requires required data; each property has at most one active assigned listing manager; only an active landlord may assign themselves or another eligible same-organization member; assignment is effective-dated and audited; archived properties cannot accept new applications.

#### `Unit`

- **Owns:** unit identity, property relationship, physical facts, availability, and effective-dated pricing.
- **Commands:** `CreateUnit`, `UpdateUnit`, `SetUnitPricing`, `PublishUnit`, `PauseUnit`, `MarkUnitOccupied`, `MarkUnitVacant`.
- **Rules:** label is unique within a property; only the property's active assigned manager may create, update, publish, pause, or withdraw its unit listings; ownership alone grants no listing authority; occupied units cannot be published as available; pricing history is retained; signed lease terms are not rewritten by later pricing changes.

### 4.3 Leasing and occupancy

#### `RentalApplication`

- **Owns:** one applicant's versioned submission for one unit, consent, evidence references, review decision, and decision reason.
- **Commands:** `CreateApplicationDraft`, `UpdateApplicationDraft`, `SubmitApplication`, `RequestApplicationChanges`, `ResubmitApplication`, `ApproveApplication`, `RejectApplication`, `WithdrawApplication`.
- **States:** `draft → submitted_for_manager_review → changes_requested → resubmitted → approved | rejected | withdrawn`.
- **Rules:** required fields, consent, and references must be complete before submission; only an authorized landlord/manager may decide; approval does not activate occupancy; every submitted version remains retrievable.

#### `Lease`

- **Owns:** parties, unit, term, rent/deposit/advance terms, discounts, due rules, signed-term version, and lifecycle.
- **Commands:** `CreateLeaseFromApplication`, `ProposeLeaseTerms`, `AcceptLease`, `SignLease`, `ActivateLease`, `RenewLease`, `TerminateLease`, `RecordMoveIn`, `RecordMoveOut`.
- **States:** `draft → offered → accepted → signed → active → ended | terminated`.
- **Rules:** no overlapping active lease or occupancy period for a unit; signed terms are immutable; activation requires required parties, acknowledgements/signatures, and availability; termination requires effective date and reason.

### 4.4 Billing and payments

#### `ChargeSchedule`

- **Owns:** recurring charge rules, due day, grace period, rent, fees, discounts, and effective intervals.
- **Commands:** `CreateChargeSchedule`, `GenerateCharges`, `AdjustCharge`, `WaiveCharge`, `CloseChargeSchedule`.
- **Rules:** generation is deterministic and idempotent for `(schedule, period)`; posted charges are not edited in place; adjustments create auditable replacement effects.

#### `Payment`

- **Owns:** payment intent/receipt, payer, provider reference, amount, status, allocations, refund/reversal state.
- **Commands:** `CreatePaymentIntent`, `RecordPayment`, `AllocatePayment`, `RefundPayment`, `ReversePayment`, `ReconcilePayment`.
- **Rules:** amount is positive; provider callbacks are verified and idempotent; allocation cannot exceed payment or charge balance; refunds and reversals are auditable; the provider is not the ledger.

### 4.5 Maintenance

#### `ServiceOffer`

- **Owns:** independent operator service categories, coverage, rates, availability, verification level, and publication state.
- **Commands:** `CreateServiceOffer`, `UpdateServiceOffer`, `PublishServiceOffer`, `PauseServiceOffer`, `WithdrawServiceOffer`.
- **Rules:** publication requires the required operator verification; discoverability does not grant property-data access; operator profile and service offer may be platform-scoped rather than landlord-organization-scoped.

#### `MaintenanceRequest`

- **Owns:** request, priority, assignment, access window, quote reference, schedule, report/evidence references, and lifecycle.
- **Commands:** `SubmitMaintenanceRequest`, `TriageRequest`, `AssignOperator`, `AcceptAssignment`, `ScheduleVisit`, `StartWork`, `CompleteWork`, `ConfirmCompletion`, `ReopenRequest`, `CancelRequest`.
- **States:** `submitted → triaged → assigned → accepted → scheduled → in_progress → completed → confirmed`; `completed` or `confirmed` may become `reopened` with a reason.
- **Rules:** requester must be related to the property/unit; assignment requires eligible operator and scope; access window is required before job data is exposed; completion requires the applicable report/evidence; every transition is audited.

#### `MaintenanceQuote`

- **Owns:** labor, materials, fees/taxes when modeled, total, validity, reviewer, and status.
- **Commands:** `SubmitQuote`, `RequestQuoteChanges`, `ApproveQuote`, `RejectQuote`, `WithdrawQuote`.
- **Rules:** total equals the sum of modeled components; only the assigned operator submits; only an authorized landlord/manager approves; expired or incompatible quotes cannot be approved.

### 4.6 Documents, communication, and governance

#### `DocumentRecord`

- **Owns:** document metadata, immutable versions, hash, related aggregate, retention, review state, and access grants.
- **Commands:** `RegisterDocument`, `UploadDocumentVersion`, `ReviewDocument`, `GrantDocumentAccess`, `RevokeDocumentAccess`, `AcknowledgeDocument`, `ArchiveDocument`.
- **Rules:** versions never overwrite one another; sensitive documents are never public; binary access uses short-lived signed references; retention rules prevent premature deletion; prohibited self-approval is rejected.

#### `Conversation`

- **Owns:** participants, subject reference, messages, delivery/read state, and lifecycle.
- **Commands:** `StartConversation`, `SendMessage`, `MarkMessageRead`, `CloseConversation`, `ReportConversation`.
- **Rules:** participants must be authorized for the subject; messages are attributed to authenticated parties; message and attachment access is checked independently.

#### `SupportAccessGrant`

- **Owns:** support actor, target organization/record, reason, scope, expiry, and visibility.
- **Commands:** `RequestSupportAccess`, `ApproveSupportAccess`, `RevokeSupportAccess`, `ExpireSupportAccess`.
- **Rules:** support access is explicit, least-privilege, time-bounded, visible to the customer, and fully audited.

## 5. State-transition rules

The backend must expose the current state but accept only named commands. A command that is invalid for the current state returns `STATE_CONFLICT` and does not partially mutate data.

| Aggregate | Valid transitions that must be enforced |
| --- | --- |
| Application | `draft → submitted_for_manager_review`; review may produce `changes_requested`, `approved`, or `rejected`; changes requested may be resubmitted; withdrawn is terminal for that version. |
| Lease | `draft → offered → accepted → signed → active`; active may end normally or terminate with reason; signed terms cannot be edited. |
| Unit | `draft → published ↔ paused`; occupancy changes are derived from lease/occupancy commands and cannot contradict an active lease. |
| Charge | `scheduled → generated → due → partially_paid → paid`; overdue is a derived state; posted corrections use reversal/replacement. |
| Payment | `initiated → pending → received → allocated → reconciled`; failed, refunded, and reversed paths are explicit and auditable. |
| Maintenance request | `submitted → triaged → assigned → accepted → scheduled → in_progress → completed → confirmed`; reopen requires reason and creates a new active work phase. |
| Document version | `uploaded → review_pending → approved | rejected → archived`; activation selects one exact version without deleting history. |

## 6. Authorization and data isolation

Authorization is evaluated in this order:

1. Authenticate the external subject.
2. Resolve the internal party and active memberships.
3. Resolve the organization scope from trusted membership and resource ownership.
4. Evaluate role permission.
5. Evaluate relationship and delegated scope.
6. Evaluate resource ownership and current state.
7. Evaluate effective dates and maintenance access window.
8. Record an audit event for mutations and privileged reads.

The client may request a context, but the server must reject any context that is not granted by the authenticated actor. A URL containing another organization's ID must return `NOT_FOUND` or `FORBIDDEN` according to the platform's information-disclosure policy, never another organization's data.

| Role | Production permission baseline |
| --- | --- |
| Tenant | Own applications, leases, charges, payments, documents, conversations, notifications, and unit-related maintenance requests. Cannot approve, post, reconcile, or access other tenants. |
| Landlord | Organization properties, units, applications, leases, charges, related payment views, maintenance, documents, manager invitations, and delegated scopes owned by the landlord. |
| Property manager | Only the effective delegated portfolio and participant records; can perform operational commands within that scope. |
| Independent operator | Own profile/service offers; assigned maintenance request, quote, report, evidence, and minimum necessary property data during the access window. |
| Platform administrator | Explicit cross-organization operations through elevated, reason-coded permissions and audit trails. No silent impersonation. |
| Support agent | Only through an active `SupportAccessGrant`; no permanent bypass role. |

Mandatory authorization tests include cross-organization IDs, broken-object references, revoked membership, expired invitation, expired operator access window, unpublished property, terminated lease, and a tenant attempting a manager command.

## 7. Persistence and consistency

Use a relational database with foreign keys, transactions, and explicit organization scoping.

### 7.1 Common columns

Organization-owned tables include:

```text
id, organization_id, created_at, updated_at, created_by, updated_by, version
```

Platform-scoped records such as an external identity or independent operator service offer may use `platform_scope` instead of a landlord organization. The scope must be explicit; never use a nullable organization column without a documented ownership rule.

### 7.2 Required constraints

- Unique unit label within a property.
- Unique active membership/role combinations according to the role policy.
- No overlapping active lease or occupancy period for a unit.
- No overlapping effective-dated pricing or relationship records where overlap is prohibited.
- Charge generation unique by schedule and billing period.
- Payment-provider reference unique within the provider namespace.
- Payment allocation cannot exceed payment amount or charge outstanding balance.
- Ledger entries are append-only after posting.
- Document version numbers are monotonic per document.
- Idempotency key is unique by actor, operation, and request scope for the retention period.
- Outbox event ID and inbox consumer/event ID are unique for deduplication.
- Audit records cannot be updated or deleted by ordinary application commands.

### 7.3 Transaction boundaries

One command transaction must include the aggregate mutation, audit event, and outbox records that describe the mutation. External provider calls must not be held open inside the database transaction. Provider results arrive through verified callbacks or a reconciliation job.

### 7.4 Required table families

```text
organizations, external_identities, parties, profiles, memberships, invitations,
relationships, properties, units, unit_pricing_versions,
viewing_requests, rental_applications, rental_application_versions,
leases, lease_term_versions, occupancy_periods,
charge_schedules, charges, ledger_accounts, ledger_entries,
payments, payment_allocations, refunds, reconciliation_batches,
service_offers, maintenance_requests, maintenance_assignments,
maintenance_access_windows, maintenance_quotes, maintenance_reports,
maintenance_evidence, documents, document_versions, document_access_grants,
conversations, messages, notifications, audit_events, support_access_grants,
outbox_events, inbox_messages, idempotency_records
```

### 7.5 Production storage and infrastructure boundary

The production system is intentionally polyglot at the infrastructure boundary, but not polyglot for transactional business truth:

| Concern | Production boundary | Authority and failure rule |
| --- | --- | --- |
| Transactional domain state | Managed PostgreSQL | The only authoritative store for organizations, parties, properties, units, applications, leases, occupancy, charges, ledger entries, payments, maintenance metadata, document metadata, authorization grants, and audit records. |
| Binary content | Private Azure Blob Storage or an equivalent private object store | The database stores the document identity, version, content hash, media type, size, storage key, retention policy, and access state. A storage key is never a public URL. |
| Asynchronous propagation | PostgreSQL transactional outbox plus worker; managed broker may be introduced later | The outbox is written in the same transaction as the domain mutation. Delivery is at-least-once, idempotent, observable, and replayable. A broker is not the source of truth. |
| Cache and rate limiting | Optional managed cache | Data may be evicted or lost. It must never be required to enforce correctness, authorization, payment balance, or lifecycle state. |
| Search | PostgreSQL full-text/vector search initially; dedicated index only after measured need | Search indexes are rebuildable projections. Search results never authorize access and never replace PostgreSQL reads for authoritative details. |
| Reporting | PostgreSQL read models initially; separate analytical store later if justified | Projections are eventually consistent, carry a generated-at timestamp, and can be rebuilt from source data/events. |
| Provider payloads | Integration tables in PostgreSQL plus policy-controlled raw payload retention | Provider responses are untrusted input. Domain state changes only through verified adapters and domain commands. |

The MVP must not introduce MongoDB, Cosmos DB, DynamoDB, Cassandra, or another NoSQL database merely for scale, convenience, or schema flexibility. A future NoSQL store is permitted only for a bounded, measurable workload with an accepted ADR covering ownership, consistency, failure behavior, migration, security, cost, and reconciliation. It may not replace PostgreSQL for financial, lease, authorization, audit, or lifecycle truth.

### 7.6 Production deployment topology

The target deployment is Azure-first and keeps the initial operational surface deliberately small:

```text
Public Site / Portal clients
          |
     HTTPS edge/WAF
          |
  API modular monolith ---- External identity provider
          |
    Managed PostgreSQL
      /       |       \
 private Blob  outbox   audit/metrics
  storage       |              |
          Background worker  Azure Monitor
                |
       Payment / messaging / verification adapters
```

Required topology rules:

- Production, staging, and development use separate resources, credentials, storage containers, and database instances or isolated databases according to the approved environment plan.
- Application and worker workloads use managed identities where supported; secrets are stored in Key Vault or the approved secret manager and never committed to source control or logged.
- PostgreSQL and object storage are private by default. Public access is limited to explicitly public property-discovery data and the public Site.
- The API and worker are independently deployable processes even when they share one codebase and one modular-monolith repository.
- External provider calls use short timeouts, bounded retries, circuit breaking where appropriate, and reconciliation jobs for uncertain outcomes.
- Database migrations run as a controlled release step and are backward-compatible with the previous application version during rollout.

### 7.7 Availability, backup, and disaster recovery

Before enabling production traffic, the owner must record approved targets in an ADR. Until approved, the backend must not claim an availability, RPO, or RTO guarantee.

The production baseline requires:

- automated encrypted PostgreSQL backups with point-in-time recovery;
- a documented retention period for backups and audit evidence;
- object-storage versioning, soft delete or an equivalent recovery control, and lifecycle rules;
- restore tests in a non-production environment at least quarterly and after material recovery changes;
- a recovery runbook covering database, object storage, secrets, identity configuration, outbox replay, and provider reconciliation;
- explicit treatment of duplicate messages and duplicate provider callbacks after recovery;
- monitoring for backup freshness, failed backups, storage health, outbox lag, worker failure, projection lag, and reconciliation exceptions.

The system must fail closed for authorization and fail safely for external side effects. An unavailable cache, search index, reporting projection, or notification provider must not corrupt leases, payments, ledger entries, or access grants.

### 7.8 Security and data-protection baseline

- Encrypt data in transit and at rest using managed platform controls.
- Apply least-privilege identities separately for API, worker, migration, support, and operational tasks.
- Classify personal, identity, financial, document, operational, and public data before production ingestion.
- Redact tokens, secrets, identity-document content, payment credentials, and unnecessary personal data from logs, traces, analytics, and error responses.
- Scan uploaded files for malware, verify MIME type and content hash, limit size, and quarantine failed uploads.
- Issue short-lived, scoped download references only after an authorization check; never expose storage credentials.
- Use dependency, container, secret, infrastructure, and API security scanning in CI/CD.
- Review privileged access, support access, membership changes, document access, payment actions, and policy changes through append-only audit records.
- Test tenant isolation with automated negative tests and database-level RLS tests where RLS is enabled.

### 7.9 Observability and operational readiness

Every request, command, event, job, webhook, and provider interaction must be traceable through a request ID and correlation ID. Production dashboards and alerts must cover:

- request latency, error rate, saturation, and availability;
- authentication failures and authorization denials;
- database connections, slow queries, locks, failed migrations, and storage growth;
- outbox age/lag, inbox failures, retry counts, dead-lettered work, and replay activity;
- payment callback failures, unmatched payments, reconciliation exceptions, and refund failures;
- document quarantine/failure rates and expired access grants;
- notification delivery failures and projection freshness.

Each alert must have an owner, severity, response target, runbook link, and a tested escalation path. Health endpoints must distinguish process health from dependency readiness and must not disclose secrets or personal data.

### 7.10 Production release gates

The architecture is implementation-ready, but the backend is not production-ready until all of the following evidence exists:

1. Reviewed migrations exist for the approved schema and pass clean-install and upgrade tests.
2. PostgreSQL constraints, RLS, application authorization, and cross-organization negative tests pass.
3. API and event contracts are validated against OpenAPI and executable contract tests.
4. Outbox, inbox, idempotency, optimistic concurrency, webhook replay, and provider reconciliation tests pass.
5. Backup restore, object recovery, secret rotation, and outbox replay have been exercised successfully.
6. Security scanning, dependency review, threat modeling, and privacy review have no unaccepted critical or high findings.
7. Legal/privacy decisions marked as launch-blocking are approved for each enabled jurisdiction and capability.
8. SLO, RPO, RTO, cost limits, on-call ownership, alert routing, and incident/runbook ownership are recorded.
9. Staging smoke tests pass with production-like configuration and no real personal or payment data.
10. A rollback or forward-fix plan exists for the application, migrations, provider configuration, and feature flags.

## 8. HTTP API contract

### 8.1 General rules

- Base path: `/api/v1`.
- Operations marked `x-keyforta-runtime: true` in `docs/openapi.yaml` are the
  named HTTP wire authority for the implemented runtime slice. Shared schemas
  and implemented Fastify routes must match that slice; unmarked operations are
  target contracts whose unresolved conflicts remain recorded in
  `docs/engineering/REQUIREMENTS_GAPS.md`.
- Public discovery routes do not require authentication and return only published, public-safe data.
- All authenticated routes require a validated bearer access token.
- Use JSON over HTTPS and ISO-8601 timestamps in UTC.
- Use opaque IDs; never expose sequential database keys.
- Use `If-Match` or an expected `version` for updates and return `VERSION_CONFLICT` on stale writes.
- Use `Idempotency-Key` for commands that can be retried or create financial/external effects.
- Use cursor pagination with stable ordering. Do not rely on offset pagination for changing collections.
- Return Problem Details-compatible errors using the error shape in Section 11.

### 8.2 Response envelopes

Single-resource response:

```json
{
  "data": {},
  "meta": { "requestId": "req_01..." },
  "auditEventId": "aud_01..."
}
```

Collection response:

```json
{
  "items": [],
  "meta": { "requestId": "req_01..." },
  "nextCursor": null,
  "total": 0
}
```

### 8.3 Required endpoint inventory

The implementation team must provide these routes or record an approved equivalent in an ADR.

| Context | Read/query routes | Commands |
| --- | --- | --- |
| Identity | `GET /me`, `GET /organizations`, `GET /memberships` | `POST /onboarding/landlords`, `POST /onboarding/maintenance-operators`, `POST /manager-invitations`, `POST /manager-invitations/{id}/accept`, membership suspension/role commands |
| Property | `GET /properties`, `GET /properties/{id}`, `GET /properties/{id}/units`, `GET /units/{id}` | Create/update/archive property; create/update/publish/pause unit; submit/approve property verification |
| Discovery | `GET /properties`, `GET /properties/{id}`, `GET /public/units/{id}` | `POST /viewing-requests`, `POST /public/units/{id}/rental-applications` when onboarding allows an authenticated applicant |
| Leasing | `GET /rental-applications`, `GET /rental-applications/{id}`, `GET /leases`, `GET /leases/{id}`, `GET /leases/{id}/occupancy` | Application submit/changes/resubmit/approve/reject/withdraw; lease offer/accept/sign/activate/renew/terminate/move-in/move-out |
| Billing | `GET /leases/{id}/charges`, `GET /charges/{id}`, `GET /leases/{id}/ledger` | Create/close schedule; generate charges; adjust/waive charge; reverse/replacement entry |
| Payments | `GET /payments`, `GET /payments/{id}`, `GET /reconciliation-batches` | Payment intent, record/allocate/refund/reverse/reconcile payment; close reconciliation batch |
| Maintenance | `GET /maintenance-requests`, `GET /maintenance-requests/{id}`, `GET /service-offers`, `GET /maintenance-requests/{id}/quotes` | Submit/triage/assign/accept/schedule/start/complete/confirm/reopen/cancel; quote submit/approve/reject; report/evidence commands |
| Documents | `GET /documents`, `GET /documents/{id}`, `GET /documents/{id}/versions` | Register document; upload version; review; grant/revoke access; acknowledge/archive |
| Communication | `GET /conversations`, `GET /conversations/{id}/messages`, `GET /notifications` | Start conversation; send message; mark read; close conversation; mark notification read |
| Reporting | `GET /landlord/dashboard`, `GET /reports/occupancy`, `GET /reports/collections`, `GET /reports/maintenance` | No direct transactional writes; projection rebuild is an administrative job |
| Governance | `GET /audit-events`, `GET /support-access-grants` | Request/approve/revoke support access; audit export according to policy |

Lifecycle endpoints should use explicit command paths such as `POST /leases/{id}/activate` and `POST /maintenance-requests/{id}/assign`. A generic `PATCH status` endpoint is not allowed.

## 9. Command processing protocol

The command pipeline is:

```text
HTTP request
  → token validation
  → request/schema validation
  → organization and relationship authorization
  → idempotency lookup
  → aggregate load and expected-version check
  → domain command and invariant checks
  → transaction: aggregate + audit + outbox
  → response
```

For a repeated idempotency key, return the original successful response without executing the command again. If the same key is reused with a different request body, return `IDEMPOTENCY_KEY_REUSED`.

For a stale version, return `VERSION_CONFLICT` with the current version and request ID. Do not silently merge changes.

## 10. Event and integration contract

### 10.1 Event envelope

Every event is immutable and contains:

```json
{
  "eventId": "evt_01...",
  "eventType": "LeaseActivated",
  "schemaVersion": 1,
  "occurredAt": "2026-09-14T00:00:00Z",
  "organizationId": "org_01...",
  "aggregateType": "Lease",
  "aggregateId": "lease_01...",
  "actor": { "partyId": "party_01...", "type": "user" },
  "correlationId": "cor_01...",
  "causationId": "cmd_01...",
  "payload": {}
}
```

### 10.2 Minimum event catalog

- Identity: `OrganizationCreated`, `MembershipInvited`, `MembershipAccepted`, `MembershipSuspended`, `ProfileVerified`.
- Property: `PropertyCreated`, `PropertySubmittedForVerification`, `PropertyPublished`, `PropertyArchived`, `UnitCreated`, `UnitAvailabilityChanged`, `UnitPricingChanged`, `ManagerAssigned`.
- Leasing: `ViewingRequested`, `RentalApplicationSubmitted`, `ApplicationChangesRequested`, `ApplicationApproved`, `ApplicationRejected`, `LeaseOffered`, `LeaseSigned`, `LeaseActivated`, `LeaseRenewed`, `LeaseEnded`, `OccupancyChanged`.
- Finance: `ChargeScheduleCreated`, `ChargeGenerated`, `ChargeAdjusted`, `PaymentIntentCreated`, `PaymentRecorded`, `PaymentAllocated`, `PaymentRefunded`, `PaymentReversed`, `PaymentReconciled`, `LedgerEntryPosted`, `LedgerEntryReversed`.
- Maintenance: `ServiceOfferPublished`, `MaintenanceRequestSubmitted`, `MaintenanceRequestTriaged`, `OperatorAssigned`, `AssignmentAccepted`, `AccessWindowOpened`, `VisitScheduled`, `WorkStarted`, `WorkCompleted`, `EvidenceSubmitted`, `CompletionConfirmed`, `MaintenanceReopened`, `QuoteSubmitted`, `QuoteApproved`, `QuoteRejected`.
- Documents/communication: `DocumentRegistered`, `DocumentVersionUploaded`, `DocumentReviewed`, `DocumentAccessGranted`, `MessageSent`, `NotificationQueued`, `NotificationDelivered`.

Consumers must tolerate duplicate delivery, preserve event version compatibility, and move poison messages to a controlled dead-letter state with operator visibility.

### 10.3 External integrations

- Verify identity-provider issuer, audience, signature, expiry, and subject before resolving a party.
- Store external provider references separately from domain IDs.
- Verify payment webhook signature, timestamp/replay protection, event identity, and provider status before recording effects.
- Use private object-storage upload/download URLs with short expiry and content hash verification.
- Treat email/SMS delivery as asynchronous and retryable; record provider message IDs and final delivery state.
- Use an anti-corruption layer for screening, verification, maps, and AI providers.

## 11. Error contract

Return an HTTP status appropriate to the failure and this stable body:

```json
{
  "type": "https://api.keyforta.com/problems/forbidden",
  "title": "Forbidden",
  "status": 403,
  "code": "FORBIDDEN",
  "detail": "You are not authorized to perform this action.",
  "traceId": "req_01...",
  "details": {}
}
```

Minimum stable codes:

| Code | Meaning |
| --- | --- |
| `VALIDATION_ERROR` | Request fields or business input are invalid. |
| `UNAUTHENTICATED` | Token is missing, invalid, expired, or from the wrong audience. |
| `FORBIDDEN` | Actor is authenticated but lacks permission or scope. |
| `NOT_FOUND` | Resource does not exist or is intentionally hidden by policy. |
| `STATE_CONFLICT` | Command is invalid for the current aggregate state. |
| `VERSION_CONFLICT` | Optimistic-concurrency version is stale. |
| `IDEMPOTENCY_REPLAY` | Same command key already completed; response should identify the original result. |
| `IDEMPOTENCY_KEY_REUSED` | Same key was submitted with a different payload. |
| `PAYMENT_PROVIDER_ERROR` | Provider operation failed or requires reconciliation. |
| `DOCUMENT_ACCESS_DENIED` | Document or evidence grant is absent, revoked, or expired. |
| `RATE_LIMITED` | Caller exceeded the applicable limit. |
| `DEPENDENCY_UNAVAILABLE` | A required external or internal dependency is unavailable. |

Never return stack traces, provider secrets, access tokens, or private record details in an error response.

## 12. Audit, privacy, and retention

Audit every mutation and every privileged read with actor, organization, action, target type/ID, outcome, timestamp, correlation ID, source, and reason where applicable. Audit records are append-only.

Sensitive data must be minimized in list responses, logs, analytics, and operator views. Access to applications, identity documents, payment details, messages, and maintenance evidence is relationship-based and purpose-limited.

Retention periods, deletion/anonymization behavior, legal holds, consent text, screening rules, and payment/refund rules must be confirmed by product ownership and qualified counsel for each operating jurisdiction. Until confirmed, the backend must preserve history, avoid irreversible deletion, and mark the policy as configurable rather than inventing a legal rule.

## 13. Reporting and AI boundaries

Reporting projections consume events and may be eventually consistent. A dashboard must display a generated-at timestamp and must not write transactional state.

AI features may:

- summarize authorized records;
- classify maintenance text;
- draft messages;
- identify missing evidence;
- answer questions with source references.

AI features may not:

- expand authorization;
- approve/reject an application without an authorized human command;
- sign, activate, or terminate a lease;
- post, allocate, refund, or reverse money;
- grant document or support access;
- mark a provider or property verified conclusively.

Every AI result must record model/provider, prompt or policy version, source record IDs, generated time, confidence where available, and human action if the result is used.

## 14. Testing and verification gates

### 14.1 Domain tests

- Value-object validation and money arithmetic.
- Aggregate invariants and every valid/invalid state transition.
- Effective-date overlap rules.
- No overlapping leases or occupancy periods.
- Deterministic charge generation.
- Immutable ledger reversal/replacement behavior.
- Payment allocation limits and provider callback idempotency.
- Quote totals and expiry.
- Maintenance assignment and access-window expiry.
- Document version activation and retention restrictions.

### 14.2 Authorization tests

- Every role/resource/action combination in the matrix.
- Cross-organization and broken-object references.
- Revoked membership and expired delegation.
- Tenant attempting landlord/manager commands.
- Operator attempting unrelated property access.
- Expired or revoked document/access grants.
- Support access outside its scope or expiry.

### 14.3 API and integration tests

- OpenAPI request/response compatibility.
- Authentication issuer/audience/expiry validation.
- Idempotency replay and key-reuse behavior.
- Optimistic-concurrency conflicts.
- Transactional aggregate/audit/outbox behavior.
- Inbox duplicate delivery.
- Signed webhook verification and replay rejection.
- Private upload/download authorization.
- Provider failure and reconciliation paths.

### 14.4 Operational checks

- Structured logs contain request, correlation, actor, organization, and outcome IDs without sensitive payloads.
- Metrics exist for command failures, authorization denials, outbox lag, inbox failures, payment reconciliation exceptions, notification delivery, and projection lag.
- Health checks distinguish process health from database, queue, storage, identity, and payment dependency health.
- Backup/restore and migration rollback procedures are documented before production release.

## 15. Implementation sequence

1. Establish API shell, configuration, migrations, structured logging, error handling, and correlation IDs.
2. Implement identity, party, organization, memberships, invitations, and authorization policy.
3. Implement property, unit, pricing, verification, publication, and manager delegation.
4. Implement viewing requests and versioned rental applications.
5. Implement lease terms, signatures/acknowledgements, activation, occupancy, renewal, and move-out.
6. Implement charge schedules, immutable ledger, payment intents, allocations, refunds, and reconciliation.
7. Implement service offers, maintenance lifecycle, assignments, access windows, quotes, reports, and evidence.
8. Implement documents, private storage references, conversations, notifications, and audit search.
9. Build reporting projections and landlord dashboard queries.
10. Add AI assistance behind authorization and human-review gates.
11. Add provider integrations, resilience, deployment, backup/restore, security review, and production readiness validation.

Each step must preserve the mock/API field mapping and add domain, authorization, persistence, API, event, and test evidence before it is considered complete.

## 16. Backend feature definition of done

A backend feature is complete only when:

1. The owning bounded context and aggregate are named.
2. Commands, invariants, states, and events are documented.
3. Authorization covers identity, organization, role, relationship, resource, action, and effective time.
4. Database constraints protect the invariant.
5. Request/response schemas and error behavior are documented in OpenAPI.
6. Retryable commands are idempotent and concurrency-safe.
7. Audit and outbox records are written transactionally.
8. Read models do not become a second source of truth.
9. Domain, authorization, API, integration, and failure tests exist.
10. Observability, retention, support, and operational behavior are defined.

## 17. Handoff checklist

The backend team can begin implementation when the following are checked:

- [ ] Product owner accepts the MVP scope and role matrix.
- [ ] Architecture owner accepts the modular-monolith module boundaries.
- [ ] Backend owner accepts the aggregate and state-transition catalog.
- [ ] Security owner accepts token validation, tenant isolation, authorization, audit, and support-access rules.
- [ ] Finance owner accepts money, charge, payment, allocation, refund, reconciliation, and ledger rules.
- [ ] Product/legal owners identify jurisdiction-specific policies that must be configurable.
- [ ] Identity, payment, messaging, storage, and verification providers are selected or isolated behind adapters.
- [ ] OpenAPI schemas are kept synchronized with this specification.
- [ ] Initial acceptance tests are converted into executable test cases.
- [ ] Migration, backup, restore, logging, metrics, and alerting ownership is assigned.

## 18. Explicit non-blocking decisions

These decisions may remain configurable without blocking the modular backend foundation, provided they do not change the domain invariants:

- Exact backend programming language and web framework.
- Exact relational database vendor.
- UUID versus ULID implementation, provided IDs remain opaque.
- Payment provider and notification provider.
- Queue/worker technology.
- Exact dashboard metric formulas after the underlying event definitions are preserved.
- Whether a future extraction begins with payments, documents/notifications, or reporting.

Record the selected option in an ADR before it affects a public contract or operational behavior.

## 19. Assumptions requiring explicit confirmation

These are the remaining product/legal/provider decisions. They are not reasons to delay implementing the domain foundation, but the affected behavior must remain configurable until confirmed:

| Decision | Temporary implementation rule |
| --- | --- |
| Operating jurisdictions | Store organization/property jurisdiction and policy version; do not hard-code legal conclusions. |
| Deposit and advance-rent limits | Store configured policy and validate only after an approved jurisdiction policy is selected. |
| Screening/vendor verification rules | Treat verification as a workflow with evidence and review status; do not auto-approve. |
| Payment settlement and refund policy | Keep provider state separate from ledger state and route exceptions to reconciliation. |
| Document retention and deletion | Preserve history and support legal holds until retention rules are approved. |
| Identity onboarding | Require a verified external identity before protected commands; allow product-specific onboarding completion state. |
| Currency and exchange | Keep each monetary value in its stated currency; do not perform exchange without an explicit approved policy. |

## 20. Documentation readiness matrix

| Production-readiness requirement | Artifact | Documentation status |
| --- | --- | --- |
| Explicit bounded-context map and ownership | Context map and ownership | Complete |
| Aggregates, commands, events, and invariants for each context | Domain contracts | Complete for transactional contexts; reporting/AI/integration boundaries are intentionally projection/adaptor contracts |
| Complete endpoint, event, and error contracts | API/event contract | Complete for MVP inventory, schemas, event envelopes/payload requirements, and stable errors |
| Detailed lease, payment, maintenance, and verification state transitions | State machines | Complete |
| Acceptance-test traceability | Acceptance-test matrix | Complete |
| Legal/privacy/DRC decisions | Legal/privacy register | Engineering policies documented; legal blocker decisions require qualified DRC counsel approval |
| ADRs for architectural choices | `docs/adr/` | Accepted decisions recorded; remaining choices explicitly registered as proposed ADRs |
| Production data model | Production data model and `database/` migrations | Complete logical/physical model, executable schema/RLS/seed migrations, and backup-retention runbook; execution evidence remains a release gate |
| Production storage boundary | This specification, Section 7.5 | PostgreSQL system of record; private object storage, outbox/worker, and rebuildable projections; no NoSQL requirement for MVP |
| Deployment and recovery baseline | This specification, Sections 7.6–7.10 | Complete baseline; concrete Azure resource names, region, SLO, RPO, RTO, cost limits, and owners require approved implementation ADRs |

## 21. Production readiness interpretation

This document is production-ready as an architecture and backend handoff when the team treats the boundaries and release gates above as mandatory. It is not a declaration that production infrastructure, migrations, provider accounts, legal approvals, monitoring, or operational ownership already exist.

The minimum approved persistence architecture is:

> PostgreSQL system of record + private object storage for binaries + transactional outbox/worker for asynchronous work + rebuildable projections. No NoSQL database is required for the MVP.

The backend team may select concrete Azure services and implementation technologies, but must preserve these properties:

- transactional business truth remains in PostgreSQL;
- files are private, versioned, hash-verified, scanned, and accessed through scoped short-lived references;
- asynchronous work is durable, retryable, idempotent, observable, and replayable;
- caches, search indexes, and reports are disposable projections or accelerators;
- financial, lease, authorization, audit, and lifecycle data cannot depend on a cache, search index, provider, or AI system;
- every production capability has tested security, recovery, observability, and legal/privacy gates.

## 22. Final implementation decision

The documented KEYFORTA design is approved as the backend implementation baseline. Backend implementation may proceed independently from the current mock frontend. Legal-blocked capabilities must remain disabled or manual until the decision register has signed approval evidence. Any material divergence requires an ADR and synchronized contract updates.

No application code change is required to adopt this document.
