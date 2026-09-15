# ADR-0004: Use PostgreSQL with Application Authorization and RLS

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

KEYFORTA needs transactional records for organizations, leases, money,
documents, maintenance, and audit evidence. Organization isolation is a product
invariant. PostgreSQL row-level security can provide defense in depth, but it
cannot establish whether a request is authorized.

Financial postings, signed terms, document versions, approvals, and audit
evidence must not be silently overwritten. Azure-hosted workloads must connect
without long-lived database passwords.

## Decision

Use Azure Database for PostgreSQL Flexible Server as the system of record and
version-controlled SQL migrations as the authoritative physical schema.

- The API authenticates the caller, resolves KEYFORTA membership, and authorizes
  every command and query before persistence access.
- Every organization-owned table has a non-null `organization_id`.
- The application supplies trusted actor, organization, correlation, and support
  action context inside each database transaction. Client-supplied identifiers
  never establish this context.
- RLS policies default-deny access when trusted organization context is absent.
- The runtime role does not own protected tables, cannot bypass RLS, and has only
  the grants required by application repositories.
- Protected tables use `FORCE ROW LEVEL SECURITY` where appropriate so table
  ownership cannot accidentally bypass policy in tests or administration.
- A separate migration identity owns schema changes. Application startup never
  applies migrations automatically.
- Azure workloads authenticate with Microsoft Entra tokens issued to managed
  identities. Local development uses an ignored local credential.
- Repository interfaces isolate domain and application code from PostgreSQL and
  Azure identity SDKs.

Use explicit SQL migrations rather than relying on ORM-generated schema. A thin,
typed query layer may be introduced, but it does not own migrations, RLS,
constraints, triggers, or transaction boundaries.

## Data conventions

- Persist money as PostgreSQL `bigint` minor units plus an ISO 4217 currency
  code. Use `bigint` in TypeScript domain and persistence code.
- Serialize persisted money through public JSON contracts as decimal strings to
  avoid JavaScript number precision loss.
- Preserve the existing bounded numeric lease-preview contract until a versioned
  contract replaces it.
- Store exchange rates as explicit records containing source currency, target
  currency, integer numerator, integer denominator, source, observed timestamp,
  accepted timestamp, and accepting actor. Never calculate money with binary
  floating point.
- Store timestamps in UTC and contractual dates separately from instants.
- Use opaque globally unique identifiers and optimistic concurrency versions.
- Give every write an actor, correlation ID, application command, and timestamp.

## Immutability and transaction rules

- Posted ledger entries are append-only. Corrections create linked reversal and
  replacement entries in one transaction.
- Payment provider references and idempotency keys are uniquely constrained.
- Signed lease terms, document versions, numbered receipts, approvals, and audit
  events are immutable after posting.
- Mutable records retain a version and reject stale commands.
- Domain writes and outbox events commit in the same PostgreSQL transaction.
- Consumers record processed message IDs transactionally before acknowledging a
  Service Bus message.

## Azure resilience

- PostgreSQL uses a dedicated delegated subnet and private DNS in each stamp.
- Dev and test use a burstable, non-HA configuration with seven-day backup
  retention unless validation requires production parity.
- Production uses a General Purpose SKU, 35-day backup retention, zone-redundant
  HA when supported for the selected SKU in South Africa North, and
  geo-redundant backup when supported and approved by cost review.
- Production receives a resource-scoped `CanNotDelete` lock. VNet, subnet, and
  private DNS resources used by PostgreSQL HA are not locked in ways that block
  service failover or DNS updates.
- Restore exercises are required before importing real tenant data.

## Consequences

- Authorization remains testable without depending on RLS behavior.
- RLS limits blast radius if a repository query omits an organization predicate.
- Explicit migrations make security policy and immutable-finance constraints
  reviewable.
- Token acquisition and connection pooling must handle token expiry.
- Integration tests require a real PostgreSQL instance; in-memory substitutes
  are insufficient for isolation and migration gates.

## Validation

1. Migrations apply from empty and upgrade from the previous release.
2. Two synthetic organizations cannot read or mutate each other's records.
3. Requests without trusted transaction context see no protected rows.
4. The runtime role cannot disable RLS or modify posted financial records.
5. Duplicate payment commands produce one posting and one receipt.
6. Reversal preserves the original posting and creates balanced linked entries.
7. Backup restore and application reconnection meet the documented pilot target.

## References

- [PostgreSQL row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Private networking for PostgreSQL Flexible Server](https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-networking-private)
- [PostgreSQL Flexible Server business continuity](https://learn.microsoft.com/azure/postgresql/flexible-server/concepts-business-continuity)
