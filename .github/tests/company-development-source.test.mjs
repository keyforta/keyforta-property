import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { foundationSource } from "../../scripts/infra/company-development.mjs";
import { sourceFixture, sourcePaths } from "./fixtures/company-source.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("source manifest rejects dirty targeted Bicep even while HEAD still equals reviewed SHA", () => {
  const fixture = sourceFixture();
  try {
    for (const path of sourcePaths) {
      const file = join(fixture.root, path);
      const original = readFileSync(file);
      writeFileSync(file, Buffer.concat([original, Buffer.from("// unreviewed change\n")]));
      assert.equal(fixture.git("rev-parse", "HEAD"), fixture.revision);
      assert.throws(() => foundationSource(fixture), /source.*(differ|dirty)|committed.*bytes/i, path);
      writeFileSync(file, original);
    }
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("source manifest hashes exact committed snapshot and permits unrelated tracked/untracked changes", () => {
  const fixture = sourceFixture();
  try {
    const files = sourcePaths.map((path) => ({ path, sha256: hash(readFileSync(join(fixture.root, path))) }));
    const expected = { files, sha256: hash(JSON.stringify(files)) };
    assert.deepEqual(foundationSource(fixture), expected);
    writeFileSync(join(fixture.root, "package.json"), '{"private":true,"syntheticBackendChange":true}\n');
    writeFileSync(join(fixture.root, "unrelated-untracked.txt"), "synthetic unrelated work\n");
    assert.deepEqual(foundationSource(fixture), expected);
    assert.throws(() => foundationSource({ ...fixture, revision: "b".repeat(40) }), /SHA|revision/i);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("source manifest rejects missing targeted worktree files", () => {
  const fixture = sourceFixture();
  try {
    rmSync(join(fixture.root, sourcePaths[0]));
    assert.throws(() => foundationSource(fixture));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("source manifest rejects targeted files absent from reviewed commit even when present in worktree", () => {
  const fixture = sourceFixture({ untracked: [sourcePaths[0]] });
  try {
    assert.equal(fixture.git("rev-parse", "HEAD"), fixture.revision);
    assert.throws(() => foundationSource(fixture));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
