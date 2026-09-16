# MCP server

Standalone Model Context Protocol boundary for KEYFORTA, accepted by
[ADR-012](../../docs/adr/ADR-012-standalone-mcp-service.md). This first slice
exposes only synthetic server metadata and one read-only health/capability
tool. It is not deployed, not publicly reachable, and calls no model provider.

## Endpoints

- `POST /mcp` — Streamable HTTP JSON-RPC (`initialize`, `notifications/*`,
  `ping`, `tools/list`, `tools/call`)
- `DELETE /mcp` — explicit session termination
- `GET /mcp` — `405`; server-initiated streams are not offered
- `GET /health` — unauthenticated platform probe with no product data
- `GET /.well-known/oauth-protected-resource[/mcp]` — RFC 9728 metadata, served
  only when protected-resource metadata is configured

Supported protocol versions are `2025-06-18` (latest) and `2025-03-26`.

## Boundaries

- Every `/mcp` request is authenticated through the injected
  `McpAuthenticator`. Actor identity is never read from JSON-RPC content, and
  no client-supplied organization context is accepted.
- Sessions are opaque, ephemeral, single-replica, and bound to the
  authenticated subject, origin class, and negotiated protocol version, with
  idle, absolute, and count limits.
- Requests fail closed on missing or invalid credentials, unsupported origins,
  unsupported protocol versions, unsupported media types, malformed JSON-RPC,
  batched messages, unknown or expired sessions, and insufficient scope.
  Errors carry a stable reason and correlation ID only.
- The `system.health` tool returns synthetic service metadata. There is no
  database access, no outbound provider call, no write tool, and no tenant,
  lease, payment, document, maintenance, or person-related data.
- A bounded per-client rate limit, body limit, and request timeout apply before
  protocol dispatch.
- Audit records contain correlation ID, client identity, protocol version,
  method, tool name, result status, denial reason, policy version, and a hashed
  session reference. They never contain credentials, prompts, arguments, or
  results.
- The API and web applications do not depend on this service; deterministic
  product workflows continue when it is unavailable.

The packaged `tools/<domain>/<tool-name>` topology and the App SDK widget
channel described by ADR-012 arrive with the separately approved widget slice;
this slice registers the health tool through the explicit in-process registry.

## Local use

```bash
MCP_DEVELOPMENT_ACCESS_TOKEN="$(openssl rand -hex 32)" \
  pnpm --filter @keyforta/mcp-server dev
```

Startup fails closed when `NODE_ENV=production` or when no development
credential is provided. Generate the credential locally; never commit one.
Optional variables are `MCP_ALLOWED_ORIGINS` (comma-separated exact browser
origins), `MCP_HOST` (default `127.0.0.1`), and `MCP_PORT` (default `3100`).

Run `pnpm --filter @keyforta/mcp-server check` for tests, type checks, and the
build.
