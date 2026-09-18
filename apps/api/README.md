# API

The current KEYFORTA modular-monolith API runtime exposes:

- `GET /api/docs/` in non-production environments only
- `GET /health`
- `GET /ready`
- `GET /api/v1/properties`
- `GET /api/v1/properties/:propertyId`
- `POST /api/v1/viewing-requests`
- `POST /api/v1/public-listings/:listingId/publish`
- `POST /api/v1/public-listings/:listingId/withdraw`
- `POST /api/v1/landlord-onboarding-applications`
- `GET /api/v1/landlord-onboarding-applications`
- `POST /api/v1/landlord-onboarding-applications/:applicationId/decision`

Property routes return only published, public-safe fields. Development may use
synthetic projections; production uses PostgreSQL gateways and fails closed
when required dependencies are unavailable.

Landlord onboarding submission requires a verified Entra bearer token. Listing
and decisions additionally require the token's immutable `oid` claim to appear
in the comma-separated `PLATFORM_ADMIN_OBJECT_IDS` environment allowlist. These
routes derive identity from the token and do not accept an organization header.
The allowlisted fact is evaluated through the shared `@keyforta/authorization`
module (`AUTHORIZATION_MODULE_ENABLED`, default `true`); set it to `false` to
roll back to the legacy allowlist-only check without a deploy.

The property list accepts optional `city` and `cursor` filters, `limit` from 1
through 100 (default 20), and `sort` values `created_at_desc` (default),
`name_asc`, or `name_desc`.

Run `pnpm --filter @keyforta/api test`, `typecheck`, and `build` from the
repository root.

Start the local API with
`NODE_ENV=development pnpm --filter @keyforta/api dev`, then open
`http://localhost:4000/api/docs/` to inspect and exercise the implemented
operations. The explorer omits unimplemented target operations from OpenAPI and
is unavailable when `NODE_ENV=production`.
