import type { ToolExecutionContext } from '@keyforta/types';
import { describe, expect, it } from 'vitest';
import {
  createHealthToolHandler,
  healthInputSchema,
  healthResourceDescriptor,
  healthResultSchema,
  healthToolDescription,
} from '../tool.js';

const context: ToolExecutionContext = {
  correlationId: 'corr-synthetic-001',
  grantedScopes: ['mcp:health'],
  locale: 'en',
  principalReference: 'synthetic:local-development',
};

describe('synthetic health tool', () => {
  it('returns a deterministic validated split result', async () => {
    const handler = createHealthToolHandler({
      now: () => new Date('2026-09-16T02:00:00.000Z'),
    });

    const result = await handler({}, context);
    expect(healthResultSchema.parse(result)).toEqual(result);
    expect(result.structuredContent).toEqual({
      capability: 'synthetic-health-widget',
      contractVersion: 1,
      status: 'healthy',
    });
    expect(result._meta.widgetData).toEqual({ checkedAt: '2026-09-16T02:00:00.000Z' });
    expect(JSON.stringify(result)).not.toMatch(/token|password|organization|tenant|user/i);
  });

  it('rejects unknown input and missing scope', async () => {
    expect(healthInputSchema.safeParse({ organizationId: 'forbidden' }).success).toBe(false);
    const handler = createHealthToolHandler({ now: () => new Date() });
    await expect(handler({}, { ...context, grantedScopes: [] })).rejects.toThrow(
      'MCP_HEALTH_SCOPE_REQUIRED',
    );
  });

  it('publishes bounded metadata and a precise description', () => {
    expect(healthResourceDescriptor).toMatchObject({
      csp: { connectDomains: [], resourceDomains: [] },
      uri: 'ui://keyforta/system/health',
    });
    expect(new TextEncoder().encode(healthToolDescription).byteLength).toBeLessThan(1024);
  });
});