import { afterEach, describe, expect, it } from "vitest";

import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "../src/protocol.js";
import {
  authorizationHeaders,
  createTestServer,
  initializeSession,
  type TestServer,
} from "./support.js";

const servers: TestServer[] = [];

async function startServer(): Promise<TestServer> {
  const server = await createTestServer();
  servers.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.app.close()));
});

async function send(
  server: TestServer,
  sessionId: string,
  message: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return server.app.inject({
    headers: {
      ...authorizationHeaders(),
      "mcp-protocol-version": LATEST_PROTOCOL_VERSION,
      "mcp-session-id": sessionId,
      ...headers,
    },
    method: "POST",
    payload: JSON.stringify(message),
    url: "/mcp",
  });
}

describe("MCP Streamable HTTP protocol", () => {
  it("initializes, negotiates a supported version, and issues a session", async () => {
    const server = await startServer();
    const { body, sessionId } = await initializeSession(server);

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(body).toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        capabilities: { tools: { listChanged: false } },
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: { name: "keyforta-mcp-server" },
      },
    });
  });

  it("negotiates every supported protocol version", async () => {
    for (const protocolVersion of SUPPORTED_PROTOCOL_VERSIONS) {
      const server = await startServer();
      const { body } = await initializeSession(server, protocolVersion);
      expect(
        (body.result as { protocolVersion: string }).protocolVersion,
      ).toBe(protocolVersion);
    }
  });

  it("rejects an unsupported initialize protocol version", async () => {
    const server = await startServer();
    const response = await server.app.inject({
      headers: authorizationHeaders(),
      method: "POST",
      payload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "1999-01-01" },
      }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["mcp-session-id"]).toBeUndefined();
    expect(response.json()).toMatchObject({
      error: {
        code: -32602,
        data: {
          reason: "unsupported_protocol_version",
          supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        },
      },
    });
  });

  it("rejects an unsupported protocol version header", async () => {
    const server = await startServer();
    const { sessionId } = await initializeSession(server);
    const response = await send(
      server,
      sessionId,
      { id: 2, jsonrpc: "2.0", method: "tools/list" },
      { "mcp-protocol-version": "1999-01-01" },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.data.reason).toBe(
      "unsupported_protocol_version",
    );
  });

  it("lists only the narrow read-only health tool", async () => {
    const server = await startServer();
    const { sessionId } = await initializeSession(server);
    const response = await send(server, sessionId, {
      id: 2,
      jsonrpc: "2.0",
      method: "tools/list",
    });

    expect(response.statusCode).toBe(200);
    const tools = response.json().result.tools as {
      inputSchema: Record<string, unknown>;
      name: string;
    }[];
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("system.health");
    expect(tools[0]?.inputSchema).toMatchObject({
      additionalProperties: false,
      properties: {},
      type: "object",
    });
  });

  it("returns synthetic health data without product or identity fields", async () => {
    const server = await startServer();
    const { sessionId } = await initializeSession(server);
    const response = await send(server, sessionId, {
      id: 3,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: {}, name: "system.health" },
    });

    expect(response.statusCode).toBe(200);
    const result = response.json().result;
    expect(result.structuredContent).toMatchObject({
      dataBoundary: "synthetic",
      readOnly: true,
      serviceName: "keyforta-mcp-server",
      status: "ok",
    });
    expect(result._meta).toBeUndefined();

    const serialized = JSON.stringify(result).toLowerCase();
    for (const prohibited of [
      "credential",
      "document",
      "lease",
      "maintenance",
      "organization",
      "password",
      "payment",
      "property",
      "secret",
      "tenant",
      "token",
      "unit",
      "user",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("answers ping and accepts initialized notifications", async () => {
    const server = await startServer();
    const { sessionId } = await initializeSession(server);

    const ping = await send(server, sessionId, {
      id: 4,
      jsonrpc: "2.0",
      method: "ping",
    });
    expect(ping.statusCode).toBe(200);
    expect(ping.json().result).toEqual({});

    const notification = await send(server, sessionId, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(notification.statusCode).toBe(202);
    expect(notification.body).toBe("");
  });

  it("fails closed on malformed and unsupported requests", async () => {
    const server = await startServer();
    const { sessionId } = await initializeSession(server);

    const malformedJson = await server.app.inject({
      headers: { ...authorizationHeaders(), "mcp-session-id": sessionId },
      method: "POST",
      payload: "{ not json",
      url: "/mcp",
    });
    expect(malformedJson.statusCode).toBe(400);
    expect(malformedJson.json().error.code).toBe(-32700);

    const emptyMessage = await send(
      server,
      sessionId,
      {} as Record<string, never>,
    );
    expect(emptyMessage.statusCode).toBe(400);

    const arrayPayload = await server.app.inject({
      headers: { ...authorizationHeaders(), "mcp-session-id": sessionId },
      method: "POST",
      payload: JSON.stringify([
        { id: 1, jsonrpc: "2.0", method: "tools/list" },
      ]),
      url: "/mcp",
    });
    expect(arrayPayload.statusCode).toBe(400);
    expect(arrayPayload.json().error.data.reason).toBe("batch_not_supported");

    const unknownMethod = await send(server, sessionId, {
      id: 5,
      jsonrpc: "2.0",
      method: "resources/list",
    });
    expect(unknownMethod.statusCode).toBe(404);
    expect(unknownMethod.json().error.code).toBe(-32601);

    const unknownTool = await send(server, sessionId, {
      id: 6,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "leases.read" },
    });
    expect(unknownTool.statusCode).toBe(404);
    expect(unknownTool.json().error.data.reason).toBe("unknown_tool");

    const invalidArguments = await send(server, sessionId, {
      id: 7,
      jsonrpc: "2.0",
      method: "tools/call",
      params: { arguments: { organizationId: "injected" }, name: "system.health" },
    });
    expect(invalidArguments.statusCode).toBe(400);
    expect(invalidArguments.json().error.data.reason).toBe(
      "malformed_tool_arguments",
    );

    const unexpectedNotificationId = await send(server, sessionId, {
      id: 8,
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(unexpectedNotificationId.statusCode).toBe(400);
  });

  it("closes sessions and rejects replayed session identifiers", async () => {
    const server = await startServer();
    const { sessionId } = await initializeSession(server);

    const closed = await server.app.inject({
      headers: { ...authorizationHeaders(), "mcp-session-id": sessionId },
      method: "DELETE",
      url: "/mcp",
    });
    expect(closed.statusCode).toBe(204);

    const replayed = await send(server, sessionId, {
      id: 9,
      jsonrpc: "2.0",
      method: "tools/list",
    });
    expect(replayed.statusCode).toBe(404);
    expect(replayed.json().error.data.reason).toBe("unknown_session");

    const closedAgain = await server.app.inject({
      headers: { ...authorizationHeaders(), "mcp-session-id": sessionId },
      method: "DELETE",
      url: "/mcp",
    });
    expect(closedAgain.statusCode).toBe(404);
  });

  it("requires a session for every post-initialize request", async () => {
    const server = await startServer();
    await initializeSession(server);
    const response = await server.app.inject({
      headers: authorizationHeaders(),
      method: "POST",
      payload: JSON.stringify({ id: 10, jsonrpc: "2.0", method: "tools/list" }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.data.reason).toBe("missing_session");
  });

  it("does not offer server-initiated streams", async () => {
    const server = await startServer();
    const response = await server.app.inject({
      headers: authorizationHeaders(),
      method: "GET",
      url: "/mcp",
    });

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe("DELETE, POST");
  });

  it("serves unauthenticated platform health without product data", async () => {
    const server = await startServer();
    const response = await server.app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: "keyforta-mcp-server",
      status: "ok",
    });
  });
});
