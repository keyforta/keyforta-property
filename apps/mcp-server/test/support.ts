import { buildMcpServer } from "../src/app.js";
import type { McpAuditRecord } from "../src/audit.js";
import type { McpAuthenticator, McpPrincipal } from "../src/auth.js";
import { createStaticAuthenticator, credentialScheme } from "../src/auth.js";
import { createSessionStore } from "../src/sessions.js";

export const syntheticCredential = "synthetic-mcp-development-credential";
export const syntheticReadOnlyPrincipal: McpPrincipal = {
  clientId: "synthetic-test-client",
  grantedScopes: ["mcp.tools.read"],
  principalReference: "synthetic-subject-1",
  tenantId: "synthetic-tenant-1",
};

export interface TestServerOptions {
  allowedNonBrowserClientIds?: readonly string[];
  allowedOrigins?: readonly string[];
  requestsPerMinute?: number;
  authenticator?: McpAuthenticator;
  now?: () => Date;
  protectedResourceMetadata?: Parameters<
    typeof buildMcpServer
  >[0]["protectedResourceMetadata"];
  sessions?: ReturnType<typeof createSessionStore>;
}

export interface TestServer {
  app: Awaited<ReturnType<typeof buildMcpServer>>;
  auditRecords: McpAuditRecord[];
}

export async function createTestServer(
  options: TestServerOptions = {},
): Promise<TestServer> {
  const auditRecords: McpAuditRecord[] = [];
  const app = await buildMcpServer({
    allowedNonBrowserClientIds:
      options.allowedNonBrowserClientIds ?? [syntheticReadOnlyPrincipal.clientId],
    allowedOrigins: options.allowedOrigins ?? [],
    auditSink: (record) => auditRecords.push(record),
    authenticator:
      options.authenticator ??
      createStaticAuthenticator({
        clientId: syntheticReadOnlyPrincipal.clientId,
        grantedScopes: syntheticReadOnlyPrincipal.grantedScopes,
        principalReference: syntheticReadOnlyPrincipal.principalReference,
        tenantId: syntheticReadOnlyPrincipal.tenantId,
        token: syntheticCredential,
      }),
    ...(options.now ? { now: options.now } : {}),
    ...(options.requestsPerMinute
      ? { requestsPerMinute: options.requestsPerMinute }
      : {}),
    ...(options.protectedResourceMetadata
      ? { protectedResourceMetadata: options.protectedResourceMetadata }
      : {}),
    ...(options.sessions ? { sessions: options.sessions } : {}),
  });
  return { app, auditRecords };
}

export function authorizationHeaders(
  token = syntheticCredential,
): Record<string, string> {
  return {
    accept: "application/json, text/event-stream",
    authorization: `${credentialScheme} ${token}`,
    "content-type": "application/json",
  };
}

export async function initializeSession(
  server: TestServer,
  protocolVersion = "2025-06-18",
  headers: Record<string, string> = {},
): Promise<{ body: Record<string, unknown>; sessionId: string }> {
  const response = await server.app.inject({
    headers: { ...authorizationHeaders(), ...headers },
    method: "POST",
    payload: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "synthetic-client", version: "1.0.0" },
        protocolVersion,
      },
    }),
    url: "/mcp",
  });

  return {
    body: response.json() as Record<string, unknown>,
    sessionId: String(response.headers["mcp-session-id"] ?? ""),
  };
}
