import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import helmet from '@fastify/helmet';
import type { ToolExecutionContext } from '@keyforta/types';
import {
  isInitializeRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import {
  AuthenticationError,
  type AuthenticatedPrincipal,
  type RequestAuthenticator,
} from './auth.js';
import { createKeyfortaMcpServer } from './mcp.js';
import {
  discardMcpTelemetry,
  isolateMcpTelemetry,
  type McpTelemetrySink,
} from './telemetry.js';

const serviceName = 'keyforta-mcp-server';

interface SessionRecord {
  readonly absoluteExpiresAt: number;
  readonly contextState: { current: ToolExecutionContext };
  readonly originClass: string;
  readonly principalReference: string;
  readonly protocolVersion: string;
  readonly server: ReturnType<typeof createKeyfortaMcpServer>;
  readonly transport: StreamableHTTPServerTransport;
  closed: boolean;
  lastActiveAt: number;
}

export interface McpAppDependencies {
  readonly allowedHosts?: readonly string[];
  readonly allowedOrigins?: readonly string[];
  readonly authenticate: RequestAuthenticator;
  readonly maxConcurrentRequests?: number;
  readonly maxSessions?: number;
  readonly now?: () => Date;
  readonly recordEvent?: McpTelemetrySink;
  readonly sessionAbsoluteTtlMs?: number;
  readonly sessionIdleTtlMs?: number;
  readonly widgetHtml?: string;
}

class OriginError extends Error {}

function jsonRpcError(reply: FastifyReply, status: number, code: number, message: string) {
  return reply.status(status).send({
    error: { code, message },
    id: null,
    jsonrpc: '2.0',
  });
}

function readSessionId(request: FastifyRequest): string | undefined {
  const value = request.headers['mcp-session-id'];
  return typeof value === 'string' ? value : undefined;
}

function readProtocolVersion(request: FastifyRequest, initializing: boolean): string | undefined {
  if (initializing && typeof request.body === 'object' && request.body !== null) {
    const params = 'params' in request.body ? request.body.params : undefined;
    if (typeof params === 'object' && params !== null && 'protocolVersion' in params) {
      return typeof params.protocolVersion === 'string' ? params.protocolVersion : undefined;
    }
  }
  const value = request.headers['mcp-protocol-version'];
  return typeof value === 'string' ? value : undefined;
}

function validateOrigin(request: FastifyRequest, allowedOrigins: ReadonlySet<string>): string {
  const origin = request.headers.origin;
  if (origin === undefined) return 'connector:none';
  if (typeof origin !== 'string' || origin === 'null' || !allowedOrigins.has(origin)) {
    throw new OriginError('MCP request origin is not allowed');
  }
  return `browser:${origin}`;
}

function createContext(
  request: FastifyRequest,
  principal: AuthenticatedPrincipal,
): ToolExecutionContext {
  return {
    correlationId: request.id,
    grantedScopes: [...principal.grantedScopes],
    locale: principal.locale,
    principalReference: principal.principalReference,
  };
}

export async function buildMcpApp(dependencies: McpAppDependencies): Promise<FastifyInstance> {
  const allowedHosts = new Set(dependencies.allowedHosts ?? []);
  const allowedOrigins = new Set(dependencies.allowedOrigins ?? []);
  const maxConcurrentRequests = dependencies.maxConcurrentRequests ?? 32;
  const maxSessions = dependencies.maxSessions ?? 64;
  const now = dependencies.now ?? (() => new Date());
  const recordEvent = isolateMcpTelemetry(
    dependencies.recordEvent ?? discardMcpTelemetry,
  );
  const absoluteTtl = dependencies.sessionAbsoluteTtlMs ?? 60 * 60 * 1000;
  const idleTtl = dependencies.sessionIdleTtlMs ?? 15 * 60 * 1000;
  const widgetHtml = dependencies.widgetHtml ?? await readFile(
    new URL('./widget/index.html', import.meta.url),
    'utf8',
  );
  const sessions = new Map<string, SessionRecord>();
  let activeRequests = 0;
  let pendingSessions = 0;

  const app = Fastify({
    bodyLimit: 16 * 1024,
    genReqId: () => randomUUID(),
    logger: process.env.NODE_ENV !== 'test',
    requestTimeout: 30_000,
  });

  await app.register(helmet);

  app.addHook('onRequest', async (request, reply) => {
    if (allowedHosts.size > 0 && (
      typeof request.headers.host !== 'string' ||
      !allowedHosts.has(request.headers.host)
    )) {
      return reply.status(421).send({ error: 'Host rejected' });
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  app.get('/health', async (request) => ({
    meta: { requestId: request.id },
    service: serviceName,
    status: 'ok',
  }));

  const closeSession = async (sessionId: string, session: SessionRecord) => {
    sessions.delete(sessionId);
    await session.transport.close();
    await session.server.close();
    if (!session.closed) {
      session.closed = true;
      recordEvent({
        event: 'mcp.session.closed',
        requestId: session.contextState.current.correlationId,
      });
    }
  };

  const findSession = async (sessionId: string): Promise<SessionRecord | undefined> => {
    const session = sessions.get(sessionId);
    if (!session) return undefined;
    const timestamp = now().getTime();
    if (timestamp >= session.absoluteExpiresAt || timestamp - session.lastActiveAt >= idleTtl) {
      await closeSession(sessionId, session);
      return undefined;
    }
    return session;
  };

  const pruneExpiredSessions = async () => {
    for (const [sessionId, session] of [...sessions.entries()]) {
      await findSession(sessionId);
    }
  };

  const handleMcp = async (request: FastifyRequest, reply: FastifyReply) => {
    const countsTowardConcurrencyLimit = request.method !== 'GET';
    let reservedSession = false;
    if (countsTowardConcurrencyLimit && activeRequests >= maxConcurrentRequests) {
      return jsonRpcError(reply, 429, -32000, 'Request limit exceeded');
    }
    if (countsTowardConcurrencyLimit) activeRequests += 1;

    try {
      const principal = await dependencies.authenticate(request);
      const originClass = validateOrigin(request, allowedOrigins);
      const initializing = request.method === 'POST' && isInitializeRequest(request.body);
      const protocolVersion = readProtocolVersion(request, initializing);
      if (!principal.grantedScopes.includes('mcp:health')) {
        return jsonRpcError(reply, 403, -32005, 'Required scope missing');
      }
      if (!protocolVersion) {
        return jsonRpcError(reply, 400, -32006, 'Protocol version required');
      }
      if (initializing && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
        return jsonRpcError(reply, 400, -32007, 'Protocol version unsupported');
      }
      const sessionId = readSessionId(request);
      let session = sessionId ? await findSession(sessionId) : undefined;

      if (sessionId && !session) {
        return jsonRpcError(reply, 404, -32001, 'Session not found');
      }
      if (session && (
        session.principalReference !== principal.principalReference ||
        session.originClass !== originClass ||
        session.protocolVersion !== protocolVersion
      )) {
        return jsonRpcError(reply, 403, -32002, 'Session binding rejected');
      }

      if (!session) {
        if (!initializing) {
          return jsonRpcError(reply, 400, -32000, 'Initialization or valid session required');
        }
        await pruneExpiredSessions();
        if (sessions.size + pendingSessions >= maxSessions) {
          return jsonRpcError(reply, 429, -32000, 'Session limit exceeded');
        }
        pendingSessions += 1;
        reservedSession = true;

        const contextState = { current: createContext(request, principal) };
        let record: SessionRecord;
        const transport = new StreamableHTTPServerTransport({
          onsessioninitialized: (initializedSessionId) => {
            sessions.set(initializedSessionId, record);
            recordEvent({
              event: 'mcp.session.initialized',
              requestId: contextState.current.correlationId,
            });
          },
          sessionIdGenerator: randomUUID,
        });
        const server = createKeyfortaMcpServer({
          context: () => contextState.current,
          now,
          recordEvent,
          widgetHtml,
        });
        const timestamp = now().getTime();
        record = {
          absoluteExpiresAt: timestamp + absoluteTtl,
          closed: false,
          contextState,
          lastActiveAt: timestamp,
          originClass,
          principalReference: principal.principalReference,
          protocolVersion,
          server,
          transport,
        };
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
          if (!record.closed) {
            record.closed = true;
            recordEvent({
              event: 'mcp.session.closed',
              requestId: record.contextState.current.correlationId,
            });
          }
        };
        await server.connect(transport as unknown as Transport);
        session = record;
      }

      session.contextState.current = createContext(request, principal);
      session.lastActiveAt = now().getTime();
      reply.hijack();
      reply.raw.setHeader('x-request-id', request.id);
      await session.transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        reply.header('WWW-Authenticate', 'Bearer realm="keyforta-mcp"');
        return jsonRpcError(reply, 401, -32003, 'Authentication required');
      }
      if (error instanceof OriginError) {
        return jsonRpcError(reply, 403, -32004, 'Origin rejected');
      }
      request.log.error({ requestId: request.id }, 'MCP request failed');
      if (!reply.sent) return jsonRpcError(reply, 500, -32603, 'Internal server error');
    } finally {
      if (reservedSession) pendingSessions -= 1;
      if (countsTowardConcurrencyLimit) activeRequests -= 1;
      recordEvent({
        event: 'mcp.request.completed',
        requestId: request.id,
        statusCode: reply.statusCode,
      });
    }
  };

  app.route({ method: ['GET', 'POST', 'DELETE'], url: '/mcp', handler: handleMcp });

  app.addHook('onClose', async () => {
    await Promise.all([...sessions.entries()].map(([sessionId, session]) =>
      closeSession(sessionId, session)));
  });

  return app;
}