import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { completionFixture, installCliMocks, zipFixture } from "./fixtures/company-completion.mjs";

const load = () => import("../../scripts/infra/company-development-completion.mjs");
const pure = () => import("../../scripts/infra/company-development-completion-validation.mjs");
const hash = (v) => createHash("sha256").update(v).digest("hex");

test("synthetic bindings still reject archive, checkpoint and template hash manipulation", async () => {
  const { loadOriginal } = await load();
  const { original, assertOriginalFiles } = await pure();
  const f = completionFixture();
  try {
    assert.equal(original.archiveSha256, "751bc76e1048338e89739127476f61f15777fabc4c205723307fa031af832ca2");
    const forged = Buffer.from(f.archive); forged[forged.length - 1] ^= 1;
    assert.throws(() => loadOriginal(f.github, () => forged, f.originalSource, f.now), /archive digest mismatch/i);
    for (const name of ["checkpoint.json", "template.json"]) {
      const files = { ...f.files, [name]: `${f.files[name]} ` };
      assert.throws(() => assertOriginalFiles(files, f.originalSource), /digest mismatch/i);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("completion audit is a separate GET-only CLI, not an apply or checkpoint alias", async () => {
  const audit = await import("../../scripts/infra/company-development-completion.mjs");
  assert.equal(typeof audit.auditCompletion, "function");
  const source = readFileSync(new URL("../../scripts/infra/company-development-completion.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["']\.\/company-development(?:-apply|-state)?\.mjs["']/);
});

test("effective authority is a closed exact-read set, never wildcard subtraction or data authority", async () => {
  const { assertReadPermissions, permittedReadActions } = await pure();
  const row = { actions: [...permittedReadActions], notActions: [], dataActions: [], notDataActions: [] };
  assert.doesNotThrow(() => assertReadPermissions([row]));
  for (const action of ["*/read", "Microsoft.Storage/*/read", "*", "Microsoft.Storage/storageAccounts/listKeys/action",
    "Microsoft.Resources/deployments/whatIf/action", "Microsoft.Resources/deployments/validate/action",
    "Microsoft.Resources/deployments/write", "Unknown.Provider/things/read"]) {
    assert.throws(() => assertReadPermissions([{ ...row, actions: [action], notActions: [action] }]), /authority|wildcard|read/i);
  }
  for (const field of ["actions", "notActions", "dataActions", "notDataActions"]) {
    assert.throws(() => assertReadPermissions([{ ...row, [field]: undefined }]), /permission/i);
  }
  assert.throws(() => assertReadPermissions([{ ...row, dataActions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"] }]), /data/i);
  assert.throws(() => assertReadPermissions([]), /permission/i);
  assert.throws(() => assertReadPermissions([{ ...row, actions: [] }]), /permission/i);
});

test("closed transport only accepts enumerated management GETs and complete same-endpoint pagination", async () => {
  const { createManagementReader, endpoints } = await load();
  const journal = [];
  const calls = [];
  const read = createManagementReader((args) => { calls.push(args); return { value: [], nextLink: null }; }, journal);
  assert.deepEqual(read.list(endpoints.resources), []);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 4), ["rest", "--method", "get", "--url"]);
  for (const url of ["https://example.invalid/", endpoints.resources.replace("891e5e6e", "00000000"),
    endpoints.resources.replace("https:", "http:"), `${endpoints.resources}&x=1`,
    endpoints.resources.replace("/resources?", "/resources/listKeys?")]) {
    assert.throws(() => read.get(url), /endpoint|scope|URL/i);
  }
  for (const response of [{}, { error: { code: "Forbidden" } }, { value: null },
    { value: [], next_link: "https://management.azure.com/missing-page" },
    { value: [], "@odata.nextLink": "https://management.azure.com/missing-page" },
    { value: [], nextLink: "https://evil.invalid/" },
    { value: [], nextLink: endpoints.deployments },
    { value: [], nextLink: `${endpoints.resources}&$skiptoken=one` }]) {
    const bad = createManagementReader(() => response, []);
    assert.throws(() => bad.list(endpoints.resources));
  }
  let n = 0;
  const good = createManagementReader(() => ++n === 1
    ? { value: [{ name: "one" }], nextLink: `${endpoints.resources}&$skiptoken=two` }
    : { value: [{ name: "two" }] }, []);
  assert.deepEqual(good.list(endpoints.resources), [{ name: "one" }, { name: "two" }]);
  assert.equal(n, 2);
});

test("receipt is not a v2 checkpoint, plan, no-op or an unauthenticated completion basis", async () => {
  const { assertCompletionReceipt, completionAssertions, completionBasis } = await pure();
  const receipt = { version: 1, ...completionAssertions };
  assert.throws(() => assertCompletionReceipt(receipt), /binding|source|evidence|missing/i);
  assert.throws(() => completionBasis(receipt), /authenticated/i);
  const { assertExecutionCheckpoint, assertPlan } = await import("../../scripts/infra/company-development-apply.mjs");
  assert.throws(() => assertExecutionCheckpoint(JSON.stringify(receipt), {}, {}, {}));
  assert.throws(() => assertPlan({ "receipt.json": JSON.stringify(receipt) }, {}, {}, {}, ""));
  for (const [k, v] of Object.entries(completionAssertions)) {
    assert.throws(() => assertCompletionReceipt({ ...receipt, [k]: typeof v === "boolean" ? !v : "forged" }));
  }
});

test("historical workflow blobs remain exact reviewed bytes, not workflow path exceptions", async () => {
  const { reviewedWorkflowProfiles } = await pure();
  for (const [revision, bindings] of Object.entries(reviewedWorkflowProfiles)) {
    for (const [path, digest] of Object.entries(bindings)) {
      assert.equal(hash(execFileSync("git", ["show", `${revision}:${path}`])), digest);
    }
  }
});

test("workflow uses existing preview identity, native protected context and success-only distinct evidence", async () => {
  const workflow = YAML.parse(readFileSync(new URL("../workflows/company-development-bootstrap-completion.yml", import.meta.url), "utf8"));
  assert.equal(workflow.concurrency.group, "company-dev-foundation");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.jobs.audit.environment, "company-dev");
  const steps = workflow.jobs.audit.steps;
  assert.ok(steps.find((s) => s.run?.endsWith(" completion-guard")) === undefined);
  const pre = steps.findIndex((s) => s.run?.endsWith(" prepare"));
  const login = steps.findIndex((s) => s.uses?.startsWith("azure/login@"));
  const audit = steps.findIndex((s) => s.run?.endsWith(" audit"));
  assert.ok(pre >= 0 && pre < login && login < audit);
  assert.equal(steps[login].with["client-id"], "${{ vars.COMPANY_DEV_PLAN_CLIENT_ID }}");
  const upload = steps.find((s) => s.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(upload.with["retention-days"], 7);
  assert.match(upload.with.name, /^company-dev-bootstrap-completion-v1-/);
  assert.doesNotMatch(JSON.stringify(workflow), /company-dev-apply|what-if|deployment group|APPLY_CLIENT_ID/);
});

test("audit rejects evidence amplification and incomplete exact-SHA run metadata", async () => {
  const { auditCompletion } = await load();
  const { stateHash } = await pure();
  const f = completionFixture();
  try {
    f.snapshot.group.syntheticOversize = "safe".repeat(600000);
    f.intent.frozenSnapshotSha256 = stateHash(f.snapshot); f.bindResponses();
    assert.throws(() => auditCompletion(f.options()), /bounded|size|Oversized/i);
    delete f.snapshot.group.syntheticOversize;
    f.intent.frozenSnapshotSha256 = stateHash(f.snapshot); f.bindResponses();
    const q = f.metadata[Object.keys(f.metadata).find((k) => k.includes("ci.yml/runs"))].workflow_runs[0];
    const attempt = q.run_attempt;
    delete q.run_attempt;
    assert.throws(() => auditCompletion(f.options()), /quality|attempt/i);
    q.run_attempt = attempt;
    const run = f.metadata[`actions/runs/${f.execution.runId}/attempts/1`], name = run.name;
    delete run.name;
    assert.throws(() => auditCompletion(f.options()), /workflow|name/i);
    run.name = name;
    run.run_started_at = new Date(Date.parse(f.intent.authorizedAt) - 1000).toISOString();
    assert.throws(() => auditCompletion(f.options()), /intent|dispatch|authorization/i);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("repository-wide source profile rejects extra workflows even with matching caller input hashes", async () => {
  const { assertSourceReview, completionSource } = await load();
  const { baselineRevision } = await pure();
  const f = completionFixture();
  try {
    writeFileSync(join(f.root, ".github/workflows/unreviewed-extra.yml"), "name: Unreviewed extra workflow\n");
    f.git("add", ".github/workflows/unreviewed-extra.yml");
    f.git("commit", "--quiet", "--no-verify", "-m", "Synthetic forbidden extra workflow");
    const revision = f.git("rev-parse", "HEAD").toString().trim();
    f.intent.execution.revision = revision;
    f.intent.source = completionSource(revision, f.root);
    f.intent.implementationChangesSha256 = hash(f.git("diff", "--raw", "--no-abbrev", "--no-renames", baselineRevision, revision));
    assert.throws(() => assertSourceReview(f.intent, f.root), /outside|surface|workflow/i);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("CLI fails closed before authentication outside approved native dispatch", async () => {
  await load();
  for (const mode of ["prepare", "audit", "unknown"]) {
    const result = spawnSync(process.execPath, ["scripts/infra/company-development-completion.mjs", mode], {
      encoding: "utf8", env: { PATH: process.env.PATH },
    });

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /currentStateVerified.*true/);
  }
});

    test("receipt consumer authenticates the successful audit archive, not downloaded JSON or diagnostics", async () => {
      const { auditCompletion, loadCompletionReceipt } = await load();
      const { original, completionBasis, assertCompletionBasis } = await pure();
      const f = completionFixture();
      try {
        const result = auditCompletion(f.options());
        const files = { ...result.files, "receipt.json": Buffer.from(JSON.stringify(result.receipt)) };
        let archive;
        const ref = { kind: "bootstrap-completion-receipt-ref", stage: "bootstrap", mode: "audit-readonly",
          sha: f.revision, runId: f.execution.runId, runAttempt: "1", artifactId: "9002" };
        const run = f.metadata[`actions/runs/${ref.runId}/attempts/1`];
        Object.assign(run, { status: "completed", conclusion: "success", updated_at: "2026-10-26T06:01:00.000Z" });
        const refresh = () => {
          archive = zipFixture(files);
          ref.archiveSha256 = hash(archive); ref.receiptSha256 = hash(files["receipt.json"]);
          const artifact = { ...f.artifact, id: 9002, size_in_bytes: archive.length, digest: `sha256:${ref.archiveSha256}`,
            name: `company-dev-bootstrap-completion-v1-${f.revision}-${ref.runId}-1`,
            created_at: "2026-10-26T06:00:30.000Z",
            workflow_run: { id: Number(ref.runId), head_sha: ref.sha } };
          f.metadata["actions/artifacts/9002"] = artifact;
          f.metadata[`actions/runs/${ref.runId}/artifacts?per_page=100`] = { total_count: 1, artifacts: [artifact] };
        };
        refresh();
        const opts = { github: f.github, root: f.root, now: f.now + 120000,
          download: (id) => id === original.artifactId ? f.archive : archive };
        const receipt = loadCompletionReceipt(ref, opts);
        assert.equal(assertCompletionBasis(completionBasis(receipt)), receipt);
        assert.throws(() => completionBasis(JSON.parse(JSON.stringify(receipt))), /Authenticated/i);
        receipt.continuationAuthorized = true;
        assert.throws(() => completionBasis(receipt), /Authenticated/i);
        assert.throws(() => loadCompletionReceipt({ ...ref, receiptSha256: "a".repeat(64) }, opts), /digest/i);
        const clean = Object.fromEntries(Object.entries(files).map(([p, b]) => [p, Buffer.from(b)]));
        const mutateJson = (name, mutate) => {
          const value = JSON.parse(files[name]); mutate(value); files[name] = Buffer.from(JSON.stringify(value));
          if (name !== "receipt.json") {
            const r = JSON.parse(files["receipt.json"]); r.evidenceHashes[name] = hash(files[name]);
            files["receipt.json"] = Buffer.from(JSON.stringify(r));
          }
          refresh();
        };
        for (const [name, mutate] of [
          ["receipt.json", (v) => { v.originalCheckpointCompleted = true; }],
          ["receipt.json", (v) => { v.kind = "VerifiedNoOp"; }],
          ["receipt.json", (v) => { v.observations[1] = "2030-01-01T00:00:00Z"; }],
          ["controls.json", (v) => { v.environment.can_admins_bypass = true; }],
          ["controls.json", (v) => { v.quality[0].sha = "a".repeat(40); }],
          ["original-bindings.json", (v) => { v.fileHashes["checkpoint.json"] = "a".repeat(64); }],
          ["read-journal.json", (v) => { v.length = 0; }],
          ["read-journal.json", (v) => { v[0].method = "PUT"; }],
          ["source-review.json", (v) => { delete v.ownerAuthorizationReference; }],
          ["source-review.json", (v) => { v.authorizedAt = "2026-10-24T00:00:00Z"; }],
        ]) {
          for (const [p, b] of Object.entries(clean)) files[p] = Buffer.from(b);
          mutateJson(name, mutate);
          assert.throws(() => loadCompletionReceipt(ref, opts), undefined, `Accepted forged ${name}`);
        }
        for (const [p, b] of Object.entries(clean)) files[p] = Buffer.from(b); refresh();
        // A later separately reviewed continuation source must NOT need HEAD to be
        // the historical audit SHA merely to authenticate its immutable blobs.
        writeFileSync(join(f.root, "later-review.txt"), "Synthetic later review\n");
        f.git("add", "later-review.txt"); f.git("commit", "--quiet", "--no-verify", "-m", "Synthetic later continuation source");
        assert.equal(loadCompletionReceipt(ref, opts).execution.revision, ref.sha);
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });

    test("archive parser rejects traversal, symlinks, invalid JSON transport and bounded-inflate abuse", async () => {
      const { readArchive } = await load();
      assert.deepEqual(readArchive(zipFixture({ "a.json": "{}" }), ["a.json"]), { "a.json": "{}" });
      for (const archive of [
        zipFixture({ "../a.json": "{}" }), zipFixture({ "a.json": "{}", "extra.json": "{}" }),
        zipFixture({ "a.json": "{}" }, { symlink: "a.json" }), zipFixture({ "a.json": "A".repeat(3 * 1024 * 1024) }),
        Buffer.from("not a ZIP"),
      ]) assert.throws(() => readArchive(archive, ["a.json"]));
    });

    test("new complete closure cannot relax the historical strict source/NoChange contracts", async () => {
      const { assertSourceReview } = await load();
      const { baselineRevision, original } = await pure();
      const { assertVerificationSources, committedSource } = await import("../../scripts/infra/company-development.mjs");
      const f = completionFixture();
      try {
        for (const mutate of [
          (v) => v.source.files.pop(), (v) => { v.source.files.at(-1).sha256 = "a".repeat(64); },
          (v) => { v.implementationChangesSha256 = "a".repeat(64); },
          (v) => { v.baselineChangesSha256 = "a".repeat(64); }, (v) => { v.originalSource.files.pop(); },
        ]) {
          const intent = structuredClone(f.intent); mutate(intent);
          assert.throws(() => assertSourceReview(intent, f.root));
        }
        const from = committedSource(original.sha), to = committedSource(baselineRevision);
        assert.throws(() => assertVerificationSources({ version: 1, kind: "bootstrap-verification-only", from, to,
          ownerReviewReference: f.intent.ownerAuthorizationReference },
        { commitSha: baselineRevision, sourceFiles: to.files, sourceSha256: to.sha256 },
        { commitSha: original.sha, sourceFiles: from.files, sourceSha256: from.sha256 }), /outside approved/i);
        const source = readFileSync(new URL("../../scripts/infra/company-development-completion-validation.mjs", import.meta.url), "utf8");
        assert.doesNotMatch(source, /from\s+["'](?:node:(?:fs|child_process)|\.\/company-development(?:-apply|-state)?\.mjs)/);
        for (const path of [".github/workflows/company-development-foundation.yml", ".github/workflows/company-development-foundation-apply.yml"]) {
          const before = YAML.parse(execFileSync("git", ["show", `${original.sha}:${path}`], { encoding: "utf8" }));
          const after = YAML.parse(execFileSync("git", ["show", `${baselineRevision}:${path}`], { encoding: "utf8" }));
          for (const job of Object.values(after.jobs)) {
            job.steps = job.steps.filter((s) => !s.name?.startsWith("Preserve rejected what-if diagnostics"));
            for (const step of job.steps) if (step.id === "what-if-route") delete step.id;
          }
          assert.deepEqual(after, before, "Historical diagnostic patch changed more than the explicitly reviewed step layout");
        }
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });
    test("synthetic original archive + complete synthetic GETs produces only a historical/current-state receipt", async () => {
      const { auditCompletion, assertSourceReview } = await load();
      const { original, completionAssertions, stateHash } = await pure();
      const f = completionFixture();
      try {
        assert.deepEqual(assertSourceReview(f.intent, f.root), f.originalSource);
        const { receipt, files } = auditCompletion(f.options());
        for (const [k, v] of Object.entries(completionAssertions)) assert.equal(receipt[k], v);
        assert.equal(receipt.original.archiveSha256, original.archiveSha256);
        assert.equal(receipt.historicalWriter.revocationVerified, false);
        assert.ok(files["historical-original.zip"].equals(f.archive));
        assert.equal(hash(files["historical-incomplete-checkpoint.json"]), original.checkpointSha256);
        assert.equal(JSON.parse(files["historical-incomplete-checkpoint.json"]).completed, false);
        assert.equal(f.snapshot.operations.flatMap((g) => g.operations).length, 17);
        assert.equal(receipt.propertyDeltas, "UNRESOLVED");
        assert.equal(receipt.whatIfStatus, "not-evaluated-for-this-contract");
        assert.equal(hash(f.unresolvedWhatIfRaw), receipt.unresolvedPrediction.sha256);
        const prediction = JSON.parse(f.unresolvedWhatIfRaw);
        assert.equal(prediction.changes.filter((c) => c.changeType === "Modify").length, 3);
        assert.equal(prediction.changes.flatMap((c) => c.delta ?? []).filter((d) => d.propertyChangeType === "Delete").length, 5);
        const { validateStageChanges } = await import("../../scripts/infra/company-development-state.mjs");
        assert.throws(() => validateStageChanges(prediction, { inputs: { stageContext: { sourceTransition: {} } } }, true), /exclusively NoChange/i);
        assert.deepEqual(Object.keys(files).sort(), ["actual-state.json", "controls.json", "historical-incomplete-checkpoint.json",
          "historical-original.zip", "original-bindings.json", "read-journal.json", "source-review.json"]);
        assert.equal(stateHash(JSON.parse(files["actual-state.json"])), f.intent.frozenSnapshotSha256);
        const calls = f.calls.filter((c) => c.azure);
        assert.ok(calls.length >= 60);
        assert.ok(calls.every((c) => c.azure[0] === "rest" && c.azure[2] === "get"));
        assert.doesNotMatch(JSON.stringify(calls), /what-if|validate|listKeys|listCredentials|token|\/blobs\//i);
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });

    test("every audit failure branch has zero non-GET capability; state, authority, controls and provenance fail closed", async () => {
      const { auditCompletion } = await load();
      const { original, stateHash } = await pure();
      const f = completionFixture();
      const cleanSnapshot = structuredClone(f.snapshot), cleanMetadata = structuredClone(f.metadata), cleanIntent = structuredClone(f.intent);
      const runKey = `actions/runs/${original.runId}/attempts/1`;
      try {
        const cases = [
          () => { f.snapshot.resources[0].properties.publicNetworkAccess = "Disabled"; },
          () => { f.snapshot.resources.pop(); },
          () => { f.snapshot.inventory.push({ id: "/subscriptions/foreign/resource", type: "Unknown/type" }); },
          () => { f.snapshot.resources.find((r) => r.type.endsWith("/userAssignedIdentities")).properties.principalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; },
          () => { f.snapshot.deployments[0].properties.correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; },
          () => { f.snapshot.deployments[1].properties.provisioningState = "Failed"; },
          () => { f.snapshot.operations[2].operations.pop(); },
          () => { f.snapshot.operations[2].operations.push(structuredClone(f.snapshot.operations[2].operations[0])); },
          () => { f.snapshot.operations[0].operations[1].properties.targetResource.id = "/subscriptions/foreign/read"; },
          () => { f.snapshot.operations[2].operations[0].properties.provisioningOperation = "Delete"; },
          () => { f.snapshot.operations[2].operations[0].properties.timestamp = "2026-10-25T00:00:00Z"; },
          () => { f.snapshot.history.push({ name: "foreign", properties: { provisioningState: "Succeeded" } }); },
          () => { f.snapshot.roles[1].assignments.push({ properties: { scope: f.snapshot.roles[1].scope, principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }); },
          () => { f.snapshot.defender.properties.isEnabled = true; },
          () => { f.snapshot.permissions[0].permissions[0].actions.push("*/read"); },
          () => { f.snapshot.permissions[0].permissions[0].actions.push("Microsoft.Resources/deployments/whatIf/action"); },
          () => { f.snapshot.permissions[0].permissions[0].dataActions.push("*/read"); },
          () => { f.snapshot.permissions[1].permissions[0].notActions = undefined; },
          () => { f.snapshot.resources[0].properties.password = "synthetic-resolved-secret"; },
          () => { f.snapshot.resources[0].properties.message = "Bearer eyJhbGciOiJIUzI1NiJ9.synthetic.signature"; },
          () => { delete f.intent.ownerAuthorizationReference; },
          () => { f.intent.manualUi.adminBypass = true; },
          () => { f.intent.manualUi.reconciledWithApi = false; },
          () => { f.intent.authorizedAt = "2026-10-24T00:00:00Z"; },
          () => { f.metadata["branches/main"].protected = false; },
          () => { f.metadata["branches/main"].commit.sha = "a".repeat(40); },
          () => { f.metadata["environments/company-dev"].protection_rules.push({ id: 1, type: "unknown" }); },
          () => { const k = Object.keys(f.metadata).find((k) => k.includes("/ci.yml/")); f.metadata[k].workflow_runs.push({ ...f.metadata[k].workflow_runs[0], id: 99999, conclusion: "failure" }); },
          () => { f.metadata[runKey].conclusion = "success"; },
          () => { f.metadata[runKey].head_repository.full_name = "foreign/repository"; },
          () => { f.metadata[runKey].run_attempt = 2; },
          () => { f.metadata[`actions/artifacts/${original.artifactId}`].expired = true; },
          () => { f.metadata[`actions/artifacts/${original.artifactId}`].digest = `sha256:${"a".repeat(64)}`; },
          () => { const l = f.metadata[`actions/runs/${original.runId}/artifacts?per_page=100`]; l.artifacts.push(l.artifacts[0]); l.total_count++; },
        ];
        for (const [index, mutate] of cases.entries()) {
          Object.assign(f.snapshot, structuredClone(cleanSnapshot));
          for (const key of Object.keys(f.metadata)) delete f.metadata[key];
          Object.assign(f.metadata, structuredClone(cleanMetadata));
          for (const key of Object.keys(f.intent)) delete f.intent[key];
          Object.assign(f.intent, structuredClone(cleanIntent));
          f.calls.length = 0; mutate(); f.bindResponses();
          assert.throws(() => auditCompletion(f.options()), undefined, `mutation ${index} accepted`);
          assert.ok(f.calls.filter((c) => c.azure).every((c) => c.azure[2] === "get"), `mutation ${index} used non-GET`);
        }
        Object.assign(f.snapshot, structuredClone(cleanSnapshot)); f.bindResponses();
        Object.assign(f.metadata, structuredClone(cleanMetadata)); Object.assign(f.intent, structuredClone(cleanIntent));
        const options = f.options(), base = options.azure;
        let reads = 0;
        options.azure = (args) => {
          const response = base(args);
          if (++reads > 34 && response.properties) response.properties.syntheticDrift = true;
          return response;
        };
        assert.throws(() => auditCompletion(options), /drift|Frozen/i);
        assert.equal(stateHash(f.snapshot), cleanIntent.frozenSnapshotSha256);
        assert.throws(() => auditCompletion({ ...f.options(), account: { ...f.account, user: { type: "servicePrincipal", name: original.writerClientId } } }), /observer/i);
        assert.throws(() => auditCompletion({ ...f.options(), download: () => Buffer.from("bad archive") }), /archive/i);
        assert.throws(() => auditCompletion({ ...f.options(), azure: () => { throw new Error("403"); } }), /403/);
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });

    test("actual CLI and YAML route use exact committed blobs and refuse any unknown executable branch", async () => {
      const { original, stateHash } = await pure();
      const f = completionFixture();
      try {
        const now = new Date(Date.now() - 60000).toISOString();
        f.intent.authorizedAt = now; f.intent.manualUi.observedAt = now;
        const auditRun = f.metadata[`actions/runs/${f.execution.runId}/attempts/1`];
        auditRun.created_at = new Date(Date.now() - 30000).toISOString();
        auditRun.run_started_at = auditRun.created_at;
        const mocks = installCliMocks(f, { ...process.env, GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "keyforta/keyforta-property",
          GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_ACTOR: "cmbuyamba", GITHUB_TRIGGERING_ACTOR: "cmbuyamba",
          GITHUB_SHA: f.revision, GITHUB_WORKFLOW_SHA: f.revision, GITHUB_REF_PROTECTED: "true",
          GITHUB_WORKFLOW_REF: "keyforta/keyforta-property/.github/workflows/company-development-bootstrap-completion.yml@refs/heads/main",
          PREVIEW_CLIENT_ID: original.previewClientId,
          GITHUB_RUN_ID: f.execution.runId, GITHUB_RUN_ATTEMPT: "1", GITHUB_OUTPUT: join(f.root, "outputs"),
          AUDIT_INTENT: JSON.stringify(f.intent) });
        // The original artifact metadata is synthetic and fresh relative to this
        // test; it does NOT assert continued availability of the actual live ZIP.
        f.metadata[`actions/artifacts/${original.artifactId}`].expires_at = new Date(Date.now() + 86400000).toISOString();
        mocks.save();
        const script = join(f.root, "scripts/infra/company-development-completion.mjs");
        const run = (mode, changes = {}) => spawnSync(process.execPath, [script, mode], { cwd: f.root, encoding: "utf8", env: { ...mocks.env, ...changes } });
        assert.equal(run("prepare", { GITHUB_ACTOR: "foreign" }).status, 1);
        assert.equal(run("audit", { AUDIT_CONTEXT: "forged" }).status, 1);
        assert.equal(existsSync(join(f.root, "company-dev-completion")), false);
        const prep = run("prepare"); assert.equal(prep.status, 0, prep.stderr);
        mocks.env.AUDIT_CONTEXT = readFileSync(join(f.root, "outputs"), "utf8").trim().split("=").at(-1);
        const typedResponse = Object.values(f.responses).find((v) => v.type?.endsWith("/registries") && v.properties);
        typedResponse.properties.password = "synthetic-cli-resolved-secret";
        mocks.save();
        const rejectedSecret = run("audit");
        assert.equal(rejectedSecret.status, 1);
        assert.doesNotMatch(rejectedSecret.stdout + rejectedSecret.stderr, /synthetic-cli-resolved-secret/);
        assert.equal(existsSync(join(f.root, "company-dev-completion")), false);
        delete typedResponse.properties.password; mocks.save();
        const result = run("audit"); assert.equal(result.status, 0, result.stderr);
        const receipt = JSON.parse(readFileSync(join(f.root, "company-dev-completion/receipt.json")));
        assert.equal(receipt.currentStateVerified, true);
        assert.equal(receipt.originalCheckpointCompleted, false);
        assert.equal(stateHash(JSON.parse(readFileSync(join(f.root, "company-dev-completion/actual-state.json")))), f.intent.frozenSnapshotSha256);
        const outputFiles = Object.fromEntries(["receipt.json", ...Object.keys(receipt.evidenceHashes)].map((p) =>
          [p, readFileSync(join(f.root, "company-dev-completion", p))]));
        f.receiptArchive = zipFixture(outputFiles);
        const ref = { kind: "bootstrap-completion-receipt-ref", stage: "bootstrap", mode: "audit-readonly",
          sha: f.revision, runId: f.execution.runId, runAttempt: "1", artifactId: "9002",
          receiptSha256: hash(outputFiles["receipt.json"]), archiveSha256: hash(f.receiptArchive) };
        Object.assign(auditRun, { status: "completed", conclusion: "success", updated_at: new Date().toISOString() });
        const artifact = { ...f.artifact, id: 9002, size_in_bytes: f.receiptArchive.length, digest: `sha256:${ref.archiveSha256}`,
          created_at: auditRun.updated_at, expires_at: new Date(Date.now() + 86400000).toISOString(),
          name: `company-dev-bootstrap-completion-v1-${f.revision}-${ref.runId}-1`,
          workflow_run: { id: Number(ref.runId), head_sha: f.revision } };
        f.metadata["actions/artifacts/9002"] = artifact;
        f.metadata[`actions/runs/${ref.runId}/artifacts?per_page=100`] = { total_count: 1, artifacts: [artifact] };
        mocks.save();
        // Invoke the SAME shared loader imported by both protected CLIs, using
        // actual gh subprocess mocks and the exact normal-workflow artifact.
        const consumer = spawnSync(process.execPath, ["--input-type=module", "-e",
          `import {loadStagePredecessor} from "./scripts/infra/company-development.mjs";
const basis=await loadStagePredecessor({predecessor:JSON.parse(process.env.PREDECESSOR_REF)},"continuation");
if(basis.kind!=="bootstrap-completion-basis"||"completed" in basis)process.exit(41);
console.log(basis.receipt.mode);`],
        { cwd: f.root, encoding: "utf8", env: { ...mocks.env, PREDECESSOR_REF: JSON.stringify(ref) } });
        assert.equal(consumer.status, 0, consumer.stderr);
        assert.match(consumer.stdout, /audit-readonly/);
        for (const p of ["checkpoint.json", "bootstrap-state.json", "submission.json", "fresh-what-if.json"]) assert.equal(existsSync(join(f.root, "company-dev-completion", p)), false);
        const calls = readFileSync(mocks.env.MOCK_LOG, "utf8").trim().split("\n").map(JSON.parse);
        assert.ok(calls.filter((c) => c.name === "az").every((c) => c.args[0] === "account" || c.args[2] === "get"));
        assert.equal(run("audit").status, 1, "Cannot silently replace prior evidence");
        writeFileSync(join(f.root, "scripts/infra/company-development-completion-validation.mjs"), "// dirty\n");
        assert.notEqual(run("prepare").status, 0, "Worktree bytes cannot override committed audit validation");
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });
