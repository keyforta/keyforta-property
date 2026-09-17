import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

export interface Principal {
  objectId: string;
  subject: string;
}

export interface PrincipalAuthenticator {
  authenticate(authorization: string): Promise<Principal | undefined>;
}

export interface EntraPrincipalAuthenticatorOptions {
  audience: string;
  issuer: string;
  jwksUri: string;
  jwks?: JWTVerifyGetKey;
}

const objectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePlatformAdminObjectIds(value: string | undefined): ReadonlySet<string> {
  if (!value?.trim()) return new Set();
  const objectIds = value.split(",").map((candidate) => candidate.trim().toLowerCase());
  if (objectIds.some((candidate) => !objectIdPattern.test(candidate))) {
    throw new Error("PLATFORM_ADMIN_OBJECT_IDS must contain comma-separated UUIDs.");
  }
  return new Set(objectIds);
}

export function createEntraPrincipalAuthenticator(
  options: EntraPrincipalAuthenticatorOptions,
): PrincipalAuthenticator {
  const issuerUrl = new URL(options.issuer);
  if (issuerUrl.protocol !== "https:") {
    throw new Error("The Entra issuer must use HTTPS.");
  }

  const jwks = options.jwks ?? (() => {
    const jwksUrl = new URL(options.jwksUri);
    if (jwksUrl.protocol !== "https:") {
      throw new Error("The Entra JWKS URI must use HTTPS.");
    }
    return createRemoteJWKSet(jwksUrl);
  })();

  return {
    async authenticate(authorization) {
      const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
      if (!match?.[1]) return undefined;

      try {
        const { payload } = await jwtVerify(match[1], jwks, {
          algorithms: ["RS256"],
          audience: options.audience,
          issuer: issuerUrl.toString(),
          requiredClaims: ["exp", "sub", "oid"],
        });
        return typeof payload.sub === "string" && payload.sub.trim() &&
          typeof payload.oid === "string" && objectIdPattern.test(payload.oid)
          ? { objectId: payload.oid.toLowerCase(), subject: payload.sub }
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}