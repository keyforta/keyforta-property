import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const fixture = fileURLToPath(new URL("./support/azure-identity-fixture.ts", import.meta.url));

describe("Azure Identity scoped MSAL security override compatibility", () => {
  it("resolves the exact reviewed MSAL patch through Azure Identity", () => {
    const apiRequire = createRequire(import.meta.url);
    const identityRequire = createRequire(apiRequire.resolve("@azure/identity"));
    const msal = JSON.parse(readFileSync(
      identityRequire.resolve("@azure/msal-node/package.json"), "utf8",
    )) as { version: string };
    expect(msal.version).toBe("7.1.0");
  });

  // MSAL retains its managed-identity source/transport and token cache in
  // process-wide state. Isolate synthetic deployment configurations in child
  // processes instead of modifying private SDK cache fields or mocking MSAL.
  for (const scenario of [
    "user-assigned-cache",
    "expired-token-renewal",
    "default-managed-pool",
    "managed-refusal",
    "empty-token",
    "system-assigned",
    "default-environment",
  ]) {
    it(`preserves real credential/token behavior: ${scenario}`, async () => {
      const { stdout } = await run(process.execPath, ["--import", "tsx", fixture, scenario]);
      expect(stdout.trim()).toBe(`PASS ${scenario}`);
    });
  }
});
