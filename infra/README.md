The ordered SQL migrations in `postgres/migrations/` create organization,
party, effective membership, jurisdiction-policy, property, unit, lease,
tenant application evidence, payment, receipt, ledger, and audit tables and
functions. The migration Container Apps job owns schema changes; the API identity receives only the restricted `keyforta_runtime`
database role. The API image includes the checksummed migration runner invoked
by that job. The runner validates each migration's transaction envelope, applies
its SQL and checksum ledger row in one transaction, and rejects checksum drift;
application startup never applies migrations.

Jurisdiction and legal-policy values remain unset until evidence-backed policy
activation. Migrations do not seed legal conclusions, consent, owner approval,
or counsel approval.
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
| `bicep/apps.bicep`            | Public web and API, managed identities, and ACR access            |
| `bicep/database-access.bicep` | PostgreSQL Entra administrators and narrow DBA workstation access |

Foundation parameter files live in `config/`. Tenant IDs and application
registration values remain GitHub environment variables and are supplied at
deployment time. Templates compile independently before `what-if` is allowed.
The bootstrap administrator creates each environment resource group before the
resource-group-scoped foundation deployment runs.

The ordered SQL migrations in `postgres/migrations/` create organization,
party, effective membership, jurisdiction-policy, property, unit, lease,
tenant application evidence, payment, receipt, ledger, and audit tables and
functions. The migration Container Apps job owns schema changes; the API
identity receives only the restricted `keyforta_runtime`
database role. The API image includes the checksummed migration runner invoked
by that job. The runner validates each migration's transaction envelope, applies
its SQL and checksum ledger row in one transaction, and rejects checksum drift;
application startup never applies migrations.

Jurisdiction and legal-policy values remain unset until evidence-backed policy
activation. Migrations do not seed legal conclusions, consent, owner approval,
or counsel approval.

Synthetic deployed data is separate from migrations. SQL in
`postgres/seeds/dev/` uses stable identifiers and may be applied only by the
manual `Seed development data` workflow after typing `synthetic-dev-data`.
The seed job shares the migration identity, is idempotent, and cannot target a
non-`dev` environment. Each seed establishes its synthetic organization context
inside the runner transaction so forced row-level security remains enabled.
Never put real people, properties, identities, payment details, or production
exports in a seed.

The public web container builds a standalone Next.js server and runs it as an
unprivileged Node user. Browsers call the public API directly; API CORS permits
only the deployed web origin and does not permit credentialed requests.
Container and workflow templates remain inactive under `deployments/azure/`
until the API runtime and deployment contract are implementation-ready.

## Deployment rules

- Do not deploy or destroy resources without reviewed `what-if` output and
  explicit environment approval.
- Run the deployment workflow with `operation=plan` first. A fresh resource
  group produces a foundation-only artifact that can authorize only
  `operation=deploy-foundation`; run `operation=plan` again afterward. Review
  the resulting full plan for that exact SHA, then dispatch `operation=deploy`
  with its workflow run ID. Deployment validates the SHA-bound, scope-bound
  plan artifact and is never the default operation.
- Expose the web application and API publicly. Restrict browser API access to
  the configured web origin and enforce authentication and authorization in the API.
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
