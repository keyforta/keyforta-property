import type {
  ToolExecutionContext,
  ToolResult,
  WidgetResourceDescriptor,
} from '../src/index.js';

const result = {
  structuredContent: { status: 'healthy' },
  content: [{ type: 'text', text: 'KEYFORTA MCP is healthy.' }],
  _meta: {
    'openai/outputTemplate': 'ui://keyforta/system/health',
    widgetData: { checkedAt: '2026-09-15T00:00:00Z' },
  },
} as const satisfies ToolResult;

const resource = {
  uri: 'ui://keyforta/system/health',
  mimeType: 'text/html+skybridge',
  contractVersion: 1,
  csp: { connectDomains: [], resourceDomains: [] },
  accessibility: {
    descriptionKey: 'health.description',
    titleKey: 'health.title',
  },
} as const satisfies WidgetResourceDescriptor;

const context = {
  correlationId: 'correlation-1',
  grantedScopes: ['mcp.tools.read'],
  locale: 'fr-CD',
  principalReference: 'principal-1',
} as const satisfies ToolExecutionContext;

void result;
void resource;
void context;

const invalidResource = {
  // @ts-expect-error Widget resources use the App SDK ui:// convention.
  uri: 'skill://system/health/ui',
  mimeType: 'text/html+skybridge',
  contractVersion: 1,
  csp: { connectDomains: [], resourceDomains: [] },
  accessibility: {
    descriptionKey: 'health.description',
    titleKey: 'health.title',
  },
} as const satisfies WidgetResourceDescriptor;

const contextWithToken = {
  correlationId: 'correlation-1',
  grantedScopes: ['mcp.tools.read'],
  locale: 'fr-CD',
  principalReference: 'principal-1',
  // @ts-expect-error Raw tokens are not part of the execution context contract.
  accessToken: 'not-allowed',
} as const satisfies ToolExecutionContext;

void invalidResource;
void contextWithToken;