export interface McpTelemetryEvent {
  readonly event:
    | 'mcp.request.completed'
    | 'mcp.resource.read'
    | 'mcp.session.closed'
    | 'mcp.session.initialized'
    | 'mcp.tool.completed'
    | 'mcp.tool.started';
  readonly requestId: string;
  readonly resourceUri?: string;
  readonly resultStatus?: 'error' | 'success';
  readonly statusCode?: number;
  readonly toolName?: string;
}

export type McpTelemetrySink = (event: McpTelemetryEvent) => Promise<void> | void;

export const discardMcpTelemetry: McpTelemetrySink = () => {};

export function isolateMcpTelemetry(sink: McpTelemetrySink): McpTelemetrySink {
  return (event) => {
    try {
      const result = sink(event);
      if (result instanceof Promise) void result.catch(() => {});
    } catch {
      // Telemetry must never affect protocol availability.
    }
  };
}