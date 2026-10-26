import assert from "node:assert/strict";
import { readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";
import { completionFixture, installCliMocks } from "./fixtures/company-completion.mjs";
// Load only after the shared fixture installs its test-only provenance hook.
const route = await import("../../scripts/infra/company-development-completion.mjs");
const pure = await import("../../scripts/infra/company-development-completion-validation.mjs");

function fixture() {
  const f = completionFixture();
  const intent = structuredClone(f.intent);
  for (const key of ["manualUi", "frozenSnapshotSha256", "freezeReference", "inspectionReference"]) delete intent[key];
  Object.assign(intent, { kind: "bootstrap-inspection-intent", scope: "inspection-only-no-authority",
    reviewReferences: [intent.ownerAuthorizationReference] });
  const workflow = ".github/workflows/company-development-inspection.yml";
  const run = f.metadata[`actions/runs/${f.execution.runId}/attempts/1`];
  Object.assign(run, { path: workflow, name: "Company development inspection" });
  f.metadata[`actions/runs/${f.execution.runId}/attempts/1/jobs?per_page=100`] = { total_count: 1, jobs: [{
    id: 9301, run_id: 9001, run_attempt: 1, head_sha: f.revision, name: "inspect",
    status: "in_progress", conclusion: null,
  }] };
  f.environment.protection_rules = [{ type: "branch_policy" }];
  intent.environment = structuredClone(f.environment);
  f.metadata["branches/main"].protection = { required_status_checks: {
    contexts: ["validate", "scan", "api"], checks: ["validate", "scan", "api"].map((context) => ({ context, app_id: 15368 })),
  }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } };
  if (route.inspectionSource) intent.source = route.inspectionSource(f.revision, f.root);
  const env = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: pure.repository, GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_WORKFLOW_REF: `${pure.repository}/${workflow}@refs/heads/main`,
    GITHUB_WORKFLOW_SHA: f.revision, GITHUB_REF_PROTECTED: "true", GITHUB_ACTOR: "cmbuyamba",
    GITHUB_TRIGGERING_ACTOR: "cmbuyamba", GITHUB_SHA: f.revision, GITHUB_RUN_ID: "9001",
    GITHUB_RUN_ATTEMPT: "1", GITHUB_JOB: "inspect" };
  return { ...f, intent, env, options: () => ({ ...f.options(), intent, source: intent.source }) };
}

test("inspection authenticates existing observer and collects complete raw snapshot without snapshot/UI/freeze approval, never receipt", async () => {
  assert.equal(typeof route.inspectSnapshot, "function", "Missing authorized inspection-only route");
  const f = fixture();
  try {
    const rawHash = pure.sha256(f.archive), state = pure.stateHash(f.snapshot);
    const result = route.inspectSnapshot(f.options());
    assert.equal(result.inspection.kind, "bootstrap-inspection-evidence");
    assert.equal(result.inspection.snapshotSha256, state);
    assert.equal(result.receipt, undefined);
    assert.equal(result.inspection.auditCompleted, false);
    assert.equal(result.inspection.permissionsVerified, false);
    assert.equal(result.inspection.pimVisibility, "unknown-not-measured");
    assert.deepEqual(JSON.parse(result.files["snapshot.json"]), f.snapshot);
    assert.equal(pure.sha256(result.files["historical-original.zip"]), rawHash);
    assert.equal(JSON.parse(result.files["historical-incomplete-checkpoint.json"]).completed, false);
    assert.ok(f.calls.filter((c) => c.azure).every((c) => c.azure[2] === "get"));
    for (const consumer of [pure.assertCompletionReceipt, pure.authenticateCompletion, pure.completionBasis, pure.assertCompletionBasis]) {
      assert.throws(() => consumer(result.inspection));
    }
    assert.throws(() => route.loadCompletionReceipt({ kind: "bootstrap-inspection-evidence", ...result.inspection }));
    const { assertExecutionCheckpoint, assertPlan } = await import("../../scripts/infra/company-development-apply.mjs");
    assert.throws(() => assertExecutionCheckpoint(JSON.stringify(result.inspection), {}, {}, {}));
    assert.throws(() => assertPlan({ "inspection.json": JSON.stringify(result.inspection) }, {}, {}, {}, ""));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("native source, owner, job and protected runtime guards reject before OIDC", () => {
  assert.equal(typeof route.assertInspectionNativeContext, "function");
  const f = fixture();
  try {
    assert.deepEqual(route.assertInspectionNativeContext(f.env), f.execution);
    for (const [key, value] of Object.entries({ GITHUB_ACTIONS: "false", GITHUB_REPOSITORY: "foreign/repo",
      GITHUB_REF: "refs/heads/feature", GITHUB_EVENT_NAME: "push", GITHUB_WORKFLOW_REF: "foreign",
      GITHUB_WORKFLOW_SHA: "0".repeat(40), GITHUB_REF_PROTECTED: "false", GITHUB_ACTOR: "other",
      GITHUB_TRIGGERING_ACTOR: "other", GITHUB_JOB: "audit", GITHUB_SHA: "bad", GITHUB_RUN_ATTEMPT: "0" })) {
      assert.throws(() => route.assertInspectionNativeContext({ ...f.env, [key]: value }), undefined, key);
    }
    assert.doesNotThrow(() => route.inspectionControls(f.intent, f.execution, f.github, f.now));
    const mutations = [
      (m) => { m["branches/main"].protected = false; },
      (m) => { m["branches/main"].commit.sha = "0".repeat(40); },
      (m) => { m["branches/main"].protection.required_status_checks.contexts.pop(); },
      (m) => { m["environments/company-dev"].can_admins_bypass = true; },
      (m) => { delete m["environments/company-dev"].can_admins_bypass; },
      (m) => { m["environments/company-dev"].deployment_branch_policy.protected_branches = false; },
      (m) => { m["actions/runs/9001/attempts/1"].actor.login = "other"; },
      (m) => { m["actions/runs/9001/attempts/1"].path = pure.auditWorkflow; },
      (m) => { m["actions/runs/9001/attempts/1/jobs?per_page=100"].jobs[0].name = "audit"; },
      (m) => { m["actions/runs/9001/attempts/1/jobs?per_page=100"].total_count = 2; },
      (m) => { m[`actions/workflows/ci.yml/runs?head_sha=${f.revision}&event=push&per_page=100`].workflow_runs[0].conclusion = "failure"; },
    ];
    for (const mutate of mutations) {
      const metadata = structuredClone(f.metadata); mutate(metadata);
      assert.throws(() => route.inspectionControls(f.intent, f.execution, (p) => structuredClone(metadata[p]), f.now));
    }
    for (const key of ["manualUi", "frozenSnapshotSha256", "freezeReference"]) {
      assert.throws(() => route.inspectionControls({ ...f.intent, [key]: "invented" }, f.execution, f.github, f.now));
    }
    assert.throws(() => route.assertIntent(f.intent, f.execution, f.now), /intent|contract/i);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("inspection fails closed on wrong caller/binding, malformed state, permissions, host, pagination and secrets", () => {
  assert.equal(typeof route.inspectSnapshot, "function");
  const f = fixture();
  try {
    for (const account of [
      { ...f.account, id: "foreign" }, { ...f.account, tenantId: "foreign" },
      { ...f.account, user: { type: "user", name: "*" } },
      { ...f.account, user: { type: "servicePrincipal", name: pure.original.previewClientId } },
    ]) assert.throws(() => route.inspectSnapshot({ ...f.options(), account }));
    const binding = structuredClone(f.observerBinding); binding.grants[0].assignment.properties.scope += "/foreign";
    assert.throws(() => route.inspectSnapshot({ ...f.options(), observerBinding: binding }));
    const bad = [
      (s) => { s.resources[0].type = "foreign"; },
      (s) => { s.permissions[0].permissions[0].actions = ["*"]; },
      (s) => { s.permissions[0].permissions[0].dataActions = ["*/read"]; },
      (s) => { s.permissions[0].permissions[0].actions.pop(); },
      (s) => { s.inventory.pop(); },
      (s) => { s.roles[0].assignments[0].properties.scope += "/foreign"; },
    ];
    for (const mutate of bad) {
      const original = structuredClone(f.snapshot); mutate(f.snapshot); f.bindResponses();
      assert.throws(() => route.inspectSnapshot(f.options()));
      Object.assign(f.snapshot, original); f.bindResponses();
    }
    for (const response of [{ error: { code: "Forbidden" } }, { value: [] , nextLink: "https://evil.invalid" },
      { value: null }, { value: [], nextLink: `${route.endpoints.resources}&$skiptoken=repeat` }]) {
      assert.throws(() => route.inspectSnapshot({ ...f.options(), azure: () => response }));
    }
    assert.throws(() => route.inspectSnapshot({ ...f.options(), azure: () => { throw Error("Forbidden"); } }));
    assert.equal(existsSync(join(f.root, "company-dev-inspection")), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("validator diagnostics are bounded facts, not completion or PIM/revocation authority", () => {
  assert.equal(typeof route.inspectSnapshot, "function");
  const f = fixture();
  try {
    f.snapshot.defender.properties.isEnabled = true; f.bindResponses();
    const result = route.inspectSnapshot(f.options());
    assert.equal(result.inspection.auditCompleted, false);
    assert.equal(result.inspection.historicalStateValidation, "rejected");
    assert.equal(result.inspection.permissionsVerified, false);
    assert.equal(result.inspection.continuationAuthorized, false);
    assert.equal(result.inspection.writerRevocationVerified, false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

function historyEvidenceCases() {
  const cases = [];
  for (let i = 0; i < 3; i++) {
    const add = (label, mutate) => cases.push([`${i}: ${label}`, mutate]);
    const create = (s) => s.operations[i].operations.find((op) => op.properties.provisioningOperation === "Create");
    add("empty deployment properties", (s) => { s.deployments[i].properties = {}; });
    add("name-only history", (s) => { s.history[i] = { name: s.history[i].name }; });
    for (const collection of ["deployments", "history"]) {
      for (const field of ["provisioningState", "correlationId", "timestamp"]) {
        add(`${collection} missing ${field}`, (s) => { delete s[collection][i].properties[field]; });
        add(`${collection} invalid ${field}`, (s) => { s[collection][i].properties[field] = { invalid: true }; });
      }
      add(`${collection} unparseable timestamp`, (s) => { s[collection][i].properties.timestamp = "not-a-time"; });
      add(`${collection} invalid correlation`, (s) => { s[collection][i].properties.correlationId = "not-a-uuid"; });
      add(`${collection} foreign id`, (s) => { s[collection][i].id += "/foreign"; });
    }
    add("Create missing timestamp", (s) => { delete create(s).properties.timestamp; });
    add("Create missing targetResource", (s) => { delete create(s).properties.targetResource; });
    add("Create invalid timestamp", (s) => { create(s).properties.timestamp = 42; });
    add("Create unparseable timestamp", (s) => { create(s).properties.timestamp = "not-a-time"; });
    add("Create invalid target", (s) => { create(s).properties.targetResource = []; });
    add("Create foreign target", (s) => { create(s).properties.targetResource.id += "/foreign"; });
    add("Create wrong target type", (s) => { create(s).properties.targetResource.resourceType = "Unknown.Provider/type"; });
    add("invalid operationId", (s) => { create(s).operationId = {}; });
    add("unknown operation", (s) => { create(s).properties.provisioningOperation = "Delete"; });
    add("Read missing target", (s) => { delete s.operations[i].operations.find((op) => op.properties.provisioningOperation === "Read").properties.targetResource; });
    add("output missing timestamp", (s) => { delete s.operations[i].operations.find((op) => op.properties.provisioningOperation === "EvaluateDeploymentOutput").properties.timestamp; });
    add("output unexpected target", (s) => {
      s.operations[i].operations.find((op) => op.properties.provisioningOperation === "EvaluateDeploymentOutput").properties.targetResource = create(s).properties.targetResource;
    });
  }
  return cases;
}

test("incomplete or malformed historical evidence rejects identical snapshots before diagnostics", () => {
  const f = fixture();
  try {
    const original = structuredClone(f.snapshot);
    for (const [label, mutate] of historyEvidenceCases()) {
      Object.assign(f.snapshot, structuredClone(original)); mutate(f.snapshot); f.bindResponses();
      assert.throws(() => route.inspectSnapshot(f.options()), undefined, label);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("complete historical mismatches and targetless service outputs remain non-authoritative diagnostics", () => {
  const f = fixture();
  try {
    f.snapshot.deployments[0].properties.correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    f.snapshot.operations[0].operations[0].properties.timestamp = "2021-01-01T00:00:00Z";
    for (const group of f.snapshot.operations) {
      delete group.operations.find((op) => op.properties.provisioningOperation === "EvaluateDeploymentOutput").properties.targetResource;
    }
    f.bindResponses();
    const result = route.inspectSnapshot(f.options());
    assert.equal(result.inspection.historicalStateValidation, "rejected");
    for (const field of ["auditCompleted", "permissionsVerified", "writerRevocationVerified", "continuationAuthorized", "securityHandoffVerified"]) {
      assert.equal(result.inspection[field], false);
    }
    assert.equal(result.receipt, undefined);
    assert.equal(result.files["receipt.json"], undefined);
    assert.throws(() => pure.assertCompletionReceipt(result.inspection));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("actual inspector CLI rejects omitted history evidence without inspection artifact or completion receipt", () => {
  const f = fixture();
  try {
    const now = Date.now();
    f.intent.authorizedAt = new Date(now - 60000).toISOString();
    f.metadata["actions/runs/9001/attempts/1"].created_at =
      f.metadata["actions/runs/9001/attempts/1"].run_started_at = new Date(now - 30000).toISOString();
    const mocks = installCliMocks(f, { ...process.env, ...f.env, INSPECTION_INTENT: JSON.stringify(f.intent),
      AUDIT_CLIENT_ID: f.observerBinding.clientId, AUDIT_OBSERVER_BINDING: JSON.stringify(f.observerBinding),
      GITHUB_OUTPUT: join(f.root, "inspection-output") });
    const run = (mode, changes = {}) => spawnSync(process.execPath, ["scripts/infra/company-development-completion.mjs", mode], {
      cwd: f.root, encoding: "utf8", env: { ...mocks.env, ...changes } });
    const prepared = run("inspect-prepare");
    assert.equal(prepared.status, 0, prepared.stderr);
    const context = readFileSync(mocks.env.GITHUB_OUTPUT, "utf8").trim().split("=")[1];
    const original = structuredClone(f.snapshot);
    // Each mock endpoint returns the same incomplete record on both reads.
    const cases = historyEvidenceCases().filter(([label]) => /empty deployment|name-only|missing (timestamp|targetResource|correlationId|provisioningState)/.test(label));
    const failures = [];
    for (const [label, mutate] of cases) {
      Object.assign(f.snapshot, structuredClone(original)); mutate(f.snapshot); f.bindResponses(); mocks.save();
      const result = run("inspect", { INSPECTION_CONTEXT: context });
      const artifact = existsSync(join(f.root, "company-dev-inspection"));
      const completion = existsSync(join(f.root, "company-dev-completion"));
      if (result.status !== 1 || artifact || completion) failures.push({ label, status: result.status, artifact, completion });
      // Only synthetic output in the isolated fixture; continue to expose each omission independently.
      rmSync(join(f.root, "company-dev-inspection"), { recursive: true, force: true });
    }
    assert.deepEqual(failures, [], "Incomplete evidence must exit 1 with no artifact/receipt");
    Object.assign(f.snapshot, structuredClone(original));
    f.snapshot.defender.properties.isEnabled = true; f.bindResponses(); mocks.save();
    const complete = run("inspect", { INSPECTION_CONTEXT: context });
    assert.equal(complete.status, 0, complete.stderr);
    const evidence = JSON.parse(readFileSync(join(f.root, "company-dev-inspection/inspection.json"), "utf8"));
    assert.equal(evidence.historicalStateValidation, "rejected");
    assert.equal(evidence.auditCompleted, false);
    assert.equal(evidence.continuationAuthorized, false);
    assert.equal(existsSync(join(f.root, "company-dev-inspection/receipt.json")), false);
    assert.equal(existsSync(join(f.root, "company-dev-completion")), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("inspection v4 closes exact new workflow and full published source; unknown workflow/helper and worktree tamper reject", () => {
  assert.equal(typeof route.inspectionSource, "function");
  const f = fixture();
  try {
    assert.equal(f.intent.source.version, 4);
    assert.deepEqual(f.intent.source.files.map((v) => v.path), [...pure.currentSourcePaths, ".github/workflows/company-development-inspection.yml"]);
    assert.doesNotThrow(() => route.assertSourceReview(f.intent, f.root));
    for (const path of ["unexpected-helper.mjs", ".github/workflows/unexpected.yml"]) {
      writeFileSync(join(f.root, path), "// unknown synthetic surface\n");
      f.git("add", "--", path); f.git("commit", "--quiet", "-m", "Synthetic unknown surface");
      const revision = f.git("rev-parse", "HEAD").toString().trim();
      const intent = { ...f.intent, execution: { revision }, source: route.inspectionSource(revision, f.root),
        implementationChangesSha256: pure.sha256(f.git("diff", "--raw", "--no-abbrev", "--no-renames", pure.baselineRevision, revision)) };
      assert.throws(() => route.assertSourceReview(intent, f.root), /outside exact reviewed/);
      f.git("reset", "--hard", f.revision);
    }
    const bytes = readFileSync(join(f.root, ".github/workflows/company-development-inspection.yml"));
    assert.equal(pure.sha256(bytes), f.intent.source.files.at(-1).sha256);
    writeFileSync(join(f.root, ".github/workflows/company-development-inspection.yml"), Buffer.concat([bytes, Buffer.from("\n# drift\n")]));
    assert.throws(() => route.assertSourceReview(f.intent, f.root), /Dirty\/uncommitted/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("whole implementation diff and immutable blobs validate under unmodified production source bindings", () => {
  const f = fixture();
  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { execFileSync } from "node:child_process";
      import { inspectionSource, assertSourceReview } from "./scripts/infra/company-development-completion.mjs";
      import { original, historicalSourcePaths, baselineRevision, sha256 } from "./scripts/infra/company-development-completion-validation.mjs";
      const git = (...a) => execFileSync("git", a);
      const revision = git("rev-parse", "HEAD").toString().trim();
      const files = historicalSourcePaths.map(path => ({path, sha256:sha256(git("show", original.sha+":"+path))}));
      const intent = {kind:"bootstrap-inspection-intent",execution:{revision},source:inspectionSource(revision),
        originalSource:{revision:original.sha,files,sha256:sha256(JSON.stringify(files))},
        baselineChangesSha256:sha256(git("diff","--raw","--no-abbrev","--no-renames",original.sha,baselineRevision)),
        implementationChangesSha256:sha256(git("diff","--raw","--no-abbrev","--no-renames",baselineRevision,revision))};
      assertSourceReview(intent); console.log("unmodified whole-diff source bindings accepted");
    `], { cwd: f.root, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /unmodified whole-diff/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("actual inspector CLI succeeds only under native exact identity; failed runs emit no artifact or authority", () => {
  const f = fixture();
  try {
    const now = Date.now();
    f.intent.authorizedAt = new Date(now - 60000).toISOString();
    const runMeta = f.metadata["actions/runs/9001/attempts/1"];
    runMeta.created_at = runMeta.run_started_at = new Date(now - 30000).toISOString();
    const mocks = installCliMocks(f, { ...process.env, ...f.env, INSPECTION_INTENT: JSON.stringify(f.intent),
      AUDIT_CLIENT_ID: f.observerBinding.clientId, AUDIT_OBSERVER_BINDING: JSON.stringify(f.observerBinding),
      GITHUB_OUTPUT: join(f.root, "inspection-output") });
    const script = "scripts/infra/company-development-completion.mjs";
    const run = (mode, changes = {}) => spawnSync(process.execPath, [script, mode], {
      cwd: f.root, encoding: "utf8", env: { ...mocks.env, ...changes } });
    assert.equal(run("inspect-prepare", { GITHUB_ACTOR: "foreign" }).status, 1);
    assert.equal(existsSync(mocks.env.MOCK_LOG), false);
    for (const changes of [{ AUDIT_CLIENT_ID: "foreign" }, { AUDIT_OBSERVER_BINDING: "{}" },
      { GITHUB_WORKFLOW_REF: `${pure.repository}/${pure.auditWorkflow}@refs/heads/main` }, { GITHUB_JOB: "audit" }]) {
      assert.equal(run("inspect-prepare", changes).status, 1);
    }
    assert.equal(existsSync(mocks.env.MOCK_LOG), false, "Pre-OIDC failures must not reach gh/az");
    const prepared = run("inspect-prepare");
    assert.equal(prepared.status, 0, prepared.stderr);
    const context = readFileSync(mocks.env.GITHUB_OUTPUT, "utf8").trim().split("=")[1];
    assert.equal(run("inspect", { INSPECTION_CONTEXT: "0".repeat(64) }).status, 1);
    assert.equal(existsSync(join(f.root, "company-dev-inspection")), false);
    const response = f.responses[route.endpoints.resources];
    f.responses[route.endpoints.resources] = { error: { code: "Forbidden" } }; mocks.save();
    assert.equal(run("inspect", { INSPECTION_CONTEXT: context }).status, 1);
    assert.equal(existsSync(join(f.root, "company-dev-inspection")), false);
    f.responses[route.endpoints.resources] = response; mocks.save();
    const inspected = run("inspect", { INSPECTION_CONTEXT: context });
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.match(inspected.stdout, /Inspection snapshot SHA256: [a-f0-9]{64}; no audit completion/);
    assert.doesNotMatch(inspected.stdout, /principalId|properties|Bearer/);
    const evidence = JSON.parse(readFileSync(join(f.root, "company-dev-inspection/inspection.json"), "utf8"));
    assert.equal(evidence.snapshotSha256, pure.stateHash(f.snapshot));
    assert.equal(existsSync(join(f.root, "company-dev-completion")), false);
    assert.equal(existsSync(join(f.root, "company-dev-inspection/receipt.json")), false);
    const calls = readFileSync(mocks.env.MOCK_LOG, "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(calls.filter((c) => c.name === "az").every((c) => c.args[0] === "account" || c.args.slice(0, 4).join(" ") === "rest --method get --url"));
    // No test hook: the same synthetic identity must fail real applied pins.
    const real = spawnSync(process.execPath, [script, "inspect-prepare"], { cwd: f.root, encoding: "utf8",
      env: { ...mocks.env, NODE_OPTIONS: "" } });
    assert.equal(real.status, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("manual inspector workflow is minimal, same concurrency and protected identity, success-only seven-day restricted evidence", () => {
  const w = YAML.parse(readFileSync(".github/workflows/company-development-inspection.yml", "utf8"));
  assert.deepEqual(Object.keys(w.on), ["workflow_dispatch"]);
  assert.equal(w.concurrency.group, "company-dev-foundation");
  assert.equal(w.concurrency["cancel-in-progress"], false);
  const j = w.jobs.inspect;
  assert.equal(j.environment, "company-dev");
  assert.deepEqual(j.permissions, { contents: "read", actions: "read", "id-token": "write" });
  const prepare = j.steps.findIndex((s) => s.run?.endsWith(" inspect-prepare"));
  const login = j.steps.findIndex((s) => s.uses?.startsWith("azure/login@"));
  const inspect = j.steps.findIndex((s) => s.run?.endsWith(" inspect"));
  assert.ok(prepare < login && login < inspect);
  const upload = j.steps.at(-1);
  assert.equal(upload.if, undefined);
  assert.equal(upload.with["retention-days"], 7);
  assert.match(upload.with.name, /^company-dev-inspection-v1-/);
  assert.doesNotMatch(upload.with.path, /receipt|completion\//);
});
