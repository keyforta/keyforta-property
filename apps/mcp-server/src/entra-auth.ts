import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

import type { McpAuthenticator, McpPrincipal } from "./auth.js";

export interface EntraAuthenticatorOptions {
  readonly allowedClientIds: readonly string[];
  readonly audience: string;
  readonly issuer: string;
  readonly jwks: JWTVerifyGetKey;
  readonly tenantId: string;
}

export interface RemoteEntraAuthenticatorOptions
  extends Omit<EntraAuthenticatorOptions, "jwks"> {
  readonly jwksUri: string;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function grantedScopes(payload: Record<string, unknown>): readonly string[] {
  return typeof payload.scp === "string"
    ? [...new Set(payload.scp.split(" ").filter((scope) => scope.length > 0))]
    : [];
}

export function createEntraAuthenticator(
  options: EntraAuthenticatorOptions,
): McpAuthenticator {
  if (options.allowedClientIds.length === 0) {
    throw new Error("At least one Entra OAuth client must be allowed.");
  }

  const allowedClientIds = new Set(options.allowedClientIds);

  return {
    async authenticate(bearerToken): Promise<McpPrincipal | null> {
      try {
        const { payload } = await jwtVerify(bearerToken, options.jwks, {
          algorithms: ["RS256"],
          audience: options.audience,
          issuer: options.issuer,
        });
        const tenantId = nonEmptyString(payload.tid);
        const principalReference = nonEmptyString(payload.sub);
        const clientId = nonEmptyString(payload.azp) ?? nonEmptyString(payload.appid);

        if (
          tenantId !== options.tenantId ||
          principalReference === null ||
          clientId === null ||
          !allowedClientIds.has(clientId)
        ) {
          return null;
        }

        return {
          clientId,
          grantedScopes: grantedScopes(payload),
          principalReference,
          tenantId,
        };
      } catch {
        return null;
      }
    },
  };
}

export function createRemoteEntraAuthenticator(
  options: RemoteEntraAuthenticatorOptions,
): McpAuthenticator {
  const jwksUrl = new URL(options.jwksUri);
  if (jwksUrl.protocol !== "https:") {
    throw new Error("The Entra JWKS URI must use HTTPS.");
  }
  return createEntraAuthenticator({
    allowedClientIds: options.allowedClientIds,
    audience: options.audience,
    issuer: options.issuer,
    jwks: createRemoteJWKSet(jwksUrl),
    tenantId: options.tenantId,
  });
}
