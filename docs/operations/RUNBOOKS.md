# Runbook Index

Runbooks will be exercised before real pilot data is imported.

Every release follows the
[release and deployment checklist](RELEASE_CHECKLIST.md), including an
immutable evidence chain, post-deployment verification, and an initial
operating window.

| Scenario | Procedure status |
| --- | --- |
| Authentication redirect mismatch | [`AUTHENTICATION_REDIRECT_FAILURE.md`](./AUTHENTICATION_REDIRECT_FAILURE.md) |
| Suspected cross-organization access | [`CROSS_ORGANIZATION_ACCESS.md`](./CROSS_ORGANIZATION_ACCESS.md) |
| Duplicate or unidentified payment | [`PAYMENT_INTEGRITY_INCIDENT.md`](./PAYMENT_INTEGRITY_INCIDENT.md) |
| Document exposure or malicious upload | [`DOCUMENT_SECURITY_INCIDENT.md`](./DOCUMENT_SECURITY_INCIDENT.md) |
| Deployment or migration failure | [`DEPLOYMENT_MIGRATION_FAILURE.md`](./DEPLOYMENT_MIGRATION_FAILURE.md) |
| Backup restoration | [`backup-retention-runbook.md`](../database/backup-retention-runbook.md) |
| MCP dev activation or containment | [`MCP_DEV_RUNBOOK.md`](./MCP_DEV_RUNBOOK.md) |
| Authentication/account recovery, incorrect charge schedule, AI grounding/tool policy, messaging outage, and data export/deletion | Missing focused procedures; identify and obtain the appropriate service, security, finance, AI, communications, or privacy owner before execution |

Use [`RUNBOOK_TEMPLATE.md`](RUNBOOK_TEMPLATE.md) for new procedures. The
[`authentication redirect mismatch`](AUTHENTICATION_REDIRECT_FAILURE.md)
runbook is the executable procedure for OIDC callback failures.
The [`MCP dev activation and containment`](MCP_DEV_RUNBOOK.md) runbook governs
the synthetic-only ChatGPT dev connector, including cost, monitoring, emergency
disable, and immutable-revision rollback.
The [`backup, recovery, and retention`](../database/backup-retention-runbook.md)
runbook defines restore authorization, isolation, stop conditions, verification,
evidence, and the controls that remain undeployed in the synthetic pilot.

Every runbook must identify detection, severity, containment, owner,
communication, recovery, evidence preservation, and follow-up actions.
