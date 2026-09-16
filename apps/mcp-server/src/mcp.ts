import type { ToolExecutionContext } from '@keyforta/types';
import {
  createHealthToolHandler,
  healthInputSchema,
  healthResourceDescriptor,
  healthStructuredContentSchema,
  healthToolDescription,
  healthToolName,
  healthWidgetUri,
} from '@keyforta/tool-system-health';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { assertUniqueRegistry, type RegistryEntry } from './registry.js';
import type { McpTelemetrySink } from './telemetry.js';

const registry: readonly RegistryEntry[] = [{
  contractVersion: healthResourceDescriptor.contractVersion,
  resourceUri: healthWidgetUri,
  toolName: healthToolName,
}];

assertUniqueRegistry(registry);
const transportHealthInputSchema = z.object({}).passthrough();

export interface McpServerDependencies {
  readonly context: () => ToolExecutionContext;
  readonly now: () => Date;
  readonly recordEvent: McpTelemetrySink;
  readonly widgetHtml: string;
}

export function createKeyfortaMcpServer(dependencies: McpServerDependencies): McpServer {
  const server = new McpServer({
    name: 'keyforta-mcp-server',
    version: '0.1.0',
  });
  const healthHandler = createHealthToolHandler({ now: dependencies.now });

  server.registerTool(healthToolName, {
    _meta: {
      'openai/outputTemplate': healthWidgetUri,
      'openai/toolInvocation/invoked': 'KEYFORTA service status is available.',
      'openai/toolInvocation/invoking': 'Checking KEYFORTA service status.',
    },
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
      title: 'KEYFORTA service status',
    },
    description: healthToolDescription,
    inputSchema: transportHealthInputSchema,
    outputSchema: healthStructuredContentSchema,
    title: 'KEYFORTA service status',
  }, async (input) => {
    const context = dependencies.context();
    const completeTool = (resultStatus: 'error' | 'success') => {
      dependencies.recordEvent({
        event: 'mcp.tool.completed',
        requestId: context.correlationId,
        resultStatus,
        toolName: healthToolName,
      });
    };
    dependencies.recordEvent({
      event: 'mcp.tool.started',
      requestId: context.correlationId,
      toolName: healthToolName,
    });
    const parsedInput = healthInputSchema.safeParse(input);
    if (!parsedInput.success) {
      completeTool('error');
      return {
        content: [{
          text: `Tool input rejected. Request ID: ${context.correlationId}`,
          type: 'text' as const,
        }],
        isError: true,
      };
    }
    let result;
    try {
      result = await healthHandler(parsedInput.data, context);
    } catch {
      completeTool('error');
      return {
        content: [{
          text: `Tool execution failed. Request ID: ${context.correlationId}`,
          type: 'text' as const,
        }],
        isError: true,
      };
    }
    completeTool('success');
    return {
      _meta: { ...result._meta },
      content: result.content.map((item) => ({ ...item })),
      structuredContent: { ...result.structuredContent },
    };
  });

  server.registerResource('keyforta_system_health_widget', healthWidgetUri, {
    _meta: {
      'openai/widgetCSP': {
        connect_domains: healthResourceDescriptor.csp.connectDomains,
        resource_domains: healthResourceDescriptor.csp.resourceDomains,
      },
      'openai/widgetDescription': 'Shows synthetic KEYFORTA MCP service availability.',
      'openai/widgetPrefersBorder': true,
    },
    description: 'Isolated presentation resource for synthetic service status.',
    mimeType: healthResourceDescriptor.mimeType,
  }, async () => ({
    contents: (() => {
      const context = dependencies.context();
      dependencies.recordEvent({
        event: 'mcp.resource.read',
        requestId: context.correlationId,
        resourceUri: healthWidgetUri,
      });
      return [{
      _meta: {
        'openai/widgetCSP': {
          connect_domains: healthResourceDescriptor.csp.connectDomains,
          resource_domains: healthResourceDescriptor.csp.resourceDomains,
        },
        'openai/widgetDescription': 'Shows synthetic KEYFORTA MCP service availability.',
        'openai/widgetPrefersBorder': true,
      },
      mimeType: healthResourceDescriptor.mimeType,
      text: dependencies.widgetHtml,
      uri: healthWidgetUri,
      }];
    })(),
  }));

  return server;
}

export { registry as keyfortaMcpRegistry };