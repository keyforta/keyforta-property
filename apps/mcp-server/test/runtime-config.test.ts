import { describe, expect, it } from "vitest";

import { loadMcpRuntimeConfiguration } from "../src/runtime-config.js";

const productionEnvironment = {
  MCP_ALLOWED_CLIENT_IDS: "11111111-1111-4111-8111-111111111111",
  MCP_ALLOWED_NON_BROWSER_CLIENT_IDS: "",
  MCP_ALLOWED_ORIGINS: "https://chatgpt.com",
  MCP_ENTRA_AUDIENCE: "https://mcp.keyforta.com",
  MCP_ENTRA_ISSUER:
    "https://login.microsoftonline.com/22222222-2222-4222-8222-222222222222/v2.0",
  MCP_ENTRA_JWKS_URI:
    "https://login.microsoftonline.com/22222222-2222-4222-8222-222222222222/discovery/v2.0/keys",
  MCP_ENTRA_TENANT_ID: "22222222-2222-4222-8222-222222222222",
  MCP_HOST: "0.0.0.0",
  MCP_PORT: "3100",
  MCP_REQUESTS_PER_MINUTE: "60",
  MCP_REQUIRED_SCOPE: "mcp.tools.read",
  MCP_RESOURCE_METADATA_URL:
    "https://mcp.keyforta.com/.well-known/oauth-protected-resource",
  MCP_RESOURCE_SCOPE: "https://mcp.keyforta.com/mcp.tools.read",
  MCP_RESOURCE_URL: "https://mcp.keyforta.com",
  NODE_ENV: "production",
};

describe("MCP runtime configuration", () => {
  it("builds an Entra-authenticated production boundary", () => {
    const configuration = loadMcpRuntimeConfiguration(productionEnvironment);

    expect(configuration).toMatchObject({
      host: "0.0.0.0",
      port: 3100,
      serverDependencies: {
        allowedNonBrowserClientIds: [],
        allowedOrigins: ["https://chatgpt.com"],
        protectedResourceMetadata: {
          authorizationServers: [productionEnvironment.MCP_ENTRA_ISSUER],
          resource: productionEnvironment.MCP_RESOURCE_URL,
          resourceMetadataUrl:
            productionEnvironment.MCP_RESOURCE_METADATA_URL,
          scopesSupported: [productionEnvironment.MCP_RESOURCE_SCOPE],
        },
        requestsPerMinute: 60,
        requiredScopes: ["mcp.tools.read"],
      },
    });
  });

  it("fails closed when production identity configuration is missing", () => {
    const { MCP_ENTRA_TENANT_ID: _missing, ...incomplete } =
      productionEnvironment;

    expect(() => loadMcpRuntimeConfiguration(incomplete)).toThrow(
      "MCP_ENTRA_TENANT_ID",
    );
  });

  it("rejects audience and resource drift", () => {
    expect(() =>
      loadMcpRuntimeConfiguration({
        ...productionEnvironment,
        MCP_ENTRA_AUDIENCE: "api://different-resource",
      }),
    ).toThrow("MCP_ENTRA_AUDIENCE must exactly match MCP_RESOURCE_URL");
  });

  it("rejects non-browser clients outside the OAuth client allowlist", () => {
    expect(() =>
      loadMcpRuntimeConfiguration({
        ...productionEnvironment,
        MCP_ALLOWED_NON_BROWSER_CLIENT_IDS:
          "33333333-3333-4333-8333-333333333333",
      }),
    ).toThrow("MCP_ALLOWED_NON_BROWSER_CLIENT_IDS");
  });

  it("keeps static credentials limited to local development", () => {
    const configuration = loadMcpRuntimeConfiguration({
      MCP_DEVELOPMENT_ACCESS_TOKEN: "local-development-token-value",
      NODE_ENV: "development",
    });

    expect(configuration).toMatchObject({ host: "127.0.0.1", port: 3100 });
  });
});