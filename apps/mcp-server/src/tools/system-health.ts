import { createToolResultSchema } from "@keyforta/contracts";
import { z } from "zod";

import { MCP_POLICY_VERSION } from "../audit.js";
import { LATEST_PROTOCOL_VERSION } from "../protocol.js";
import type { McpToolDefinition } from "../registry.js";

export const systemHealthToolName = "system.health";

const systemHealthInputSchema = z.object({}).strict();

const systemHealthStructuredContentSchema = z
  .object({
    checkedAt: z.iso.datetime(),
    dataBoundary: z.literal("synthetic"),
    policyVersion: z.literal(MCP_POLICY_VERSION),
    protocolVersion: z.literal(LATEST_PROTOCOL_VERSION),
    readOnly: z.literal(true),
    serviceName: z.literal("keyforta-mcp-server"),
    status: z.literal("ok"),
  })
  .strict();

const systemHealthResultSchema = createToolResultSchema({
  structuredContentSchema: systemHealthStructuredContentSchema,
});

export const systemHealthInputJsonSchema = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const;

export const systemHealthOutputJsonSchema = {
  additionalProperties: false,
  properties: {
    checkedAt: { format: "date-time", type: "string" },
    dataBoundary: { const: "synthetic", type: "string" },
    policyVersion: { const: MCP_POLICY_VERSION, type: "string" },
    protocolVersion: { const: LATEST_PROTOCOL_VERSION, type: "string" },
    readOnly: { const: true, type: "boolean" },
    serviceName: { const: "keyforta-mcp-server", type: "string" },
    status: { const: "ok", type: "string" },
  },
  required: [
    "checkedAt",
    "dataBoundary",
    "policyVersion",
    "protocolVersion",
    "readOnly",
    "serviceName",
    "status",
  ],
  type: "object",
} as const;

export interface SystemHealthToolOptions {
  now?: () => Date;
}

/**
 * Read-only capability probe. It reports only synthetic service metadata and
 * never reads product data, persistence, or request identity.
 */
export function createSystemHealthTool(
  options: SystemHealthToolOptions = {},
): McpToolDefinition {
  const now = options.now ?? (() => new Date());

  return {
    description:
      "Use when a client needs to confirm that the KEYFORTA MCP boundary is reachable and which read-only capabilities it exposes. Do not use when property, lease, payment, document, maintenance, or any person-related information is required; this tool returns only synthetic service metadata.",
    handler: () =>
      systemHealthResultSchema.parse({
        content: [
          {
            text: "The KEYFORTA MCP boundary is reachable and exposes read-only synthetic capability metadata.",
            type: "text",
          },
        ],
        structuredContent: {
          checkedAt: now().toISOString(),
          dataBoundary: "synthetic",
          policyVersion: MCP_POLICY_VERSION,
          protocolVersion: LATEST_PROTOCOL_VERSION,
          readOnly: true,
          serviceName: "keyforta-mcp-server",
          status: "ok",
        },
      }),
    inputJsonSchema: systemHealthInputJsonSchema,
    inputSchema: systemHealthInputSchema,
    name: systemHealthToolName,
    outputJsonSchema: systemHealthOutputJsonSchema,
    requiredScopes: ["mcp.tools.read"],
    resultSchema: systemHealthResultSchema,
    title: "Service health and capability",
  };
}
