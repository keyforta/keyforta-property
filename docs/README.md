# KEYFORTA Documentation

Use this page to find the controlling source for a decision or behavior. A
supporting summary never overrides its linked authority.

## Authority map

| Question | Controlling source | Supporting sources |
| --- | --- | --- |
| Approved product scope and outcomes | [`product/PRD.md`](./product/PRD.md) | [`product/README.md`](./product/README.md), role use cases, user-flow diagrams |
| Aggregates, invariants, commands, and events | [`keyforta-domain-contracts.md`](./keyforta-domain-contracts.md) | Domain-driven design and architecture views |
| Lifecycle transitions and guards | [`keyforta-state-machines.md`](./keyforta-state-machines.md) | Product journeys and implementation handoff |
| HTTP wire contract | [`openapi.yaml`](./openapi.yaml), subject to recorded gaps | API/event contract and backend integration guidance |
| Target relational design | [`keyforta-production-data-model.md`](./keyforta-production-data-model.md) and reference SQL under [`database/`](./database/) | [`architecture/DATA_MODEL.md`](./architecture/DATA_MODEL.md) |
| Executable database history | [`infra/postgres/migrations`](../infra/postgres/migrations/) and [`ADR-013`](./adr/ADR-013-operational-migration-lineage.md) | Target model and migration-lineage diagram |
| Accepted architecture decisions | [`adr/`](./adr/) | [`architecture/`](./architecture/) and its [candidate/history index](./architecture/adr/README.md) |
| Implemented behavior | Source, tests, manifests, migrations, Bicep, and workflows at the reviewed SHA | Dated status summaries and diagrams |
| Live environment state | SHA-bound deployment evidence and authorized Azure inspection | Repository-defined Bicep topology |
| Unresolved conflicts | [`engineering/REQUIREMENTS_GAPS.md`](./engineering/REQUIREMENTS_GAPS.md) | Documents containing the conflicting statements |

## Start here

1. [`keyforta-backend-implementation-specification.md`](./keyforta-backend-implementation-specification.md) — overall implementation contract and release gates.
2. [`keyforta-context-map-and-ownership.md`](./keyforta-context-map-and-ownership.md) — bounded contexts, owners, boundaries, and prohibited dependencies.
3. [`keyforta-domain-contracts.md`](./keyforta-domain-contracts.md) — aggregates, commands, events, and invariants.
4. [`keyforta-production-data-model.md`](./keyforta-production-data-model.md) — PostgreSQL tables, keys, constraints, indexes, RLS, and migration rules.
5. [`keyforta-api-event-contract.md`](./keyforta-api-event-contract.md) — HTTP endpoints, schemas, events, webhooks, and errors.
6. [`keyforta-state-machines.md`](./keyforta-state-machines.md) — verification, application, lease, payment, maintenance, and document transitions.
7. [`keyforta-acceptance-test-traceability.md`](./keyforta-acceptance-test-traceability.md) — requirement-to-test matrix.
8. [`keyforta-legal-privacy-decision-register.md`](./keyforta-legal-privacy-decision-register.md) — DRC/legal/privacy policy decisions and approval gates.
9. [`adr/`](./adr/) — authoritative accepted and proposed architecture decisions.
10. [`database/`](./database/) — normative target PostgreSQL reference schema, RLS, reference data, and backup/retention guidance; executable history is under `infra/postgres/migrations`.
11. [`product/README.md`](./product/README.md) — product authority, journeys, policy examples, plans, and historical vision.
12. [`architecture/`](./architecture/) — supporting system, security, integration, and Azure design detail.
13. [`operations/README.md`](./operations/README.md) — runbooks, release checks, proposed service objectives, and Azure bootstrap guidance.
14. [`ai/`](./ai/) — AI system card, tool policy, and evaluation plan.
15. [`DIAGRAMS.md`](./DIAGRAMS.md) — Mermaid diagram catalog, ownership, authority, and review triggers.

When supporting material conflicts with the numbered implementation contracts,
`openapi.yaml`, `database/`, or `adr/`, the authoritative source controls and the
conflict must remain in `engineering/REQUIREMENTS_GAPS.md` until approved.

## Implementation rule

Backend engineers may choose the programming language, framework, and Azure service implementation, but must preserve the domain invariants, authorization rules, data ownership, money handling, auditability, idempotency, and public contracts. A material divergence requires an ADR and synchronized document updates.

## Launch rule

Engineering can build the backend before every legal decision is approved. Commercial leasing, screening, automated payments, and jurisdiction-specific notices remain disabled or manual until the legal/privacy decision register contains the required approval evidence.
