export const JSON_RPC_ERROR_CODES = {
  internalError: -32603,
  invalidParams: -32602,
  invalidRequest: -32600,
  methodNotFound: -32601,
  parseError: -32700,
  requestDenied: -32001,
} as const;

export type JsonRpcErrorCode =
  (typeof JSON_RPC_ERROR_CODES)[keyof typeof JSON_RPC_ERROR_CODES];

export interface JsonRpcErrorBody {
  error: {
    code: JsonRpcErrorCode;
    data: {
      correlationId: string;
      reason: string;
      supportedProtocolVersions?: readonly string[];
    };
    message: string;
  };
  id: string | number | null;
  jsonrpc: "2.0";
}

/**
 * Builds a sanitized JSON-RPC error. Messages and reasons are stable
 * identifiers; raw exceptions, payloads, and stack traces never leave the
 * server.
 */
export function jsonRpcError(
  id: string | number | null,
  code: JsonRpcErrorCode,
  message: string,
  correlationId: string,
  reason: string,
  supportedProtocolVersions?: readonly string[],
): JsonRpcErrorBody {
  return {
    error: {
      code,
      data: supportedProtocolVersions
        ? { correlationId, reason, supportedProtocolVersions }
        : { correlationId, reason },
      message,
    },
    id,
    jsonrpc: "2.0",
  };
}
