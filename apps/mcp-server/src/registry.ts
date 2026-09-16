import type { z } from "zod";

export interface RegisteredTool {
  readonly description: string;
  readonly execute: (
    input: unknown,
    context: unknown,
  ) => Promise<unknown>;
  readonly inputSchema: z.ZodType;
  readonly name: string;
  readonly resource: { readonly uri: string };
  readonly resultSchema: z.ZodType;
}

export interface ToolRegistry {
  readonly get: (name: string) => RegisteredTool | undefined;
  readonly list: () => readonly RegisteredTool[];
}

export function createToolRegistry(tools: readonly RegisteredTool[]): ToolRegistry {
  const byName = new Map<string, RegisteredTool>();
  const resourceUris = new Set<string>();

  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate MCP tool name: ${tool.name}`);
    }
    if (resourceUris.has(tool.resource.uri)) {
      throw new Error(`Duplicate MCP widget resource URI: ${tool.resource.uri}`);
    }
    byName.set(tool.name, tool);
    resourceUris.add(tool.resource.uri);
  }

  return Object.freeze({
    get: (name: string) => byName.get(name),
    list: () => [...byName.values()],
  });
}
