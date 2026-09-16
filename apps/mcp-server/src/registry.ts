import { toolDescriptionSchema } from "@keyforta/contracts";
import type { JsonObject, ToolExecutionContext } from "@keyforta/types";
import type { z } from "zod";

export interface McpToolDefinition {
  readonly description: string;
  readonly handler: (
    input: unknown,
    context: ToolExecutionContext,
  ) => Promise<unknown> | unknown;
  readonly inputJsonSchema: JsonObject;
  readonly inputSchema: z.ZodType;
  readonly name: string;
  readonly outputJsonSchema: JsonObject;
  readonly requiredScopes: readonly string[];
  readonly resultSchema: z.ZodType;
  readonly title: string;
}

export interface ToolRegistry {
  get: (name: string) => McpToolDefinition | undefined;
  list: () => readonly McpToolDefinition[];
}

const toolNamePattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

/**
 * Explicit tool registry. Tools never self-register through filesystem scanning
 * or import-time side effects; duplicate or malformed definitions fail startup.
 */
export function createToolRegistry(
  tools: readonly McpToolDefinition[],
): ToolRegistry {
  const byName = new Map<string, McpToolDefinition>();

  for (const tool of tools) {
    if (!toolNamePattern.test(tool.name)) {
      throw new Error(`Invalid MCP tool name: ${tool.name}`);
    }
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate MCP tool name: ${tool.name}`);
    }
    toolDescriptionSchema.parse(tool.description);
    byName.set(tool.name, tool);
  }

  const ordered = [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  return {
    get: (name) => byName.get(name),
    list: () => ordered,
  };
}
