import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import {
  authenticateLocalSyntheticRequest,
  AuthenticationError,
  localSyntheticBearer,
  type RequestAuthenticator,
} from '../src/auth.js';
import { buildMcpApp } from '../src/app.js';
import type { McpTelemetryEvent } from '../src/telemetry.js';

const widgetHtml = '<!doctype html><html><body>synthetic health</body></html>';
const openApps: Awaited<ReturnType<typeof buildMcpApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function startApp(
  overrides: Partial<Parameters<typeof buildMcpApp>[0]> = {},
) {
  const app = await buildMcpApp({
    authenticate: authenticateLocalSyntheticRequest,
    widgetHtml,
    ...overrides,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  openApps.push(app);
  const address = app.server.address() as AddressInfo;
  return { app, endpoint: new URL(`http://127.0.0.1:${address.port}/mcp`) };
}

function createClient(endpoint: URL, headers: Record<string, string> = {}) {
  const client = new Client({ name: 'keyforta-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: { authorization: localSyntheticBearer, ...headers },
    },
  });
  return { client, transport };
}

async function connectClient(
  connection: ReturnType<typeof createClient>,
): Promise<void> {
  await connection.client.connect(connection.transport as unknown as Transport);
}

describe('MCP protocol', () => {
  it('initializes, lists, calls, and reads the synthetic capability', async () => {
    const events: McpTelemetryEvent[] = [];
    const { endpoint } = await startApp({
      now: () => new Date('2026-03-23T12:00:00.000Z'),
      recordEvent: (event) => { events.push(event); },
    });
    const { client, transport } = createClient(endpoint);

    await connectClient({ client, transport });
    expect(transport.sessionId).toEqual(expect.any(String));

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['keyforta_system_health']);

    const result = await client.callTool({
      arguments: {},
      name: 'keyforta_system_health',
    });
    expect(result.structuredContent).toEqual({
      capability: 'synthetic-health-widget',
      contractVersion: 1,
      status: 'healthy',
    });
    expect(result._meta?.widgetData).toEqual({ checkedAt: '2026-03-23T12:00:00.000Z' });

    const invalidResult = await client.callTool({
      arguments: { organizationId: 'prohibited-client-authority' },
      name: 'keyforta_system_health',
    });
    expect(invalidResult.isError).toBe(true);
    expect(invalidResult.content).toEqual([expect.objectContaining({
      text: expect.stringMatching(/^Tool input rejected\. Request ID: /),
    })]);
    expect(JSON.stringify(invalidResult)).not.toContain('organizationId');
    expect(JSON.stringify(invalidResult)).not.toContain('prohibited-client-authority');

    const resource = await client.readResource({ uri: 'ui://keyforta/system/health' });
    expect(resource.contents).toEqual([expect.objectContaining({
      mimeType: 'text/html+skybridge',
      text: widgetHtml,
      uri: 'ui://keyforta/system/health',
    })]);

    await transport.terminateSession();
    await client.close();
    expect(events.map((event) => event.event)).toEqual(expect.arrayContaining([
      'mcp.session.initialized',
      'mcp.tool.started',
      'mcp.tool.completed',
      'mcp.resource.read',
      'mcp.session.closed',
    ]));
    expect(JSON.stringify(events)).not.toContain('prohibited-client-authority');
  });
});

describe('MCP HTTP boundary', () => {
  it('rejects missing authentication without reflecting credentials', async () => {
    const events: McpTelemetryEvent[] = [];
    const { app } = await startApp({
      recordEvent: (event) => { events.push(event); },
    });
    const response = await app.inject({
      headers: { authorization: 'Bearer secret-that-must-not-appear' },
      method: 'POST',
      payload: {},
      url: '/mcp',
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer realm="keyforta-mcp"');
    expect(response.body).not.toContain('secret-that-must-not-appear');
    expect(JSON.stringify(events)).not.toContain('secret-that-must-not-appear');
  });

  it('ignores caller-provided correlation IDs', async () => {
    const events: McpTelemetryEvent[] = [];
    const { app } = await startApp({
      recordEvent: (event) => { events.push(event); },
    });
    const response = await app.inject({
      headers: {
        authorization: 'Bearer invalid',
        'x-request-id': 'token-shaped-caller-value',
      },
      method: 'POST',
      payload: {},
      url: '/mcp',
    });

    expect(response.headers['x-request-id']).not.toBe('token-shaped-caller-value');
    expect(JSON.stringify(events)).not.toContain('token-shaped-caller-value');
  });

  it('isolates telemetry failures from request capacity', async () => {
    const { app } = await startApp({
      maxConcurrentRequests: 1,
      recordEvent: async () => { throw new Error('telemetry unavailable'); },
    });
    const request = {
      headers: { authorization: 'Bearer invalid' },
      method: 'POST' as const,
      payload: {},
      url: '/mcp',
    };

    expect((await app.inject(request)).statusCode).toBe(401);
    expect((await app.inject(request)).statusCode).toBe(401);
  });

  it('rejects unsupported protocol proposals before creating a session', async () => {
    const { app } = await startApp();
    const response = await app.inject({
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: localSyntheticBearer,
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: {
        id: 1,
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
          protocolVersion: '2099-01-01',
        },
      },
      url: '/mcp',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe('Protocol version unsupported');
    expect(response.headers['mcp-session-id']).toBeUndefined();
  });

  it('rejects unapproved browser origins', async () => {
    const { app } = await startApp({ allowedOrigins: ['https://approved.example'] });
    const response = await app.inject({
      headers: { authorization: localSyntheticBearer, origin: 'https://rejected.example' },
      method: 'POST',
      payload: {},
      url: '/mcp',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.message).toBe('Origin rejected');
  });

  it('rejects unapproved hosts before protocol dispatch', async () => {
    const { app } = await startApp({ allowedHosts: ['approved.example'] });
    const response = await app.inject({
      headers: { host: 'rejected.example' },
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(421);
  });

  it('requires health scope before listing tools or reading resources', async () => {
    const { endpoint } = await startApp({
      authenticate: async () => ({
        grantedScopes: [],
        locale: 'en',
        principalReference: 'synthetic:no-scope',
      }),
    });
    const connection = createClient(endpoint);

    await expect(connectClient(connection)).rejects.toThrow('Required scope missing');
  });

  it('rejects request bodies over the configured transport limit', async () => {
    const { app } = await startApp();
    const response = await app.inject({
      headers: {
        authorization: localSyntheticBearer,
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: JSON.stringify({ data: 'x'.repeat(17 * 1024) }),
      url: '/mcp',
    });

    expect(response.statusCode).toBe(413);
  });

  it('binds sessions to the authenticated principal', async () => {
    const authenticate: RequestAuthenticator = async (request) => {
      const principalReference = request.headers.authorization?.replace('Bearer ', '');
      if (!principalReference) throw new AuthenticationError();
      return { grantedScopes: ['mcp:health'], locale: 'en', principalReference };
    };
    const { endpoint } = await startApp({ authenticate });
    const first = createClient(endpoint, { authorization: 'Bearer principal-a' });
    await connectClient(first);
    const sessionId = first.transport.sessionId;

    const response = await fetch(endpoint, {
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer principal-b',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-11-25',
        'mcp-session-id': sessionId!,
      },
      method: 'POST',
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe('Session binding rejected');
    await first.transport.terminateSession();
    await first.client.close();
  });

  it('binds established sessions to the negotiated protocol version', async () => {
    const { endpoint } = await startApp();
    const connection = createClient(endpoint);
    await connectClient(connection);

    const response = await fetch(endpoint, {
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: localSyntheticBearer,
        'content-type': 'application/json',
        'mcp-protocol-version': '2024-10-07',
        'mcp-session-id': connection.transport.sessionId!,
      },
      method: 'POST',
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe('Session binding rejected');
    await connection.transport.terminateSession();
    await connection.client.close();
  });

  it('enforces the configured session limit', async () => {
    const { endpoint } = await startApp({ maxSessions: 1 });
    const first = createClient(endpoint);
    await connectClient(first);
    const second = createClient(endpoint);

    await expect(connectClient(second)).rejects.toThrow('Session limit exceeded');
    await first.transport.terminateSession();
    await first.client.close();
  });

  it('reserves session capacity across concurrent initialization', async () => {
    const { endpoint } = await startApp({ maxSessions: 1 });
    const first = createClient(endpoint);
    const second = createClient(endpoint);
    const results = await Promise.allSettled([connectClient(first), connectClient(second)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const connected = results[0]?.status === 'fulfilled' ? first : second;
    await connected.transport.terminateSession();
    await connected.client.close();
  });

  it('expires idle sessions', async () => {
    let timestamp = Date.parse('2026-03-23T12:00:00.000Z');
    const { endpoint } = await startApp({
      now: () => new Date(timestamp),
      sessionIdleTtlMs: 100,
    });
    const connection = createClient(endpoint);
    await connectClient(connection);
    timestamp += 101;

    await expect(connection.client.listTools()).rejects.toThrow('Session not found');
  });

  it('prunes abandoned expired sessions before applying the session limit', async () => {
    let timestamp = Date.parse('2026-03-23T12:00:00.000Z');
    const { endpoint } = await startApp({
      maxSessions: 1,
      now: () => new Date(timestamp),
      sessionIdleTtlMs: 100,
    });
    const abandoned = createClient(endpoint);
    await connectClient(abandoned);
    timestamp += 101;

    const replacement = createClient(endpoint);
    await connectClient(replacement);
    expect(replacement.transport.sessionId).toEqual(expect.any(String));
    await replacement.transport.terminateSession();
    await replacement.client.close();
  });

  it('does not count long-lived GET streams against POST concurrency', async () => {
    const { app } = await startApp({ maxConcurrentRequests: 0 });
    const response = await app.inject({
      headers: {
        authorization: localSyntheticBearer,
        'mcp-protocol-version': '2025-11-25',
      },
      method: 'GET',
      url: '/mcp',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe('Initialization or valid session required');
  });
});