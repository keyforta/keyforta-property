import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkArchitecture } from "./architecture-boundaries.mjs";
import { scanSecrets } from "./secret-scan.mjs";

function withTemporaryFile(source, assertion) {
  const directory = mkdtempSync(join(tmpdir(), "keyforta-control-test-"));
  const file = join(directory, "fixture.js");
  try {
    writeFileSync(file, source);
    assertion(file);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("secret scanner fails closed on a credential pattern", () => {
  withTemporaryFile(`API_KEY=${"real" + "credential" + "value"}`, (file) => {
    assert.equal(scanSecrets([file]).length, 1);
  });
});

test("secret scanner accepts environment-backed configuration", () => {
  withTemporaryFile("const API_KEY = process.env.API_KEY;", (file) => {
    assert.deepEqual(scanSecrets([file]), []);
  });
});

test("architecture checker rejects application imports from shared code", () => {
  withTemporaryFile('import "@keyforta/api";', (file) => {
    assert.equal(checkArchitecture([file]).length, 1);
  });
});

test("architecture checker accepts shared type imports", () => {
  withTemporaryFile('import type { ToolResult } from "@keyforta/types";', (file) => {
    assert.deepEqual(checkArchitecture([file]), []);
  });
});