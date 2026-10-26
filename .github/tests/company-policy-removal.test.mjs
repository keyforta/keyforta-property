import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import YAML from "yaml";
import { completionFixture } from "./fixtures/company-completion.mjs";
import { zipFixture } from "./fixtures/company-zip.mjs";
import { rmSync } from "node:fs";
// Synthetic provenance hooks must precede all runtime imports, as in the
// existing historical suites. No operational archives are used in tests.
const foundation = await import("../../scripts/infra/company-development.mjs");
const apply = await import("../../scripts/infra/company-development-apply.mjs");
const { assertIntent, readArchive, auditCompletion } = await import("../../scripts/infra/company-development-completion.mjs");
const { currentSourcePaths, sha256 } = await import("../../scripts/infra/company-development-completion-validation.mjs");

const workflow = (name) => YAML.parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
test("new dispatch has one ordered plan/apply operation and no copied plan or freeze fields", () => {
  const w = workflow("company-development-foundation-apply");
  assert.deepEqual(Object.keys(w.jobs), ["preview_guard", "plan", "apply_guard", "apply"]);
  assert.deepEqual(w.jobs.plan.needs, ["preview_guard"]);
  assert.deepEqual(w.jobs.apply_guard.needs, ["plan"]);
  assert.deepEqual(w.jobs.apply.needs, ["apply_guard"]);
  for (const key of Object.keys(w.on.workflow_dispatch.inputs)) assert.doesNotMatch(key, /^(plan_|reviewed_|change_freeze)/);
  assert.equal(workflow("company-development-foundation").on.workflow_dispatch.inputs.change_freeze, undefined);
});
test("v3 input/inventory omit freeze; legacy v2 still requires it; unknown versions fail", () => {
  const input = { ...foundation.destination, stage: "bootstrap", mode: "initial", evidenceVersion: 3,
    vnetCidr: "10.84.0.0/24", acaSubnetCidr: "10.84.0.0/26", postgresSubnetCidr: "10.84.0.64/28",
    networkApproval: "https://github.com/keyforta/keyforta-property/issues/159" };
  assert.equal("changeFreeze" in foundation.validateInputs(input, input), false);
  assert.equal("changeFreeze" in foundation.stageInventory(input), false);
  assert.throws(() => foundation.validateInputs({ ...input, changeFreeze: "obsolete" }, input), /obsolete/i);
  assert.throws(() => foundation.validateInputs({ ...input, evidenceVersion: 2 }, input), /freeze/i);
  assert.throws(() => foundation.validateInputs({ ...input, evidenceVersion: 99 }, input), /version/i);
});
test("intent v2 removes only freeze/UI, retains authorization, snapshot and inspection", () => {
  const f = completionFixture({ policyVersion: 2 });
  try {
    const intent = { ...f.intent, version: 2 };
    delete intent.freezeReference; delete intent.manualUi;
    assert.doesNotThrow(() => assertIntent(intent, f.execution, f.now));
    for (const key of ["freezeReference", "manualUi"]) assert.throws(() => assertIntent({ ...intent, [key]: {} }, f.execution, f.now), /obsolete/i);
    for (const key of ["authorizedAt", "ownerAuthorizationReference", "frozenSnapshotSha256", "inspectionReference"]) {
      const bad = { ...intent }; delete bad[key];
      assert.throws(() => assertIntent(bad, f.execution, f.now));
    }
    assert.throws(() => assertIntent({ ...intent, version: 1 }, f.execution, f.now));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("ordered plan is a distinct closed contract, not optional legacy run success", () => {
  assert.equal(typeof apply.assertOrderedPlan, "function");
  assert.equal(typeof apply.assertOrderedNativeContext, "function");
});

function orderedFixture() {
  const now = Date.parse("2026-10-26T06:00:00Z"), sha = "a".repeat(40);
  const expected = { contract: "ordered-plan-apply-v1", evidenceVersion: 3, sha, stage: "bootstrap",
    mode: "initial", runId: "123", runAttempt: "2", artifactId: "456", archiveSha256: "f".repeat(64) };
  const input = { ...foundation.destination, stage: expected.stage, mode: expected.mode, evidenceVersion: 3,
    vnetCidr: "10.84.0.0/24", acaSubnetCidr: "10.84.0.0/26", postgresSubnetCidr: "10.84.0.64/28",
    networkApproval: "https://github.com/keyforta/keyforta-property/issues/159" };
  const inventory = foundation.stageInventory(input), parameters = foundation.armParameters(input);
  const env = { id: 42, node_id: "synthetic", name: "company-dev",
    deployment_branch_policy: { protected_branches: true }, protection_rules: [] };
  const snapshot = foundation.environmentSnapshot(env);
  const context = { repository: "keyforta/keyforta-property", revision: sha, runId: "123", runAttempt: "2",
    stage: input.stage, mode: input.mode, evidenceVersion: 3, environment: snapshot,
    environmentSha256: sha256(JSON.stringify(snapshot)), inventorySha256: sha256(JSON.stringify(inventory)) };
  const template = { resources: [{ type: "Microsoft.Resources/deployments", subscriptionId: input.subscriptionId,
    resourceGroup: input.resourceGroup, properties: { mode: "Incremental" } }] };
  const whatIf = { changes: inventory.expected.map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })) };
  const encode = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const files = Object.fromEntries(Object.entries({ inputs: input, inventory, parameters, template,
    "what-if": whatIf, "review-context": context }).map(([k, v]) => [`${k}.json`, encode(v)]));
  const sourceFiles = currentSourcePaths.map((path) => ({ path, sha256: "b".repeat(64) }));
  const evidence = { ...input, operation: "foundation-preview-only", commitSha: sha, runId: "123", runAttempt: "2",
    sourceManifestVersion: 5, sourceFiles, sourceSha256: sha256(JSON.stringify(sourceFiles)),
    previewClientId: "11111111-1111-4111-8111-111111111111", reviewContext: context, approvedParameters: parameters,
    executionApproved: false, planningCeilingUsdBeforeTax: "120.00", estimatedMonthlyUsdBeforeTax: "108.35" };
  for (const [file, field] of Object.entries({ inputs: "inputs", inventory: "inventory", parameters: "parameters",
    template: "template", "what-if": "whatIf", "review-context": "reviewContext" })) evidence[`${field}Sha256`] = sha256(files[`${file}.json`]);
  files["evidence.json"] = encode(evidence);
  const run = { id: 123, run_attempt: 2, head_sha: sha, head_branch: "main", event: "workflow_dispatch",
    path: ".github/workflows/company-development-foundation-apply.yml", status: "in_progress", conclusion: null,
    repository: { full_name: "keyforta/keyforta-property", id: 42 }, head_repository: { full_name: "keyforta/keyforta-property", id: 42 },
    actor: { login: "cmbuyamba" }, triggering_actor: { login: "cmbuyamba" }, run_started_at: "2026-10-26T05:50:00Z" };
  const job = { id: 789, run_id: 123, run_attempt: 2, head_sha: sha, name: "plan", status: "completed",
    conclusion: "success", started_at: "2026-10-26T05:51:00Z", completed_at: "2026-10-26T05:55:00Z",
    steps: [{ name: "Upload immutable ordered plan", status: "completed", conclusion: "success",
      started_at: "2026-10-26T05:54:00Z", completed_at: "2026-10-26T05:55:00Z" }] };
  const artifact = { id: 456, expired: false, name: `company-dev-foundation-bootstrap-initial-v3-plan-${sha}-123-2`,
    workflow_run: { id: 123, head_sha: sha, head_branch: "main", repository_id: 42, head_repository_id: 42 },
    size_in_bytes: 1024, digest: `sha256:${expected.archiveSha256}`, created_at: "2026-10-26T05:54:30Z",
    expires_at: "2026-10-27T06:00:00Z" };
  const listing = { total_count: 1, artifacts: [artifact] }, jobs = { total_count: 1, jobs: [job] };
  return { files, run, artifact, listing, jobs, expected, now, source: evidence.sourceSha256 };
}
const validate = (f) => apply.assertOrderedPlan(f.files, f.run, f.artifact, f.listing, f.jobs, f.expected, f.source, f.now);
test("automatic current-attempt plan accepted with six recomputed execution digests, no manually copied fields", () => {
  const f = orderedFixture(), { binding, plan } = validate(f);
  assert.equal(binding.producerJobId, "789");
  assert.equal(plan.inputs.evidenceVersion, 3);
  for (const field of ["sourceSha256", "templateSha256", "parametersSha256", "whatIfSha256", "inventorySha256", "evidenceSha256"]) {
    assert.match(binding[field], /^[a-f0-9]{64}$/);
    const changed = structuredClone(f); changed.expected[field] = "0".repeat(64);
    assert.throws(() => validate(changed), /drift/);
  }
  assert.doesNotThrow(() => validate({ ...f, expected: binding }));
  assert.throws(() => apply.assertPlan(f.files, f.run, f.artifact, { ...f.expected, evidenceVersion: 2 }, f.source), /attempt|completed|successful|name/);
});
test("ordered provenance rejects native run, plan-job and artifact matrix", () => {
  const mutations = [
    ...Object.entries({ id: 999, run_attempt: 1, head_sha: "c".repeat(40), head_branch: "other", event: "push",
      path: ".github/workflows/company-development-foundation.yml", status: "completed", conclusion: "failure",
      actor: { login: "other" }, triggering_actor: { login: "other" }, repository: { full_name: "foreign/repo", id: 42 },
      head_repository: { full_name: "foreign/repo", id: 42 } }).map(([key, value]) => (f) => { f.run[key] = value; }),
    ...Object.entries({ id: 0, run_attempt: 1, run_id: 999, head_sha: "c".repeat(40), status: "in_progress",
      conclusion: "failure", started_at: "bad", completed_at: "2026-10-27T00:00:00Z", name: "unknown" })
      .map(([key, value]) => (f) => { f.jobs.jobs[0][key] = value; }),
    ...["skipped", "cancelled", null].map((value) => (f) => { f.jobs.jobs[0].conclusion = value; }),
    (f) => { f.jobs.jobs = []; f.jobs.total_count = 0; },
    (f) => { f.jobs.jobs.push(structuredClone(f.jobs.jobs[0])); f.jobs.total_count++; },
    (f) => { f.jobs.total_count = 101; },
    (f) => { f.jobs.jobs[0].steps[0].conclusion = "skipped"; },
    (f) => { f.jobs.jobs[0].steps = []; },
    ...Object.entries({ id: 999, name: "wrong", expired: true, expires_at: "bad", digest: `sha256:${"0".repeat(64)}`,
      size_in_bytes: 0, created_at: "2026-10-26T05:30:00Z" }).map(([key, value]) => (f) => { f.artifact[key] = value; }),
    ...Object.entries({ id: 999, head_sha: "c".repeat(40), repository_id: 999, head_repository_id: 999, head_branch: "other" })
      .map(([key, value]) => (f) => { f.artifact.workflow_run[key] = value; }),
    (f) => { f.listing.total_count = 101; },
    (f) => { f.listing.artifacts = []; f.listing.total_count = 0; },
    (f) => { f.listing.artifacts.push(structuredClone(f.artifact)); f.listing.total_count++; },
    (f) => { f.expected.contract = "unknown"; },
    (f) => { f.expected.evidenceVersion = 2; },
    (f) => { f.expected.runAttempt = "1"; },
  ];
  for (const mutate of mutations) { const f = orderedFixture(); mutate(f); assert.throws(() => validate(f), undefined, String(mutate)); }
});
test("ordered plan cross-binds all file bytes, source, input, scope, stage, template and inventory", () => {
  for (const file of Object.keys(orderedFixture().files)) {
    const f = orderedFixture(); f.files[file] += " ";
    // Evidence hash is derived, but its embedded file bindings still reject
    // tampered dependencies. A semantically identical evidence envelope is
    // valid until the authenticated binding has been issued.
    if (file !== "evidence.json") assert.throws(() => validate(f), undefined, file);
  }
  for (const [file, mutate] of [
    ["evidence.json", (v) => { v.stage = "continuation"; }],
    ["evidence.json", (v) => { v.sourceManifestVersion = 99; }],
    ["evidence.json", (v) => { v.changeFreeze = "obsolete"; }],
    ["evidence.json", (v) => { v.sourceFiles.pop(); }],
    ["inputs.json", (v) => { v.subscriptionId = "foreign"; }],
    ["inputs.json", (v) => { v.stage = "continuation"; }],
    ["inventory.json", (v) => { v.expected.pop(); }],
    ["template.json", (v) => { v.resources[0].properties.mode = "Complete"; }],
    ["parameters.json", (v) => { v.parameters.vnetCidr.value = "10.84.0.0/23"; }],
  ]) {
    const f = orderedFixture(), value = JSON.parse(f.files[file]); mutate(value); f.files[file] = JSON.stringify(value);
    assert.throws(() => validate(f), undefined, file);
  }
  const f = orderedFixture(); f.source = "0".repeat(64); assert.throws(() => validate(f), /source/);
});
test("native ordered context rejects foreign actor, triggering actor, event, ref, SHA, repository and attempt", () => {
  const env = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "keyforta/keyforta-property", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main", GITHUB_REF_PROTECTED: "true", GITHUB_ACTOR: "cmbuyamba", GITHUB_TRIGGERING_ACTOR: "cmbuyamba",
    GITHUB_WORKFLOW_REF: "keyforta/keyforta-property/.github/workflows/company-development-foundation-apply.yml@refs/heads/main",
    GITHUB_WORKFLOW_SHA: "a".repeat(40), GITHUB_SHA: "a".repeat(40), GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2" };
  assert.doesNotThrow(() => apply.assertOrderedNativeContext(env));
  for (const key of Object.keys(env)) assert.throws(() => apply.assertOrderedNativeContext({ ...env, [key]: "foreign" }), undefined, key);
});
test("bounded ordered archive parser rejects unsafe paths, extra entries and source binding changes", () => {
  const files = orderedFixture().files, archive = zipFixture(files);
  assert.deepEqual(readArchive(archive, Object.keys(files)), files);
  for (const bad of [{ ...files, "../escape.json": "{}" }, { ...files, "extra.json": "{}" }]) {
    assert.throws(() => readArchive(zipFixture(bad), Object.keys(files)));
  }
});
test("v2 audit issues receipt2 without freeze/UI; API bypass absent is unobservable, true rejects", () => {
  const f = completionFixture({ policyVersion: 2 });
  try {
    delete f.environment.can_admins_bypass;
    delete f.intent.environment.can_admins_bypass;
    const result = auditCompletion(f.options());
    assert.equal(result.receipt.version, 2);
    assert.equal("freezeReference" in result.receipt, false);
    assert.equal("manualUi" in JSON.parse(result.files["source-review.json"]), false);
    assert.equal(JSON.parse(result.files["controls.json"]).adminBypassObservation, "unobservable");
    f.environment.can_admins_bypass = true; f.intent.environment.can_admins_bypass = true;
    assert.throws(() => auditCompletion(f.options()), /bypass/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
