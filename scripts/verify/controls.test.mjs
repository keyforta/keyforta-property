import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkArchitecture } from "./architecture-boundaries.mjs";
import { validateMermaidDocuments } from "./mermaid-diagrams.mjs";
import { checkPrEvidence } from "./pr-evidence.mjs";
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

async function withTemporaryMarkdown(source, assertion) {
  const directory = mkdtempSync(join(tmpdir(), "keyforta-diagram-test-"));
  const file = join(directory, "fixture.md");
  try {
    writeFileSync(file, source);
    await assertion(file);
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

test("Mermaid checker accepts a valid fenced diagram", async () => {
  await withTemporaryMarkdown("```mermaid\nflowchart LR\n  A --> B\n```\n", async (file) => {
    assert.deepEqual(await validateMermaidDocuments([file]), {
      diagramCount: 1,
      failures: [],
    });
  });
});

test("Mermaid checker fails closed on malformed syntax", async () => {
  await withTemporaryMarkdown("```mermaid\nflowchart LR\n  A -- B\n```\n", async (file) => {
    const result = await validateMermaidDocuments([file]);
    assert.equal(result.diagramCount, 1);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /fixture\.md diagram 1/);
  });
});

test("Mermaid checker fails closed on an unclosed fence", async () => {
  await withTemporaryMarkdown("```mermaid\nflowchart LR\n  A --> B\n", async (file) => {
    const result = await validateMermaidDocuments([file]);
    assert.equal(result.diagramCount, 1);
    assert.deepEqual(result.failures, [
      `${file} diagram 1 at line 1: unclosed Mermaid fence`,
    ]);
  });
});
test("PR evidence checker rejects a description missing all sections", () => {
  const violations = checkPrEvidence("## Summary\nJust a summary, no evidence.");
  assert.ok(violations.length > 0);
  assert.ok(violations.some((v) => v.includes("Before evidence")));
  assert.ok(violations.some((v) => v.includes("Failing test (red)")));
});

test("PR evidence checker rejects sections out of order", () => {
  const body = [
    "## Before evidence",
    "curl returns 404",
    "## After evidence",
    "curl returns 200",
    "## Failing test (red)",
    "test fails",
    "## Passing test (green)",
    "test passes",
  ].join("\n");
  const violations = checkPrEvidence(body);
  assert.ok(violations.some((v) => v.includes("out of order")));
});

test("PR evidence checker rejects placeholder-only sections", () => {
  const body = [
    "## Before evidence",
    "<!-- fill in -->",
    "## Failing test (red)",
    "some red output",
    "## After evidence",
    "some after output",
    "## Passing test (green)",
    "some green output",
  ].join("\n");
  const violations = checkPrEvidence(body);
  assert.ok(violations.some((v) => v.includes('Section "before"')));
});

test("PR evidence checker accepts a compliant four-part description", () => {
  const body = [
    "## Before evidence",
    "GET /api/v1/thing -> 404",
    "## Failing test (red)",
    "1 failing",
    "## After evidence",
    "GET /api/v1/thing -> 200",
    "## Passing test (green)",
    "1 passing",
  ].join("\n");
  assert.deepEqual(checkPrEvidence(body), []);
});

test("PR evidence checker honors the documentation-only exception (no red/green required)", () => {
  const body = [
    "- [x] This is a documentation/process/configuration-only change with no executable behavior (red/green test replaced by a deterministic before/after check below).",
    "## Before evidence",
    "grep finds no match on origin/main",
    "## After evidence",
    "grep finds a match on this branch",
  ].join("\n");
  assert.deepEqual(checkPrEvidence(body), []);
});

test("PR evidence checker still requires before/after content under the exception", () => {
  const body = [
    "- [x] This is a documentation/process/configuration-only change with no executable behavior (red/green test replaced by a deterministic before/after check below).",
    "## Before evidence",
    "<!-- fill in -->",
    "## After evidence",
    "<!-- fill in -->",
  ].join("\n");
  const violations = checkPrEvidence(body);
  assert.ok(violations.length > 0);
});
