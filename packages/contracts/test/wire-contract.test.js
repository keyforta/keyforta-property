import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parse } from "yaml";

import {
  apiBasePath,
  apiWireAuthority,
  problemSchema,
  runtimeHttpOperations,
} from "../src/index.js";

const openApi = parse(
  readFileSync(new URL("../../../docs/openapi.yaml", import.meta.url), "utf8"),
);

const runtimeOpenApiOperations = Object.entries(openApi.paths).flatMap(
  ([path, pathItem]) => Object.entries(pathItem)
    .filter(([, operation]) => operation?.["x-keyforta-runtime"] === true)
    .map(([method, operation]) => ({
      authentication: Array.isArray(operation.security) && operation.security.length === 0
        ? "anonymous"
        : "required",
      method: method.toUpperCase(),
      operationId: operation.operationId,
      path,
    })),
);

test("OpenAPI is the named HTTP wire authority for implemented runtime operations", () => {
  assert.deepEqual(apiWireAuthority, {
    document: "docs/openapi.yaml",
    name: "OpenAPI",
  });
  assert.ok(
    openApi.servers.every((server) => new URL(server.url).pathname.endsWith(apiBasePath)),
  );

  assert.deepEqual(
    runtimeOpenApiOperations.sort((left, right) => left.operationId.localeCompare(right.operationId)),
    Object.entries(runtimeHttpOperations)
      .map(([operationId, operation]) => ({ operationId, ...operation }))
      .sort((left, right) => left.operationId.localeCompare(right.operationId)),
  );

  for (const { operationId, method, path } of runtimeOpenApiOperations) {
    const operation = openApi.paths[path][method.toLowerCase()];
    assert.ok(
      operation.parameters.some(
        (parameter) => parameter.$ref === "#/components/parameters/RequestCorrelation",
      ),
      `${operationId} must document request correlation`,
    );
    for (const response of Object.values(operation.responses)) {
      const responseName = response.$ref.split("/").at(-1);
      assert.equal(
        openApi.components.responses[responseName].headers["X-Request-Id"].$ref,
        "#/components/headers/RequestId",
        `${operationId} ${responseName} must document response correlation`,
      );
    }
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

test("shared problem details are required objects", () => {
  assert.equal(
    problemSchema.safeParse({
      error: { code: "TEST", message: "Test error", traceId: "request-1" },
    }).success,
    false,
  );
  assert.equal(
    problemSchema.safeParse({
      error: {
        code: "TEST",
        details: {},
        message: "Test error",
        traceId: "request-1",
      },
    }).success,
    true,
  );
});

test("lifecycle mutations use named command paths instead of generic decision parameters", () => {
  const paths = Object.keys(openApi.paths);
  assert.equal(paths.some((path) => path.includes("{command}")), false);
  assert.equal(paths.some((path) => path.includes("{decision}")), false);
  assert.equal(openApi.paths["/maintenance-requests/{requestId}"].patch, undefined);
});
