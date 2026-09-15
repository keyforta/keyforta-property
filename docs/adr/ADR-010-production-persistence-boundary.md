# ADR-010: Production Persistence Boundary

**Status:** Accepted for MVP
**Date:** 2026-09-14
**Owners:** Technology/Architecture, Security, Finance

## Context

Keyforta needs reliable transactional handling for leases, occupancy, charges, payments, maintenance, authorization, documents, and audit history. It also needs storage for large files and infrastructure for asynchronous work. Treating every category as relational rows would be inefficient, while introducing multiple databases without a measured need would increase operational and consistency risk.

## Decision

Use a controlled polyglot persistence boundary:

1. Managed PostgreSQL is the authoritative system of record for all transactional domain data.
2. Private Azure Blob Storage, or an approved equivalent, stores document, photo, identity-evidence, and export bytes. PostgreSQL stores their metadata, hashes, versions, retention, relationships, and access state.
3. PostgreSQL transactional outbox/inbox tables and a background worker provide durable asynchronous propagation for the MVP. A managed broker may be added later without changing domain ownership.
4. Search and reporting are rebuildable projections. PostgreSQL search and read models are the initial implementation.
5. A cache may accelerate reads and rate limiting but is never authoritative.
6. No MongoDB, Cosmos DB, DynamoDB, Cassandra, or other NoSQL database is required or approved for the MVP.

## Consequences

- Financial, lease, authorization, audit, and lifecycle invariants remain protected by PostgreSQL transactions, foreign keys, constraints, and application policies.
- Binary storage can scale independently while retaining domain-controlled access and retention.
- The outbox makes external delivery retryable and replayable without placing provider calls inside domain transactions.
- Search, reports, and cache can be rebuilt or discarded without losing business truth.
- Any future specialized database requires an ADR with a measured workload, explicit ownership, consistency model, reconciliation, security, backup/recovery, cost, and retirement plan.

## Rejected alternatives

- **NoSQL as the primary database:** rejected because MVP workflows require relational integrity, financial correctness, effective-dated rules, cross-aggregate constraints, and auditable corrections.
- **Files in PostgreSQL:** rejected for binary-storage scale, delivery, and lifecycle reasons; metadata remains relational.
- **Provider or queue as system of record:** rejected because external systems are not controlled by the domain and may deliver duplicates, delays, or contradictory status.

## Required implementation evidence

- Reviewed PostgreSQL migrations and constraint tests.
- Tenant-isolation/RLS and authorization negative tests.
- Object upload scanning, hash verification, private access, versioning, and recovery tests.
- Outbox/inbox idempotency, retry, failure, and replay tests.
- Backup/restore and disaster-recovery evidence before production traffic.
