# Admin web

The privileged Keyforta platform administration console. It owns organization/user administration, verification review, configuration, support access, reporting, reconciliation oversight, and audit review.

This app is separate from the operational portal. It must consume `@keyforta/contracts`, `@keyforta/api-client`, and `@keyforta/authorization`; every privileged action requires server-side authorization and an audit event.

The app always starts at an administrator login gate and renders no admin modules until a session exists. The current login is a browser-local demo only. Production should use Microsoft Entra External ID and require a server-validated platform-admin claim for every admin API request.
