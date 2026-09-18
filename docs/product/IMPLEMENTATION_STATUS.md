# Product implementation status

**Verified against repository source:** 2026-09-17  
**Baseline commit:** `17560f848514ee4ed77b63e7c980efd1e1f9d3f1`

This is the single documentation summary of current delivery status. Source,
tests, executable migrations, manifests, and workflows at the reviewed commit
remain the evidence. Product requirements describe approved behavior, not proof
that behavior is available.

| Capability | Status | Repository evidence or boundary |
| --- | --- | --- |
| Public property catalogue and detail | Implemented | Public web API proxies and Fastify `GET /api/v1/properties` routes |
| Public viewing inquiry | API only | Public web proxy and Fastify `POST /api/v1/viewing-requests` provide validation, rate limiting, persistence, and duplicate handling; the current browser form still uses browser-local storage |
| Listing publication and withdrawal | API only | Protected Fastify publication commands; no current portal management screen |
| Landlord onboarding application and human admin decision | Implemented | Public signup flow, admin onboarding console, protected API routes, PostgreSQL gateway, and authorization tests |
| Authenticated role portal | Mock/prototype | `portal-web` uses a labeled browser-local demo session and sample records; it has no approved deployment path |
| Public rental application prototype | Non-authoritative mock and product conflict | Legacy public-web route stores browser-local data; approved PRD excludes public rental applications |
| Tenant application, evidence upload/scanning, and access confirmation | Planned | Target contracts and persistence foundations exist; no current tenant application or evidence API route |
| Operational portfolio, invitations, lease activation, statements, and maintenance workflows | Planned user-facing delivery | Some lower-layer contracts or persistence foundations exist; they are not exposed by the current deployable API |
| Payments and immutable correction foundations | Foundation only | Operational migrations and tests protect posting/reversal invariants; allocation and statement workflows remain incomplete |
| Organization-reference and audit integrity | Implemented foundation | Canonical migration `0021` atomically rejects cross-organization organization-owned parent references, denies audit update/delete/truncate, and has clean-install plus `0020` upgrade/recovery regression coverage |
| Synthetic `system.health` MCP capability | Implemented but inactive | Authenticated read-only MCP boundary and dedicated gated deployment path; no tenant data or model-provider access |
| Tenant-data AI assistance | Deferred | Requires approved tools, authorization, evaluation, privacy, operations, and release evidence |

Evidence entry points:

- API routes and dependencies: [`../../apps/api/src/app.ts`](../../apps/api/src/app.ts)
- Production gateway composition: [`../../apps/api/src/server.ts`](../../apps/api/src/server.ts)
- Public web API proxies: [`../../apps/public-web/app/api/v1`](../../apps/public-web/app/api/v1)
- Portal mock boundary: [`../../apps/portal-web/README.md`](../../apps/portal-web/README.md)
- Operational migrations: [`../../infra/postgres/migrations`](../../infra/postgres/migrations)
- MCP boundary: [`../../apps/mcp-server/README.md`](../../apps/mcp-server/README.md)
- Acceptance and isolation tests: [`../../apps/api/test`](../../apps/api/test)
- Deployment paths: [`../../.github/workflows`](../../.github/workflows)

Update this table in the same change that adds or removes a deployable
capability. Detailed requirements remain in the PRD and role-use-case documents;
unresolved contradictions remain in the requirements-gap report.