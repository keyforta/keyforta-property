import type { McpServerDependencies } from "./app.js";
import { createStaticAuthenticator } from "./auth.js";
import { createRemoteEntraAuthenticator } from "./entra-auth.js";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface McpRuntimeConfiguration {
  readonly host: string;
  readonly port: number;
  readonly serverDependencies: McpServerDependencies;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function commaSeparated(environment: RuntimeEnvironment, name: string): string[] {
  const values = required(environment, name)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new Error(`${name} must contain unique comma-separated values.`);
  }
  return values;
}

function optionalCommaSeparated(
  environment: RuntimeEnvironment,
  name: string,
): string[] {
  const value = environment[name]?.trim();
  if (!value) return [];
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (new Set(values).size !== values.length) {
    throw new Error(`${name} must contain unique comma-separated values.`);
  }
  return values;
}

function integer(
  environment: RuntimeEnvironment,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const rawValue = required(environment, name);
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function httpsUrl(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  return url;
}

function validateClientIds(clientIds: readonly string[], name: string): void {
  if (clientIds.some((clientId) => !uuidPattern.test(clientId))) {
    throw new Error(`${name} must contain only Entra application IDs.`);
  }
}

function loadProductionConfiguration(
  environment: RuntimeEnvironment,
): McpRuntimeConfiguration {
  const tenantId = required(environment, "MCP_ENTRA_TENANT_ID");
  if (!uuidPattern.test(tenantId)) {
    throw new Error("MCP_ENTRA_TENANT_ID must be an Entra directory ID.");
  }

  const issuer = required(environment, "MCP_ENTRA_ISSUER");
  const expectedIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  if (issuer !== expectedIssuer) {
    throw new Error("MCP_ENTRA_ISSUER must be the tenant-specific v2 issuer.");
  }

  const jwksUri = required(environment, "MCP_ENTRA_JWKS_URI");
  const expectedJwksUri =
    `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  if (jwksUri !== expectedJwksUri) {
    throw new Error("MCP_ENTRA_JWKS_URI must be the tenant-specific v2 JWKS URI.");
  }

  const resource = required(environment, "MCP_RESOURCE_URL");
  const resourceUrl = httpsUrl(resource, "MCP_RESOURCE_URL");
  if (resourceUrl.origin !== resource || resourceUrl.pathname !== "/") {
    throw new Error("MCP_RESOURCE_URL must be a canonical HTTPS origin.");
  }

  const audience = required(environment, "MCP_ENTRA_AUDIENCE");
  if (audience !== resource) {
    throw new Error("MCP_ENTRA_AUDIENCE must exactly match MCP_RESOURCE_URL.");
  }

  const requiredScope = required(environment, "MCP_REQUIRED_SCOPE");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(requiredScope)) {
    throw new Error("MCP_REQUIRED_SCOPE is malformed.");
  }
  const resourceScope = required(environment, "MCP_RESOURCE_SCOPE");
  if (resourceScope !== `${resource}/${requiredScope}`) {
    throw new Error(
      "MCP_RESOURCE_SCOPE must combine MCP_RESOURCE_URL and MCP_REQUIRED_SCOPE.",
    );
  }

  const resourceMetadataUrl = required(
    environment,
    "MCP_RESOURCE_METADATA_URL",
  );
  if (
    resourceMetadataUrl !==
    `${resource}/.well-known/oauth-protected-resource`
  ) {
    throw new Error(
      "MCP_RESOURCE_METADATA_URL must be the resource protected-metadata URL.",
    );
  }

  const allowedClientIds = commaSeparated(
    environment,
    "MCP_ALLOWED_CLIENT_IDS",
  );
  const allowedNonBrowserClientIds = optionalCommaSeparated(
    environment,
    "MCP_ALLOWED_NON_BROWSER_CLIENT_IDS",
  );
  validateClientIds(allowedClientIds, "MCP_ALLOWED_CLIENT_IDS");
  validateClientIds(
    allowedNonBrowserClientIds,
    "MCP_ALLOWED_NON_BROWSER_CLIENT_IDS",
  );
  const allowedClientIdSet = new Set(allowedClientIds);
  if (
    allowedNonBrowserClientIds.some(
      (clientId) => !allowedClientIdSet.has(clientId),
    )
  ) {
    throw new Error(
      "MCP_ALLOWED_NON_BROWSER_CLIENT_IDS must be a subset of MCP_ALLOWED_CLIENT_IDS.",
    );
  }

  const allowedOrigins = commaSeparated(environment, "MCP_ALLOWED_ORIGINS");
  for (const origin of allowedOrigins) {
    const url = httpsUrl(origin, "MCP_ALLOWED_ORIGINS");
    if (url.origin !== origin || url.pathname !== "/") {
      throw new Error("MCP_ALLOWED_ORIGINS must contain exact HTTPS origins.");
    }
  }

  return {
    host: required(environment, "MCP_HOST"),
    port: integer(environment, "MCP_PORT", 1, 65_535),
    serverDependencies: {
      allowedNonBrowserClientIds,
      allowedOrigins,
      authenticator: createRemoteEntraAuthenticator({
        allowedClientIds,
        audience,
        issuer,
        jwksUri,
        tenantId,
      }),
      protectedResourceMetadata: {
        authorizationServers: [issuer],
        resource,
        resourceMetadataUrl,
        scopesSupported: [resourceScope],
      },
      requestsPerMinute: integer(
        environment,
        "MCP_REQUESTS_PER_MINUTE",
        1,
        1_000,
      ),
      requiredScopes: [requiredScope],
    },
  };
}

function loadLocalConfiguration(
  environment: RuntimeEnvironment,
): McpRuntimeConfiguration {
  const developmentToken = required(
    environment,
    "MCP_DEVELOPMENT_ACCESS_TOKEN",
  );
  return {
    host: environment.MCP_HOST?.trim() || "127.0.0.1",
    port: environment.MCP_PORT
      ? integer(environment, "MCP_PORT", 1, 65_535)
      : 3_100,
    serverDependencies: {
      allowedNonBrowserClientIds: ["local-development-client"],
      allowedOrigins: [],
      authenticator: createStaticAuthenticator({ token: developmentToken }),
    },
  };
}

export function loadMcpRuntimeConfiguration(
  environment: RuntimeEnvironment = process.env,
): McpRuntimeConfiguration {
  const nodeEnvironment = required(environment, "NODE_ENV");
  if (nodeEnvironment === "production") {
    return loadProductionConfiguration(environment);
  }
  if (["development", "test"].includes(nodeEnvironment)) {
    return loadLocalConfiguration(environment);
  }
  throw new Error(
    "NODE_ENV must be production, development, or test for the MCP server.",
  );
}