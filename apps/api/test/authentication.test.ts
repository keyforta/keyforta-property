import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createEntraPrincipalAuthenticator,
  parsePlatformAdminObjectIds,
} from "../src/authentication.js";

describe("Entra principal authentication", () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair("RS256"));
  });

  async function token(overrides: { audience?: string; issuer?: string; objectId?: string | null } = {}) {
    const claims = overrides.objectId === null
      ? {}
      : { oid: overrides.objectId ?? "00000000-0000-4000-8000-000000000701" };
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("synthetic-external-subject")
      .setAudience(overrides.audience ?? "api://keyforta-test")
      .setIssuer(overrides.issuer ?? "https://login.example.test/tenant/v2.0")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  function authenticator() {
    return createEntraPrincipalAuthenticator({
      audience: "api://keyforta-test",
      issuer: "https://login.example.test/tenant/v2.0",
      jwks: async () => publicKey,
      jwksUri: "https://login.example.test/keys",
    });
  }

  it("accepts a signed token with the configured issuer and audience", async () => {
    await expect(
      authenticator().authenticate(`Bearer ${await token()}`),
    ).resolves.toEqual({
      objectId: "00000000-0000-4000-8000-000000000701",
      subject: "synthetic-external-subject",
    });
  });

  it.each([
    ["malformed", "Bearer not-a-token"],
    ["wrong audience", null],
    ["wrong issuer", null],
  ])("rejects a %s credential", async (scenario, credential) => {
    const authorization = credential ?? `Bearer ${await token(
      scenario === "wrong audience"
        ? { audience: "api://other" }
        : { issuer: "https://login.example.test/other/v2.0" },
    )}`;
    await expect(authenticator().authenticate(authorization)).resolves.toBeUndefined();
  });

  it("requires HTTPS for remote key discovery", () => {
    expect(() => createEntraPrincipalAuthenticator({
      audience: "api://keyforta-test",
      issuer: "https://login.example.test/tenant/v2.0",
      jwksUri: "http://login.example.test/keys",
    })).toThrow("must use HTTPS");
  });

  it.each([
    "http://login.example.test/tenant/v2.0",
    "not-an-issuer",
  ])("rejects an invalid issuer configuration: %s", (issuer) => {
    expect(() => createEntraPrincipalAuthenticator({
      audience: "api://keyforta-test",
      issuer,
      jwks: async () => publicKey,
      jwksUri: "https://login.example.test/keys",
    })).toThrow();
  });

  it("rejects a token without an immutable Entra object ID", async () => {
    await expect(
      authenticator().authenticate(`Bearer ${await token({ objectId: null })}`),
    ).resolves.toBeUndefined();
  });

  it("parses and normalizes the platform administrator allowlist", () => {
    expect(parsePlatformAdminObjectIds(
      "00000000-0000-4000-8000-000000000701, 00000000-0000-4000-8000-000000000702",
    )).toEqual(new Set([
      "00000000-0000-4000-8000-000000000701",
      "00000000-0000-4000-8000-000000000702",
    ]));
    expect(parsePlatformAdminObjectIds(undefined)).toEqual(new Set());
    expect(() => parsePlatformAdminObjectIds("not-an-object-id")).toThrow(
      "comma-separated UUIDs",
    );
  });
});