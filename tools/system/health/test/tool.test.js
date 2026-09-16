import assert from 'node:assert/strict';
import test from 'node:test';

import { createHealthTool, healthDescription } from '../tool.js';

const context = {
  correlationId: 'correlation-1',
  grantedScopes: ['mcp.tools.read'],
  locale: 'en',
  principalReference: 'synthetic-principal',
};

test('returns a strict dual-layer synthetic health result', async () => {
  const tool = createHealthTool({ now: () => '2026-09-16T00:00:00.000Z' });

  assert.deepEqual(await tool.execute({}, context), {
    structuredContent: { status: 'healthy' },
    content: [{ type: 'text', text: 'KEYFORTA MCP synthetic health capability is available.' }],
    _meta: {
      'openai/outputTemplate': 'ui://keyforta/system/health',
      widgetData: {
        checkedAt: '2026-09-16T00:00:00.000Z',
        capabilities: ['synthetic-health'],
      },
    },
  });
});

test('does not accept caller authority or oversize descriptions', async () => {
  const tool = createHealthTool();
  await assert.rejects(() => tool.execute({ actorId: 'not-authority' }, context));
  assert.ok(new TextEncoder().encode(healthDescription).byteLength < 1024);
});
