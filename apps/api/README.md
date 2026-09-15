# API

The KEYFORTA modular-monolith API runtime. API-002 provides process health,
dependency readiness, and anonymous read-only property discovery:

- `GET /health`
- `GET /ready`
- `GET /api/v1/properties`
- `GET /api/v1/properties/:propertyId`

Property routes depend on an injected public projection gateway and return only
published, public-safe fields. The server uses synthetic development projections
outside production; no production persistence adapter is configured in this
slice.

Run `pnpm --filter @keyforta/api test`, `typecheck`, and `build` from the
repository root.
