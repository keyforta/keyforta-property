# KEYFORTA

KEYFORTA is a Kinshasa-first property discovery and rental-management platform.

## Repository structure

```text
apps/public-web/  Public website and static Sites build
apps/portal-web/   Authenticated tenant, landlord, manager, and technician portal
apps/admin-web/    Platform administration console
apps/api/           Planned modular-monolith backend boundary
apps/jobs/          Planned asynchronous worker boundary
packages/brand/    Shared KEYFORTA identity tokens and asset helpers
packages/contracts/Shared API schemas, commands, and events
packages/api-client/Shared typed API client boundary
packages/authorization/Shared role and permission vocabulary
docs/              Mock-to-API resource, role, and workflow contract
dist/              Generated public-web output consumed by Sites
.openai/        Sites hosting configuration
```

## Development

This repository uses pnpm workspaces. The public experience remains a dependency-light app while portal and admin surfaces are developed independently against shared contracts. `apps/public-web/src/mock-api.js` is the browser-local CRUD adapter and `docs/backend-integration-contract.md` is the contract to preserve when replacing it with HTTP APIs.

```bash
pnpm check
pnpm build
pnpm dev
```

The public deployment remains static until the production backend, authentication, live listings, verification workflows, payments, notifications, maintenance messaging, and finalized legal documents are connected.

The canonical domain model is documented in `docs/keyforta-domain-driven-design.md`. The backend implementation handoff is `docs/keyforta-backend-implementation-specification.md`, with companion context, domain, API/event, state-machine, data-model, acceptance, legal/privacy, and ADR documents under `docs/`. The machine-readable API contract is `docs/openapi.yaml`; the mock/API resource contract remains in `docs/backend-integration-contract.md`. These artifacts and the frontend apps must evolve together when backend implementation begins.
