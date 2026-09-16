import {
  createToolResultSchema,
  toolDescriptionSchema,
  widgetResourceDescriptorSchema,
} from '@keyforta/contracts';
import type { ToolExecutionContext, ToolResult } from '@keyforta/types';
import { z } from 'zod';

export const healthToolName = 'keyforta_system_health';
export const healthWidgetUri = 'ui://keyforta/system/health' as const;

export const healthInputSchema = z.object({}).strict();
export const healthStructuredContentSchema = z.object({
  capability: z.literal('synthetic-health-widget'),
  contractVersion: z.literal(1),
  status: z.literal('healthy'),
}).strict();
export const healthWidgetDataSchema = z.object({
  checkedAt: z.string().datetime(),
}).strict();

export const healthResultSchema = createToolResultSchema({
  structuredContentSchema: healthStructuredContentSchema,
  widgetDataSchema: healthWidgetDataSchema,
});

export const healthResourceDescriptor = widgetResourceDescriptorSchema.parse({
  accessibility: {
    descriptionKey: 'health.description',
    titleKey: 'health.title',
  },
  contractVersion: 1,
  csp: {
    connectDomains: [],
    resourceDomains: [],
  },
  mimeType: 'text/html+skybridge',
  uri: healthWidgetUri,
});

export const healthToolDescription = toolDescriptionSchema.parse(
  'Use when a user asks whether the KEYFORTA MCP connector and synthetic widget capability are available. Do not use for application, tenant, property, lease, payment, document, or provider health.',
);

export interface HealthToolDependencies {
  readonly now: () => Date;
}

export function createHealthToolHandler({ now }: HealthToolDependencies) {
  return async (
    input: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolResult> => {
    healthInputSchema.parse(input);
    if (!context.grantedScopes.includes('mcp:health')) {
      throw new Error('MCP_HEALTH_SCOPE_REQUIRED');
    }

    return healthResultSchema.parse({
      _meta: {
        'openai/outputTemplate': healthWidgetUri,
        widgetData: { checkedAt: now().toISOString() },
      },
      content: [{
        text: 'KEYFORTA MCP and its synthetic widget capability are available.',
        type: 'text',
      }],
      structuredContent: {
        capability: 'synthetic-health-widget',
        contractVersion: 1,
        status: 'healthy',
      },
    });
  };
}