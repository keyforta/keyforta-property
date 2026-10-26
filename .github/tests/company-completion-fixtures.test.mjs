import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { generateCompletionFixtures } from "./fixtures/generate-company-completion.mjs";
import { original, sha256, assertOriginalFiles, assertAuditPayload } from "../../scripts/infra/company-development-completion-validation.mjs";
import { readArchive } from "../../scripts/infra/company-development-completion.mjs";

test("published fixtures are reproducible synthetic data, never the authenticated operational archive", () => {
  const f = generateCompletionFixtures(), again = generateCompletionFixtures();
  assert.deepEqual(f.archive, again.archive);
  assert.deepEqual(f.arm, again.arm);
  assert.equal(sha256(readFileSync(new URL("./fixtures/company-bootstrap-original.zip", import.meta.url))), sha256(f.archive));
  assert.equal(sha256(readFileSync(new URL("./fixtures/company-bootstrap-arm.json.gz", import.meta.url))), sha256(f.arm));
  assert.notEqual(sha256(f.archive), original.archiveSha256);
  const data = JSON.parse(gunzipSync(f.arm));
  assert.equal(data.resources.length, 7);
  assert.equal(data.operations.flatMap((g) => g.operations).length, 17);
  assertAuditPayload(data);
  for (const field of ["runId", "artifactId", "correlationId", "writerPrincipalId", "writerClientId", "previewClientId"]) {
    assert.notEqual(data.original[field], original[field]);
    assert.ok(!JSON.stringify(data).includes(original[field]), `Retained ${field}`);
  }
  const files = readArchive(f.archive, ["checkpoint.json", "fresh-what-if.json", "result.json",
    "reviewed-inputs.json", "submission.json", "template.json"]);
  assertAuditPayload(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, JSON.parse(v)])));
  // This worker uses unmodified production bindings, no fixture loader.
  assert.throws(() => assertOriginalFiles(files, {}), /checkpoint digest mismatch/i);
});
