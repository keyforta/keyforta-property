# API

The current KEYFORTA modular-monolith API runtime exposes:

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

The property list accepts optional `city` and `cursor` filters, `limit` from 1
through 100 (default 20), and `sort` values `created_at_desc` (default),
`name_asc`, or `name_desc`.

Run `pnpm --filter @keyforta/api test`, `typecheck`, and `build` from the
repository root.
