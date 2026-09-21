# Product implementation status

**Verified against repository source:** 2026-09-19  
**Baseline commit:** `976c7015a0eac95176bb0dfcb21aaa31cca1c260`

This is the single documentation summary of current delivery status. Source,
tests, executable migrations, manifests, and workflows at the reviewed commit
remain the evidence. Product requirements describe approved behavior, not proof
that behavior is available.

| Capability | Status | Repository evidence or boundary |
| --- | --- | --- |
| Public property catalogue and detail | Implemented | Public web API proxies and Fastify `GET /api/v1/properties` routes |
| Public viewing inquiry | Implemented | Public web proxy and Fastify `POST /api/v1/viewing-requests` provide validation, rate limiting, persistence, and duplicate handling; the browser form now submits via this API instead of browser-local storage |
| Listing publication and withdrawal | Implemented | Protected Fastify publication commands plus `GET /api/v1/public-listings/mine` (migration `0029`, landlord/assigned-manager authorization and cross-organization isolation tests) give the manager portal an authoritative portfolio feed (issue #114); the publish/withdraw panel selects from this feed exclusively — the prior manual listing-ID text entry has been removed |
| Rental Property and Unit inventory lifecycle | Implemented | Protected Fastify `POST /api/v1/properties`, `GET /api/v1/properties/mine`, `DELETE /api/v1/properties/{propertyId}`, `POST /api/v1/properties/{propertyId}/units`, `PATCH /api/v1/units/{unitId}/pricing`, `PATCH /api/v1/units/{unitId}/availability`, and `DELETE /api/v1/units/{unitId}` routes, backed by migration `0028` command/read functions with landlord/assigned-manager authorization and cross-organization isolation tests; a Fluent UI portal-web Property Management panel (issue #116) lets a signed-in landlord create properties, add units, view their authoritative `properties/mine` feed, and now set a unit's monthly rent (pricing) and mark it available/unavailable with a required reason code — demo (`?role=`) sessions remain read-only by design; new PublicListing creation, publication, and media remain gated pending an approved media-activation requirement (see requirements-gap report) |
| Landlord onboarding application and human admin decision | Implemented | Public signup flow, admin onboarding console, protected API routes, PostgreSQL gateway, and authorization tests |
| Authenticated role portal | Real sign-in and membership lookup shipped; dashboard data still pending | `portal-web` uses a real Microsoft Entra B2B sign-in/sign-out gate (issue #78, PR #103); `GET /api/v1/session/memberships` now resolves a signed-in identity's organization/role server-side (issue #78), so a real membership lands the identity in its real (non-demo) workspace and publish/withdraw commands. Workspace dashboards still show honest empty-state copy pending real read APIs (issue #101) — no dashboard stats/activity data ships in this change. |
| Public rental application prototype | Non-authoritative mock; scope now approved (PRD amended, issue #75) | Legacy public-web route stores browser-local data only; needs a real API-backed rebuild (persistence, validation, human-review gate; submission remains unauthenticated per the PRD) — no longer a scope conflict, but not yet backed by a durable API; implementation deferred (issue #73) pending dependent decisions |
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