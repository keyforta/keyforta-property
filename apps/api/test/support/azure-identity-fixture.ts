import assert from "node:assert/strict";
import { mock } from "node:test";
import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredentialOptions,
} from "@azure/identity";

import { createDatabasePool } from "../../src/database.js";

const scope = "https://ossrdbms-aad.database.windows.net/.default";
const resource = "https://ossrdbms-aad.database.windows.net";
const endpoint = "http://127.0.0.1:49199/synthetic/identity/token";
const clientId = "00000000-0000-4000-8000-00000000d001";
const tenantId = "00000000-0000-4000-8000-00000000d002";
type HttpClient = NonNullable<TokenCredentialOptions["httpClient"]>;

// Never consume developer/cloud identity settings or launch credential CLIs.
// The real SDK's public HttpClient boundary returns synthetic responses only;
// no HTTP server, socket, live credentials, or Azure access is involved.
for (const name of [
  "AZURE_CLIENT_ID", "AZURE_TENANT_ID", "AZURE_CLIENT_SECRET",
  "AZURE_CLIENT_CERTIFICATE_PATH", "AZURE_CLIENT_CERTIFICATE_PASSWORD",
  "AZURE_CLIENT_SEND_CERTIFICATE_CHAIN", "AZURE_USERNAME", "AZURE_PASSWORD",
  "AZURE_FEDERATED_TOKEN_FILE", "AZURE_AUTHORITY_HOST",
  "AZURE_REGIONAL_AUTHORITY_NAME", "AZURE_TOKEN_CREDENTIALS",
  "IDENTITY_ENDPOINT", "IDENTITY_HEADER", "IDENTITY_SERVER_THUMBPRINT",
  "IMDS_ENDPOINT", "MSI_ENDPOINT", "MSI_SECRET",
]) delete process.env[name];
process.env.IDENTITY_ENDPOINT = endpoint;
process.env.IDENTITY_HEADER = "synthetic-identity-header";

function managedTransport(status = 200, token = "synthetic-managed-access-token") {
  const requests: Parameters<HttpClient["sendRequest"]>[0][] = [];
  const httpClient: HttpClient = {
    async sendRequest(request) {
      requests.push(request);
      assert.equal(new URL(request.url).origin, new URL(endpoint).origin);
      return {
        request, status, headers: request.headers,
        bodyAsText: JSON.stringify(status === 200 ? {
          access_token: token,
          expires_on: String(Math.floor(Date.now() / 1000) + 3600),
          resource,
          token_type: "Bearer",
        } : {
          error: "invalid_request",
          error_description: "Synthetic managed identity refusal",
        }),
      };
    },
  };
  return { httpClient, requests };
}

const scenario = process.argv[2];
if (scenario === "default-environment") {
  process.env.AZURE_TOKEN_CREDENTIALS = "EnvironmentCredential";
  process.env.AZURE_CLIENT_ID = clientId;
  process.env.AZURE_TENANT_ID = tenantId;
  process.env.AZURE_CLIENT_SECRET = "synthetic-client-secret";
  const authority = `https://login.microsoftonline.com/${tenantId}`;
  const requests: Parameters<HttpClient["sendRequest"]>[0][] = [];
  const httpClient: HttpClient = {
    async sendRequest(request) {
      requests.push(request);
      const url = new URL(request.url);
      assert.equal(url.origin, "https://login.microsoftonline.com");
      let body;
      if (url.pathname === `/${tenantId}/v2.0/.well-known/openid-configuration`) {
        assert.equal(request.method, "GET");
        body = {
          authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
          token_endpoint: `${authority}/oauth2/v2.0/token`,
          issuer: `${authority}/v2.0`,
          jwks_uri: `${authority}/discovery/v2.0/keys`,
          end_session_endpoint: `${authority}/oauth2/v2.0/logout`,
        };
      } else {
        assert.equal(url.pathname, `/${tenantId}/oauth2/v2.0/token`);
        assert.equal(request.method, "POST");
        const form = new URLSearchParams(String(request.body));
        assert.equal(form.get("grant_type"), "client_credentials");
        assert.equal(form.get("scope"), scope);
        assert.equal(form.get("client_id"), clientId);
        assert.equal(form.get("client_secret"), "synthetic-client-secret");
        body = {
          access_token: "synthetic-environment-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          ext_expires_in: 3600,
        };
      }
      return { request, status: 200, headers: request.headers, bodyAsText: JSON.stringify(body) };
    },
  };
  const credential = new DefaultAzureCredential({
    httpClient, disableInstanceDiscovery: true, retryOptions: { maxRetries: 0 },
  });
  const first = await credential.getToken(scope);
  assert.equal(first?.token, "synthetic-environment-access-token");
  assert.ok(first.expiresOnTimestamp > Date.now() + 3_000_000);
  const count = requests.length;
  assert.ok(count > 0);
  assert.equal((await credential.getToken(scope))?.token, first.token);
  assert.equal(requests.length, count);
  await assert.rejects(credential.getToken(scope, {
    tenantId: "00000000-0000-4000-8000-00000000d003",
  }));
  assert.equal(requests.length, count, "unapproved tenant must fail before transport");
} else {
  const { httpClient, requests } = managedTransport(
    scenario === "managed-refusal" ? 400 : 200,
    scenario === "empty-token" ? "" : "synthetic-managed-access-token",
  );
  const options = { httpClient, retryOptions: { maxRetries: 0 } };
  if (scenario === "default-managed-pool") process.env.AZURE_TOKEN_CREDENTIALS = "ManagedIdentityCredential";
  const credential = scenario === "default-managed-pool"
    ? new DefaultAzureCredential({ ...options, managedIdentityClientId: clientId })
    : scenario === "system-assigned"
      ? new ManagedIdentityCredential(options)
      : new ManagedIdentityCredential(clientId, options);
  if (scenario === "managed-refusal" || scenario === "default-managed-pool") {
    const pool = createDatabasePool({
      DATABASE_AUTH: "entra",
      DATABASE_URL: "postgresql://synthetic@database.example.test/keyforta",
    }, credential);
    try {
      const password = pool.options.password as () => Promise<string>;
      if (scenario === "managed-refusal") await assert.rejects(password());
      else assert.equal(await password(), "synthetic-managed-access-token");
      assert.ok(requests.length > 0);
      assert.equal(new URL(requests[0]!.url).searchParams.get("resource"), resource);
    } finally {
      await pool.end();
    }
  } else if (scenario === "empty-token") {
    await assert.rejects(credential.getToken(scope));
  } else if (scenario === "user-assigned-cache" || scenario === "system-assigned") {
    const first = await credential.getToken(scope);
    assert.equal(first?.token, "synthetic-managed-access-token");
    assert.ok(first.expiresOnTimestamp > Date.now() + 3_000_000);
    assert.equal((await credential.getToken(scope))?.token, first.token);
    assert.equal(requests.length, 1);
    const request = requests[0]!;
    const url = new URL(request.url);
    assert.equal(request.method, "GET");
    assert.equal(url.searchParams.get("resource"), resource);
    assert.equal(url.searchParams.get("client_id"), scenario === "system-assigned" ? null : clientId);
    assert.equal(url.searchParams.get("api-version"), "2019-08-01");
    assert.equal(request.headers.get("X-IDENTITY-HEADER"), "synthetic-identity-header");
  } else if (scenario === "expired-token-renewal") {
    mock.timers.enable({ apis: ["Date"], now: Date.now() });
    try {
      const first = await credential.getToken(scope);
      mock.timers.tick(3_700_000);
      const second = await credential.getToken(scope);
      assert.equal(requests.length, 2);
      assert.ok(second!.expiresOnTimestamp > first!.expiresOnTimestamp);
    } finally {
      mock.timers.reset();
    }
  } else {
    throw new Error(`Unknown synthetic scenario: ${scenario}`);
  }
}
console.log(`PASS ${scenario}`);
