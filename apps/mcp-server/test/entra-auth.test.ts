import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createEntraAuthenticator } from "../src/entra-auth.js";

const audience = "api://keyforta-mcp-dev";
const clientId = "chatgpt-connector-client";
const issuer = "https://login.microsoftonline.com/synthetic-tenant/v2.0";
const tenantId = "synthetic-tenant";

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let authenticator: ReturnType<typeof createEntraAuthenticator>;

beforeAll(async () => {
  const keyPair = await generateKeyPair("RS256");
  privateKey = keyPair.privateKey;
  const publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.alg = "RS256";
  publicJwk.kid = "synthetic-key";
  publicJwk.use = "sig";

  authenticator = createEntraAuthenticator({
    allowedClientIds: [clientId],
    audience,
    issuer,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
    tenantId,
  });
});

async function token(overrides: JWTPayload = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let signer = new SignJWT({
    azp: clientId,
    scp: "mcp.tools.read",
    sub: "synthetic-subject",
    tid: tenantId,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic-key" })
    .setIssuedAt(now)
    .setNotBefore(now - 5);
  if (overrides.exp === undefined) signer = signer.setExpirationTime(now + 300);
  if (overrides.aud === undefined) signer = signer.setAudience(audience);
  if (overrides.iss === undefined) signer = signer.setIssuer(issuer);
  return signer.sign(privateKey);
}

describe("Entra MCP authentication", () => {
  it("returns only validated principal claims", async () => {
    await expect(authenticator.authenticate(await token())).resolves.toEqual({
      clientId,
      grantedScopes: ["mcp.tools.read"],
      principalReference: "synthetic-subject",
      tenantId,
    });
  });

  it.each([
    ["wrong audience", { aud: "api://other-resource" }],
    ["wrong issuer", { iss: "https://issuer.invalid/v2.0" }],
    ["wrong tenant", { tid: "other-tenant" }],
    ["unapproved client", { azp: "other-client" }],
    ["missing subject", { sub: "" }],
    ["expired token", { exp: 1 }],
  ])("rejects %s", async (_name, claims) => {
    await expect(authenticator.authenticate(await token(claims))).resolves.toBeNull();
  });

  it("accepts the legacy appid client claim but ignores application roles", async () => {
    await expect(
      authenticator.authenticate(
        await token({ appid: clientId, azp: undefined, roles: ["mcp.tools.read"], scp: undefined }),
      ),
    ).resolves.toMatchObject({ clientId, grantedScopes: [] });
  });
});
