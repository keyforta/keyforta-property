import { randomUUID } from "node:crypto";

import rateLimit from "@fastify/rate-limit";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import {
  type McpAuditRecord,
  type McpAuditSink,
  type McpAuditStatus,
  MCP_POLICY_VERSION,
  sessionReference,
} from "./audit.js";
import {
  type McpAuthenticator,
  type McpPrincipal,
  credentialScheme,
  readBearerToken,
} from "./auth.js";
import {
  type JsonRpcErrorCode,
  JSON_RPC_ERROR_CODES,
  jsonRpcError,
} from "./errors.js";
import {
  type SupportedProtocolVersion,
  initializeParamsSchema,
  isSupportedProtocolVersion,
  jsonRpcRequestSchema,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  toolCallParamsSchema,
} from "./protocol.js";
import { type McpToolDefinition, type ToolRegistry, createToolRegistry } from "./registry.js";
import {
  type SessionStore,
  SessionCapacityError,
  createSessionStore,
} from "./sessions.js";
import { createSystemHealthTool } from "./tools/system-health.js";

export const serviceName = "keyforta-mcp-server";
export const serviceVersion = "0.1.0";

const sessionIdPattern = /^[A-Za-z0-9_-]{16,128}$/;
const mcpEndpointPath = "/mcp";

export interface ProtectedResourceMetadata {
  readonly authorizationServers: readonly string[];
  readonly resource: string;
  readonly resourceMetadataUrl: string;
  readonly scopesSupported: readonly string[];
}

export interface McpServerDependencies {
  /** Authenticated OAuth clients allowed to omit the browser Origin header. */
  allowedNonBrowserClientIds?: readonly string[];
  /** Exact browser origins allowed to reach the endpoint. */
  allowedOrigins?: readonly string[];
  /** Maximum requests per minute per source address. */
  requestsPerMinute?: number;
  auditSink?: McpAuditSink;
  authenticator: McpAuthenticator;
  now?: () => Date;
  protectedResourceMetadata?: ProtectedResourceMetadata;
  requiredScopes?: readonly string[];
  sessions?: SessionStore;
  tools?: ToolRegistry;
}

interface RequestOutcome {
  clientId: string | null;
  method: string | null;
  protocolVersion: string | null;
  reason: string | null;
  sessionId: string | null;
  status: McpAuditStatus;
  toolName: string | null;
}

/**
 * A response is deliverable when the client accepts JSON. An absent `Accept`
 * header is treated as permissive for non-browser connectors that omit it; a
 * present header must allow JSON because this endpoint never opens a
 * server-initiated stream.
 */
function acceptsJson(acceptHeader: string | undefined): boolean {
  if (typeof acceptHeader !== "string" || acceptHeader.trim() === "") {
    return true;
  }
  return acceptHeader
    .split(",")
    .map((entry) => entry.split(";")[0]?.trim().toLowerCase() ?? "")
    .some((mediaType) =>
      ["*/*", "application/*", "application/json"].includes(mediaType),
    );
}

function resolveOriginKey(
  originHeader: string | undefined,
  allowedOrigins: readonly string[],
): string | null {
  if (originHeader === undefined) return "non-browser";
  if (!allowedOrigins.includes(originHeader)) return null;
  try {
    const url = new URL(originHeader);
    return url.origin === originHeader ? url.origin : null;
  } catch {
    return null;
  }
}

export async function buildMcpServer(
  dependencies: McpServerDependencies,
): Promise<FastifyInstance> {
  if (!dependencies.authenticator) {
    throw new Error("The MCP server requires an authenticator.");
  }

  const allowedOrigins = dependencies.allowedOrigins ?? [];
  const allowedNonBrowserClientIds = new Set(
    dependencies.allowedNonBrowserClientIds ?? [],
  );
  const auditSink = dependencies.auditSink ?? (() => undefined);
  const requiredScopes = dependencies.requiredScopes ?? ["mcp.tools.read"];
  const sessions = dependencies.sessions ?? createSessionStore();
  const tools =
    dependencies.tools ??
    createToolRegistry([
      createSystemHealthTool(
        dependencies.now ? { now: dependencies.now } : {},
      ),
    ]);

  const advertisedToolScopes = new Map<string, readonly string[]>();
  for (const tool of tools.list()) {
    const advertisedScopes = tool.requiredScopes.map((requiredScope) => {
      if (!dependencies.protectedResourceMetadata) return requiredScope;
      const advertisedScope =
        dependencies.protectedResourceMetadata.scopesSupported.find(
          (scope) => scope === requiredScope || scope.endsWith(`/${requiredScope}`),
        );
      if (!advertisedScope) {
        throw new Error(
          `Protected resource metadata does not advertise the ${requiredScope} scope required by ${tool.name}.`,
        );
      }
      return advertisedScope;
    });
    advertisedToolScopes.set(tool.name, advertisedScopes);
  }

  const app = Fastify({
    bodyLimit: 64 * 1024,
    genReqId: () => randomUUID(),
    logger: process.env.NODE_ENV !== "test",
    requestTimeout: 30_000,
  });

  const readRawBody = (
    _request: FastifyRequest,
    body: string,
    done: (error: Error | null, result?: string) => void,
  ): void => {
    done(null, body);
  };

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    readRawBody,
  );
  app.addContentTypeParser("*", { parseAs: "string" }, readRawBody);

  // Limits are keyed by source address. Connectors that share egress
  // infrastructure therefore share one bucket until a reviewed per-principal
  // limit is approved.
  await app.register(rateLimit, {
    max: dependencies.requestsPerMinute ?? 120,
    timeWindow: "1 minute",
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  const emitAudit = (correlationId: string, outcome: RequestOutcome): void => {
    const record: McpAuditRecord = {
      clientId: outcome.clientId,
      correlationId,
      method: outcome.method,
      policyVersion: MCP_POLICY_VERSION,
      protocolVersion: outcome.protocolVersion,
      reason: outcome.reason,
      sessionReference: sessionReference(outcome.sessionId),
      status: outcome.status,
      toolName: outcome.toolName,
    };
    auditSink(record);
  };

  const challengeHeader = (error: string): string => {
    const parts = [`realm="${serviceName}"`, `error="${error}"`];
    if (dependencies.protectedResourceMetadata) {
      parts.push(
        `resource_metadata="${dependencies.protectedResourceMetadata.resourceMetadataUrl}"`,
        `scope="${dependencies.protectedResourceMetadata.scopesSupported.join(" ")}"`,
      );
    }
    return `${credentialScheme} ${parts.join(", ")}`;
  };

  const isApprovedHostname = (request: FastifyRequest): boolean => {
    const metadata = dependencies.protectedResourceMetadata;
    return !metadata || request.hostname === new URL(metadata.resource).hostname;
  };

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const isClientError = statusCode >= 400 && statusCode < 500;
    const reason =
      statusCode === 429
        ? "rate_limited"
        : isClientError
          ? "rejected_request"
          : "unhandled_error";
    emitAudit(request.id, {
      clientId: null,
      method: null,
      protocolVersion: null,
      reason,
      sessionId: null,
      status: isClientError ? "denied" : "error",
      toolName: null,
    });
    if (!isClientError) {
      request.log.error({ correlationId: request.id }, "Unhandled MCP error");
    }
    return reply
      .status(isClientError ? statusCode : 500)
      .send(
        jsonRpcError(
          null,
          statusCode === 429
            ? JSON_RPC_ERROR_CODES.requestDenied
            : isClientError
              ? JSON_RPC_ERROR_CODES.invalidRequest
              : JSON_RPC_ERROR_CODES.internalError,
          statusCode === 429
            ? "Too many requests were received."
            : isClientError
              ? "The request was rejected."
              : "The request could not be completed.",
          request.id,
          reason,
        ),
      );
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(
        jsonRpcError(
          null,
          JSON_RPC_ERROR_CODES.invalidRequest,
          "The requested resource was not found.",
          request.id,
          "unknown_resource",
        ),
      ),
  );

  app.get("/health", async (request) => ({
    meta: { correlationId: request.id },
    service: serviceName,
    status: "ok",
  }));

  for (const metadataPath of [
    "/.well-known/oauth-protected-resource",
    `/.well-known/oauth-protected-resource${mcpEndpointPath}`,
  ]) {
    app.get(metadataPath, async (request, reply) => {
      const metadata = dependencies.protectedResourceMetadata;
      if (!metadata || !isApprovedHostname(request)) {
        return reply
          .status(404)
          .send(
            jsonRpcError(
              null,
              JSON_RPC_ERROR_CODES.invalidRequest,
              "The requested resource was not found.",
              request.id,
              "unknown_resource",
            ),
          );
      }
      return reply.send({
        authorization_servers: metadata.authorizationServers,
        bearer_methods_supported: ["header"],
        resource: metadata.resource,
        scopes_supported: metadata.scopesSupported,
      });
    });
  }

  app.get(mcpEndpointPath, async (request, reply) =>
    isApprovedHostname(request)
      ? reply
          .status(405)
          .header("allow", "DELETE, POST")
          .send(
            jsonRpcError(
              null,
              JSON_RPC_ERROR_CODES.invalidRequest,
              "Server-initiated streams are not supported.",
              request.id,
              "unsupported_method",
            ),
          )
      : reply
          .status(404)
          .send(
            jsonRpcError(
              null,
              JSON_RPC_ERROR_CODES.invalidRequest,
              "The requested resource was not found.",
              request.id,
              "unknown_resource",
            ),
          ),
  );

  interface GuardContext {
    originKey: string;
    principal: McpPrincipal;
  }

  const guardRequest = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<GuardContext | null> => {
    const deny = (
      status: number,
      code: JsonRpcErrorCode,
      message: string,
      reason: string,
      challenge?: string,
      clientId: string | null = null,
      responseReason: string = reason,
    ): null => {
      emitAudit(request.id, {
        clientId,
        method: null,
        protocolVersion: null,
        reason,
        sessionId: null,
        status: "denied",
        toolName: null,
      });
      if (challenge) reply.header("www-authenticate", challenge);
      void reply
        .status(status)
        .send(jsonRpcError(null, code, message, request.id, responseReason));
      return null;
    };

    const originKey = resolveOriginKey(request.headers.origin, allowedOrigins);
    if (!isApprovedHostname(request)) {
      return deny(
        404,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "The requested resource was not found.",
        "unapproved_hostname",
        undefined,
        null,
        "unknown_resource",
      );
    }
    if (originKey === null) {
      return deny(
        403,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "The request origin is not allowed.",
        "unsupported_origin",
      );
    }

    if (!acceptsJson(request.headers.accept)) {
      return deny(
        406,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "The request does not accept a JSON response.",
        "unsupported_accept",
      );
    }

    const bearerToken = readBearerToken(request.headers.authorization);
    if (!bearerToken) {
      return deny(
        401,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "Authentication is required.",
        "missing_credential",
        challengeHeader("invalid_request"),
      );
    }

    const principal = await dependencies.authenticator.authenticate(
      bearerToken,
    );
    if (!principal) {
      return deny(
        401,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "The credential was rejected.",
        "invalid_credential",
        challengeHeader("invalid_token"),
      );
    }

    if (
      originKey === "non-browser" &&
      !allowedNonBrowserClientIds.has(principal.clientId)
    ) {
      return deny(
        403,
        JSON_RPC_ERROR_CODES.requestDenied,
        "The request origin is not allowed.",
        "unsupported_origin",
        undefined,
        principal.clientId,
      );
    }

    const missingScope = requiredScopes.some(
      (scope) => !principal.grantedScopes.includes(scope),
    );
    if (missingScope) {
      return deny(
        403,
        JSON_RPC_ERROR_CODES.requestDenied,
        "The credential does not grant MCP access.",
        "insufficient_scope",
        challengeHeader("insufficient_scope"),
        principal.clientId,
      );
    }

    return { originKey, principal };
  };

  app.post(mcpEndpointPath, async (request, reply) => {
    const correlationId = request.id;
    const guard = await guardRequest(request, reply);
    if (!guard) return reply;
    const { originKey, principal } = guard;
    let messageId: string | number | null = null;

    const deny = (
      status: number,
      code: JsonRpcErrorCode,
      message: string,
      reason: string,
      outcome: Partial<RequestOutcome> = {},
      supportedProtocolVersions?: readonly string[],
    ) => {
      emitAudit(correlationId, {
        clientId: principal.clientId,
        method: outcome.method ?? null,
        protocolVersion: outcome.protocolVersion ?? null,
        reason,
        sessionId: outcome.sessionId ?? null,
        status: outcome.status ?? "denied",
        toolName: outcome.toolName ?? null,
      });
      return reply
        .status(status)
        .send(
          jsonRpcError(
            messageId,
            code,
            message,
            correlationId,
            reason,
            supportedProtocolVersions,
          ),
        );
    };

    const contentType = (request.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      return deny(
        415,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "The request media type is not supported.",
        "unsupported_media_type",
      );
    }

    if (typeof request.body !== "string" || request.body.trim() === "") {
      return deny(
        400,
        JSON_RPC_ERROR_CODES.parseError,
        "The request body could not be parsed.",
        "empty_body",
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(request.body);
    } catch {
      return deny(
        400,
        JSON_RPC_ERROR_CODES.parseError,
        "The request body could not be parsed.",
        "parse_error",
      );
    }

    if (Array.isArray(payload)) {
      return deny(
        400,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "Batched JSON-RPC messages are not supported.",
        "batch_not_supported",
      );
    }

    const parsedMessage = jsonRpcRequestSchema.safeParse(payload);
    if (!parsedMessage.success) {
      return deny(
        400,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "The JSON-RPC message is invalid.",
        "malformed_message",
      );
    }

    const { method } = parsedMessage.data;
    messageId = parsedMessage.data.id ?? null;
    const isNotification = method.startsWith("notifications/");
    const misusedMessageId = isNotification
      ? messageId !== null
      : messageId === null;
    if (misusedMessageId) {
      return deny(
        400,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "The JSON-RPC message is invalid.",
        "malformed_message",
        { method },
      );
    }

    const protocolVersionHeader = request.headers["mcp-protocol-version"];
    let requestedProtocolVersion: SupportedProtocolVersion | undefined;
    if (protocolVersionHeader !== undefined) {
      if (!isSupportedProtocolVersion(protocolVersionHeader)) {
        return deny(
          400,
          JSON_RPC_ERROR_CODES.invalidRequest,
          "The MCP protocol version is not supported.",
          "unsupported_protocol_version",
          { method },
          SUPPORTED_PROTOCOL_VERSIONS,
        );
      }
      requestedProtocolVersion = protocolVersionHeader;
    }

    const succeed = (
      result: unknown,
      protocolVersion: SupportedProtocolVersion,
      outcome: Partial<RequestOutcome> = {},
    ) => {
      emitAudit(correlationId, {
        clientId: principal.clientId,
        method,
        protocolVersion,
        reason: null,
        sessionId: outcome.sessionId ?? null,
        status: "ok",
        toolName: outcome.toolName ?? null,
      });
      reply.header("mcp-protocol-version", protocolVersion);
      return reply.send({ id: messageId, jsonrpc: "2.0", result });
    };

    if (method === "initialize") {
      const parsedParams = initializeParamsSchema.safeParse(
        parsedMessage.data.params ?? {},
      );
      if (!parsedParams.success) {
        return deny(
          400,
          JSON_RPC_ERROR_CODES.invalidParams,
          "The initialize parameters are invalid.",
          "malformed_initialize_params",
          { method },
        );
      }
      if (!isSupportedProtocolVersion(parsedParams.data.protocolVersion)) {
        return deny(
          400,
          JSON_RPC_ERROR_CODES.invalidParams,
          "The MCP protocol version is not supported.",
          "unsupported_protocol_version",
          { method },
          SUPPORTED_PROTOCOL_VERSIONS,
        );
      }
      const negotiatedProtocolVersion = parsedParams.data.protocolVersion;

      let sessionId: string;
      try {
        sessionId = sessions.open({
          clientId: principal.clientId,
          originKey,
          protocolVersion: negotiatedProtocolVersion,
          subjectReference: principal.principalReference,
          tenantId: principal.tenantId,
        }).id;
      } catch (error) {
        if (error instanceof SessionCapacityError) {
          return deny(
            429,
            JSON_RPC_ERROR_CODES.requestDenied,
            "The session limit was reached.",
            "session_limit_reached",
            { method, protocolVersion: negotiatedProtocolVersion },
          );
        }
        throw error;
      }

      reply.header("mcp-session-id", sessionId);
      return succeed(
        {
          capabilities: { tools: { listChanged: false } },
          instructions:
            "KEYFORTA exposes read-only synthetic capability metadata. No tenant, lease, payment, document, or maintenance data is available through this boundary.",
          protocolVersion: negotiatedProtocolVersion,
          serverInfo: {
            name: serviceName,
            title: "KEYFORTA MCP",
            version: serviceVersion,
          },
        },
        negotiatedProtocolVersion,
        { sessionId },
      );
    }

    const suppliedSessionId = request.headers["mcp-session-id"];
    if (
      typeof suppliedSessionId !== "string" ||
      !sessionIdPattern.test(suppliedSessionId)
    ) {
      return deny(
        400,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "A valid MCP session is required.",
        "missing_session",
        { method },
      );
    }

    const lookup = sessions.touch(suppliedSessionId, {
      clientId: principal.clientId,
      originKey,
      protocolVersion: requestedProtocolVersion,
      subjectReference: principal.principalReference,
      tenantId: principal.tenantId,
    });
    if (!lookup.ok) {
      return deny(
        404,
        JSON_RPC_ERROR_CODES.invalidRequest,
        "The MCP session is no longer valid.",
        lookup.reason,
        { method },
      );
    }
    const { session } = lookup;

    if (isNotification) {
      emitAudit(correlationId, {
        clientId: principal.clientId,
        method,
        protocolVersion: session.protocolVersion,
        reason: null,
        sessionId: session.id,
        status: "ok",
        toolName: null,
      });
      reply.header("mcp-protocol-version", session.protocolVersion);
      return reply.status(202).send();
    }

    if (method === "ping") {
      return succeed({}, session.protocolVersion, { sessionId: session.id });
    }

    if (method === "tools/list") {
      return succeed(
        {
          tools: tools.list().map((tool: McpToolDefinition) => ({
            description: tool.description,
            inputSchema: tool.inputJsonSchema,
            name: tool.name,
            outputSchema: tool.outputJsonSchema,
            securitySchemes: [
              {
                scopes: advertisedToolScopes.get(tool.name) ?? [],
                type: "oauth2",
              },
            ],
            title: tool.title,
          })),
        },
        session.protocolVersion,
        { sessionId: session.id },
      );
    }

    if (method === "tools/call") {
      const parsedParams = toolCallParamsSchema.safeParse(
        parsedMessage.data.params ?? {},
      );
      if (!parsedParams.success) {
        return deny(
          400,
          JSON_RPC_ERROR_CODES.invalidParams,
          "The tool call parameters are invalid.",
          "malformed_tool_params",
          { method, sessionId: session.id },
        );
      }

      const tool = tools.get(parsedParams.data.name);
      if (!tool) {
        return deny(
          404,
          JSON_RPC_ERROR_CODES.invalidParams,
          "The requested tool is not available.",
          "unknown_tool",
          { method, sessionId: session.id },
        );
      }

      const missingScope = tool.requiredScopes.some(
        (scope) => !principal.grantedScopes.includes(scope),
      );
      if (missingScope) {
        reply.header("www-authenticate", challengeHeader("insufficient_scope"));
        return deny(
          403,
          JSON_RPC_ERROR_CODES.requestDenied,
          "The credential does not grant this tool.",
          "insufficient_scope",
          { method, sessionId: session.id, toolName: tool.name },
        );
      }

      const parsedInput = tool.inputSchema.safeParse(
        parsedParams.data.arguments ?? {},
      );
      if (!parsedInput.success) {
        return deny(
          400,
          JSON_RPC_ERROR_CODES.invalidParams,
          "The tool arguments are invalid.",
          "malformed_tool_arguments",
          { method, sessionId: session.id, toolName: tool.name },
        );
      }

      try {
        const handlerResult = await tool.handler(parsedInput.data, {
          correlationId,
          grantedScopes: principal.grantedScopes,
          locale: "en",
          principalReference: principal.principalReference,
        });
        const validatedResult = tool.resultSchema.parse(handlerResult);
        return succeed(validatedResult, session.protocolVersion, {
          sessionId: session.id,
          toolName: tool.name,
        });
      } catch (error) {
        request.log.error(
          { correlationId, toolName: tool.name },
          "MCP tool execution failed",
        );
        return deny(
          500,
          JSON_RPC_ERROR_CODES.internalError,
          "The tool could not be completed.",
          "tool_execution_failed",
          {
            method,
            sessionId: session.id,
            status: "error",
            toolName: tool.name,
          },
        );
      }
    }

    return deny(
      404,
      JSON_RPC_ERROR_CODES.methodNotFound,
      "The requested method is not supported.",
      "unknown_method",
      { method, sessionId: session.id },
    );
  });

  app.delete(mcpEndpointPath, async (request, reply) => {
    const guard = await guardRequest(request, reply);
    if (!guard) return reply;

    const suppliedSessionId = request.headers["mcp-session-id"];
    const closed =
      typeof suppliedSessionId === "string" &&
      sessionIdPattern.test(suppliedSessionId) &&
      sessions.close(suppliedSessionId, {
        clientId: guard.principal.clientId,
        originKey: guard.originKey,
        subjectReference: guard.principal.principalReference,
        tenantId: guard.principal.tenantId,
      });

    emitAudit(request.id, {
      clientId: guard.principal.clientId,
      method: "session/close",
      protocolVersion: null,
      reason: closed ? null : "unknown_session",
      sessionId: typeof suppliedSessionId === "string" ? suppliedSessionId : null,
      status: closed ? "ok" : "denied",
      toolName: null,
    });

    return closed
      ? reply.status(204).send()
      : reply
          .status(404)
          .send(
            jsonRpcError(
              null,
              JSON_RPC_ERROR_CODES.invalidRequest,
              "The MCP session is no longer valid.",
              request.id,
              "unknown_session",
            ),
          );
  });

  return app;
}

export { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS };
