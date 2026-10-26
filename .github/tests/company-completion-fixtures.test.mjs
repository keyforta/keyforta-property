import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { generateCompletionFixtures } from "./fixtures/generate-company-completion.mjs";
import { original, sha256, assertOriginalFiles, assertAuditPayload } from "../../scripts/infra/company-development-completion-validation.mjs";
import { readArchive } from "../../scripts/infra/company-development-completion.mjs";

test("synthetic gzip uses canonical OS-neutral framing and verbatim DEFLATE evidence", () => {
  const { arm } = generateCompletionFixtures();
  const payload = gunzipSync(arm);
  // RFC 1952: no timestamp, optional fields, compressor hint or host OS.
  assert.equal(arm.subarray(0, 10).toString("hex"), "1f8b08000000000000ff");
  // RFC 1951: one final stored block, independent of native zlib heuristics.
  assert.ok(payload.length <= 65535, "Fixture must fit the reviewed single-block encoding");
  assert.equal(arm[10], 1);
  assert.equal(arm.readUInt16LE(11), payload.length);
  assert.equal(arm.readUInt16LE(13), payload.length ^ 0xffff);
  assert.deepEqual(arm.subarray(15, -8), payload);
  assert.equal(arm.readUInt32LE(arm.length - 4), payload.length);
  // gunzip must authenticate both the CRC32 and size, not merely parse JSON.
  for (const offset of [15, arm.length - 8, arm.length - 4]) {
    const tampered = Buffer.from(arm);
    tampered[offset] ^= 1;
    assert.throws(() => gunzipSync(tampered), /incorrect (?:data|length) check/);
  }
});

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
