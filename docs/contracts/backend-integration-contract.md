# KEYFORTA mock-to-API contract

> **Normative handoff:** Use [`keyforta-backend-implementation-specification.md`](./keyforta-backend-implementation-specification.md) for aggregate ownership, state transitions, persistence constraints, authorization, command processing, events, and production controls. This document preserves the current mock-to-API mapping.

The public site is currently a static, bilingual mock. Every interaction is synthetic and stored only in the browser. The backend can replace the mock adapter without changing the primary user journeys. The mock is not a source of truth for authorization, financial state, lifecycle transitions, or audit history.

## Roles and access

| Role | Mock route | Production scope |
| --- | --- | --- |
| Tenant | `#demo/tenant` | Own leases, payments, documents, conversations, and maintenance requests |
| Landlord | `#demo/landlord` | Owned properties, units, rental records, and related maintenance |
| Property manager | `#demo/manager` | Authorized portfolio, participants, verification, and work orders |
| Independent maintenance operator | `#demo/operator` | Own profile plus assigned work orders and time-bounded property-access data |

### Onboarding and access rules

- **Landlord:** may self-register, create an organization/profile, add properties and units, and invite property managers.
- **Tenant:** may browse public units, but must submit a complete rental application for a specific unit. The application is versioned and remains `submitted_for_manager_review` until a manager approves, rejects, or requests changes.
- **Property manager:** cannot self-register into an organization. A landlord creates an invitation; the manager accepts it and then receives only the landlord's delegated organization scope.
- **Independent maintenance operator:** may self-register with service categories, coverage, contact details, and verification evidence. The operator may offer services across any property, but access to property details and work records is granted only for an assigned job and active access window.

Recommended commands: `POST /auth/signup/landlords`, `POST /auth/signup/maintenance-operators`, `POST /manager-invitations`, `POST /manager-invitations/{id}/accept`, `POST /units/{id}/rental-applications`, `POST /rental-applications/{id}/approve`, `/reject`, `/request-changes`, and `POST /service-offers`.

## Resource mapping

| Mock capability | Suggested API resource | Main operations |
| --- | --- | --- |
| Property discovery | `/properties` | list, filter, detail |
| Viewing request | `/viewing-requests` | create, list, reschedule, cancel |
| Access request | `/access-requests` | create, acknowledge |
| Maintenance lifecycle | `/maintenance-requests` | create, triage, assign, accept, schedule, start, complete, reopen |
| Quotes | `/maintenance-quotes` | create, submit, approve, reject |
| Field evidence | `/maintenance-reports` and `/maintenance-evidence` | create, upload, finalize |
| Payments and receipts | `/payments` and `/receipts` | list, record, reconcile |
| Notifications | `/notifications` | list, mark read |

## Common API conventions

- Base path: `/api/v1`
- Public discovery routes may be anonymous and return only published, public-safe data. Protected requests carry `Authorization: Bearer <access-token>`; organization context and resource scope are resolved server-side from the authenticated identity and active relationships.
- IDs are opaque strings. Timestamps are ISO-8601 UTC. Money is represented as integer minor units plus `currency` in production; the mock displays convenient dollar values.
- List responses use `{ items, total, nextCursor }`. Support `limit`, `cursor`, `sort`, and resource-specific filters.
- Single-resource responses use `{ data }`; mutations return the changed record and an `auditEventId`.
- Use optimistic concurrency with `If-Match: <version>` or a `version` field. Return `409 VERSION_CONFLICT` when stale. Lifecycle changes must use named command endpoints rather than arbitrary status patches.

## CRUD contract

| Operation | HTTP | Response | Required behavior |
| --- | --- | --- | --- |
| Create | `POST /resources` | `201 { data, auditEventId }` | Validate required fields, relationships, organization, and actor permission. |
| Read one | `GET /resources/{id}` | `200 { data }` | Apply object-level authorization; never rely on client filtering. |
| Read many | `GET /resources?cursor=&limit=` | `200 { items, total, nextCursor }` | Return stable ordering and filter only authorized records. |
| Update | `PATCH /resources/{id}` | `200 { data, auditEventId }` | Accept partial changes, validate state transitions, and increment `version`. |
| Delete/archive | `DELETE /resources/{id}` | `204` or `200 { data }` | Prefer soft delete/archive for leases, payments, evidence, and audit-linked records. |

## Minimum resource fields

All resources include `id`, `organizationId`, `createdAt`, `updatedAt`, and `version` in production. Relationship IDs must be validated against the same organization.

| Resource | Required business fields |
| --- | --- |
| Profile | role, displayName, email, phone, verificationStatus, skills, serviceArea, availability |
| Property | name, address, city, ownerId, managerId, verificationStatus |
| Unit | propertyId, label, type, bedrooms, bathrooms, monthlyRent, availabilityStatus |
| Lease | unitId, tenantId, coTenantIds, guarantorId, status, dates, rent, deposit, advance rent, discount, due day, grace period, late fee, versioned terms |
| Charge | leaseId, type, amount, currency, dueDate, status |
| Payment | leaseId, amount, currency, type, method, status, reference, paidAt |
| Viewing request | propertyId, requesterId, requestedAt, scheduledAt, status, notes |
| Maintenance request | propertyId, unitId, requesterId, assignedOperatorId, title, description, category, priority, status, accessWindow |
| Maintenance quote | maintenanceRequestId, operatorId, laborAmount, materialsAmount, amount, currency, validUntil, status, reviewedBy |
| Maintenance report | maintenanceRequestId, operatorId, arrivalAt, startedAt, completedAt, workPerformed, materials, totalCost, status, customerConfirmation |
| Document | ownerId, relatedType, relatedId, type, storageKey, status, version, reviewer, review timestamp |
| Message | conversationId, senderId, recipientId, body, readAt |
| Notification | recipientId, type, title, body, readAt |

## Profile authorization matrix

`CRUD` means create, read, update, and delete/archive only within the stated relationship. `R` means read. `—` means no access.

| Resource | Tenant | Landlord | Property manager | Independent operator |
| --- | --- | --- | --- | --- |
| Profiles | Own CRUD | Own CRUD | Assigned CRUD | Own CRUD |
| Properties / units | Related R | Owned CRUD | Assigned CRUD | Assigned R |
| Leases / charges | Own R | Owned R | Assigned CRUD | Assigned R |
| Payments | Own CRUD | Owned R | Assigned CRUD | Own R only |
| Viewing requests | Own CRUD | Owned R | Assigned CRUD | Assigned R |
| Maintenance requests | Own CRUD | Owned CRUD | Assigned CRUD | Assigned CRUD |
| Quotes / reports | Related R | Owned R | Assigned CRUD | Own CRUD |
| Documents | Own/related R | Owned CRUD | Assigned CRUD | Own CRUD |
| Messages | Related CRUD | Related CRUD | Assigned CRUD | Assigned CRUD |
| Notifications | Own R | Own R | Own R | Own R |
| Audit events | — | — | Authorized R | Own action history R |

## Command endpoints

Use commands for lifecycle changes instead of allowing arbitrary status patches:

`POST /maintenance-requests/{id}/triage`, `/assign`, `/accept`, `/schedule`, `/start`, `/complete`, `/confirm`, `/reopen`

`POST /maintenance-requests/{id}/quotes`, `/quotes/{id}/approve`, `/quotes/{id}/reject`

`POST /maintenance-requests/{id}/reports`, `/reports/{id}/evidence`

Commands must be idempotent with an optional `Idempotency-Key`, validate the current state, and create an audit event in the same transaction.

## Errors

Return `{ error: { code, message, details, traceId } }` with these stable codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `STATE_CONFLICT` (409), `VERSION_CONFLICT` (409), `IDEMPOTENCY_REPLAY` (409), and `RATE_LIMITED` (429).

## Mock write events

The browser currently records workflow actions under `kf-workflow-events` with `{ action, role, source, createdAt }`. Replace the local `save()` call with authenticated API requests while preserving these action names:

- `request-maintenance`
- `message-manager`
- `review-maintenance`
- `invite-manager`
- `assign-work-order`
- `request-evidence`
- `accept-job`
- `submit-quote`
- `start-report`

## Maintenance state machine

`submitted → triaged → assigned → accepted → scheduled → in_progress → completed → confirmed`

The tenant may `reopen` a completed request. Every transition should record actor, timestamp, reason, and audit metadata. Operators must never receive unrestricted portfolio access; authorization should be evaluated server-side for every object and action.

## Production replacement checklist

1. Replace synthetic arrays with API query hooks or a typed client.
2. Replace browser-local form persistence with authenticated commands.
3. Enforce tenant-aware authorization and time-bounded operator access on the server.
4. Add private evidence storage and signed upload/download URLs.
5. Keep the mock notice and bilingual labels until real services are connected and legal text is finalized.
