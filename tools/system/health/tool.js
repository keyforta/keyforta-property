import { createToolResultSchema, toolDescriptionSchema, toolExecutionContextSchema, widgetResourceDescriptorSchema } from '@keyforta/contracts';
import { z } from 'zod';

export const healthResource = widgetResourceDescriptorSchema.parse({
  accessibility: {
    descriptionKey: 'health.description',
    titleKey: 'health.title',
  },
  contractVersion: 1,
  csp: { connectDomains: [], resourceDomains: [] },
  mimeType: 'text/html+skybridge',
  uri: 'ui://keyforta/system/health',
});

export const healthDescription = toolDescriptionSchema.parse(
  'Use when checking whether the synthetic KEYFORTA MCP capability is available. Do not use for tenant, property, payment, or other business data.',
);

export const healthInputSchema = z.object({}).strict();
export const healthStructuredContentSchema = z.object({
  status: z.literal('healthy'),
}).strict();
export const healthWidgetDataSchema = z.object({
  checkedAt: z.string().datetime(),
  capabilities: z.array(z.literal('synthetic-health')).min(1).max(1),
}).strict();
export const healthResultSchema = createToolResultSchema({
  structuredContentSchema: healthStructuredContentSchema,
  widgetDataSchema: healthWidgetDataSchema,
});

export function createHealthTool({ now = () => new Date().toISOString() } = {}) {
  return Object.freeze({
    description: healthDescription,
    inputSchema: healthInputSchema,
    name: 'keyforta_system_health',
    resource: healthResource,
    resultSchema: healthResultSchema,
    async execute(input, context) {
      healthInputSchema.parse(input);
      toolExecutionContextSchema.parse(context);
      return healthResultSchema.parse({
        structuredContent: { status: 'healthy' },
        content: [{ type: 'text', text: 'KEYFORTA MCP synthetic health capability is available.' }],
        _meta: {
          'openai/outputTemplate': healthResource.uri,
          widgetData: {
            checkedAt: now(),
            capabilities: ['synthetic-health'],
          },
        },
      });
    },
  });
}
