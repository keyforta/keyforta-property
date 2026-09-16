# MCP dev deployment and connector proof plan

**Status:** Implementation and dev activation approved; deployment remains gated by reviewed plan evidence  
**Environment:** KEYFORTA dev only  
**Scope:** Synthetic read-only `system.health` capability only  
**Provider order:** ChatGPT first; Claude remains unapproved  
**Cost ceiling:** USD 25 per month incremental MCP Azure spend  
**Authority:** [ADR-012](../adr/ADR-012-standalone-mcp-service.md), issues #15 and #17

## Advisory review record

Specialist-agent reviews are engineering evidence, not repository or deployment
approval. After revision and re-review on 2026-09-16, all four specialists
recommended plan acceptance with conditions. The Product Owner subsequently
authorized implementation, ChatGPT-first dev activation at `mcp.keyforta.com`,
continued dev availability, and a USD 25 monthly ceiling. Protected GitHub
environment approval, exact-SHA plan evidence, and external identity inputs
remain mandatory controls; this record does not bypass them.

| Review | Advisory result | Blocking conditions |
| --- | --- | --- |
| Product | Approved for the bounded dev proof | Preserve synthetic-only scope and ChatGPT-first order |
| Architecture | Implementation accepted by ADR-012 | Preserve the standalone service, session binding, and no-data identity boundary |
| Security/Privacy | Conditional activation | Verify exact Entra/ChatGPT registration, minimized evidence, denial redaction, and containment before connection |
| Platform/SRE | Conditional activation | Review exact-SHA plan, digest, Bicep inputs, DNS/TLS, RBAC, monitoring, rollback, and cost before deployment |

## Purpose and boundary

This plan prepares a separately deployed Model Context Protocol endpoint for
direct compatibility testing with Claude and ChatGPT. Existing offline tests
prove synthetic protocol compatibility; they do not prove that either provider
can discover, authorize, or reach a deployed KEYFORTA resource server.

The Product learning objective is to decide independently for each provider
whether direct Entra OAuth and Streamable HTTP interoperability are viable
without a broker. Success for one provider does not authorize or unblock the
other. Failure stops that provider path and records the incompatibility; it does
not activate grounded assistance or create an end-user feature.

The business invariant is that models and connectors receive no database,
tenant, organization, lease, payment, document, or other business access. The
pilot remains usable when MCP, Entra, Claude, or ChatGPT is unavailable.

This document authorizes implementation and a ChatGPT-first dev activation only
through the protected deployment sequence below. It does not authorize
production use, Claude connection, business data, autonomous decisions, a
custom OAuth server, OAuth broker, shared session store, private API
integration, model invocation, or business tools.

ADR-012 is the accepted bounded exception to the PRD's general exclusion of
independent microservices. It permits only this isolated synthetic MCP resource
server and does not establish a general microservice architecture.

## Approval gates

| Gate | Decision and evidence | Required owners |
| --- | --- | --- |
| Plan acceptance | Confirm synthetic-only scope, environment, success criteria, and no business data | Product, Architecture, Security/Privacy, UX, Platform/SRE |
| Identity design | Approve Entra tenant, resource application ID URI, token audience, delegated scope, consent, exact provider redirect URIs, RFC 8707 behavior, revocation, and credential ownership | Security/Privacy, Identity administrator, Architecture |
| Connector privacy | Approve data-flow inventory and provider terms for synthetic metadata and operational telemetry only | Product, Security/Privacy, Legal/Privacy as required |
| Infrastructure implementation | Approve inactive Bicep, managed identity and RBAC, cost estimate, monitoring, runbook, and deployment workflow changes | Platform/SRE, Security/Privacy, Architecture |
| Activation | Approve reviewed Bicep build and `what-if`, immutable image digest, exact-SHA plan evidence, live-test window, and rollback readiness | Environment approver, Platform/SRE, Security/Privacy |
| Bounded proof connection | Approve one named provider connection for a fixed test window after documentation-level compatibility and all preceding gates succeed | Product, Security/Privacy, Environment approver |
| Continued provider use | After successful live proof and evidence review, decide whether the individual provider may remain connected in dev | Product, Security/Privacy, Environment approver |

Any failure to satisfy a provider's registration, metadata, PKCE, redirect,
resource, audience, or scope contract stops that provider's work. It must not be
worked around with weaker token validation or an unapproved authorization
broker.

## Target dev topology

- Add a dedicated Azure Container App for `apps/mcp-server`; do not place MCP in
  `apps/api` or share the API lifecycle.
- Use a dedicated managed identity with no PostgreSQL, Blob, private API, or
   model-provider permissions. Its only data-plane role is narrowly scoped
   `AcrPull`; verify direct and inherited assignments against an explicit allowed
   and forbidden RBAC inventory.
- Reuse the approved Container Apps environment, ACR, and Log Analytics
  workspace. Use a consumption workload profile, zero minimum replicas, one
  maximum replica, bounded CPU and memory, and ephemeral in-memory sessions.
- Deploy an image selected by immutable digest. Use multiple-revision mode,
   SHA-derived revision identity, readiness-gated traffic promotion, and retain
   the prior healthy revision. Initial connector activation requires two reviewed
   MCP revisions so traffic-switch rollback can be exercised first.
- Expose HTTPS only for `/mcp`, RFC 9728 protected-resource metadata, approved
  widget resources, and minimal health endpoints. All other routes fail closed.
- Allow the exact browser origin `https://chatgpt.com`. Permit absent `Origin`
  for an approved non-browser Claude connector. Reject malformed, `null`, and
  every other origin before protocol dispatch.
- Authenticate every MCP request with Entra. Validate signature, tenant-specific
  issuer, audience, time bounds, and the least-privilege delegated scope.
- Bind opaque sessions to validated tenant, subject, OAuth client identifier
   (`azp` or `appid` according to the approved claim contract), connector class,
   origin class, and protocol version. Origin is never a substitute for client
   identity. Allow absent `Origin` only for explicitly approved authenticated
   client IDs. Bound idle and absolute expiry, count, concurrency, and request
   duration. Restart, rollout, and scale-to-zero invalidate sessions.
- Separate platform and application controls. Bicep owns CPU, memory, explicit
   HTTP scaling concurrency, probes, shutdown, and replica bounds. The MCP server
   owns route denial, body size, per-client and per-principal rate limits,
   initialization/session churn, session count, dispatch concurrency, and
   duration. Final numeric values require Security and SRE review based on a
   bounded load test; defaults may not be silently inherited from the platform.
- Record server-generated correlation ID, authenticated client identity,
   protocol version, method, tool name, result status, denial reason, policy
   version, hashed session reference, request count, latency, session count,
   limit rejection, connector class, and revision. Never use a client-supplied
   request ID as the audit correlation ID. Never record tokens, authorization
   codes, prompts, arguments, results, personal data, or tenant data.
- The shared Container Apps environment does not itself enforce egress
   isolation. Before activation, either implement approved enforceable egress
   controls or record Security/Privacy and SRE acceptance of that residual risk,
   backed by dependency checks and runtime egress observation.

## Ordered implementation

### 1. Freeze contracts and live-test fixtures

1. Confirm the only registered tool is `system.health`; enforce strict
   allowlisted schemas for its `structuredContent`, `content`, widget `_meta`,
   registry, and public resources. Unknown fields fail closed.
2. Add versioned Claude and ChatGPT live-test scripts that exercise discovery,
   authorization, initialize, initialized notification, tool listing, tool
   invocation, session close, and reinitialization.
3. Keep canonical CI offline and secret-free. Label live evidence as
   environment-specific and time-bound.

**Owning paths:** `apps/mcp-server`, `tools/system/health`, `harness/evals`,
`docs/ai`.

The version 1 synthetic allowlist is pinned to the current implementation:

- Registry: exactly one tool named `system.health`, with strict empty input,
  bounded description, and OAuth `securitySchemes` declaring the exact
  delegated resource scope.
- `structuredContent`: exactly `checkedAt`, `dataBoundary: "synthetic"`,
  `policyVersion`, `protocolVersion`, `readOnly: true`,
  `serviceName: "keyforta-mcp-server"`, and `status: "ok"`.
- `content`: exactly one text item containing the approved synthetic boundary
  status; no prompts, identity claims, tenant data, or business data.
- No widget, Apps SDK component, resource template, prompt, completion, or
  model capability is registered in this proof.
- Public routes: `/mcp`, the RFC 9728 protected-resource metadata routes, and
   the minimal `/health` probe only. Entra, not KEYFORTA, serves authorization
   server discovery.
   Exact paths for metadata and probes must be frozen in the application contract
   before IaC review; every other route returns a sanitized denial.

Changing this allowlist or contract version requires Product, Architecture, and
Security/Privacy review before deployment.

### 2. Prove Entra design before provisioning

1. Document the Azure deployment tenant, resource-server issuer tenant, allowed
   tenant IDs, connector client ownership, application ID URI, delegated scope,
   consent authority, tenant-specific issuer, expected audience, client-binding
   claims, signing-key refresh, token lifetime, and owners.
2. Document RFC 9728 protected-resource metadata and matching
   `WWW-Authenticate` challenge, authorization-server discovery, authorization
   code with S256 PKCE, exact redirect URIs, supported client identification or
   registration, and RFC 8707 `resource` handling.
3. Verify from current provider documentation that Claude and ChatGPT can use
   the proposed Entra configuration directly. Record unresolved provider
   registration or redirect constraints as blockers.
4. Define realistic Entra revocation semantics: consent and account revocation,
   Continuous Access Evaluation support if applicable, residual token-validity
   window, signing-key rollover, reauthorization, and maximum containment time.
   Do not claim immediate access-token revocation unless the selected Entra flow
   demonstrably provides it.

**Stop condition:** do not create registrations or proceed to infrastructure if
either selected provider requires an unapproved broker or incompatible token
semantics.

### 3. Implement production-mode resource authentication

1. Replace the development static-token runtime boundary with an injected Entra
   JWT verifier for the deployed environment while retaining explicit local and
   test authentication adapters.
2. Fail startup when tenant, issuer, audience, scope, client allowlist, metadata
   URL, origin policy, or limits are absent or malformed.
3. Authenticate and enforce scope before every operation, including initialize,
   notifications, list, call, and close, before session creation or lookup.
   Bind sessions to the validated tenant, principal, and OAuth client. Never
   expose a raw token to tool handlers or widgets.
4. Add sanitized denial and audit events using stable reason codes and hashed
   session references.

**Owning paths:** `apps/mcp-server`, `packages/auth`, `packages/contracts`.

Current compatibility findings are:

- ChatGPT supports a predefined OAuth client; dynamic client registration and
   client ID metadata documents are not required for this connection.
- ChatGPT requires RFC 8707 `resource`. Microsoft Entra accepts the resource
   parameter while the requested delegated scope determines the access-token
   audience.
- The exact ChatGPT redirect URI is generated by the ChatGPT app-management
   flow and must be copied verbatim into the Entra client registration before
   connection. It must not be guessed or generalized with a wildcard.
- The resource advertises the exact delegated scope in RFC 9728 metadata,
   `WWW-Authenticate`, and each tool's `securitySchemes` declaration.

### 4. Prepare inactive infrastructure

1. Add a separate MCP Bicep deployment unit and parameters for the existing dev
   stamp. Define the Container App, dedicated managed identity, ingress,
   multiple-revision mode, traffic, scaling, platform-owned limits, telemetry,
   alerts, and least-privilege RBAC without credentials.
2. Add a dedicated MCP image build with deterministic workspace inputs,
   non-root execution, health checks, SBOM, vulnerability threshold, build
   provenance, and immutable digest output.
3. Calculate incremental idle and bounded-test-window cost in an approved
   currency from current South Africa North prices. Include Container Apps
   execution, ACR storage/builds, Log Analytics ingestion/query alerts, DNS/TLS,
   and each provider plan; state usage and free-grant assumptions, shared versus
   incremental amounts, proof-window duration, hard ceiling, budget alert, and
   cost owner. Any non-zero minimum, gateway, external session store, paid
   connector plan, or new telemetry service requires a new cost decision.
4. Build Bicep, run policy checks, and capture a resource-group `what-if`. No
   deployment occurs in this stage.
5. Define the exact MCP hostname and metadata URLs. Capture a pre-change
   Cloudflare DNS snapshot; document DNS-only records, certificate validation,
   staged hostname binding, HTTPS and certificate probes, renewal monitoring,
   and DNS/certificate teardown and restoration evidence.

**Owning paths:** `infra/bicep`, `deployments/azure`, `apps/mcp-server`,
`docs/operations`.

### 5. Add exact-SHA delivery controls

1. Replace the current fail-closed placeholder for `deployment_scope=mcp` only
   after the image and inactive resource definition have been approved.
2. Add a separately authorized publication stage that builds and pushes the
   exact-SHA image before review. Extend plan mode to resolve that registry
   digest, compile Bicep, run `what-if`, and publish tamper-evident evidence
   binding source SHA, image digest, environment, scope, Bicep hash, parameter
   hash, and plan run ID. ACR publication is an external change and requires
   explicit authorization even though it does not activate the service.
3. Require deploy mode to consume a successful reviewed plan run for the same
   SHA, scope, environment, image digest, and Bicep inputs, deploying only
   `image@sha256:...` without rebuilding.
4. Keep protected environment approval mandatory. Do not include MCP in `full`
   deployment scope until separately approved.

**Owning path:** `.github/workflows/deploy-mcp.yml`.

### 6. Prepare operations and containment

1. Define structured event schemas, KQL queries, dashboards, thresholds, action
   groups, recipients, alert owners, expected-zero suppression, cold-start
   measurements, operating window, and proposed learning SLOs for authentication
   failures, rate-limit rejection, errors, latency, restarts, session saturation,
   and Entra dependency failure.
2. Add a runbook naming operators, permissions, break-glass path, maximum
   containment time, connector disable, consent revocation, ingress disable,
   active-revision checks, post-disable probes, traffic rollback, IaC
   reconciliation, log review, and evidence retention.
3. Exercise rollback between infrastructure activation and provider activation:
   deploy two reviewed revisions, switch traffic to the prior revision, disable
   ingress and connector access, invalidate sessions, reconcile IaC, and prove
   that public web and API traffic remain unaffected.
4. Define live-evidence custody: approved storage, classification, ACLs,
   encryption, sanitization review, retention/deletion, and a prohibition on
   retaining screenshots or artifacts containing tokens or identity claims.

### 7. Activate and test one provider at a time

1. Obtain explicit environment deployment approval against the reviewed
   exact-SHA plan and `what-if`.
2. Deploy with no connector registered and verify health, route exposure,
   authentication denial, telemetry redaction, limits, and rollback controls.
3. Connect one approved provider, execute the live acceptance suite using only
   `system.health`, disconnect it, and review evidence before testing the second
   provider.
4. Disable the endpoint after the bounded proof window unless continued dev
   availability receives explicit approval.

Continued dev availability is approved for ChatGPT after a successful bounded
proof. It remains subject to the monthly cost ceiling, synthetic-only tool
registry, monitoring, and immediate-disable procedure in
`docs/operations/MCP_DEV_RUNBOOK.md`.

## Requirement-to-test map

| ID and source | Requirement | Acceptance evidence |
| --- | --- | --- |
| MCP-DEV-01; ADR-012 Service and data boundary; Tool Policy 10 | Only synthetic read-only capability is available | Strict registry, result, and route allowlists show only `system.health`; unknown fields fail; deterministic fixtures contain exactly the approved fields |
| MCP-DEV-02; ADR-012 Authentication | Resource is discoverable and standards-compliant | RFC 9728 metadata and matching `WWW-Authenticate` tests; authorization-server discovery succeeds |
| MCP-DEV-03; ADR-012 Authentication | OAuth is direct and least privilege | Authorization code plus S256 PKCE succeeds with exact redirect and RFC 8707 resource; token has expected tenant, issuer, audience, client, scope, and expiry |
| MCP-DEV-04; Tool Policy 9 and 11 | Authentication and protocol fail closed | Missing, malformed, expired, effectively revoked, wrong-tenant, wrong-issuer, wrong-audience, wrong-client, and missing-scope tokens are rejected before every operation; malformed JSON-RPC, unsupported versions, and unknown sessions fail with sanitized errors |
| MCP-DEV-05; ADR-012 Sessions and infrastructure | Origins are bounded | Exact ChatGPT origin succeeds; absent origin succeeds only for the approved authenticated Claude client; `null`, malformed, and unlisted origins fail |
| MCP-DEV-06; ADR-012 Sessions and infrastructure | Sessions cannot cross identities or clients | Tenant, subject, OAuth-client, connector-class, origin-class, and protocol-version mismatch tests fail; expiry, close, restart, and rollout require reinitialization |
| MCP-DEV-07; ADR-012 Verification gates | Protocol lifecycle works | Claude and ChatGPT independently complete discovery, PKCE, initialize, notification, list, call, close, token expiry, consent/account revocation within documented semantics, and reauthorization |
| MCP-DEV-08; Tool Policy 11 | Limits protect dispatch | Oversized body, excessive client/principal/IP rate, initialization churn, session saturation, concurrency, and duration tests return sanitized bounded failures |
| MCP-DEV-09; ADR-012 Service boundary; Tool Policy 8 and 10 | No sensitive integration exists | Architecture test proves no PostgreSQL or API implementation imports; identity has only approved `AcrPull`; direct/inherited RBAC and dependencies are inventoried; egress controls or approved residual risk plus runtime observation show no private API or model calls |
| MCP-DEV-10; Tool Policy 12 | Audit is useful and minimized | Events include server correlation ID, client identity, protocol, method, tool, status, denial, policy version, hashed session, and approved operational fields; application, Fastify, Container Apps, Log Analytics, exports, and exception paths exclude prohibited data |
| MCP-DEV-11; ADR-012 Consequences and rollback | Failure is isolated | Scale-to-zero, Entra failure, connector failure, ingress disable, traffic rollback, and revision deactivation leave web/API health unchanged |
| MCP-DEV-12; ADR-012 UI isolation | No unapproved provider UI is exposed | Tool listing contains no widget, resource template, prompt, completion, or model capability |
| MCP-DEV-13; ADR-012 Activation gates | Deployment is governed | SBOM, vulnerability and provenance checks, Bicep build, policy review, `what-if`, exact-SHA/digest/input binding, protected approval, smoke test, and rollback evidence identify both reviewed revisions by SHA, digest, readiness, traffic state, and probe result |
| MCP-DEV-14; ADR-012 Activation gates | DNS and TLS are governed and reversible | Pre-change DNS snapshot, DNS-only record review, staged managed-certificate binding, metadata/HTTPS probes, issuance and renewal monitoring, and teardown/restoration evidence are retained |

## Verification commands and evidence

- Run the focused MCP package checks and provider compatibility fixtures.
- Run architecture, secret, dependency, and complete repository verification
  with `pnpm verify` before review.
- Compile every affected Bicep entry point and retain machine-readable
  `what-if` output for the target resource group.
- Capture image digest, source SHA, workflow run IDs, deployment revision,
  exposed route inventory, Entra metadata, sanitized test results, alert checks,
   and rollback timestamps in the approved evidence store. Do not capture
   credentials, token contents, identity claims, or unsanitized screenshots.

## Rollback and emergency disable

The first containment action is to disable provider connections and external
ingress. Revoke consent and workload access, deactivate the current Container
App revision, and invalidate all ephemeral sessions. If service restoration is
appropriate, route traffic to the prior reviewed image digest. The MCP managed
identity has no private data permissions, so containment does not require a
database or application rollback. Public web, API, and deterministic workflows
must remain available throughout.

## Open decisions

Implementation is approved. The first deployment and ChatGPT connection remain
blocked until operators record:

- the Entra resource and client application IDs, owners, consent owner, and
  exact ChatGPT redirect URI;
- protected `dev` environment variables containing only non-secret IDs;
- the Cloudflare DNS snapshot and owner, DNS-only record, managed-certificate
  staging result, and renewal owner;
- a successful workflow plan for the exact main SHA, immutable image digest,
  Bicep hash, parameter hash, and reviewed `what-if`;
- direct and inherited RBAC inventory proving the MCP identity has only the
  intended registry pull access;
- alert recipient, evidence custodian, and operator for the proof window;
- an Azure budget/alert or equivalent reviewed subscription-level control that
  keeps incremental MCP Azure spend within USD 25 monthly;
- explicit Security/Privacy and SRE acceptance of the shared-environment egress
  residual risk, or an approved enforceable egress control.

Claude registration remains a separate unapproved decision. ChatGPT may remain
available in dev after successful proof while every approved boundary above
continues to hold.

## Accepted dev residual risks

The Product Owner accepted the following bounded dev-only residuals before
activation:

- Azure Container Apps retains a generated public hostname. The application
   serves MCP and protected-resource metadata only when the HTTP host is
   `mcp.keyforta.com`; ordinary requests through the generated hostname return a
   sanitized `404`. Because the platform terminates TLS, the application cannot
   independently prove the original SNI value. OAuth, exact client, origin,
   tenant, audience, delegated scope, and session binding remain mandatory.
   Adding a paid gateway or Cloudflare proxy control requires a separate design
   and cost decision.
- The reused Container Apps environment does not enforce workload-specific
   egress. This synthetic service has no database, Blob, private API, Key Vault,
   model-provider, or tenant-data credential or role. Dependency scanning,
   registry-only RBAC verification, minimized telemetry, and the 15-minute
   disable procedure bound the accepted dev risk.
- The Azure budget alert is sent to the signed-in Azure account owner without
   storing the address in source control. The workflow requires an enabled
   `keyforta-mcp-dev` budget of no more than USD 25 before image publication or
   deployment.

PR #25 must be reviewed against the accepted ADR and this plan. It must not be
merged solely because its existing CI checks pass.