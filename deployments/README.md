# KEYFORTA deployment images

`azure/docker/` contains the active container build definitions consumed by the
gated GitHub deployment workflows. Workflow YAML controls build context,
scanning, digest publication, and deployment; these files cannot deploy alone.

Infrastructure definitions remain under `../infra/`. Every deployment still
requires the runtime/container contract, migration reconciliation, OIDC and
GitHub environment readiness, reviewed plan evidence, rollback evidence, and
explicit protected-environment approval in the
[`release checklist`](../docs/operations/RELEASE_CHECKLIST.md).