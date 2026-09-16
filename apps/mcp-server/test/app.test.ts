import assert from "node:assert/strict";
import test from "node:test";

import { buildMcpApp } from "../src/app.js";
import { createToolRegistry } from "../src/registry.js";
import { z } from "zod";

const principal = {
  correlationId: "correlation-1",
  grantedScopes: ["mcp.tools.read"],
  locale: "en",
  principalReference: "synthetic-principal",
};

test("authenticates before dispatching the Streamable HTTP MCP endpoint", async () => {
  const app = await buildMcpApp({
    authenticator: async () => principal,
  });
  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "keyforta_system_health" },
      },
      url: "/mcp",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().result.structuredContent, { status: "healthy" });
    assert.equal(response.body.includes("synthetic-principal"), false);
  } finally {
    await app.close();
  }
});

test("rejects unauthenticated requests before parsing tool content", async () => {
  const app = await buildMcpApp({
    authenticator: async () => { throw new Error("not authenticated"); },
  });
  try {
    const response = await app.inject({
      method: "POST",
      payload: { malformed: "payload" },
      url: "/mcp",
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.includes("not authenticated"), false);
  } finally {
    await app.close();
  }
});

test("registry rejects duplicate names and widget resources", () => {
  const tool = {
    description: "synthetic",
    execute: async () => ({}),
    inputSchema: {} as never,
    name: "duplicate",
    resource: { uri: "ui://keyforta/system/health" },
    resultSchema: {} as never,
  };
  assert.throws(() => createToolRegistry([tool, tool]), /Duplicate MCP tool name/);
  assert.throws(() => createToolRegistry([
    tool,
    { ...tool, name: "another" },
  ]), /Duplicate MCP widget resource URI/);
});

test("sanitizes unexpected tool failures as internal errors", async () => {
  const app = await buildMcpApp({
    authenticator: async () => principal,
    registry: createToolRegistry([{
      description: "Fails synthetically.",
      execute: async () => { throw new Error("provider payload must not escape"); },
      inputSchema: z.object({}).strict(),
      name: "synthetic_failure",
      resource: { uri: "ui://keyforta/system/failure" },
      resultSchema: z.object({}).strict(),
    }]),
  });
  try {
    const response = await app.inject({
      method: "POST",
      payload: {
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "synthetic_failure" },
      },
      url: "/mcp",
    });
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.includes("provider payload"), false);
    assert.equal(response.json().error.code, -32603);
  } finally {
    await app.close();
  }
});
