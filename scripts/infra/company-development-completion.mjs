// Dedicated evidence route. Imports only transport-free validation, never the
// preview/apply drivers (including their dynamic imports). No deployment SDK.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  repository, destination, rg, original, baselineRevision, auditWorkflow, reviewedWorkflowProfiles,
  historicalSourcePaths, currentSourcePaths, sha256, stateHash, sameId, bootstrapInventory,
  assertAuditPayload as assertNoSecretPayload, assertReadPermissions, assertReference, assertArtifactMetadata, historicalFiles,
  assertOriginalFiles, assertHistoricalState, completionAssertions, assertCompletionReceipt, authenticateCompletion, projectResources,
} from "./company-development-completion-validation.mjs";

const host = "https://management.azure.com";
const arm = (path, version) => `${host}${path}?api-version=${version}`;
const names = [original.deploymentName, "foundation-keyforta-cdev", "stamp-keyforta-cdev"];
const storage = bootstrapInventory().find((r) => r.type.endsWith("/storageAccounts")).id;
const roleScopes = [rg, ...bootstrapInventory().filter((r) => /\/(registries|storageAccounts|containers)$/.test(r.type)).map((r) => r.id)];
export const endpoints = Object.freeze({
  subscription: arm(`/subscriptions/${destination.subscriptionId}`, "2022-12-01"),
  group: arm(rg, "2022-09-01"),
  resources: arm(`${rg}/resources`, "2021-04-01"),
  deployments: arm(`${rg}/providers/Microsoft.Resources/deployments`, "2025-04-01"),
  defender: arm(`${storage}/providers/Microsoft.Security/defenderForStorageSettings/current`, "2025-06-01"),
  ...Object.fromEntries(bootstrapInventory().map((r) => [r.id, arm(r.id,
    r.type.startsWith("Microsoft.ManagedIdentity/") ? "2023-01-31" : r.type.startsWith("Microsoft.ContainerRegistry/") ? "2023-11-01-preview" : "2023-05-01")])),
  ...Object.fromEntries(names.flatMap((name) => {
    const path = `${rg}/providers/Microsoft.Resources/deployments/${name}`;
    return [[name, arm(path, "2025-04-01")], [`${name}/operations`, arm(`${path}/operations`, "2025-04-01")]];
  })),
  ...Object.fromEntries([rg, ...bootstrapInventory().map((r) => r.id)].map((scope) =>
    [`${scope}/permissions`, arm(`${scope}/providers/Microsoft.Authorization/permissions`, "2022-04-01")])),
  ...Object.fromEntries(roleScopes.map((scope) => [`${scope}/roles`,
    `${arm(`${scope}/providers/Microsoft.Authorization/roleAssignments`, "2022-04-01")}&$filter=atScope()`])),
});
const listEndpoints = new Set([endpoints.resources, endpoints.deployments,
  ...names.map((n) => endpoints[`${n}/operations`]),
  ...[rg, ...bootstrapInventory().map((r) => r.id)].map((s) => endpoints[`${s}/permissions`]),
  ...roleScopes.map((s) => endpoints[`${s}/roles`])]);
export function createManagementReader(invoke, journal, clock = () => new Date().toISOString()) {
  const allowed = new Set(Object.values(endpoints));
  const request = (url, base) => {
    assert.ok(typeof url === "string" && (url === base || (url.startsWith(`${base}&$skiptoken=`)
      && /^[A-Za-z0-9%._~-]{1,4096}$/.test(url.slice(`${base}&$skiptoken=`.length)))), "Unknown pagination URL/endpoint");
    assert.ok(allowed.has(base), "Unknown management endpoint/scope");
    const response = invoke(["rest", "--method", "get", "--url", url]);
    assert.ok(response && typeof response === "object" && !Array.isArray(response) && !response.error, "Unknown/error management GET response");
    assertNoSecretPayload(response);
    journal.push({ time: clock(), method: "GET", url, responseSha256: stateHash(response), response: structuredClone(response) });
    return response;
  };
  return {
    get(url) {
      assert.ok(allowed.has(url) && !listEndpoints.has(url), "Unknown/non-object management endpoint");
      const response = request(url, url);
      assert.ok(!response.nextLink, "Unexpected object pagination");
      return response;
    },
    list(url) {
      assert.ok(listEndpoints.has(url), "Unknown list endpoint");
      const rows = [], seen = new Set();
      let page = url;
      while (page) {
        assert.ok(!seen.has(page) && seen.size < 100, "Repeated/missing/too many pages"); seen.add(page);
        const response = request(page, url);
        assert.ok(Object.keys(response).every((k) => ["value", "nextLink"].includes(k)), "Unknown list/pagination schema");
        assert.ok(Array.isArray(response.value) && response.value.length <= 10000, "Missing list page visibility");
        rows.push(...response.value); assert.ok(rows.length <= 10000, "Oversized list");
        assert.ok(response.nextLink === undefined || response.nextLink === null || (typeof response.nextLink === "string" && response.nextLink.length), "Invalid next page");
        page = response.nextLink;
      }
      return rows;
    },
  };
}
function command(executable, args, options = {}) {
  return execFileSync(executable, args, { stdio: ["pipe", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024, ...options });
}
const git = (args, root) => command("git", ["-C", root, ...args]);
const gh = (path) => JSON.parse(command("gh", ["api", `repos/${repository}/${path}`]));
function manifest(revision, paths, root) {
  return paths.map((path) => ({ path, sha256: sha256(git(["show", `${revision}:${path}`], root)) }));
}
function historicalObjects(root) {
  if (git(["rev-parse", "--is-shallow-repository"], root).toString().trim() === "true") {
    // Existing preview/apply checkouts intentionally retain their reviewed
    // workflow bytes. Fetch only fixed repository history, not arbitrary URLs,
    // and never move HEAD or alter GitHub configuration.
    git(["-c", "credential.helper=!gh auth git-credential", "fetch", "--no-tags", "--unshallow",
      "https://github.com/keyforta/keyforta-property.git", "main"], root);
  }
}
export function completionSource(revision, root = process.cwd(), checkWorktree = true) {
  assert.match(revision ?? "", /^[a-f0-9]{40}$/, "Missing exact source SHA");
  if (checkWorktree) assert.equal(git(["rev-parse", "HEAD"], root).toString().trim(), revision, "Checkout SHA mismatch");
  const files = manifest(revision, currentSourcePaths, root);
  for (const { path, sha256: digest } of checkWorktree ? files : []) {
    const stat = lstatSync(join(root, path));
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2 * 1024 * 1024, "Unsafe source file");
    assert.equal(sha256(readFileSync(join(root, path))), digest, "Dirty/uncommitted source bytes");
  }
  return { version: 3, revision, files, sha256: sha256(JSON.stringify(files)) };
}
export function assertSourceReview(intent, root = process.cwd(), checkWorktree = true) {
  assert.deepEqual(intent.source, completionSource(intent.execution.revision, root, checkWorktree), "Reviewed source closure mismatch");
  const oldFiles = manifest(original.sha, historicalSourcePaths, root);
  const oldSource = { revision: original.sha, files: oldFiles, sha256: sha256(JSON.stringify(oldFiles)) };
  assert.deepEqual(intent.originalSource, oldSource, "Original source binding mismatch");
  for (const [rev, bindings] of Object.entries(reviewedWorkflowProfiles)) {
    for (const [path, digest] of Object.entries(bindings)) assert.equal(sha256(git(["show", `${rev}:${path}`], root)), digest, "Unreviewed historical workflow blob");
  }
  git(["merge-base", "--is-ancestor", original.sha, baselineRevision], root);
  git(["merge-base", "--is-ancestor", baselineRevision, intent.execution.revision], root);
  assert.notEqual(intent.execution.revision, baselineRevision, "New reviewed implementation required");
  // No workflow wildcard. The old workflows remain byte-exact PR166; the new
  // entire workflow is bound by the reviewed version-3 source closure.
  for (const [path, digest] of Object.entries(reviewedWorkflowProfiles[baselineRevision])) {
    assert.equal(sha256(git(["show", `${intent.execution.revision}:${path}`], root)), digest, "Unreviewed existing workflow change");
  }
  assert.equal(intent.baselineChangesSha256, sha256(git(["diff", "--raw", "--no-abbrev", "--no-renames", original.sha, baselineRevision], root)), "Historical repository-wide change review mismatch");
  assert.equal(intent.implementationChangesSha256, sha256(git(["diff", "--raw", "--no-abbrev", "--no-renames", baselineRevision, intent.execution.revision], root)), "Unreviewed repository-wide changes");
  const reviewedSurfaces = [
    ...historicalSourcePaths.slice(3, 6), ...currentSourcePaths.slice(9),
    ".github/tests/company-development-completion.test.mjs", ".github/tests/company-development-apply.test.mjs",
    ".github/tests/company-development-source.test.mjs", ".github/tests/company-development.test.mjs",
    ".github/tests/fixtures/company-source.mjs", ".github/tests/fixtures/company-completion.mjs",
    ".github/tests/fixtures/company-bootstrap-original.zip", ".github/tests/fixtures/company-bootstrap-arm.json.gz",
    "infra/README.md", "docs/adr/ADR-016-company-development-private-foundation.md",
  ];
  const changed = git(["diff", "--name-only", "--no-renames", baselineRevision, intent.execution.revision], root).toString().trim().split("\n");
  assert.ok(changed.length && changed.every((p) => reviewedSurfaces.includes(p)), "Change outside exact reviewed completion surfaces; no additional workflow exception");
  // Immutable Bicep/parser/payload surfaces, even if a caller supplies another
  // diff digest. Owner context cannot authorize a deployment contract change.
  for (const path of [...historicalSourcePaths.slice(0, 3), historicalSourcePaths[8]]) {
    assert.equal(sha256(git(["show", `${intent.execution.revision}:${path}`], root)),
      sha256(git(["show", `${baselineRevision}:${path}`], root)), "Audit cannot change deployment payload/parser");
  }
  return oldSource;
}
export function assertNativeContext(env = process.env) {
  assert.equal(env.GITHUB_ACTIONS, "true", "Native Actions dispatch required");
  assert.equal(env.GITHUB_REPOSITORY, repository, "Wrong repository");
  assert.equal(env.GITHUB_REF, "refs/heads/main", "Protected main required");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch", "Manual dispatch required");
  assert.equal(env.GITHUB_WORKFLOW_REF, `${repository}/${auditWorkflow}@refs/heads/main`, "Wrong native audit workflow");
  assert.equal(env.GITHUB_WORKFLOW_SHA, env.GITHUB_SHA, "Native workflow source SHA mismatch");
  assert.equal(env.GITHUB_REF_PROTECTED, "true", "Native protected branch required");
  assert.equal(env.GITHUB_ACTOR, "cmbuyamba", "Owner dispatch required");
  assert.equal(env.GITHUB_TRIGGERING_ACTOR, "cmbuyamba", "Owner attempt required");
  assert.match(env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/, "Exact SHA required");
  for (const k of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]) assert.match(env[k] ?? "", /^[1-9]\d*$/, "Native run required");
  return { revision: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT };
}
export function assertIntent(intent, execution, now = Date.now()) {
  assert.equal(intent?.version, 1, "Missing audit intent");
  assert.equal(intent.kind, "bootstrap-completion-audit-intent", "Wrong owner intent contract");
  assert.equal(intent.scope, "audit-only-no-continuation", "Audit-only authorization required");
  assert.equal(intent.owner, "cmbuyamba", "Wrong owner context");
  assert.equal(intent.execution.revision, execution.revision, "Owner exact SHA mismatch");
  assert.deepEqual(intent.original, original, "Wrong historical archive intent");
  for (const k of ["ownerAuthorizationReference", "freezeReference", "inspectionReference"]) assertReference(intent[k]);
  const age = now - Date.parse(intent.authorizedAt);
  assert.ok(age >= 0 && age <= 60 * 60 * 1000, "Stale owner authorization context");
  assert.equal(intent.manualUi?.owner, "cmbuyamba", "Missing actual owner UI context");
  assert.equal(intent.manualUi.adminBypass, false, "Manual admin bypass must be OFF");
  assert.equal(intent.manualUi.reconciledWithApi, true, "Unreconciled UI/API bypass observation");
  assertReference(intent.manualUi.observationReference);
  const uiAge = now - Date.parse(intent.manualUi.observedAt);
  assert.ok(uiAge >= 0 && uiAge <= 60 * 60 * 1000, "Stale manual UI context");
  assert.match(intent.frozenSnapshotSha256 ?? "", /^[a-f0-9]{64}$/, "Missing full frozen snapshot binding");
  // Context/reference/hash is deliberately NOT machine-authenticated approval.
}
export function controls(intent, execution, github = gh, now = Date.now()) {
  assertIntent(intent, execution, now);
  const branch = github("branches/main");
  assert.equal(branch.protected, true, "Main is not protected");
  assert.equal(branch.commit?.sha, execution.revision, "Main moved from exact reviewed SHA");
  const environment = github("environments/company-dev");
  assert.ok(Number.isSafeInteger(environment.id) && environment.node_id, "Missing actual environment identity");
  assert.equal(environment.name, "company-dev", "Wrong environment");
  assert.equal(environment.deployment_branch_policy?.protected_branches, true, "Environment requires protected branches");
  assert.ok(Array.isArray(environment.protection_rules), "Missing actual rule inventory");
  // API support varies. Do not use an absent field as proof of the UI control.
  if ("can_admins_bypass" in environment) assert.equal(environment.can_admins_bypass, false, "API/UI bypass mismatch");
  assert.deepEqual(environment, intent.environment, "Actual environment snapshot drift");
  const run = github(`actions/runs/${execution.runId}/attempts/${execution.runAttempt}`);
  for (const [k, v] of Object.entries({ head_sha: execution.revision, head_branch: "main", event: "workflow_dispatch", path: auditWorkflow })) assert.equal(run[k], v, `Audit run ${k} mismatch`);
  assert.equal(run.name, "Company development bootstrap completion audit", "Wrong audit workflow name");
  assert.equal(run.status, "in_progress", "Audit dispatch is not currently executing");
  assert.equal(String(run.id), execution.runId, "Audit run mismatch");
  assert.equal(String(run.run_attempt), execution.runAttempt, "Audit attempt mismatch");
  for (const field of ["actor", "triggering_actor"]) assert.equal(run[field]?.login, "cmbuyamba", "Audit owner actor mismatch");
  for (const field of ["repository", "head_repository"]) assert.equal(run[field]?.full_name, repository, "Foreign audit repository");
  const started = Date.parse(run.run_started_at);
  assert.ok(Number.isFinite(started) && started <= now && Date.parse(intent.authorizedAt) <= started
    && Date.parse(intent.manualUi.observedAt) <= started, "Owner authorization/UI intent must precede this dispatch attempt");
  const quality = ["ci.yml", "security.yml", "dast.yml"].map((workflow) => {
    const response = github(`actions/workflows/${workflow}/runs?head_sha=${execution.revision}&event=push&per_page=100`);
    assert.ok(Array.isArray(response.workflow_runs) && response.workflow_runs.length, "Missing exact-SHA quality runs");
    const latest = [...response.workflow_runs].sort((a, b) => b.id - a.id)[0];
    assert.ok(Number.isSafeInteger(latest.id) && latest.id > 0 && Number.isSafeInteger(latest.run_attempt)
      && latest.run_attempt > 0, "Incomplete exact-SHA quality run/attempt metadata");
    for (const [k, v] of Object.entries({ path: `.github/workflows/${workflow}`, head_sha: execution.revision,
      head_branch: "main", event: "push", status: "completed", conclusion: "success" })) assert.equal(latest[k], v, `Latest exact-SHA ${workflow} ${k} failed`);
    return { workflow, id: latest.id, attempt: latest.run_attempt, sha: latest.head_sha };
  });
  return { environment, branch, quality, dispatch: { actor: run.actor.login, triggeringActor: run.triggering_actor.login,
    createdAt: run.created_at, runStartedAt: run.run_started_at, ...execution } };
}
// Inspect/extract in memory through the fixed standard-library parser. No shell,
// path extraction, user executable, symlinks, directories or unbounded inflate.
export function readArchive(bytes, expectedNames) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 16 * 1024 * 1024, "Unsafe archive size");
  const script = `
import sys,io,zipfile,json,stat
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
expected=json.loads(sys.argv[1]); rows=z.infolist()
assert len(rows)==len(expected) and sorted(x.filename for x in rows)==sorted(expected)
assert len(set(x.filename for x in rows))==len(rows)
result={}
for x in rows:
 assert x.filename in expected and '/' not in x.filename and '\\\\' not in x.filename
 assert not x.is_dir() and not (x.flag_bits & 1) and x.compress_type in (0,8)
 mode=x.external_attr >> 16
 assert not stat.S_ISLNK(mode) and (stat.S_IFMT(mode) in (0,stat.S_IFREG))
 assert 0 < x.file_size <= 2*1024*1024 and x.compress_size > 0
 assert x.file_size <= x.compress_size*200
 result[x.filename]=z.read(x).decode('utf-8')
print(json.dumps(result))
`;
  return JSON.parse(command("python3", ["-c", script, JSON.stringify(expectedNames)], { input: bytes }));
}
export function loadOriginal(github = gh, download = (id) => command("gh", ["api", `repos/${repository}/actions/artifacts/${id}/zip`]), source, now = Date.now()) {
  const run = github(`actions/runs/${original.runId}/attempts/${original.runAttempt}`);
  const artifact = github(`actions/artifacts/${original.artifactId}`);
  const listing = github(`actions/runs/${original.runId}/artifacts?per_page=100`);
  assertArtifactMetadata(run, artifact, listing, original, ".github/workflows/company-development-foundation-apply.yml", "failure",
    `company-dev-foundation-bootstrap-initial-v2-apply-${original.sha}-${original.runId}-1`, now);
  const archive = download(original.artifactId);
  assert.equal(archive.length, artifact.size_in_bytes, "Original archive metadata size mismatch");
  assert.equal(sha256(archive), original.archiveSha256, "Original archive digest mismatch");
  const files = readArchive(archive, historicalFiles);
  return { ...assertOriginalFiles(files, source), files, archive, run, artifact };
}
export function observe(reader) {
  const resources = bootstrapInventory().map((r) => reader.get(endpoints[r.id]));
  return {
    subscription: reader.get(endpoints.subscription), group: reader.get(endpoints.group),
    inventory: reader.list(endpoints.resources), resources,
    history: reader.list(endpoints.deployments), deployments: names.map((n) => reader.get(endpoints[n])),
    operations: names.map((n) => ({ deploymentName: n, operations: reader.list(endpoints[`${n}/operations`]) })),
    permissions: [rg, ...bootstrapInventory().map((r) => r.id)].map((scope) => ({ scope, permissions: reader.list(endpoints[`${scope}/permissions`]) })),
    roles: roleScopes.map((scope) => ({ scope, assignments: reader.list(endpoints[`${scope}/roles`]) })),
    defender: reader.get(endpoints.defender),
  };
}
function validateObservation(snapshot, origin, intent) {
  assert.equal(snapshot.subscription.subscriptionId, destination.subscriptionId, "Wrong subscription");
  assert.equal(snapshot.subscription.tenantId, destination.tenantId, "Wrong tenant");
  assert.equal(snapshot.subscription.state, "Enabled", "Disabled subscription");
  assert.ok(sameId(snapshot.group.id, rg) && snapshot.group.location === destination.location, "Wrong resource group");
  assert.equal(snapshot.permissions.length, 8, "Missing scoped permissions");
  for (const p of snapshot.permissions) assertReadPermissions(p.permissions);
  assertHistoricalState(snapshot, origin.checkpoint, origin.run);
  assert.equal(stateHash(snapshot), intent.frozenSnapshotSha256, "Frozen complete state/provenance drift");
}
export function auditCompletion({ intent, execution, originalSource, source, github = gh, download, azure, account,
  clock = () => new Date().toISOString(), now = Date.now() }) {
  assert.ok(typeof azure === "function", "Closed GET transport required");
  const firstControls = controls(intent, execution, github, now);
  assert.deepEqual(source, intent.source, "Execution source drift");
  assert.equal(account.id, destination.subscriptionId, "Wrong observer subscription");
  assert.equal(account.tenantId, destination.tenantId, "Wrong observer tenant");
  assert.equal(account.user?.type, "servicePrincipal", "Federated preview observer required");
  assert.equal(account.user.name.toLowerCase(), original.previewClientId, "Wrong observer identity");
  const observerAccount = { subscriptionId: account.id, tenantId: account.tenantId,
    user: { type: account.user.type, name: account.user.name.toLowerCase() } };
  const origin = loadOriginal(github, download, originalSource, now);
  const journal = [], reader = createManagementReader(azure, journal, clock), observations = [];
  observations.push(clock());
  const before = observe(reader); validateObservation(before, origin, intent);
  const after = observe(reader); validateObservation(after, origin, intent);
  observations.push(clock());
  assert.deepEqual(after, before, "Final state/provenance drift");
  const finalTime = Date.parse(observations[1]);
  const finalOrigin = loadOriginal(github, download, originalSource, finalTime);
  assert.deepEqual(finalOrigin, origin, "Original immutable archive provenance changed");
  assert.deepEqual(controls(intent, execution, github, finalTime), firstControls, "Final protected/quality/dispatch context drift");
  const evidence = {
    "historical-original.zip": origin.archive, "historical-incomplete-checkpoint.json": origin.files["checkpoint.json"],
    "original-bindings.json": { original, run: origin.run, artifact: origin.artifact, fileHashes: origin.fileHashes },
    "actual-state.json": after, "read-journal.json": journal, "source-review.json": intent,
    "controls.json": { ...firstControls, observerAccount },
  };
  const encoded = Object.fromEntries(Object.entries(evidence).map(([path, value]) => [path,
    Buffer.isBuffer(value) ? value : typeof value === "string" ? Buffer.from(value) : Buffer.from(`${JSON.stringify(value, null, 2)}\n`)]));
  for (const [path, bytes] of Object.entries(encoded)) assert.ok(bytes.length > 0
    && bytes.length <= (path.endsWith(".zip") ? 16 : 2) * 1024 * 1024, "Oversized/unbounded audit evidence file");
  const receipt = { version: 1, ...completionAssertions, destination, original, execution, source, resources: projectResources(after.resources),
    observer: { clientId: original.previewClientId }, historicalWriter: { clientId: original.writerClientId, principalId: original.writerPrincipalId, revocationVerified: false },
    observations, ownerAuthorizationReference: intent.ownerAuthorizationReference, freezeReference: intent.freezeReference,
    inspectionReference: intent.inspectionReference, approvalAuthentication: "external-owner-control-required",
    evidenceHashes: Object.fromEntries(Object.entries(encoded).map(([p, b]) => [p, sha256(b)])),
    unresolvedPrediction: { sha256: "dc69598ff7e2cb03a36f91f92100285cce0edfadd1739fac185f3fcfb26253ff", modifyResources: 3, deleteProperties: 5, acceptedAsNoise: false },
  };
  assertCompletionReceipt(receipt);
  for (const [p, bytes] of Object.entries(encoded)) if (p !== "historical-original.zip") assertNoSecretPayload(JSON.parse(bytes));
  return { receipt, files: encoded };
}
const receiptFiles = ["receipt.json", "historical-original.zip", "historical-incomplete-checkpoint.json", "original-bindings.json",
  "actual-state.json", "read-journal.json", "source-review.json", "controls.json"];
export function loadCompletionReceipt(ref, { github = gh, download = (id) => command("gh", ["api", `repos/${repository}/actions/artifacts/${id}/zip`]), root = process.cwd(), now = Date.now() } = {}) {
  assert.equal(ref?.kind, "bootstrap-completion-receipt-ref", "Typed receipt reference required");
  assert.equal(ref.stage, "bootstrap", "Wrong receipt completion stage");
  assert.equal(ref.mode, "audit-readonly", "Wrong receipt reference mode");
  assert.match(ref.sha ?? "", /^[a-f0-9]{40}$/, "Missing immutable receipt source");
  for (const k of ["runId", "runAttempt", "artifactId"]) assert.match(ref[k] ?? "", /^[1-9]\d*$/, "Missing receipt artifact reference");
  for (const k of ["archiveSha256", "receiptSha256"]) assert.match(ref[k] ?? "", /^[a-f0-9]{64}$/, "Missing receipt digest");
  const run = github(`actions/runs/${ref.runId}/attempts/${ref.runAttempt}`);
  const artifact = github(`actions/artifacts/${ref.artifactId}`);
  assertArtifactMetadata(run, artifact, github(`actions/runs/${ref.runId}/artifacts?per_page=100`), ref, auditWorkflow, "success",
    `company-dev-bootstrap-completion-v1-${ref.sha}-${ref.runId}-${ref.runAttempt}`, now);
  const archive = download(ref.artifactId);
  assert.equal(archive.length, artifact.size_in_bytes, "Receipt archive size mismatch");
  assert.equal(sha256(archive), ref.archiveSha256, "Receipt archive digest mismatch");
  // Nested ZIP is binary; archive extraction uses base64 for that single fixed
  // entry, with the same bounded path/size checks as text archives.
  const files = readReceiptArchive(archive);
  assert.equal(sha256(files["receipt.json"]), ref.receiptSha256, "Receipt byte digest mismatch");
  const receipt = assertCompletionReceipt(JSON.parse(files["receipt.json"]));
  assert.deepEqual(receipt.execution, { revision: ref.sha, runId: ref.runId, runAttempt: ref.runAttempt }, "Receipt execution mismatch");
  assert.deepEqual(Object.keys(receipt.evidenceHashes).sort(), receiptFiles.filter((p) => p !== "receipt.json").sort(), "Receipt evidence inventory mismatch");
  for (const [p, digest] of Object.entries(receipt.evidenceHashes)) assert.equal(sha256(files[p]), digest, "Receipt evidence digest mismatch");
  const intent = JSON.parse(files["source-review.json"]);
  assertIntent(intent, receipt.execution, Date.parse(receipt.observations[1]));
  for (const k of ["ownerAuthorizationReference", "freezeReference", "inspectionReference"]) assert.equal(receipt[k], intent[k], "Receipt owner context drift");
  for (const t of receipt.observations) assert.ok(Date.parse(t) >= Date.parse(run.created_at)
    && Date.parse(t) <= Date.parse(run.updated_at) && Date.parse(t) <= now, "Receipt observation outside authenticated run");
  historicalObjects(root);
  const oldSource = assertSourceReview(intent, root, false);
  assert.deepEqual(receipt.source, intent.source, "Receipt source review mismatch");
  const freshOrigin = loadOriginal(github, download, oldSource, now);
  assert.ok(freshOrigin.archive.equals(files["historical-original.zip"]), "Receipt original archive mismatch");
  assert.equal(sha256(files["historical-incomplete-checkpoint.json"]), original.checkpointSha256, "Historical checkpoint changed");
  const snapshot = JSON.parse(files["actual-state.json"]);
  validateObservation(snapshot, freshOrigin, intent);
  assert.deepEqual(receipt.resources, projectResources(snapshot.resources), "Receipt typed resource binding mismatch");
  assert.deepEqual(JSON.parse(files["original-bindings.json"]), {
    original, run: freshOrigin.run, artifact: freshOrigin.artifact, fileHashes: freshOrigin.fileHashes,
  }, "Original evidence bindings drift");
  const context = JSON.parse(files["controls.json"]);
  assert.deepEqual(context.observerAccount, { subscriptionId: destination.subscriptionId, tenantId: destination.tenantId,
    user: { type: "servicePrincipal", name: original.previewClientId } }, "Receipt observing caller binding drift");
  assert.deepEqual(context.environment, intent.environment, "Receipt environment context drift");
  assert.equal(context.branch.protected, true, "Receipt unprotected branch");
  assert.equal(context.branch.commit?.sha, ref.sha, "Receipt branch SHA mismatch");
  assert.equal(context.environment.name, "company-dev", "Receipt wrong environment");
  assert.equal(context.environment.deployment_branch_policy?.protected_branches, true, "Receipt branch policy mismatch");
  assert.ok(Array.isArray(context.environment.protection_rules), "Receipt missing protection rules");
  if ("can_admins_bypass" in context.environment) assert.equal(context.environment.can_admins_bypass, false, "Receipt bypass mismatch");
  assert.deepEqual(context.dispatch, { actor: "cmbuyamba", triggeringActor: "cmbuyamba",
    createdAt: run.created_at, runStartedAt: run.run_started_at, ...receipt.execution }, "Receipt dispatch identity drift");
  assert.equal(run.actor?.login, "cmbuyamba", "Receipt wrong dispatch owner");
  assert.equal(run.triggering_actor?.login, "cmbuyamba", "Receipt wrong attempt owner");
  assert.ok(Date.parse(intent.authorizedAt) <= Date.parse(run.run_started_at)
    && Date.parse(intent.manualUi.observedAt) <= Date.parse(run.run_started_at), "Receipt authorization after dispatch");
  assert.deepEqual(context.quality.map((q) => q.workflow), ["ci.yml", "security.yml", "dast.yml"], "Receipt quality inventory mismatch");
  for (const q of context.quality) {
    assert.equal(q.sha, ref.sha, "Receipt quality SHA mismatch");
    assert.ok(Number.isSafeInteger(q.id) && q.id > 0 && Number.isSafeInteger(q.attempt) && q.attempt > 0, "Missing quality attempt");
    const verified = github(`actions/runs/${q.id}/attempts/${q.attempt}`);
    for (const [k, v] of Object.entries({ id: q.id, run_attempt: q.attempt, path: `.github/workflows/${q.workflow}`, head_sha: ref.sha,
      head_branch: "main", event: "push", status: "completed", conclusion: "success" })) assert.equal(verified[k], v, "Receipt authenticated quality mismatch");
  }
  const journal = JSON.parse(files["read-journal.json"]);
  assert.ok(Array.isArray(journal) && journal.length > 0 && journal.length <= 2000, "Missing bounded read journal");
  let index = 0;
  const replay = createManagementReader((args) => {
    const entry = journal[index++];
    assert.ok(entry && entry.method === "GET" && entry.url === args[4], "Receipt incomplete/non-GET journal");
    assert.equal(entry.responseSha256, stateHash(entry.response), "Journal response digest mismatch");
    assert.ok(Date.parse(entry.time) >= Date.parse(receipt.observations[0])
      && Date.parse(entry.time) <= Date.parse(receipt.observations[1]), "Journal observation time mismatch");
    return entry.response;
  }, []);
  assert.deepEqual(observe(replay), snapshot, "First journal state/provenance mismatch");
  assert.deepEqual(observe(replay), snapshot, "Final journal state/provenance mismatch");
  assert.equal(index, journal.length, "Unknown/extra journal reads");
  for (const [p, bytes] of Object.entries(files)) if (!p.endsWith(".zip")) assertNoSecretPayload(JSON.parse(bytes));
  return authenticateCompletion(receipt, ref);
}
function readReceiptArchive(bytes) {
  // Outer archives are bounded to 16 MiB; nested original evidence also remains
  // bounded. Avoid decoding binary as UTF-8 or re-zipping historical bytes.
  const directory = mkdtempSync(join(tmpdir(), "companydev-completion-"));
  try {
    const path = join(directory, "evidence.zip"); writeFileSync(path, bytes, { mode: 0o600 });
    const result = command("python3", ["-c", `
import zipfile,sys,json,base64,stat
z=zipfile.ZipFile(sys.argv[1]); expected=json.loads(sys.argv[2]); rows=z.infolist()
assert len(rows)==len(expected) and sorted(x.filename for x in rows)==sorted(expected)
assert len(set(x.filename for x in rows))==len(rows)
result={}
for x in rows:
 assert x.filename in expected and '/' not in x.filename and '\\\\' not in x.filename
 assert not x.is_dir() and not (x.flag_bits & 1) and x.compress_type in (0,8)
 assert stat.S_IFMT(x.external_attr >> 16) in (0,stat.S_IFREG)
 assert 0 < x.file_size <= (16*1024*1024 if x.filename.endswith('.zip') else 2*1024*1024)
 assert x.compress_size > 0 and x.file_size <= x.compress_size*200
 result[x.filename]=base64.b64encode(z.read(x)).decode('ascii')
print(json.dumps(result))
`, path, JSON.stringify(receiptFiles)]);
    return Object.fromEntries(Object.entries(JSON.parse(result)).map(([p, b]) => [p, Buffer.from(b, "base64")]));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
function inputs() {
  const execution = assertNativeContext();
  assert.equal(process.env.PREVIEW_CLIENT_ID, original.previewClientId, "Wrong configured preview identity before OIDC");
  const intent = JSON.parse(process.env.AUDIT_INTENT ?? "null");
  assertIntent(intent, execution);
  return { execution, intent, source: completionSource(execution.revision), originalSource: assertSourceReview(intent) };
}
function cli() {
  const mode = process.argv[2];
  assert.ok(["prepare", "audit"].includes(mode), "Only prepare/audit commands are supported");
  const bound = inputs();
  const context = controls(bound.intent, bound.execution);
  if (mode === "prepare") {
    assert.ok(process.env.GITHUB_OUTPUT, "Native output required");
    appendFileSync(process.env.GITHUB_OUTPUT, `audit_context=${stateHash({ ...bound, context })}\n`);
    console.log("Bound GET-only audit context; owner authorization and UI no-bypass are external controls, not inferred approvals.");
    return;
  }
  assert.equal(process.env.AUDIT_CONTEXT, stateHash({ ...bound, context }), "Pre-OIDC context drift");
  // Fixed authentication context read, never get-access-token/key export.
  const account = JSON.parse(command("az", ["account", "show", "--output", "json", "--only-show-errors"]));
  const result = auditCompletion({ ...bound, account, azure: (args) => JSON.parse(command("az",
    [...args, "--subscription", destination.subscriptionId, "--output", "json", "--only-show-errors"])) });
  // Recheck committed bytes and full source review after the observation window.
  assert.deepEqual(inputs(), bound, "Final execution/source drift");
  mkdirSync("company-dev-completion", { mode: 0o700 }); // refuse preexisting evidence directory
  for (const [path, bytes] of Object.entries(result.files)) writeFileSync(join("company-dev-completion", path), bytes, { mode: 0o600, flag: "wx" });
  writeFileSync("company-dev-completion/receipt.json", `${JSON.stringify(result.receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log("Historical ARM success/current frozen state recorded; no reapply, continuation, revocation or security-handoff authorization.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { cli(); } catch {
    // Provider/CLI stderr and assertion values may contain resolved secrets.
    // Never dump those into Actions logs or failed diagnostics.
    console.error("Completion audit rejected; no success receipt or execution authority. Stop and obtain authorized inspection; do not retry a deployment.");
    process.exitCode = 1;
  }
}
