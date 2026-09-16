import { describe, expect, it } from 'vitest';

import { assertUniqueRegistry } from '../src/registry.js';

describe('MCP registry', () => {
  const entry = {
    contractVersion: 1,
    resourceUri: 'ui://keyforta/system/health' as const,
    toolName: 'keyforta_system_health',
  };

  it('rejects duplicate tool names and resource URIs', () => {
    expect(() => assertUniqueRegistry([entry, {
      ...entry,
      resourceUri: 'ui://keyforta/system/other',
    }])).toThrow('Duplicate tool name');
    expect(() => assertUniqueRegistry([entry, {
      ...entry,
      toolName: 'keyforta_other',
    }])).toThrow('Duplicate resource URI');
  });

  it('rejects unsupported contract versions', () => {
    expect(() => assertUniqueRegistry([{ ...entry, contractVersion: 2 }]))
      .toThrow('Unsupported contract version');
  });
});