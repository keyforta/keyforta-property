# Admin web

The current privileged platform console reviews landlord-onboarding
applications and records allowlisted human decisions. Broader organization,
verification, support, reporting, reconciliation, and audit capabilities remain
planned and are not current UI behavior.

This app is separate from the operational portal. It must consume `@keyforta/contracts`, `@keyforta/api-client`, and `@keyforta/authorization`; every privileged action requires server-side authorization and an audit event.

The app starts at a Microsoft Entra login gate and renders no onboarding data until sign-in succeeds. The API independently checks the verified Entra object ID against `PLATFORM_ADMIN_OBJECT_IDS` for every list and decision request.

## Runtime configuration

The approved `dev` deployment serves this app from the native HTTPS FQDN of
`ca-keyforta-dev-admin`. Build it with browser-safe Vite values:

- `VITE_ENTRA_CLIENT_ID`: public SPA application client ID
- `VITE_ENTRA_AUTHORITY`: HTTPS Microsoft Entra authority
- `VITE_ENTRA_API_SCOPE`: delegated scope exposed by the KEYFORTA API
- `VITE_KEYFORTA_API_BASE_URL`: API root including `/api/v1`; HTTPS is required except for loopback development

The Entra app registration must include the exact local and deployed
`/auth/callback` redirect URIs. The API permits the exact public and admin
origins. Never place a client secret, token, administrator object ID, or
allowlist in a `VITE_` value; `PLATFORM_ADMIN_OBJECT_IDS` is injected only into
the API from the protected GitHub environment.
