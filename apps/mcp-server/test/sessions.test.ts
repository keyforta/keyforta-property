import { describe, expect, it } from "vitest";

import { credentialScheme, readBearerToken } from "../src/auth.js";
import { createToolRegistry } from "../src/registry.js";
import { createSessionStore, SessionCapacityError } from "../src/sessions.js";
import { createSystemHealthTool } from "../src/tools/system-health.js";

const binding = {
  originKey: "non-browser",
  protocolVersion: "2025-06-18",
  subjectReference: "synthetic-subject-1",
} as const;

describe("MCP session store", () => {
  it("expires sessions on the absolute lifetime", () => {
    let currentTime = 0;
    const sessions = createSessionStore({
      absoluteTtlMs: 1_000,
      idleTtlMs: 60_000,
      now: () => currentTime,
    });
    const session = sessions.open(binding);

    for (const elapsed of [200, 400, 600, 800]) {
      currentTime = elapsed;
      expect(sessions.touch(session.id, binding).ok).toBe(true);
    }

    currentTime = 1_000;
    const lookup = sessions.touch(session.id, binding);
    expect(lookup).toEqual({ ok: false, reason: "expired_session" });
    expect(sessions.size()).toBe(0);
  });

  it("issues unique opaque identifiers and enforces capacity", () => {
    const sessions = createSessionStore({ maxSessions: 2 });
    const first = sessions.open(binding);
    const second = sessions.open(binding);

    expect(first.id).not.toBe(second.id);
    expect(() => sessions.open(binding)).toThrow(SessionCapacityError);
  });

  it("rejects lookups that change the session binding", () => {
    const sessions = createSessionStore();
    const session = sessions.open(binding);

    expect(
      sessions.touch(session.id, { ...binding, originKey: "https://other.invalid" }),
    ).toEqual({ ok: false, reason: "mismatched_session_binding" });
    expect(
      sessions.touch(session.id, { ...binding, protocolVersion: "2025-03-26" }),
    ).toEqual({ ok: false, reason: "mismatched_session_binding" });
    expect(sessions.touch("unknown-session-identifier", binding)).toEqual({
      ok: false,
      reason: "unknown_session",
    });
  });
});

describe("MCP tool registry", () => {
  it("rejects duplicate and malformed tool registrations", () => {
    const tool = createSystemHealthTool();

    expect(() => createToolRegistry([tool, tool])).toThrow(
      /Duplicate MCP tool name/,
    );
    expect(() =>
      createToolRegistry([{ ...tool, name: "System Health" }]),
    ).toThrow(/Invalid MCP tool name/);
    expect(() =>
      createToolRegistry([{ ...tool, description: "a".repeat(1024) }]),
    ).toThrow();
  });

  it("registers the synthetic health tool with a read-only scope", () => {
    const registry = createToolRegistry([createSystemHealthTool()]);
    const tool = registry.get("system.health");

    expect(registry.list()).toHaveLength(1);
    expect(tool?.requiredScopes).toEqual(["mcp.tools.read"]);
  });
});

describe("credential parsing", () => {
  it("accepts token68 credentials including base64url identity tokens", () => {
    const base64UrlToken = [
      "synthetic_header-segment",
      "synthetic_payload-segment",
      "synthetic_signature-segment",
    ].join(".");

    expect(readBearerToken(`${credentialScheme} ${base64UrlToken}`)).toBe(
      base64UrlToken,
    );
    expect(readBearerToken(`${credentialScheme} synthetic==`)).toBe(
      "synthetic==",
    );
    expect(readBearerToken("Basic synthetic")).toBeNull();
    expect(readBearerToken(undefined)).toBeNull();
  });
});
