# MCP dev activation and containment runbook

This runbook governs the synthetic-only ChatGPT connection to
`https://mcp.keyforta.com/mcp` in the KEYFORTA dev environment. It does not
authorize production use, Claude, business tools, tenant data, model calls, or
database/API access.

## Owners and limits

- Product owner: approves the learning boundary and continued dev availability.
- Environment approver: reviews each exact-SHA `dev` deployment.
- Identity administrator: owns both Entra registrations, consent, redirect URI,
  scope, and emergency revocation.
- Platform/SRE operator: owns Azure, DNS/TLS, alerts, rollback, and cost review.
- Security/Privacy owner: owns connection approval, evidence minimization, and
  incident review.
- Incremental Azure cost ceiling: USD 25 per month. The service scales from zero
  to one replica and reuses ACR, Container Apps environment, and Log Analytics.
  Stop activation when estimated or observed incremental spend may cross the
  ceiling; do not add a paid gateway, session store, telemetry service, or
  non-zero minimum replicas without a new decision.

Record named people and escalation contacts in the protected deployment record,
not in this repository. Never place secrets, tokens, authorization codes, raw
claims, or provider screenshots containing identity data in workflow artifacts.

## Pre-activation record

1. Record the exact main commit SHA and successful `Deploy MCP` plan run ID.
2. Confirm plan evidence binds the SHA, `operation=plan`, run ID, certificate
   choice, immutable `sha256` image digest, Bicep hash, and parameter hash.
3. Review `what-if`; allow only the dedicated MCP Container App, user-assigned
   identity, scoped ACR pull assignment, certificate/hostname when selected,
   and expected shared-environment references.
4. Confirm `MCP_ALLOWED_CLIENT_IDS` and
   `MCP_ALLOWED_NON_BROWSER_CLIENT_IDS` contain approved Entra client IDs only.
   GitHub does not store empty environment variables, so an absent
   `MCP_ALLOWED_NON_BROWSER_CLIENT_IDS` represents the required empty list. For
   ChatGPT-first activation, browser requests use exact origin
   `https://chatgpt.com`; absent-origin access is not granted to ChatGPT.
5. Confirm the Entra resource exposes only
   `https://mcp.keyforta.com/mcp.tools.read`. Record exact issuer, audience,
   tenant, consent owner, client owner, and the redirect URI copied from the
   ChatGPT app-management page.
6. Capture the current DNS record set. Stage a DNS-only `mcp.keyforta.com`
   CNAME to the Container App validation target, then verify the Azure managed
   certificate before binding it. Do not proxy the bootstrap record.
7. List direct and inherited role assignments for the MCP identity. It must have
   no PostgreSQL, Blob, private API, Key Vault, model, or business-data access.
8. Record the current Azure budget/alert state and incremental month-to-date MCP
   cost. Stop if the USD 25 ceiling cannot be enforced or reviewed.

The accepted dev posture permits the generated Container Apps hostname to
exist, but the MCP application returns a sanitized `404` unless the HTTP host is
`mcp.keyforta.com`. It also accepts shared-environment egress only while the
identity and dependency checks prove the service has no business-data or model
access. Either residual must be reopened before production or boundary
expansion.

### Entra bootstrap record

The identity administrator created and verified this non-secret baseline on
2026-09-16. Named owners, tenant ID, consent evidence, and any credential remain
in the protected deployment record.

| Registration | Application (client) ID | Verified boundary |
| --- | --- | --- |
| `KEYFORTA MCP Dev Resource` | `0cd03e7b-9cc9-4d69-a8ed-ce898fb4de78` | Single tenant; v2 access tokens; identifier URI `https://mcp.keyforta.com`; one user-delegated `mcp.tools.read` scope; no redirect URI or credential |
| `KEYFORTA ChatGPT MCP Dev Client` | `90a67531-a623-4445-be80-62ddb6212020` | Single tenant; requests only resource scope ID `76cfd280-7b33-4925-b437-ce35e9e32a2f`; no redirect URI or credential |

The protected `dev` environment sets `MCP_ALLOWED_CLIENT_IDS` to the ChatGPT
client ID above and leaves `MCP_ALLOWED_NON_BROWSER_CLIENT_IDS` absent. The exact
ChatGPT redirect URI, confidential-client credential, consent, deployment,
DNS/TLS, and provider proof are pending. Do not infer a callback URI or create a
credential before ChatGPT discovers the live MCP authorization metadata.

## Activation order

1. Run `Deploy MCP` with `operation=deploy`, the reviewed `plan_run_id`, exact
   `commit_sha`, and the same `bind_certificate` choice used by the plan.
2. Confirm `/health` succeeds and unauthenticated `/mcp` returns `401` with a
   sanitized Bearer challenge containing the RFC 9728 metadata URL and scope.
3. Confirm protected-resource and authorization-server metadata use
   `https://mcp.keyforta.com`, the tenant-specific Entra endpoints, and the exact
   delegated scope.
4. Create the ChatGPT app in draft, copy its exact redirect URI into the Entra
   client, and complete least-privilege consent. Do not enable dynamic client
   registration and do not introduce an OAuth broker.
5. Connect only ChatGPT. Initialize a session, list tools, call `system.health`,
   close the session, and reinitialize. The list must contain exactly one tool;
   its result must contain synthetic service metadata only.
6. Verify logs contain a server-generated correlation ID, client reference,
   protocol, method, status, policy version, and hashed session reference, but
   no token, prompt, arguments, result body, personal data, or tenant data.
7. Record the revision, digest, probe result, test timestamps, and sanitized
   outcome. After the proof, continued ChatGPT dev availability is permitted
   while the synthetic-only, monitoring, and cost controls remain true.

## Monitoring and learning targets

Use Container App console logs and platform metrics during the initial operating
window. These are dev learning targets, not customer commitments.

- Page when the active revision is unready for 10 minutes during an approved
  test window, or when all connector requests fail for 5 minutes.
- Investigate five or more `invalid_credential`, `wrong_client`,
  `wrong_tenant`, or `insufficient_scope` denials in 5 minutes.
- Investigate any session saturation, concurrency rejection, restart loop, or
  sustained rate-limit rejection during the proof.
- Review cold-start duration and tool-call latency after each activation; do not
  increase minimum replicas to hide cold starts without a cost decision.
- Review Azure cost weekly while the connector remains enabled and immediately
  on a budget alert.

Example bounded KQL, with the exact table and field extraction adjusted to the
deployed Log Analytics schema:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "ca-keyforta-dev-mcp"
| where TimeGenerated > ago(15m)
| summarize Events=count() by Log_s
```

Do not create alerts that include raw log bodies in email or chat payloads.

## Emergency disable

Target maximum containment time is 15 minutes from an authorized disable
decision.

1. Disable the ChatGPT connection and revoke user/admin consent or disable the
   Entra client as directed by the identity administrator.
2. Disable external ingress or route zero traffic to the suspect MCP revision.
   A rollout or restart invalidates all in-memory sessions.
3. Verify public `/mcp` access no longer succeeds and that public web and API
   health remain unaffected.
4. Preserve only sanitized deployment, revision, Entra audit, DNS, and
   application audit references in the approved evidence store.
5. Inspect the dedicated identity's direct and inherited RBAC for drift. Revoke
   unexpected assignments before restoration.

## Revision rollback

1. Identify the prior reviewed healthy revision by source SHA and image digest.
2. Move 100 percent traffic to that revision without rebuilding the image.
3. Verify `/health`, authentication denial, metadata, and the synthetic
   `system.health` call with a newly initialized session.
4. Reconcile the selected revision through a new exact-SHA plan/deploy run. Do
   not leave an emergency portal change as the desired state.
5. If certificate or DNS caused the failure, unbind the hostname before deleting
   certificate state, restore the captured DNS record set, and verify HTTPS is
   no longer advertised for the disabled endpoint.

## Evidence and closure

Retain the reviewed plan, deployment run, source SHA, digest, hashes, revision,
sanitized probes, role inventory, DNS/TLS state, cost review, and incident or
rollback timestamps for 30 days unless Security/Privacy specifies a shorter
period. Access is limited to the named Product, Security/Privacy, Identity, and
Platform/SRE owners. Delete transient headers, denial bodies, and screenshots
after sanitization review.

Close the operating window only after confirming the connector state, ingress,
active revision, Entra consent, DNS/TLS state, alerts, spend, and any follow-up
owner. Any boundary expansion starts a new approved requirement and threat
review.
