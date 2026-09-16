import { createHash } from "node:crypto";

/** Version of the AI tool policy enforced by this boundary. */
export const MCP_POLICY_VERSION = "2026-09-16";

export type McpAuditStatus = "denied" | "error" | "ok";

export interface McpAuditRecord {
  readonly clientId: string | null;
  readonly correlationId: string;
  readonly method: string | null;
  readonly policyVersion: string;
  readonly protocolVersion: string | null;
  readonly reason: string | null;
  readonly sessionReference: string | null;
  readonly status: McpAuditStatus;
  readonly toolName: string | null;
}

export type McpAuditSink = (record: McpAuditRecord) => void;

/**
 * Derives a non-reversible session reference so audit records never contain the
 * session credential itself.
 */
export function sessionReference(sessionId: string | null): string | null {
  return sessionId
    ? createHash("sha256").update(sessionId).digest("base64url").slice(0, 32)
    : null;
}
