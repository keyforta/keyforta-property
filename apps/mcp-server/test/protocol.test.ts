import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { describe, expect, it } from 'vitest';

import {
  createKeyfortaMcpServer,
  keyfortaMcpRegistry,
} from '../src/mcp.js';

describe('published MCP capability', () => {
  it('declares exactly the approved synthetic tool and widget resource', () => {
    expect(keyfortaMcpRegistry).toEqual([{
      contractVersion: 1,
      resourceUri: 'ui://keyforta/system/health',
      toolName: 'keyforta_system_health',
    }]);
  });

  it('maps unexpected tool failures to a stable correlated result', async () => {
    const events: import('../src/telemetry.js').McpTelemetryEvent[] = [];
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createKeyfortaMcpServer({
      context: () => ({
        correlationId: 'server-request-id',
        grantedScopes: ['mcp:health'],
        locale: 'en',
        principalReference: 'synthetic:test',
      }),
      now: () => { throw new Error('SENSITIVE_RUNTIME_DETAIL'); },
      recordEvent: (event) => { events.push(event); },
      widgetHtml: '<html></html>',
    });
    const client = new Client({ name: 'test', version: '1.0.0' });
    await server.connect(serverTransport as unknown as Transport);
    await client.connect(clientTransport as unknown as Transport);

    const result = await client.callTool({ arguments: {}, name: 'keyforta_system_health' });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{
      text: 'Tool execution failed. Request ID: server-request-id',
      type: 'text',
    }]);
    expect(JSON.stringify(result)).not.toContain('SENSITIVE_RUNTIME_DETAIL');
    expect(events.filter((event) => event.event === 'mcp.tool.completed')).toEqual([{
      event: 'mcp.tool.completed',
      requestId: 'server-request-id',
      resultStatus: 'error',
      toolName: 'keyforta_system_health',
    }]);
    await client.close();
    await server.close();
  });
});