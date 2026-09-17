import { z } from "zod";

export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;

export type SupportedProtocolVersion =
  (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

export const LATEST_PROTOCOL_VERSION: SupportedProtocolVersion =
  "2025-11-25";

export function isSupportedProtocolVersion(
  value: unknown,
): value is SupportedProtocolVersion {
  return (
    typeof value === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value)
  );
}

export const jsonRpcIdSchema = z.union([
  z.string().min(1).max(256),
  z.number().int(),
]);

export const jsonRpcRequestSchema = z
  .object({
    id: jsonRpcIdSchema.optional(),
    jsonrpc: z.literal("2.0"),
    method: z.string().min(1).max(128),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

export const initializeParamsSchema = z
  .object({
    capabilities: z.record(z.string(), z.unknown()).optional(),
    clientInfo: z
      .object({
        name: z.string().trim().min(1).max(128),
        title: z.string().trim().min(1).max(128).optional(),
        version: z.string().trim().min(1).max(64).optional(),
      })
      .loose()
      .optional(),
    protocolVersion: z.string().trim().min(1).max(64),
  })
  .loose();

export const toolCallParamsSchema = z
  .object({
    arguments: z.record(z.string(), z.unknown()).optional(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  })
  .loose();
