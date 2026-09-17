# KEYFORTA

KEYFORTA is a Kinshasa-first property discovery and rental-management platform.

## Repository structure

```text
apps/public-web/  Public Next.js application
apps/portal-web/   Authenticated tenant, landlord, manager, and maintenance operator portal
apps/admin-web/    Platform administration console
apps/api/           Current modular-monolith Fastify API
apps/mcp-server/   Standalone synthetic MCP boundary with a separate gated deployment path
apps/jobs/          Asynchronous worker boundary without a configured runtime
packages/brand/    Shared KEYFORTA identity tokens and asset helpers
packages/contracts/Shared API schemas, commands, and events
packages/types/     Dependency-free shared TypeScript declarations
packages/ui/        Shared application UI exports
packages/ui-core/   Isolated widget bridge
packages/build-utils/ Deterministic standalone widget build configuration
packages/api-client/Shared typed API client boundary
packages/authorization/Shared role and permission vocabulary
docs/              Authority map, product requirements, contracts, decisions, and operations
tools/system/health/Synthetic MCP health tool and isolated widget
```

## Development

This repository uses pnpm workspaces. The public application uses Next.js; the
portal and admin applications use Vite. All three
use React 19 and Fluent UI React v9 while remaining independently deployable
against shared contracts. Browser integrations call the public Fastify API
directly; production CORS permits only the deployed web origin.

```bash
pnpm check
pnpm build
pnpm dev
pnpm build:widgets
pnpm storybook
```

## Verification

```bash
pnpm verify
```

This runs workspace, architecture, and secret checks; product, control, and
deployment workflow tests; an all-dependency audit; and production builds. CI
also compiles every Bicep module recursively.

The MCP scaffold has no public ingress, identity registration, credentials, or
provider connection. Its production entry point fails closed until a separately
approved authenticator is configured.

## Copilot customizations

Product-focused specialist agents and reusable skills live under
`.github/agents/` and `.github/skills/`. They support requirements, design,
implementation, testing, review, operations, and release preparation without a
repository-local EDD system. They are advisory and do not replace product-owner
approval, required GitHub controls, or `pnpm verify`.

`pnpm dev` serves the public site at `http://localhost:3000`. Use `pnpm dev:portal` for the portal at `http://localhost:3001`, `pnpm dev:admin` for the admin console at `http://localhost:3002`, or `pnpm dev:all` to run all three.

Current delivery status is summarized in
`docs/product/IMPLEMENTATION_STATUS.md`; source and executable tests remain the
controlling evidence.

The canonical domain model is documented in `docs/contracts/keyforta-domain-driven-design.md`. The backend implementation handoff is `docs/contracts/keyforta-backend-implementation-specification.md`, with companion context, domain, API/event, state-machine, data-model, acceptance, and legal/privacy documents under `docs/contracts/` and ADR documents under `docs/adr/`. The machine-readable API contract remains at the docs root in `docs/openapi.yaml`; the mock/API resource contract remains in `docs/contracts/backend-integration-contract.md`. These artifacts and the frontend apps must evolve together when backend implementation begins.
