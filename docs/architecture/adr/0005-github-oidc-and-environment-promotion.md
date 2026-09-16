# ADR-0005: Deploy from GitHub Actions with OIDC

- **Status:** Superseded in part by ADR-0006
- **Date:** 2026-09-09

## Context

KEYFORTA needs repeatable dev, test, and production deployments without storing
long-lived Azure credentials in GitHub. Infrastructure and application revisions
must be reviewed, traceable to a commit, and promoted with production approval.

## Decision

Use GitHub Actions workload identity federation with `azure/login@v3` and one
user-assigned deployment identity per environment.

- Create GitHub environments named `dev`, `test`, and `production`.
- Configure one federated credential per deployment identity with an environment
  subject such as `repo:cmbuyamba/keyforta-property:environment:dev`.
- Store client ID, tenant ID, subscription ID, location, and naming values as
  environment variables. These identifiers are configuration, not credentials.
- Do not create or store Azure client secrets, certificates, publish profiles,
  registry passwords, or database passwords in GitHub.
- Grant workflow jobs `contents: read` and `id-token: write` only when Azure login
  is required.
- Allow deployments only when the selected commit belongs to the protected
  `main` branch.
- Require manual approval for production. Test approval can be enabled when a
  separate reviewer is available.

## Delivery sequence

Validation runs for every pull request and relevant branch push:

1. Install dependencies from the frozen lockfile.
2. Run lint, type checks, tests, production builds, and formatting checks.
3. Compile every Bicep entry point.
4. Build the web and API container images without pushing them.
5. Run container configuration and vulnerability checks selected by the
   security baseline.

Deployment runs against a GitHub environment:

1. Resolve and verify an immutable commit SHA from `main`.
2. Authenticate to Azure through OIDC.
3. Compile Bicep and run subscription/resource-group `what-if`.
4. Stop for the environment approval gate.
5. Deploy foundation infrastructure before application infrastructure.
6. Build and push web and API images tagged with the full commit SHA.
7. Deploy Container Apps revisions referencing only SHA-tagged images.
8. Verify public web and API health and the API's exact allowed browser origin.
9. Record deployment outputs and evidence without printing credentials.

Production deployment does not use mutable tags such as `latest`. Rollback moves
traffic to a previously validated Container Apps revision or redeploys a prior
SHA; database rollback uses forward corrective migrations unless an approved
restore procedure is required.

## Azure permissions

Bootstrap is performed by an administrator. Each deployment identity receives
roles at the smallest practical environment scope:

- `Contributor` for environment resources.
- `Role Based Access Control Administrator` constrained to required role
  assignments, or a reviewed custom role with
  `Microsoft.Authorization/roleAssignments/*`.
- `AcrPush` on the environment registry after it exists.

The bootstrap administrator also needs permission to create user-assigned
managed identities, federated identity credentials, role assignments, and
resource locks. Runtime identities never receive deployment roles.

## Consequences

- GitHub receives short-lived Azure tokens rather than reusable credentials.
- Separate identities and environments reduce cross-environment blast radius.
- Infrastructure changes remain visible in `what-if` before deployment.
- Initial bootstrap cannot bootstrap itself and requires an authorized Azure and
  GitHub administrator.
- Environment variables and role assignments must be maintained when a resource
  group or tenant changes.

## Validation

1. A pull request cannot deploy.
2. A non-`main` branch cannot deploy through manual input manipulation.
3. OIDC login succeeds without repository or environment client secrets.
4. The dev identity cannot modify test or production resources.
5. Production requires approval and deploys only an immutable SHA.
6. Logs contain no access tokens, credentials, connection strings, or personal
   data.
7. Failed smoke checks stop promotion and preserve the prior healthy revision.

## References

- [Authenticate to Azure from GitHub Actions by OIDC](https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect)
- [GitHub Actions deployment environments](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment)
