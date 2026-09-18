# Portal web

The authenticated Keyforta application for four role modules:

- Tenant
- Landlord
- Property manager
- Independent maintenance operator

This app owns role-specific navigation and workflows. It must consume `@keyforta/contracts`, `@keyforta/api-client`, and approved browser-auth boundaries; it must not duplicate domain types or permission rules.

The current shell still starts with a clearly labeled browser-local demo session for review. Demo sessions must not fabricate bearer tokens or perform protected API mutations.

## Runtime configuration

Local portal development runs on `http://127.0.0.1:3001` while the API defaults to `http://127.0.0.1:3000` (`API_PORT` in `apps/api/src/server.ts`). `vite.config.js` proxies `/api/*` requests to the API origin during local development via `VITE_KEYFORTA_API_PROXY_TARGET` (default `http://127.0.0.1:3000`).

For deployed builds, configure:

- `VITE_KEYFORTA_API_BASE_URL`: browser-safe API root including `/api/v1`; HTTPS is required except for loopback development.
- `VITE_KEYFORTA_API_PROXY_TARGET`: optional local-development override for the Vite `/api` proxy target. `vite.config.js` loads this from Vite env files (for example `.env.local`) or exported shell variables.

When `VITE_KEYFORTA_API_BASE_URL` is not set, the portal uses relative `/api/v1` requests and relies on the dev proxy or same-origin deployment routing.

## Known limitation / follow-up

Issue #71 delivers the listing-publication panel, command wiring, and component coverage for real authenticated sessions. The integrated portal shell still uses browser-local demo sessions; replacing that shell with the approved Entra/MSAL session boundary is tracked separately in issue #78 and is blocked by decision issue #77. Until #78 lands, demo sessions correctly keep publication commands disabled rather than pretending to mutate protected API state.
