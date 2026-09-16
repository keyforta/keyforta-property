import { afterEach, describe, expect, it } from "vitest";

import {
  type McpAuthenticator,
  createStaticAuthenticator,
  credentialScheme,
} from "../src/auth.js";
import { LATEST_PROTOCOL_VERSION } from "../src/protocol.js";
import { createSessionStore } from "../src/sessions.js";
import {
  authorizationHeaders,
  createTestServer,
  initializeSession,
  syntheticCredential,
  type TestServer,
} from "./support.js";

const servers: TestServer[] = [];

async function startServer(
  options: Parameters<typeof createTestServer>[0] = {},
): Promise<TestServer> {
  const server = await createTestServer(options);
  servers.push(server);
  return server;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.app.close()));
});

const protectedResourceMetadata = {
  authorizationServers: [
    "https://login.microsoftonline.com/synthetic-directory/v2.0",
  ],
  resource: "https://mcp.invalid/mcp",
  resourceMetadataUrl:
    "https://mcp.invalid/.well-known/oauth-protected-resource/mcp",
  scopesSupported: ["mcp.tools.read"],
};

describe("MCP request authentication and isolation", () => {
  it("rejects unauthenticated requests with a sanitized challenge", async () => {
    const server = await startServer({ protectedResourceMetadata });
    const response = await server.app.inject({
      headers: { "content-type": "application/json", host: "mcp.invalid" },
      method: "POST",
      payload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: LATEST_PROTOCOL_VERSION },
      }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toContain(credentialScheme);
    expect(response.headers["www-authenticate"]).toContain(
      protectedResourceMetadata.resourceMetadataUrl,
    );
    expect(response.json().error.data.reason).toBe("missing_credential");
    expect(JSON.stringify(response.json())).not.toContain(syntheticCredential);
  });

  it("does not expose MCP through an unapproved hostname", async () => {
    const server = await startServer({ protectedResourceMetadata });
    const response = await server.app.inject({
      headers: { ...authorizationHeaders(), host: "generated.azurecontainerapps.io" },
      method: "POST",
      payload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: LATEST_PROTOCOL_VERSION },
      }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.data.reason).toBe("unknown_resource");
    expect(server.auditRecords.at(-1)).toMatchObject({
      reason: "unapproved_hostname",
      status: "denied",
    });
  });

  it("rejects an invalid credential", async () => {
    const server = await startServer();
    const response = await server.app.inject({
      headers: authorizationHeaders("synthetic-rejected-credential-value"),
      method: "POST",
      payload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: LATEST_PROTOCOL_VERSION },
      }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.data.reason).toBe("invalid_credential");
  });

  it("denies initialize without the required scope", async () => {
    const server = await startServer({
      authenticator: createStaticAuthenticator({
        clientId: "synthetic-test-client",
        grantedScopes: ["mcp.metadata.read"],
        token: syntheticCredential,
      }),
    });
    const response = await server.app.inject({
      headers: authorizationHeaders(),
      method: "POST",
      payload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: LATEST_PROTOCOL_VERSION },
      }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["mcp-session-id"]).toBeUndefined();
    expect(response.json().error.data.reason).toBe("insufficient_scope");
    expect(server.auditRecords.at(-1)).toMatchObject({
      reason: "insufficient_scope",
      status: "denied",
    });
  });

  it("allows configured browser origins and non-browser connectors only", async () => {
    const server = await startServer({
      allowedOrigins: ["https://claude.ai"],
    });

    const allowed = await initializeSession(server, LATEST_PROTOCOL_VERSION, {
      origin: "https://claude.ai",
    });
    expect(allowed.sessionId).not.toBe("");

    for (const origin of [
      "null",
      "https://claude.ai.attacker.invalid",
      "https://claude.ai/",
      "not-a-url",
    ]) {
      const response = await server.app.inject({
        headers: { ...authorizationHeaders(), origin },
        method: "POST",
        payload: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: { protocolVersion: LATEST_PROTOCOL_VERSION },
        }),
        url: "/mcp",
      });
      expect(response.statusCode, origin).toBe(403);
      expect(response.json().error.data.reason).toBe("unsupported_origin");
    }

    const unlistedClient = await startServer({
      allowedNonBrowserClientIds: ["approved-connector-client"],
      authenticator: createStaticAuthenticator({
        clientId: "unlisted-connector-client",
        token: syntheticCredential,
      }),
    });
    const absentOrigin = await unlistedClient.app.inject({
      headers: authorizationHeaders(),
      method: "POST",
      payload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: LATEST_PROTOCOL_VERSION },
      }),
      url: "/mcp",
    });
    expect(absentOrigin.statusCode).toBe(403);
    expect(absentOrigin.json().error.data.reason).toBe("unsupported_origin");
  });

  it("binds a session to its authenticated subject", async () => {
    const otherCredential = "synthetic-second-development-credential";
    const authenticator: McpAuthenticator = {
      authenticate: async (token) => {
        if (token === syntheticCredential) {
          return {
            clientId: "synthetic-client-one",
            grantedScopes: ["mcp.tools.read"],
            principalReference: "synthetic-subject-1",
            tenantId: "synthetic-tenant-1",
          };
        }
        if (token === otherCredential) {
          return {
            clientId: "synthetic-client-two",
            grantedScopes: ["mcp.tools.read"],
            principalReference: "synthetic-subject-2",
            tenantId: "synthetic-tenant-1",
          };
        }
        return null;
      },
    };
    const server = await startServer({
      allowedNonBrowserClientIds: [
        "synthetic-client-one",
        "synthetic-client-two",
      ],
      authenticator,
    });
    const { sessionId } = await initializeSession(server);

    const response = await server.app.inject({
      headers: {
        ...authorizationHeaders(otherCredential),
        "mcp-session-id": sessionId,
      },
      method: "POST",
      payload: JSON.stringify({ id: 2, jsonrpc: "2.0", method: "tools/list" }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.data.reason).toBe(
      "mismatched_session_binding",
    );
  });

  it("expires idle sessions and bounds concurrent sessions", async () => {
    let currentTime = 1_000;
    const sessions = createSessionStore({
      idleTtlMs: 1_000,
      maxSessions: 1,
      now: () => currentTime,
    });
    const server = await startServer({ sessions });
    const { sessionId } = await initializeSession(server);

    const second = await initializeSession(server);
    expect(second.sessionId).toBe("");
    expect(
      (second.body.error as { data: { reason: string } }).data.reason,
    ).toBe("session_limit_reached");

    currentTime += 2_000;
    const response = await server.app.inject({
      headers: { ...authorizationHeaders(), "mcp-session-id": sessionId },
      method: "POST",
      payload: JSON.stringify({ id: 3, jsonrpc: "2.0", method: "tools/list" }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.data.reason).toBe("expired_session");
  });

  it("records bounded audit metadata without credentials or payloads", async () => {
    const server = await startServer();
    const { sessionId } = await initializeSession(server);
    await server.app.inject({
      headers: { ...authorizationHeaders(), "mcp-session-id": sessionId },
      method: "POST",
      payload: JSON.stringify({
        id: 2,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "system.health" },
      }),
      url: "/mcp",
    });

    const toolRecord = server.auditRecords.at(-1);
    expect(toolRecord).toMatchObject({
      clientId: "synthetic-test-client",
      method: "tools/call",
      policyVersion: "2026-09-16",
      protocolVersion: LATEST_PROTOCOL_VERSION,
      status: "ok",
      toolName: "system.health",
    });
    expect(toolRecord?.correlationId).toBeTruthy();
    expect(toolRecord?.sessionReference).toBeTruthy();
    expect(toolRecord?.sessionReference).not.toBe(sessionId);

    const serializedAudit = JSON.stringify(server.auditRecords);
    expect(serializedAudit).not.toContain(syntheticCredential);
    expect(serializedAudit).not.toContain(sessionId);
    expect(serializedAudit).not.toContain("synthetic-subject-1");
  });

  it("generates correlation IDs instead of trusting client request IDs", async () => {
    const server = await startServer();
    const suppliedRequestId = "client-controlled-request-id";
    const response = await server.app.inject({
      headers: {
        ...authorizationHeaders(),
        "x-request-id": suppliedRequestId,
      },
      method: "POST",
      payload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: LATEST_PROTOCOL_VERSION },
      }),
      url: "/mcp",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).not.toBe(suppliedRequestId);
    expect(server.auditRecords.at(-1)?.correlationId).toBe(
      response.headers["x-request-id"],
    );
  });

  it("publishes protected resource metadata only when configured", async () => {
    const configured = await startServer({ protectedResourceMetadata });
    const metadata = await configured.app.inject({
      headers: { host: "mcp.invalid" },
      method: "GET",
      url: "/.well-known/oauth-protected-resource/mcp",
    });
    expect(metadata.statusCode).toBe(200);
    expect(metadata.json()).toMatchObject({
      authorization_servers: protectedResourceMetadata.authorizationServers,
      resource: protectedResourceMetadata.resource,
      scopes_supported: protectedResourceMetadata.scopesSupported,
    });

    const unconfigured = await startServer();
    const missing = await unconfigured.app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("rate limits repeated requests before dispatch", async () => {
    const server = await startServer({ requestsPerMinute: 2 });
    const payload = JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: { protocolVersion: LATEST_PROTOCOL_VERSION },
    });

    const statusCodes: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await server.app.inject({
        headers: authorizationHeaders(),
        method: "POST",
        payload,
        url: "/mcp",
      });
      statusCodes.push(response.statusCode);
    }

    expect(statusCodes).toEqual([200, 200, 429]);
    expect(server.auditRecords.at(-1)).toMatchObject({
      reason: "rate_limited",
      status: "denied",
    });
  });

  it("rejects unsupported media types and response formats", async () => {
    const server = await startServer();

    const unsupportedMediaType = await server.app.inject({
      headers: {
        ...authorizationHeaders(),
        "content-type": "text/plain",
      },
      method: "POST",
      payload: "initialize",
      url: "/mcp",
    });
    expect(unsupportedMediaType.statusCode).toBe(415);

    const unacceptable = await server.app.inject({
      headers: { ...authorizationHeaders(), accept: "text/plain" },
      method: "POST",
      payload: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: LATEST_PROTOCOL_VERSION },
      }),
      url: "/mcp",
    });
    expect(unacceptable.statusCode).toBe(406);
    expect(unacceptable.json().error.data.reason).toBe("unsupported_accept");
  });
});
