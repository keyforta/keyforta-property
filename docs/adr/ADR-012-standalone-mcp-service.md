# ADR-012: Standalone MCP App SDK Platform

**Status:** Accepted for implementation planning
**Date:** 2026-09-15
**Owners:** Product, Technology/Architecture, Security/Privacy, UX, Platform/SRE

## Context

Issues [#15](https://github.com/keyforta/keyforta-property/issues/15) and
[#17](https://github.com/keyforta/keyforta-property/issues/17) approve design of
a bounded Model Context Protocol foundation for Claude and ChatGPT cloud
connectors. The first slice exposes only server metadata and one synthetic
read-only health/capability tool with an isolated React widget. It exposes no
tenant or business data and calls no model provider.

The initially approved `/mcp` route inside the private API was superseded by
the requirement that MCP be independently deployed and never implemented in
`apps/api`. Cloud connectors originate outside the KEYFORTA network and require
a reachable HTTPS endpoint. The service also needs provider-driven MCP and App
SDK compatibility, iframe isolation, separate release controls, and an
emergency disable path that cannot interrupt deterministic application traffic.

ADR-001 starts KEYFORTA as a modular monolith and permits extraction when
independent scaling, availability, provider coupling, or ownership justifies
the operational cost. The public protocol, identity, widget, and connector
boundary provides that measurable justification. The private API remains the
business authorization, domain, persistence, and audit authority.

The requested dependency-free package cannot contain Zod schemas because Zod
is executable runtime validation. Compile-time declarations and runtime schemas
therefore require separate ownership. Similarly, MCP result `_meta` is hidden
from the model but delivered to client-side widget code; it is not a secret
store or an authorization boundary.

## Decision

Create a standalone TypeScript MCP application and a package-oriented tool and
widget platform in the existing pnpm monorepo. Add Turborepo only as a build
orchestrator. It must not replace direct pnpm scripts, canonical harness
verification, GitHub controls, or package export boundaries.

The architecture and inactive infrastructure definition may be prepared after
this ADR is accepted. Runtime implementation, dependency installation,
external identity changes, public ingress activation, Azure provisioning,
credentials, provider connections, paid services, and deployment require
separately routed task contracts and explicit approvals.

### Repository topology

```text
apps/
  mcp-server/                  # HTTP MCP resource server and API adapters
packages/
  contracts/                   # Runtime Zod schemas, including MCP envelopes
  types/                       # Dependency-free, type-only declarations
  ui/                          # Existing shared product components and tokens
  ui-core/                     # Widget bridge, theme, localization, a11y fixtures
  build-utils/                 # Shared Vite widget build configuration
tools/
  system/
    health/                    # Synthetic tool, widget, stories, and tests
```

Every future `tools/<domain>/<tool-name>` package owns:

- `tool.ts` with strict input/output schemas, metadata, a description, and a
  handler factory;
- `src/` with the isolated React widget and extracted string tables;
- `stories/` covering loading, empty, populated, and error states;
- `tests/` covering handler behavior, contracts, serialization, isolation,
  accessibility, and widget states;
- a deterministic standalone `dist/index.html` output produced through
  `@keyforta/build-utils`.

Tool packages do not self-register through filesystem scanning or import-time
side effects. `apps/mcp-server` owns an explicit registry generated from
reviewed package exports. Startup fails on duplicate tool names, resource URIs,
or incompatible contract versions.

### Root build contract

- Root `package.json` retains `pnpm@11.19.0`, adds pinned Turbo and TypeScript
  development tooling, and exposes dependency-aware build, check, test,
  Storybook, and widget commands.
- `pnpm-workspace.yaml` retains `apps/*` and `packages/*`, adds `tools/*/*`, and
  preserves the explicit esbuild build policy.
- `turbo.json` caches only deterministic tasks with declared inputs and outputs.
  Development servers and Storybook are persistent and uncached. Harness,
  security, evidence, identity, and deployment commands are never satisfied
  from Turbo cache.
- Root `tsconfig.base.json` uses strict NodeNext/ES2022 defaults,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and
  `verbatimModuleSyntax`. Package configs add DOM libraries only for widget
  code and Node types only for server/build code.
- Packages consume each other through declared workspace dependencies and
  exports. TypeScript path aliases must not bypass those boundaries.
- Direct pnpm package scripts remain available until build, test, cache, and
  canonical verification parity is demonstrated.

### Core contracts and ownership

`@keyforta/types` exports only erased TypeScript declarations and has no runtime
dependencies or emitted validation logic. It defines serializable shapes for:

- `ToolResult<TStructured, TWidgetMeta>`;
- `SafeToolError` with a stable code, localized message key, retryability, and
  correlation ID;
- `WidgetResourceDescriptor` with a `ui://keyforta/...` URI, MIME type, CSP
  domains, contract version, and accessibility metadata;
- `ToolExecutionContext` with an immutable validated principal reference,
  granted scopes, locale, and correlation ID, but never a raw token;
- versioned widget bridge command and event unions.

`@keyforta/contracts` and each owning tool export strict Zod schemas for data
that crosses a runtime boundary. The server validates tool input before handler
dispatch and validates the complete result before serialization. Unknown keys,
non-finite values, unsupported content, and contract-version mismatches fail
closed.

Every tool result has three deliberate channels:

- `structuredContent` is concise JSON visible to both model and widget. It
  contains only fields needed for model reasoning and UI coordination.
- `content` is short localized narration for model reasoning and non-widget
  clients.
- `_meta` references the `ui://keyforta/<domain>/<tool-name>` resource and may
  contain larger presentation data visible only to the widget, subject to the
  same user authorization and data minimization rules.

Neither channel may contain credentials, authorization codes, access or refresh
tokens, cookies, connection strings, server-only policy context, raw provider
errors, stack traces, or data the authenticated user may not receive. Model
hidden does not mean browser secret. Sensitive tenant data remains prohibited
from the first slice and requires a separate privacy, product, authorization,
and cross-organization decision.

Tool descriptions use precise "use when" and "do not use when" language. A
deterministic UTF-8 byte check rejects descriptions of 1024 bytes or more.

### Widget isolation and accessibility

Each widget is built as a standalone HTML resource and runs in the connector's
sandboxed iframe. `@keyforta/ui-core` provides a versioned bridge over
`postMessage`, Fluent UI theme integration aligned with `@keyforta/ui`, locale
resolution, and reusable accessibility test fixtures.

The bridge validates message source, exact configured origin, protocol version,
message kind, and payload schema before dispatch. It never transports tokens,
credentials, server authorization context, or unrestricted parent-window data.
Widgets have no direct private API or database access. Their network and asset
domains are denied by default and broadened only through reviewed resource CSP
metadata.

Visible strings, accessible names, status announcements, dates, numbers, and
errors come from typed locale tables with a deterministic fallback. Every
widget supports loading, empty, populated, and error states; keyboard operation;
programmatic busy/status/error state; logical focus behavior; WCAG 2.2 AA
contrast; reduced motion; zoom and text reflow; and responsive narrow/wide
layouts. Storybook is a development and visual-state fixture, not a production
runtime dependency.

### Service and data boundary

`apps/mcp-server` owns the Streamable HTTP endpoint at `/mcp`, OAuth resource
metadata, authentication middleware, protocol/session limits, explicit tool and
resource registries, safe error mapping, and typed private API adapters. It
must not import `apps/api` implementation modules, connect to PostgreSQL, embed
business authorization, or accept actor/organization authority from JSON-RPC
content or widget messages.

Downstream calls use parameterized typed HTTPS clients. URL paths, query
parameters, and bodies are produced from validated contracts rather than string
concatenation. The private API independently authenticates, resolves membership,
authorizes records, applies domain rules, projects minimum fields, and writes
authoritative audit records.

Handler failures are mapped to a small stable error taxonomy. Model-visible and
widget-visible summaries contain a correlation ID and safe localization key,
not raw exception messages, validation internals, provider payloads, SQL, paths,
or stack traces. Detailed diagnostics remain in bounded server telemetry without
tokens, prompts, personal data, tool payloads, or tenant data.

### Authentication and delegated API access

Microsoft Entra is the identity authority. The MCP server is an OAuth resource
server with its own application ID URI, audience, and least-privilege delegated
scope. It publishes RFC 9728 protected-resource metadata and a matching
`WWW-Authenticate` challenge. Every MCP HTTP request validates signature,
tenant-specific issuer, audience, time bounds, and required scopes before
protocol dispatch.

Direct connector compatibility is a mandatory non-production proof gate. The
proof covers protected-resource and authorization-server discovery,
authorization code with S256 PKCE, exact redirect URIs, supported client
identification or registration, RFC 8707 resource handling, token audience,
scope, expiry, revocation, and reauthorization for Claude and ChatGPT.

If Entra cannot directly satisfy a connector's registration, metadata, or
resource behavior, implementation stops. An OAuth compatibility authorization
server or broker requires a new architecture, security, privacy, cost, and
operations decision. This ADR does not authorize a custom authorization server
or weaker audience validation.

Future business tools exchange the MCP-audience user token for a distinct
private-API-audience token through Entra on-behalf-of flow. The inbound MCP
token is never passed through. The API resolves actor and organization context;
the model, connector, tool input, and widget cannot override either. OBO and
private API calls are not needed by the synthetic first slice.

### Sessions, infrastructure, and operations

Sessions use opaque random identifiers bound to the authenticated subject,
origin class, and protocol version. They have bounded idle and absolute expiry,
maximum count, explicit close behavior, and authentication on every request.
The synthetic pilot uses one Container App replica and ephemeral in-memory
sessions. Scale-to-zero, restart, or revision replacement invalidates sessions;
clients reinitialize. Horizontal scaling or a shared session store needs a new
approved data lifecycle and cost decision.

Infrastructure is a separate inactive Bicep deployment unit with an immutable
image digest, dedicated managed identity, least-privilege RBAC, scale-to-zero
consumption capacity, bounded CPU/memory, and existing approved telemetry where
possible. IaC contains no credentials. No workflow deploys it without protected
environment approval and reviewed `what-if` evidence.

Only `/mcp`, protected-resource metadata, widget resources, and minimal platform
health endpoints may be externally reachable. The private API remains private.
TLS, body, concurrency, duration, and rate limits apply before dispatch. Exact
configured browser origins are allowed; absent `Origin` is allowed for
non-browser cloud connectors; malformed, `null`, and unlisted origins fail.

Telemetry includes request count, denial category, latency, session count,
limit rejection, tool name, result status, protocol version, connector class,
revision, and correlation ID. Alerts cover authentication failures, rate limits,
errors, latency, restarts, session saturation, and Entra/API dependency failure.
Tokens, prompts, arguments, results, personal data, and tenant data are excluded
from logs.

Pilot cost is bounded by scale-to-zero, one replica, existing ACR and Log
Analytics reuse, and no shared session store. A non-zero minimum, dedicated
gateway, authorization product, external store, or paid connector plan requires
an explicit cost decision.

## Verification and activation gates

Deterministic tests must cover protocol negotiation, strict schemas, registry
uniqueness, authentication, origin checks, session binding/expiry, limits,
description byte length, split-result serialization, safe errors, bridge origin
and schema checks, localization fallback, all four widget states, accessibility,
CSP metadata, shutdown, and absence of prohibited data.

Live Claude and ChatGPT checks use only synthetic data in a non-production
environment with credential-isolated evidence. Canonical offline CI requires no
external secret and cannot claim live connector compatibility.

Before implementation begins, this ADR requires Product, Architecture,
Security/Privacy, UX, and Platform/SRE acceptance and separate application and
infrastructure task contracts. Before any public endpoint is activated, require
an approved Entra registration/consent design, connector privacy review,
threat model, Bicep build and `what-if`, cost estimate, runbook, monitoring,
rollback exercise, and explicit environment deployment approval.

## Consequences

- MCP protocol and widget dependencies do not expand the private API runtime or
  public ingress surface.
- Explicit package ownership makes each tool reviewable and testable, but adds
  build graph, Storybook, localization, and compatibility maintenance.
- Split result channels reduce model context size but do not relax browser data
  disclosure rules.
- Delegated OBO preserves user context and prevents token passthrough, but
  requires coordinated Entra registrations, consent, and API scopes.
- The one-replica ephemeral session model is inexpensive but intentionally has
  no continuity during scale-to-zero, restart, or rollout.
- Deterministic product workflows continue when MCP, widgets, Entra exchange,
  Claude, or ChatGPT is unavailable.

## Rejected alternatives

- **MCP inside `apps/api`:** rejected by the explicit deployment requirement
  and because it expands the private business API boundary.
- **Sidecar on the API deployment:** rejected because it shares lifecycle,
  scaling, and failure isolation.
- **Zod in dependency-free `packages/types`:** rejected because Zod is a
  runtime dependency; runtime schemas remain in contract/tool packages.
- **Custom `skill://` widget URI:** rejected in favor of the App SDK `ui://`
  convention and direct compatibility testing.
- **Filesystem auto-discovery:** rejected because explicit registration is more
  deterministic and reviewable.
- **Direct PostgreSQL access:** rejected because MCP is not an authorization or
  domain boundary.
- **Pass MCP tokens to the API:** rejected as audience-invalid token passthrough
  and a confused-deputy risk.
- **Secrets or unrestricted sensitive data in `_meta`:** rejected because
  browser code receives `_meta`.
- **Shared session storage in the first slice:** rejected because one synthetic
  tool does not justify its cost and data lifecycle.

## Rollback and containment

Before activation, rollback removes the new packages and Turbo wiring and
restores direct pnpm scripts; no data migration or external resource is involved.
After separately approved activation, containment disables connector
registrations and ingress, revokes consent and workload access, stops the
Container App revision to invalidate sessions, and leaves the private API and
deterministic workflows operating.

## Approval record

- Standalone deployment inputs:
  [issue #15 comment 5688119424](https://github.com/keyforta/keyforta-property/issues/15#issuecomment-5688119424)
- Expanded requirement and Product Owner approval:
  [issue #17 comment 5688216704](https://github.com/keyforta/keyforta-property/issues/17#issuecomment-5688216704)
- Product, Architecture, Security/Privacy, UX, and Platform/SRE acceptance:
  [issue #17 comment 5688247402](https://github.com/keyforta/keyforta-property/issues/17#issuecomment-5688247402)

This acceptance authorizes implementation planning and separate task contracts.
It does not authorize external identity changes, infrastructure activation,
credentials, provider connections, paid services, or deployment.