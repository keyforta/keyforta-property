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
| `bicep/external-identity.bicep` | External ID tenant and dedicated Azure resource group           |

Foundation parameter files live in `config/`. Tenant IDs and application
registration values remain GitHub environment variables and are supplied at
deployment time. Templates compile independently before `what-if` is allowed.
The bootstrap administrator creates each environment resource group before the
resource-group-scoped foundation deployment runs.

Security CI scans Bicep with digest-pinned Checkov. The exact exclusions cover
the approved synthetic-pilot topology: public service endpoints
(`CKV_AZURE_35`, `CKV_AZURE_59`, `CKV_AZURE_139`), external plan-time Trivy
instead of ACR-native scanning and quarantine (`CKV_AZURE_163`,
`CKV_AZURE_166`), the statically unprovable generated storage name
(`CKV_AZURE_43`), and deferred geo-replication (`CKV_AZURE_206`). Checkov 3.3.17
cannot parse `mcp.bicep`, so that exact file is excluded from Checkov while
its compiler-generated ARM template is scanned separately and it remains
covered by required recursive Bicep compilation. Any broader
exclusion requires architecture and security approval.

`config/external-identity.dev.bicepparam` records the approved development
customer-identity tenant name and residency choice. South Africa (`ZA`) maps to
Microsoft Entra External ID's Europe data region. Tenant country and initial
domain choices are immutable; review `what-if` before creation. The Base A0
tenant uses External ID monthly active user billing. Deleting its Azure resource
is not a routine rollback and must not be attempted after customer identities or
application registrations exist.

The ordered SQL migrations in `postgres/migrations/` create organization,
party, effective membership, jurisdiction-policy, property, unit, lease,
tenant application evidence, payment, receipt, ledger, and audit tables and
functions. The migration Container Apps job owns schema changes; the API
identity receives only the restricted `keyforta_runtime`
database role. The API image includes the checksummed migration runner invoked
by that job. The runner validates each migration's transaction envelope, applies
its SQL and checksum ledger row in one transaction, and rejects checksum drift;
application startup never applies migrations.
The manually triggered migration job runs one replica and requires that replica
to complete, preventing concurrent migration runners inside one job execution.

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
unprivileged Node user. The admin SPA runs as an unprivileged Nginx user on its
native Container Apps HTTPS FQDN. Browsers call the public API directly; API
CORS permits only `https://keyforta.com` and the exact admin FQDN, and does not
permit credentialed requests. Azure
managed certificates secure `keyforta.com` and `www.keyforta.com`; the `www`
host redirects permanently to the canonical apex host. Cloudflare remains the
authoritative DNS provider, but these traffic records must remain DNS-only so
Azure can issue and renew the certificates.
The deployment workflow builds the API, public-web, and admin-web Dockerfiles
under `deployments/azure/docker/` only during `operation=plan`. It publishes
BuildKit SBOM/provenance, blocks on High/Critical image findings, resolves ACR
digests, locks each SHA-tagged manifest against later writes, and stores those
references with normalized `what-if` evidence. The
deploy operation imports the reviewed digests, rebuilds nothing, rejects drift,
and passes only digest-addressed images to Bicep. The empty
`deployments/azure/workflows/` directory
is reserved and has no active deployment authority; GitHub discovers workflows
only under `.github/workflows/`.

## Deployment rules

The deployment workflow uses a SHA-bound, scope-bound plan:

| Scope        | Reconciled resources |
| ------------ | -------------------- |
| `postgres`   | PostgreSQL Entra access, migration image and job, forward migrations |
| `api`        | API image and Container App only |
| `public-web` | Public-web image and Container App only |
| `admin-web`  | Admin-web image and Container App only |
| `full`       | PostgreSQL, API, public web, admin web, and dormant development seed-job definition |

The `portal-web` and `mcp` names are reserved in the workflow but
fail before Azure sign-in because those applications do not yet have approved
container images and Azure resource definitions. A `postgres` deployment uses
the API image as its checksummed migration runner but does not deploy the API
Container App. PostgreSQL server provisioning remains part of the foundation;
the component scope does not create another server.

- Do not deploy or destroy resources without reviewed `what-if` output and
  explicit environment approval.
- Run the deployment workflow with `operation=plan` first. A fresh resource
  group produces a foundation-only artifact that can authorize only
  `operation=deploy-foundation`; run `operation=plan` again afterward. Review
  the resulting component plan for that exact SHA, then dispatch
  `operation=deploy` with the same scope and its workflow run ID. Deployment
  validates the SHA-bound, scope-bound plan artifact and is never the default
  operation.
- Expose the web application and API publicly. Restrict browser API access to
  the configured web origin and enforce authentication and authorization in the API.
- Use managed identities and Azure RBAC. Do not use registry admin credentials,
  storage keys, Service Bus connection strings, or long-lived GitHub secrets.
- Keep browser client IDs, authority, delegated scope, and platform-admin object
  IDs in the protected GitHub `dev` environment. They are identifiers, not
  credentials. Never add client secrets or access tokens to browser builds.
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
- Prefer the narrowest scope. Scoped reconciliation adds no standing resources,
  although selected plan-time image builds and migration job executions retain
  their normal transient cost. Roll applications back to a previously reviewed
  immutable digest and revision; correct schema defects with a reviewed forward migration.
- Do not add general document storage, Key Vault, Service Bus, workers, HA, or production
  resources without a reviewed requirement and cost estimate.

## Public domain cutover

Preserve the prior Cloudflare records before changing them. Query the current
Container Apps environment immediately before cutover:

```bash
az containerapp env show --name "$APP_ENVIRONMENT" --resource-group "$RESOURCE_GROUP" \
  --query '{staticIp:properties.staticIp,verificationId:properties.customDomainConfiguration.customDomainVerificationId}'
az containerapp show --name "ca-keyforta-${ENVIRONMENT}-web" --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn -o tsv
```

The deployment workflow refuses a `public-web` deployment unless these live
values match public DNS and the existing API permits the canonical origin. The
2026-09-16 dev snapshot is:

| Type  | Name        | Value                                                                      | Proxy    |
| ----- | ----------- | -------------------------------------------------------------------------- | -------- |
| TXT   | `asuid`     | `B5783F46F1301E1DCA04EA5A00366ABCAD1672F49C0517FC29E444C4162B29CB`         | DNS only |
| TXT   | `asuid.www` | `B5783F46F1301E1DCA04EA5A00366ABCAD1672F49C0517FC29E444C4162B29CB`         | DNS only |
| A     | `@`         | `4.253.76.254`                                                             | DNS only |
| CNAME | `www`       | `ca-keyforta-dev-web.blueplant-a2bb85a6.southafricanorth.azurecontainerapps.io` | DNS only |

Do not reuse the snapshot after the Container Apps environment is recreated;
derive and review a fresh record set first.

Azure managed certificate issuance and renewal require the A and CNAME records
to resolve directly to Container Apps. Do not enable the Cloudflare proxy for
these records. If a CAA record is later added at the apex, include
`0 issue digicert.com`.

Cut over in this order:

1. Add both TXT validation records without changing traffic.
2. Merge and deploy the reviewed `api` scope so CORS permits
  `https://keyforta.com`.
3. Replace the current apex records with the DNS-only A record and add the
  DNS-only `www` CNAME.
4. Confirm public DNS, then deploy the reviewed `public-web` plan to issue and
  bind both managed certificates.
5. Verify the apex page, path-preserving `www` redirect, API allowed-origin
  response, and denied-origin behavior.

Rollback restores the preserved Cloudflare records. Remove certificate and
hostname bindings only through another reviewed Bicep plan; do not make
unrecorded Azure portal changes.

No click-created production resource is considered complete without its
equivalent reviewed infrastructure code and recovery documentation.

See
[`AZURE_ARCHITECTURE.md`](../docs/architecture/AZURE_ARCHITECTURE.md),
[`AZURE_ACCESS_AND_BOOTSTRAP.md`](../docs/operations/AZURE_ACCESS_AND_BOOTSTRAP.md),
[`RELEASE_CHECKLIST.md`](../docs/operations/RELEASE_CHECKLIST.md),
and [`docs/architecture/adr`](../docs/architecture/adr/) before changing this
directory.
