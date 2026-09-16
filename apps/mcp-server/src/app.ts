import { randomUUID } from "node:crypto";

import { toolExecutionContextSchema } from "@keyforta/contracts";
import { createHealthTool } from "@keyforta/system-health";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";

import { createToolRegistry, type ToolRegistry } from "./registry.js";

const requestSchema = z.object({
  id: z.union([z.string(), z.number(), z.null()]),
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1).max(128),
  params: z.unknown().optional(),
}).strict();

export type McpAuthenticator = (
  request: FastifyRequest,
) => Promise<unknown>;

export interface McpAppDependencies {
  readonly authenticator: McpAuthenticator;
  readonly registry?: ToolRegistry;
}

function errorResponse(id: string | number | null, code: number, message: string) {
  return { error: { code, message }, id, jsonrpc: "2.0" };
}

export async function buildMcpApp(
  dependencies: McpAppDependencies,
): Promise<FastifyInstance> {
  const registry = dependencies.registry ?? createToolRegistry([createHealthTool()]);
  const app = Fastify({
    bodyLimit: 16 * 1024,
    genReqId: () => randomUUID(),
    logger: process.env.NODE_ENV !== "test",
    requestTimeout: 30_000,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  app.post("/mcp", async (request, reply) => {
    let context: unknown;
    try {
      context = toolExecutionContextSchema.parse(
        await dependencies.authenticator(request),
      );
    } catch {
      return reply
        .header(
          "www-authenticate",
          'MCP realm="keyforta"',
        )
        .status(401)
        .send(errorResponse(null, -32001, "Authentication required"));
    }

    const parsedRequest = requestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.status(400).send(errorResponse(null, -32600, "Invalid request"));
    }

    const { id, method, params } = parsedRequest.data;
    if (method === "initialize") {
      return {
        id,
        jsonrpc: "2.0",
        result: {
          capabilities: { tools: {} },
          protocolVersion: "2025-06-18",
          serverInfo: { name: "keyforta-mcp", version: "0.1.0" },
        },
      };
    }
    if (method === "tools/list") {
      return {
        id,
        jsonrpc: "2.0",
        result: {
          tools: registry.list().map((tool) => ({
            description: tool.description,
            inputSchema: z.toJSONSchema(tool.inputSchema),
            name: tool.name,
          })),
        },
      };
    }
    if (method === "tools/call") {
      const call = z.object({
        arguments: z.unknown().optional(),
        name: z.string().min(1).max(128),
      }).strict().safeParse(params);
      if (!call.success) {
        return reply.status(400).send(errorResponse(id, -32602, "Invalid tool arguments"));
      }
      const tool = registry.get(call.data.name);
      if (!tool) return reply.status(404).send(errorResponse(id, -32601, "Unknown tool"));
      try {
        const result = await tool.execute(call.data.arguments ?? {}, context);
        return { id, jsonrpc: "2.0", result };
      } catch {
        return reply.status(400).send(errorResponse(id, -32602, "Tool input is invalid"));
      }
    }
    return reply.status(404).send(errorResponse(id, -32601, "Method not found"));
  });

  return app;
}
