# Infrastructure

KEYFORTA pilot infrastructure targets Azure Container Apps in South Africa
North. The reviewed Bicep creates one lean `dev` stamp. Test, production, and
unused managed services are deferred until pilot evidence justifies them.

## Entry points

| File                          | Scope                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| `bicep/foundation.bicep`      | Resource group stamp, network, data, messaging, and observability |
| `bicep/migration-job.bicep`   | Private, manually triggered database migration job                |
| `bicep/seed-job.bicep`        | Dormant, manually triggered synthetic data job for `dev` only     |
| `bicep/apps.bicep`            | Public web, internal API, managed identities, and ACR access      |
| `bicep/database-access.bicep` | PostgreSQL Entra administrators and narrow DBA workstation access |

Foundation parameter files live in `config/`. Tenant IDs and application
registration values remain GitHub environment variables and are supplied at
deployment time. Templates compile independently before `what-if` is allowed.
The bootstrap administrator creates each environment resource group before the
resource-group-scoped foundation deployment runs.

The ordered SQL migrations in `postgres/migrations/` create organization,
membership invitation, property, unit, lease, tenant application evidence,
payment, receipt, ledger, and audit tables and functions. The migration Container Apps job owns schema
changes; the API identity receives only the restricted `keyforta_runtime`
database role.

Synthetic deployed data is separate from migrations. SQL in
`postgres/seeds/dev/` uses stable identifiers and may be applied only by the
manual `Seed development data` workflow after typing `synthetic-dev-data`.
The seed job shares the migration identity, is idempotent, and cannot target a
non-`dev` environment. Each seed establishes its synthetic organization context
inside the runner transaction so forced row-level security remains enabled.
Never put real people, properties, identities, payment details, or production
exports in a seed.

The public web container builds the Vite application and serves the generated
static output from an unprivileged Nginx runtime. Container and workflow
templates remain inactive under `deployments/azure/` until the API runtime and
deployment contract are implementation-ready.

## Deployment rules

- Do not deploy or destroy resources without reviewed `what-if` output and
  explicit environment approval.
- Run the deployment workflow with `operation=plan` first. A fresh resource
  group produces a foundation-only artifact that can authorize only
  `operation=deploy-foundation`; run `operation=plan` again afterward. Review
  the resulting full plan for that exact SHA, then dispatch `operation=deploy`
  with its workflow run ID. Deployment validates the SHA-bound, scope-bound
  plan artifact and is never the default operation.
- Expose only the web application publicly. Browser requests reach the internal
  API through same-origin BFF routes.
- Use managed identities and Azure RBAC. Do not use registry admin credentials,
  storage keys, Service Bus connection strings, or long-lived GitHub secrets.
- Keep tenant application evidence in the private Blob container. Defender
  on-upload scanning must write Blob Index Tags; API download remains blocked
  until the result is exactly clean. Verify seven-day Blob soft delete and the
  Defender soft-delete-malicious-blobs control after deployment.
- Keep PostgreSQL password authentication disabled. The pilot permits Azure
  service traffic and relies on Entra database identities, restricted grants,
  application authorization, and RLS until private networking is justified.
- Limit approved DBA access to an Entra principal and exact workstation IP.
  Incremental deployment does not revoke existing access; explicitly delete
  both the administrator and firewall rule through a separately reviewed,
  recorded operation when access ends.
- Deploy only the `dev` environment during the private pilot.
- Do not add general document storage, Key Vault, Service Bus, workers, HA, or production
  resources without a reviewed requirement and cost estimate.

No click-created production resource is considered complete without its
equivalent reviewed infrastructure code and recovery documentation.

See
[`AZURE_ARCHITECTURE.md`](../docs/architecture/AZURE_ARCHITECTURE.md),
[`AZURE_ACCESS_AND_BOOTSTRAP.md`](../docs/operations/AZURE_ACCESS_AND_BOOTSTRAP.md),
[`RELEASE_CHECKLIST.md`](../docs/operations/RELEASE_CHECKLIST.md),
and [`docs/architecture/adr`](../docs/architecture/adr/) before changing this
directory.
