# KEYFORTA Backend Documentation

This documentation package is the backend implementation handoff for the KEYFORTA MVP. The current public and portal applications may continue using mock data while the backend is implemented separately.

## Start here

1. [`keyforta-backend-implementation-specification.md`](./keyforta-backend-implementation-specification.md) — overall implementation contract and release gates.
2. [`keyforta-context-map-and-ownership.md`](./keyforta-context-map-and-ownership.md) — bounded contexts, owners, boundaries, and prohibited dependencies.
3. [`keyforta-domain-contracts.md`](./keyforta-domain-contracts.md) — aggregates, commands, events, and invariants.
4. [`keyforta-production-data-model.md`](./keyforta-production-data-model.md) — PostgreSQL tables, keys, constraints, indexes, RLS, and migration rules.
5. [`keyforta-api-event-contract.md`](./keyforta-api-event-contract.md) — HTTP endpoints, schemas, events, webhooks, and errors.
6. [`keyforta-state-machines.md`](./keyforta-state-machines.md) — verification, application, lease, payment, maintenance, and document transitions.
7. [`keyforta-acceptance-test-traceability.md`](./keyforta-acceptance-test-traceability.md) — requirement-to-test matrix.
8. [`keyforta-legal-privacy-decision-register.md`](./keyforta-legal-privacy-decision-register.md) — DRC/legal/privacy policy decisions and approval gates.
9. [`adr/`](./adr/) — accepted and proposed architecture decisions.

10. [`database/`](./database/) — executable PostgreSQL schema, RLS, reference-data migrations, and backup/retention runbook.

## Implementation rule

Backend engineers may choose the programming language, framework, and Azure service implementation, but must preserve the domain invariants, authorization rules, data ownership, money handling, auditability, idempotency, and public contracts. A material divergence requires an ADR and synchronized document updates.

## Launch rule

Engineering can build the backend before every legal decision is approved. Commercial leasing, screening, automated payments, and jurisdiction-specific notices remain disabled or manual until the legal/privacy decision register contains the required approval evidence.
