import { createHash, timingSafeEqual } from "node:crypto";

export interface McpPrincipal {
  /** Stable, non-personal client identifier used for bounded audit records. */
  readonly clientId: string;
  readonly grantedScopes: readonly string[];
  /** Opaque reference to the authenticated subject; never a raw token. */
  readonly principalReference: string;
  /** Validated identity-tenant identifier used only for authorization binding. */
  readonly tenantId: string;
}

export interface McpAuthenticator {
  /**
   * Resolves the authenticated actor for a bearer credential, or `null` when
   * the credential is missing, expired, or invalid. Implementations must never
   * derive identity from JSON-RPC content.
   */
  authenticate: (bearerToken: string) => Promise<McpPrincipal | null>;
}

export interface StaticAuthenticatorOptions {
  clientId?: string;
  grantedScopes?: readonly string[];
  principalReference?: string;
  tenantId?: string;
  token: string;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

/**
 * Deterministic authenticator for local development and tests. It performs no
 * outbound calls and holds no provider credential. Production identity is
 * supplied by the approved external identity boundary.
 */
export function createStaticAuthenticator(
  options: StaticAuthenticatorOptions,
): McpAuthenticator {
  if (options.token.length < 16) {
    throw new Error(
      "The static MCP authenticator requires a token of at least 16 characters.",
    );
  }
  const principal: McpPrincipal = {
    clientId: options.clientId ?? "local-development-client",
    grantedScopes: options.grantedScopes ?? ["mcp.tools.read"],
    principalReference: options.principalReference ?? "local-development-subject",
    tenantId: options.tenantId ?? "local-development-tenant",
  };

  return {
    async authenticate(bearerToken) {
      return constantTimeEquals(bearerToken, options.token) ? principal : null;
    },
  };
}

export const credentialScheme = "Bearer";
const credentialPattern = new RegExp(
  `^${credentialScheme}\\s+([A-Za-z0-9\\-._~+/]+=*)$`,
  "i",
);

/** Extracts a bearer credential from an `Authorization` header value. */
export function readBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (typeof authorizationHeader !== "string") return null;
  const match = credentialPattern.exec(authorizationHeader.trim());
  return match?.[1] ?? null;
}
