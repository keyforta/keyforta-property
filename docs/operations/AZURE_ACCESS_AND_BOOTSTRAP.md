# Azure Access and Bootstrap

This guide defines the one-time prerequisites for KEYFORTA deployments. It does
not authorize deployment or resource deletion. Every deployment requires a
reviewed plan, `what-if` output, and explicit environment approval.

## Selected Azure Context

- Subscription: Visual Studio Enterprise Subscription
- Primary region: South Africa North
- Environment: one `dev` resource group for the private pilot
- Resource prefix: `keyforta`
- Microsoft Entra External ID tenant: `keyfortacustomers.onmicrosoft.com`

Keep subscription, tenant, and client identifiers in GitHub environment
configuration rather than source files. They are not passwords, but centralizing
them prevents accidental coupling to one tenant or subscription.

## Required GitHub Configuration

Create one GitHub environment named `dev`.

Set these environment variables:

| Variable                      | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| `AZURE_CLIENT_ID`             | Environment deployment identity client ID  |
| `AZURE_TENANT_ID`             | Azure directory tenant ID                  |
| `AZURE_SUBSCRIPTION_ID`       | Target subscription ID                     |
| `POSTGRES_DBA_CLIENT_IP`      | Approved DBA workstation public IP         |
| `POSTGRES_DBA_OBJECT_ID`      | Approved DBA Entra user or group object ID |
| `POSTGRES_DBA_PRINCIPAL_NAME` | Approved DBA Entra principal name          |
| `POSTGRES_DBA_PRINCIPAL_TYPE` | `User` or `Group`; defaults to `User`      |

The deployment workflow consumes these non-secret application identifiers from
the protected `dev` environment:

| Variable                           | Purpose                                 |
| ---------------------------------- | --------------------------------------- |
| `ENTRA_AUDIENCE`                   | Expected API access-token audience      |
| `ENTRA_ISSUER`                     | External ID token issuer                |
| `ENTRA_JWKS_URI`                   | External ID signing-key endpoint        |
| `ENTRA_AUTHORITY`                  | External ID browser authority           |
| `ENTRA_API_SCOPE`                  | Delegated API scope                     |
| `PUBLIC_ENTRA_CLIENT_ID`           | Public-web SPA client ID                |
| `ADMIN_ENTRA_CLIENT_ID`            | Admin-web SPA client ID                 |
| `PLATFORM_ADMIN_OBJECT_IDS`        | Comma-separated approved administrator Entra object IDs |

`AZURE_TENANT_ID` identifies the directory that owns Azure resources and
managed identities. External ID issuer and endpoint values may belong to a
different tenant and must not be substituted for the Azure resource tenant.

The customer app registration must emit the optional `email` claim in access
tokens and ID tokens, and `ENTRA_SCOPES` must include `email`. B2B guest UPNs
use a transformed `#EXT#` value and must never be treated as the invited email
address.

## Customer Identity Onboarding

The public and admin SPAs use the provisioned External ID email OTP user flow.
Authentication alone grants no organization or platform access. The API derives
the immutable object ID from the verified access token; landlord membership is
created only after a separately authorized administrator approves the pending
application.

Platform administrator bootstrap is configuration-only: deployment owners pass
approved immutable Entra object IDs through `PLATFORM_ADMIN_OBJECT_IDS`. An empty
allowlist denies all onboarding review access. It does not create a platform or
customer organization, user, or membership record.

### Local invitation email testing

Microsoft Graph invitation redirects require a recipient-reachable HTTPS URL;
do not set `KEYFORTA_PUBLIC_BASE_URL` to the deployed web app while testing a
different local build. Start a short-lived anonymous Dev Tunnel to the local web
port instead:

```sh
devtunnel host -p 3000 --protocol http --allow-anonymous --expiration 1d \
  --host-header unchanged --origin-header unchanged
```

Set `KEYFORTA_PUBLIC_BASE_URL` in `apps/api/.env.local` to the reported HTTPS
URL. Configure the browser to use `<tunnel-url>/auth/callback`, then add that
callback to the app registration's SPA redirect URIs without removing the
localhost or deployed callbacks. Restart the local API and web app before
issuing an invitation. Keep the tunnel process running until acceptance
completes, then remove the temporary callback URI; a new tunnel URL requires a
new callback registration. Treat the anonymous tunnel URL as temporary access
to the local web boundary and never use it for production or sensitive test
data.

For Azure deployments, keep `https://keyforta.com/auth/callback` and the exact
admin Container Apps FQDN plus `/auth/callback` registered as SPA redirects.

Do not configure an Azure client secret, certificate, publish profile, registry
password, database password, storage key, or Key Vault secret in GitHub.

Configure environment protection:

- Restrict deployment branches to `main`.
- Prevent self-review where the GitHub plan supports it.
- Keep the repository workflow token read-only by default. Grant
  `id-token: write` only in Azure deployment jobs.

Protect `main` with pull requests, the CI status check, conversation
resolution, and no force pushes. Do not allow deployment workflows to substitute
a user-supplied branch or image tag.

## Azure Provider Registration

An authorized subscription administrator verifies registration for:

- `Microsoft.App`
- `Microsoft.ContainerRegistry`
- `Microsoft.DBforPostgreSQL`
- `Microsoft.ManagedIdentity`
- `Microsoft.OperationalInsights`

Provider registration changes subscription state and therefore requires explicit
approval before execution.

## Bootstrap Identities

Create one user-assigned deployment identity for `dev`. Configure its GitHub
federated credential with:

- Issuer: `https://token.actions.githubusercontent.com`
- Audience: `api://AzureADTokenExchange`
- Subject: the exact `dev` environment subject emitted by GitHub's OIDC token

The bootstrap administrator creates each target resource group and deployment
identity, then configures its federated credential and resource-group role
assignments. GitHub deployments are resource-group scoped and do not require a
subscription-wide `Contributor` assignment. Use the least-privileged
combination that can deploy the reviewed templates:

| Principal               | Scope                        | Required role or capability                                          |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------- |
| Bootstrap administrator | Subscription or bootstrap RG | Managed identity and federated credential creation                   |
| Bootstrap administrator | Target scopes                | Role assignment and lock creation                                    |
| Deployment identity     | Environment resource group   | `Contributor`                                                        |
| Deployment identity     | Environment resource group   | Constrained `Role Based Access Control Administrator` or custom role |
| Deployment identity     | Environment ACR              | `AcrPush`                                                            |

For `dev`, the bootstrap resource group is `rg-keyforta-dev-san` and the
federated subject is
`repo:keyforta@329171003/keyforta-property@1370148176:environment:dev`.
Create the resource group before running the deployment workflow; the
resource-group-scoped foundation template intentionally does not create it.

Prefer a custom role constrained to the exact runtime role assignments once the
Bicep resource inventory is stable. Do not grant runtime identities `Contributor`,
`Owner`, or deployment permissions.

## Runtime Identities

Provision separate identities for:

- Public web
- Public API
- PostgreSQL application access
- PostgreSQL migration administration
- Deployment automation

Expected data-plane assignments are documented and reviewed with the Bicep
change. The initial direction is:

| Identity  | Resource   | Intended access                           |
| --------- | ---------- | ----------------------------------------- |
| Web       | ACR        | `AcrPull`                                 |
| API       | ACR        | `AcrPull`                                 |
| Migration | ACR        | `AcrPull`                                 |
| API       | PostgreSQL | Restricted application role through Entra |

The foundation allow-lists only the PostgreSQL extensions required by reviewed
migrations. The initial schema requires `pgcrypto` for UUID generation; keep the
`azure.extensions` server configuration aligned with migration dependencies.

Database grants and RLS policy are applied by a migration identity, not by the
runtime identity. The migration identity is configured as the PostgreSQL Entra
administrator, runs only the manual migration job, and grants the API identity
the restricted `keyforta_runtime` role. The migration maps that database login
to the API managed identity's immutable object ID by transactionally creating a
login role and attaching its `pgaadauth` security label. This documented direct
label mechanism avoids optional server helper functions and does not rely on a
tenant-wide display-name lookup. Idempotent mapping checks read that label
through `pg_roles` and `pg_seclabel`.
`DATABASE_AUTH=entra` selects the attached user-assigned identity explicitly
from `AZURE_CLIENT_ID` and rejects missing or blank PostgreSQL access tokens.
The API parses the passwordless Entra `DATABASE_URL` into explicit connection
options before applying the token callback; passing both directly to `pg` lets
the parsed empty password replace the callback during client construction.

An approved DBA user or group may be configured as an additional Entra
administrator. Direct access is limited to the exact public IP in
`POSTGRES_DBA_CLIENT_IP`. The client IP, object ID, and principal name must be
configured together or all left unset. Leaving them unset prevents creation but
does not revoke previously deployed access because deployments are incremental.
Revocation requires a separately reviewed explicit deletion of both the Entra
administrator and `AllowDbaWorkstation` firewall rule; preserve that operation
as release evidence, then clear the DBA environment variables. The DBA account
is for diagnostics and approved recovery operations. Schema and data
corrections still use forward migrations, and posted financial records must be
reversed and replaced rather than edited.

After the access deployment succeeds, obtain a short-lived token and connect:

```bash
export PGPASSWORD="$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)"
psql "host=<server>.postgres.database.azure.com port=5432 dbname=keyforta user=<entra-principal-name> sslmode=require"
```

## External ID Bootstrap

The development External ID tenant was bootstrapped separately from the Azure
application deployment. An identity administrator provisioned the CIAM
directory, API registration and delegated scope, public and admin SPA
registrations, consent, exact callback URIs, and the `KEYFORTA_SignUpSignIn`
email OTP user flow. These Microsoft Graph resources are mandatory deployment
prerequisites; the application workflow does not create or modify them.

Before planning any application deployment, the protected `dev` environment
must supply the recorded audience, client IDs, authority, issuer, JWKS URI,
scope, and administrator Object ID allowlist. The workflow fails closed unless
the configured issuer publishes reachable HTTPS OpenID metadata with the exact
configured issuer and JWKS URI, and the JWKS contains signing keys.

The metadata check proves tenant endpoint consistency only. An identity
administrator must separately review app registrations, delegated consent,
callback URIs, email OTP user flow, named administrators, recovery, MFA,
break-glass, and offboarding whenever those resources change. Do not grant the
deployment identity Microsoft Graph write permissions to automate this review.

Application identity proves a subject. KEYFORTA database membership still
determines organization, role, property, unit, lease, and tenant access.

Do not substitute the Azure resource tenant for the External ID customer tenant.

## Local Validation

Required tools:

```bash
az version
az bicep version
pnpm --version
docker --version
```

Compile each entry point without deploying:

```bash
az bicep build --file infra/bicep/foundation.bicep
az bicep build --file infra/bicep/migration-job.bicep
az bicep build --file infra/bicep/apps.bicep
az bicep build --file infra/bicep/database-access.bicep
```

Run repository and container validation:

```bash
pnpm check
docker build --file apps/api/Dockerfile .
docker build --file apps/public-web/Dockerfile .
```

Poll a migration execution by passing the job name and execution name
separately:

```bash
az containerapp job execution show \
  --name caj-keyforta-dev-migration \
  --job-execution-name <execution-name> \
  --resource-group rg-keyforta-dev-san
```

These commands validate source artifacts only. `what-if`, deployment, provider
registration, role assignment, resource lock changes, and resource deletion
require separate explicit approval.

## Predeployment Checklist

1. Confirm the selected subscription and active tenant.
2. Confirm South Africa North quota and availability for every selected SKU.
3. Review estimated monthly cost, budgets, and alert recipients.
4. Review Bicep build output and linter findings.
5. Review `what-if` for unexpected deletes, replacements, public endpoints, or
   privilege expansion.
6. Verify immutable image SHA and successful CI evidence.
7. Approve the GitHub environment deployment.
8. Run web/API health, CORS, authorization, and tenant-isolation smoke tests.
9. Preserve deployment evidence and verify rollback readiness.

## Break-glass and Secrets

Do not place credentials in tickets, pull requests, workflow inputs, command
history, or chat. Enter interactive credentials only into the trusted Azure or
GitHub interface. Any break-glass action must be time-limited, justified,
reviewed, and captured in the audit and incident record.
