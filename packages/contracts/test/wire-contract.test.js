import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

import {
  apiBasePath,
  apiWireAuthority,
  runtimeHttpOperations,
} from "../src/index.js";

const openApi = parse(
  readFileSync(new URL("../../../docs/openapi.yaml", import.meta.url), "utf8"),
);

test("OpenAPI is the named HTTP wire authority for implemented runtime operations", () => {
  assert.deepEqual(apiWireAuthority, {
    document: "docs/openapi.yaml",
    name: "OpenAPI",
  });
  assert.ok(
    openApi.servers.every((server) => new URL(server.url).pathname.endsWith(apiBasePath)),
  );

  for (const [operationId, operation] of Object.entries(runtimeHttpOperations)) {
    const path = openApi.paths[operation.path];
    assert.ok(path, `${operation.path} is missing from OpenAPI`);
    const method = path[operation.method.toLowerCase()];
    assert.ok(method, `${operation.method} ${operation.path} is missing from OpenAPI`);
    assert.equal(method.operationId, operationId);
    assert.equal(
      Array.isArray(method.security) && method.security.length === 0,
      operation.authentication === "anonymous",
      `${operationId} authentication must match OpenAPI security`,
    );
  }
});

test("OpenAPI preserves stable envelopes, errors, and integer-minor-unit money fields", () => {
  assert.deepEqual(openApi.components.schemas.Problem.required, ["error"]);
  assert.deepEqual(openApi.components.schemas.Problem.properties.error.required, [
    "code",
    "details",
    "message",
    "traceId",
  ]);
  assert.deepEqual(openApi.components.schemas.PublicRequestReceipt.required, [
    "data",
    "meta",
  ]);
  assert.deepEqual(openApi.components.schemas.PublicPropertyListEnvelope.required, [
    "items",
    "total",
    "nextCursor",
    "meta",
  ]);
  assert.deepEqual(openApi.components.schemas.Envelope.required, ["data", "meta"]);
  assert.deepEqual(openApi.components.schemas.ListEnvelope.required, [
    "items",
    "total",
    "meta",
  ]);
  assert.deepEqual(openApi.components.schemas.Money.required, [
    "amountMinor",
    "currency",
  ]);
  assert.equal(
    openApi.components.schemas.Money.properties.amountMinor.type,
    "integer",
  );
  assert.equal(
    "amount" in openApi.components.schemas.Money.properties,
    false,
  );
});

test("lifecycle mutations use named command paths instead of generic decision parameters", () => {
  const paths = Object.keys(openApi.paths);
  assert.equal(paths.some((path) => path.includes("{command}")), false);
  assert.equal(paths.some((path) => path.includes("{decision}")), false);
  assert.equal(openApi.paths["/maintenance-requests/{requestId}"].patch, undefined);
});
