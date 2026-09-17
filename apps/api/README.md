# API

The KEYFORTA modular-monolith API runtime. API-002 provides process health,
dependency readiness, and anonymous read-only property discovery:

- `GET /health`
- `GET /ready`
- `GET /api/v1/properties`
- `GET /api/v1/properties/:propertyId`
- `POST /api/v1/landlord-onboarding-applications`
- `GET /api/v1/landlord-onboarding-applications`
- `POST /api/v1/landlord-onboarding-applications/:applicationId/decision`

Property routes depend on an injected public projection gateway and return only
published, public-safe fields. The server uses synthetic development projections
outside production; no production persistence adapter is configured in this
slice.

Landlord onboarding submission requires a verified Entra bearer token. Listing
and decisions additionally require the token's immutable `oid` claim to appear
in the comma-separated `PLATFORM_ADMIN_OBJECT_IDS` environment allowlist. These
routes derive identity from the token and do not accept an organization header.

The property list accepts optional `city` and `cursor` filters, `limit` from 1
through 100 (default 20), and `sort` values `created_at_desc` (default),
`name_asc`, or `name_desc`.

Run `pnpm --filter @keyforta/api test`, `typecheck`, and `build` from the
repository root.
