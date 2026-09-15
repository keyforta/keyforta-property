# KEYFORTA deployment templates

The `azure/` directory contains KEYFORTA Azure workflow and container templates.
They are deliberately outside `.github/workflows/` and application directories,
so they cannot deploy or become production images implicitly.

The infrastructure in `../infra/` is canonical and may be compiled or reviewed.
Do not activate the deployment templates until the API runtime, public-web
container contract, database migration reconciliation, GitHub environment, OIDC
identity, reviewed Azure plan, rollback evidence, and explicit human deployment
approval are present.