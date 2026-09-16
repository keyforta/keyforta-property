import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

async function collectRuntimeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => !["dist", "node_modules"].includes(entry.name))
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? collectRuntimeFiles(entryPath) : [entryPath];
      }),
  );
  return files.flat();
}

describe("KEYFORTA API identity", () => {
  it("uses the canonical package and runtime identities", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { name: string };
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(packageJson.name).toBe("@keyforta/api");
    expect(response.json().service).toBe("keyforta-api");
  });

  it("contains no predecessor identity in runtime content or paths", async () => {
    const forbiddenIdentities = [
      ["moba", "teli"].join(""),
      ["mama", "lopango"].join(""),
    ];
    const files = await collectRuntimeFiles(process.cwd());

    for (const file of files) {
      const normalizedPath = file.toLowerCase();
      const content = (await readFile(file, "utf8")).toLowerCase();
      for (const forbiddenIdentity of forbiddenIdentities) {
        expect(normalizedPath).not.toContain(forbiddenIdentity);
        expect(content).not.toContain(forbiddenIdentity);
      }
    }
  });
});