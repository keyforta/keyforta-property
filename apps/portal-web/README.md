# Portal web

The authenticated Keyforta application for four role modules:

- Tenant
- Landlord
- Property manager
- Independent maintenance operator

This app owns role-specific navigation and workflows. It must consume `@keyforta/contracts`, `@keyforta/api-client`, and approved browser-auth boundaries; it must not duplicate domain types or permission rules.

The app starts at a Microsoft Entra B2B guest sign-in gate (decision #77) and shows an honest "workspace access pending" state for identities with no organization membership assigned yet, since no backend endpoint currently resolves a signed-in identity to its organization/role memberships. A `?role=` query-string shortcut remains available for local QA/demo review of the role-specific dashboards; it must not fabricate bearer tokens or perform protected API mutations.

## Runtime configuration

Local portal development runs on `http://127.0.0.1:3001` while the API defaults to `http://127.0.0.1:3000` (`API_PORT` in `apps/api/src/server.ts`). `vite.config.js` proxies `/api/*` requests to the API origin during local development via `VITE_KEYFORTA_API_PROXY_TARGET` (default `http://127.0.0.1:3000`).

For deployed builds, configure:

- `VITE_ENTRA_CLIENT_ID`: public SPA application client ID
- `VITE_ENTRA_AUTHORITY`: HTTPS Microsoft Entra authority
- `VITE_ENTRA_API_SCOPE`: delegated scope exposed by the KEYFORTA API
- `VITE_KEYFORTA_API_BASE_URL`: browser-safe API root including `/api/v1`; HTTPS is required except for loopback development.
- `VITE_KEYFORTA_API_PROXY_TARGET`: optional local-development override for the Vite `/api` proxy target. `vite.config.js` loads this from Vite env files (for example `.env.local`) or exported shell variables.

When `VITE_ENTRA_*` values are absent, sign-in falls back to an "unavailable" status rather than failing, so the app remains usable via the `?role=` demo shortcut. When `VITE_KEYFORTA_API_BASE_URL` is not set, the portal uses relative `/api/v1` requests and relies on the dev proxy or same-origin deployment routing. The Entra app registration must include the exact local and deployed `/auth/callback` redirect URIs; never place a client secret or token in a `VITE_` value.

## Known limitation / follow-up

Issue #71 delivers the listing-publication panel, command wiring, and component coverage for real authenticated sessions. Issue #78 (blocked by decision #77, now resolved as Entra B2B) delivers the real sign-in/sign-out gate above. What remains open: no API endpoint yet resolves a signed-in Entra identity to its organization memberships/role, so every real sign-in currently lands on the "workspace access pending" state. Adding that lookup requires a new database migration, which conflicts with the guarded destructive migration `0022_rental_inventory_v1.sql` sitting immediately past the runtime migration boundary — that sequencing conflict needs its own architecture decision before the membership lookup can be implemented. The `?role=` demo shortcut correctly keeps publication commands disabled rather than pretending to mutate protected API state.
