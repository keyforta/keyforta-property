# Portal web

The authenticated Keyforta application for four role modules:

- Tenant
- Landlord
- Property manager
- Independent maintenance operator

This app owns role-specific navigation and workflows. It must consume `@keyforta/contracts`, `@keyforta/api-client`, and `@keyforta/authorization`; it must not duplicate domain types or permission rules.

Public demo login hands off to `/?role=<tenant|landlord|manager|operator>&email=<email>`. `public-web` uses `NEXT_PUBLIC_PORTAL_WEB_URL` for an explicitly configured portal origin and defaults to `http://127.0.0.1:3001/` only during local development. Production handoff fails closed when no approved portal origin is configured. Legacy public `/demo/:role` URLs redirect to this app only when that origin exists; role workspace pages must not be implemented in `public-web`.

The app starts at a login gate. The current static implementation uses a clearly labeled browser-local demo session so the protected-shell behavior can be reviewed. Production login should use Microsoft Entra External ID; the API remains responsible for organization membership, role, relationship, resource scope, and technician assignment-window checks.
