import { afterEach, describe, expect, it } from "vitest";

import {
  authorizationHeaders,
  createTestServer,
  type TestServer,
} from "./support.js";

const protectedResourceMetadata = {
  authorizationServers: [
    "https://login.microsoftonline.com/synthetic-directory/v2.0",
  ],
  resource: "https://mcp.invalid",
  resourceMetadataUrl:
    "https://mcp.invalid/.well-known/oauth-protected-resource",
  scopesSupported: ["https://mcp.invalid/mcp.tools.read"],
};

/**
 * Synthetic protocol-level fixtures for the Claude and ChatGPT remote MCP
 * connectors. They require no provider account, credential, or outbound model
 * API call; only the documented Streamable HTTP client behavior is replayed.
 */
const connectorFixtures = [
  {
    name: "claude",
    origin: undefined,
    protocolVersion: "2025-06-18",
    requestHeaders: {
      accept: "application/json, text/event-stream",
      "user-agent": "synthetic-claude-connector/1.0",
    },
  },
  {
    name: "chatgpt",
    origin: "https://chatgpt.com",
    protocolVersion: "2025-03-26",
    requestHeaders: {
      accept: "application/json, text/event-stream",
      "user-agent": "synthetic-chatgpt-connector/1.0",
    },
  },
] as const;

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.app.close()));
});

describe("remote MCP connector compatibility", () => {
  it.each(connectorFixtures)(
    "completes the $name connector session lifecycle",
    async (fixture) => {
      const server = await createTestServer({
        allowedOrigins: ["https://chatgpt.com"],
        protectedResourceMetadata,
      });
      servers.push(server);

      const baseHeaders = {
        ...authorizationHeaders(),
        ...fixture.requestHeaders,
        host: "mcp.invalid",
        ...(fixture.origin ? { origin: fixture.origin } : {}),
      };

      const initialize = await server.app.inject({
        headers: baseHeaders,
        method: "POST",
        payload: JSON.stringify({
          id: "init-1",
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            capabilities: {},
            clientInfo: { name: fixture.name, version: "1.0.0" },
            protocolVersion: fixture.protocolVersion,
          },
        }),
        url: "/mcp",
      });

      expect(initialize.statusCode).toBe(200);
      expect(initialize.json().result.protocolVersion).toBe(
        fixture.protocolVersion,
      );
      const sessionId = String(initialize.headers["mcp-session-id"]);
      expect(sessionId).toMatch(/^[A-Za-z0-9_-]{16,128}$/);

      const sessionHeaders = {
        ...baseHeaders,
        "mcp-protocol-version": fixture.protocolVersion,
        "mcp-session-id": sessionId,
      };

      const initialized = await server.app.inject({
        headers: sessionHeaders,
        method: "POST",
        payload: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
        url: "/mcp",
      });
      expect(initialized.statusCode).toBe(202);

      const toolList = await server.app.inject({
        headers: sessionHeaders,
        method: "POST",
        payload: JSON.stringify({
          id: "list-1",
          jsonrpc: "2.0",
          method: "tools/list",
        }),
        url: "/mcp",
      });
      expect(toolList.statusCode).toBe(200);
      expect(
        (toolList.json().result.tools as { name: string }[]).map(
          (tool) => tool.name,
        ),
      ).toEqual(["system.health"]);
      expect(toolList.json().result.tools[0].securitySchemes).toEqual([
        {
          scopes: ["https://mcp.invalid/mcp.tools.read"],
          type: "oauth2",
        },
      ]);

      const toolCall = await server.app.inject({
        headers: sessionHeaders,
        method: "POST",
        payload: JSON.stringify({
          id: "call-1",
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: {}, name: "system.health" },
        }),
        url: "/mcp",
      });
      expect(toolCall.statusCode).toBe(200);
      expect(toolCall.headers["mcp-protocol-version"]).toBe(
        fixture.protocolVersion,
      );
      expect(toolCall.json().result.structuredContent.status).toBe("ok");
      expect(toolCall.json().result.content[0].type).toBe("text");

      const close = await server.app.inject({
        headers: sessionHeaders,
        method: "DELETE",
        url: "/mcp",
      });
      expect(close.statusCode).toBe(204);

      expect(
        server.auditRecords.map((record) => `${record.method}:${record.status}`),
      ).toEqual([
        "initialize:ok",
        "notifications/initialized:ok",
        "tools/list:ok",
        "tools/call:ok",
        "session/close:ok",
      ]);
    },
  );
});
