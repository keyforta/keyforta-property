# KEYFORTA MCP server

Standalone Streamable HTTP MCP application for the synthetic health capability.
It does not import the private API, access PostgreSQL, call a model provider, or
serve tenant data.

Build the widget before local startup:

```bash
pnpm --filter @keyforta/tool-system-health build
MCP_ENABLE_LOCAL_SYNTHETIC_AUTH=true pnpm --filter @keyforta/mcp-server dev
```

The local endpoint is `http://127.0.0.1:3200/mcp` and accepts only the synthetic
header `Authorization: Bearer keyforta-local-synthetic`. Production startup
fails closed because Entra integration requires a separate approved task.