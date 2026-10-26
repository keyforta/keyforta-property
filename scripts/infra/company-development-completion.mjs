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
  historicalAuditGrants, assertObserverBinding, assertAuditGrants,
  inspectionWorkflow, inspectionSourcePaths, permittedReadActions, uuid,
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
export function roleDefinitionEndpoints(binding) {
  if (binding) assertObserverBinding(binding);
  return [...new Set([...historicalAuditGrants.map((g) => g.roleDefinitionId),
    ...(binding?.grants ?? []).map((g) => g.roleDefinition.id)])].map((id) => arm(id, "2022-04-01"));
}
export function createManagementReader(invoke, journal, clock = () => new Date().toISOString(), binding) {
  const allowed = new Set([...Object.values(endpoints), ...roleDefinitionEndpoints(binding)]);
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
function sourceManifest(revision, root, checkWorktree, paths, version) {
  assert.match(revision ?? "", /^[a-f0-9]{40}$/, "Missing exact source SHA");
  if (checkWorktree) assert.equal(git(["rev-parse", "HEAD"], root).toString().trim(), revision, "Checkout SHA mismatch");
  const files = manifest(revision, paths, root);
  for (const { path, sha256: digest } of checkWorktree ? files : []) {
    const stat = lstatSync(join(root, path));
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2 * 1024 * 1024, "Unsafe source file");
    assert.equal(sha256(readFileSync(join(root, path))), digest, "Dirty/uncommitted source bytes");
  }
  return { version, revision, files, sha256: sha256(JSON.stringify(files)) };
}
export function completionSource(revision, root = process.cwd(), checkWorktree = true, version = 5) {
  assert.ok([3, 5].includes(version), "Unknown completion source profile");
  return sourceManifest(revision, root, checkWorktree, currentSourcePaths, version);
}
export function inspectionSource(revision, root = process.cwd(), checkWorktree = true, version = 6) {
  assert.ok([4, 6].includes(version), "Unknown inspection source profile");
  return sourceManifest(revision, root, checkWorktree, inspectionSourcePaths, version);
}
// Current approved policy profile: workflow bytes are explicit, never a
// wildcard or self-referential manifest hash. Historical pins above stay intact.
export const policyWorkflowProfile = Object.freeze({
  ".github/workflows/company-development-foundation.yml": "f3a61be83353382279afcc772b525c54f818f28af7dda0b1921bd15d0a0f07ff",
  ".github/workflows/company-development-foundation-apply.yml": "6ba75c222aa9b193c70297359303e8c052a42ac12f235f0c197d62557204ded3",
  ".github/workflows/company-development-bootstrap-completion.yml": "23723cf7003feca4c10de014725ca11b3f5dc50e4b2613a44dae0c7082ec3316",
  ".github/workflows/company-development-inspection.yml": "9be4225ac78954d511fad462bf59a67546ca95412b3a9b1e1cbc97def56ac756",
});
export const policyReviewPaths = Object.freeze([
  ".github/workflows/company-development-foundation.yml",
  ".github/workflows/company-development-foundation-apply.yml",
  ".github/tests/company-policy-removal.test.mjs",
]);
// Exact repository-wide review surface, separate from the twelve-path runtime
// manifest. Test-only loaders/helpers must never enter the runtime import graph.
export const reviewedCompletionPaths = Object.freeze([
  ...historicalSourcePaths.slice(3, 6), ...currentSourcePaths.slice(9),
  ".github/tests/company-development-completion.test.mjs", ".github/tests/company-development-apply.test.mjs",
  ".github/tests/company-development-source.test.mjs", ".github/tests/company-development.test.mjs",
  ".github/tests/company-completion-fixtures.test.mjs", ".github/tests/company-completion-history.test.mjs",
  ".github/tests/fixtures/company-source.mjs", ".github/tests/fixtures/company-completion.mjs",
  ".github/tests/fixtures/company-completion-loader.mjs", ".github/tests/fixtures/company-zip.mjs",
  ".github/tests/fixtures/generate-company-completion.mjs", ".github/tests/fixtures/company-history.mjs",
  ".github/tests/fixtures/company-bootstrap-original.zip", ".github/tests/fixtures/company-bootstrap-arm.json.gz",
  "infra/README.md", "docs/adr/ADR-016-company-development-private-foundation.md",
  inspectionWorkflow, ".github/tests/company-development-inspection.test.mjs",
]);
export function assertSourceReview(intent, root = process.cwd(), checkWorktree = true) {
  const source = intent.kind === "bootstrap-inspection-intent" ? inspectionSource : completionSource;
  const currentPolicy = [5, 6].includes(intent.source?.version);
  assert.deepEqual(intent.source, source(intent.execution.revision, root, checkWorktree, intent.source?.version), "Reviewed source closure mismatch");
  if (intent.kind === "bootstrap-completion-audit-intent") assert.equal(intent.source.version, intent.version === 2 ? 5 : 3, "Intent/source policy mismatch");
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
  // entire workflow is bound by the reviewed mode-specific source closure.
  for (const [path, digest] of Object.entries(currentPolicy ? policyWorkflowProfile : reviewedWorkflowProfiles[baselineRevision])) {
    assert.equal(sha256(git(["show", `${intent.execution.revision}:${path}`], root)), digest, "Unreviewed existing workflow change");
  }
  assert.equal(intent.baselineChangesSha256, sha256(git(["diff", "--raw", "--no-abbrev", "--no-renames", original.sha, baselineRevision], root)), "Historical repository-wide change review mismatch");
  assert.equal(intent.implementationChangesSha256, sha256(git(["diff", "--raw", "--no-abbrev", "--no-renames", baselineRevision, intent.execution.revision], root)), "Unreviewed repository-wide changes");
  const changed = git(["diff", "--name-only", "--no-renames", baselineRevision, intent.execution.revision], root).toString().trim().split("\n");
  assert.ok(changed.length && changed.every((p) => [...reviewedCompletionPaths, ...(currentPolicy ? policyReviewPaths : [])].includes(p)), "Change outside exact reviewed completion surfaces; no additional workflow exception");
  // Immutable Bicep/parser/payload surfaces, even if a caller supplies another
  // diff digest. Owner context cannot authorize a deployment contract change.
  for (const path of [...historicalSourcePaths.slice(0, 3), historicalSourcePaths[8]]) {
    assert.equal(sha256(git(["show", `${intent.execution.revision}:${path}`], root)),
      sha256(git(["show", `${baselineRevision}:${path}`], root)), "Audit cannot change deployment payload/parser");
  }
  return oldSource;
}
function nativeContext(env, workflow) {
  assert.equal(env.GITHUB_ACTIONS, "true", "Native Actions dispatch required");
  assert.equal(env.GITHUB_REPOSITORY, repository, "Wrong repository");
  assert.equal(env.GITHUB_REF, "refs/heads/main", "Protected main required");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch", "Manual dispatch required");
  assert.equal(env.GITHUB_WORKFLOW_REF, `${repository}/${workflow}@refs/heads/main`, "Wrong native evidence workflow");
  assert.equal(env.GITHUB_WORKFLOW_SHA, env.GITHUB_SHA, "Native workflow source SHA mismatch");
  assert.equal(env.GITHUB_REF_PROTECTED, "true", "Native protected branch required");
  assert.equal(env.GITHUB_ACTOR, "cmbuyamba", "Owner dispatch required");
  assert.equal(env.GITHUB_TRIGGERING_ACTOR, "cmbuyamba", "Owner attempt required");
  assert.match(env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/, "Exact SHA required");
  for (const k of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]) assert.match(env[k] ?? "", /^[1-9]\d*$/, "Native run required");
  return { revision: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT };
}
export const assertNativeContext = (env = process.env) => nativeContext(env, auditWorkflow);
export function assertIntent(intent, execution, now = Date.now()) {
  assert.ok([1, 2].includes(intent?.version), "Missing/unknown audit intent version");
  if (intent.version === 2) {
    assert.ok(!("freezeReference" in intent) && !("manualUi" in intent), "Obsolete audit policy fields");
  }
  assert.equal(intent.kind, "bootstrap-completion-audit-intent", "Wrong owner intent contract");
  assert.equal(intent.scope, "audit-only-no-continuation", "Audit-only authorization required");
  assert.equal(intent.owner, "cmbuyamba", "Wrong owner context");
  assert.equal(intent.execution.revision, execution.revision, "Owner exact SHA mismatch");
  assert.deepEqual(intent.original, original, "Wrong historical archive intent");
  for (const k of ["ownerAuthorizationReference", ...(intent.version === 1 ? ["freezeReference"] : []), "inspectionReference"]) assertReference(intent[k]);
  const age = now - Date.parse(intent.authorizedAt);
  assert.ok(age >= 0 && age <= 60 * 60 * 1000, "Stale owner authorization context");
  if (intent.version === 1) {
    assert.equal(intent.manualUi?.owner, "cmbuyamba", "Missing actual owner UI context");
    assert.equal(intent.manualUi.adminBypass, false, "Manual admin bypass must be OFF");
    assert.equal(intent.manualUi.reconciledWithApi, true, "Unreconciled UI/API bypass observation");
    assertReference(intent.manualUi.observationReference);
    const uiAge = now - Date.parse(intent.manualUi.observedAt);
    assert.ok(uiAge >= 0 && uiAge <= 60 * 60 * 1000, "Stale manual UI context");
  }
  assert.match(intent.frozenSnapshotSha256 ?? "", /^[a-f0-9]{64}$/, "Missing full frozen snapshot binding");
  assertObserverBinding(intent.observerBinding);
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
    && (intent.version === 2 || Date.parse(intent.manualUi.observedAt) <= started), "Owner authorization/UI intent must precede this dispatch attempt");
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
  return { environment, branch, quality,
    ...(intent.version === 2 ? { adminBypassObservation: "can_admins_bypass" in environment ? environment.can_admins_bypass : "unobservable" } : {}),
    dispatch: { actor: run.actor.login, triggeringActor: run.triggering_actor.login,
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
export function observe(reader, binding) {
  const resources = bootstrapInventory().map((r) => reader.get(endpoints[r.id]));
  return {
    subscription: reader.get(endpoints.subscription), group: reader.get(endpoints.group),
    inventory: reader.list(endpoints.resources), resources,
    history: reader.list(endpoints.deployments), deployments: names.map((n) => reader.get(endpoints[n])),
    operations: names.map((n) => ({ deploymentName: n, operations: reader.list(endpoints[`${n}/operations`]) })),
    permissions: [rg, ...bootstrapInventory().map((r) => r.id)].map((scope) => ({ scope, permissions: reader.list(endpoints[`${scope}/permissions`]) })),
    roles: roleScopes.map((scope) => ({ scope, assignments: reader.list(endpoints[`${scope}/roles`]) })),
    roleDefinitions: roleDefinitionEndpoints(binding).map((url) => reader.get(url)),
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
  assert.ok(snapshot.resources.every((r) => ![r.properties?.clientId, r.properties?.principalId]
    .some((id) => sameId(id, intent.observerBinding.clientId) || sameId(id, intent.observerBinding.principalId))), "Observer cannot be a bootstrap workload identity");
  assertAuditGrants(snapshot, intent.observerBinding);
  assertHistoricalState(snapshot, origin.checkpoint, origin.run);
  assert.equal(stateHash(snapshot), intent.frozenSnapshotSha256, "Frozen complete state/provenance drift");
}
export function auditCompletion({ intent, execution, originalSource, source, github = gh, download, azure, account, observerBinding,
  clock = () => new Date().toISOString(), now = Date.now() }) {
  assert.ok(typeof azure === "function", "Closed GET transport required");
  const firstControls = controls(intent, execution, github, now);
  assertObserverBinding(observerBinding);
  assert.deepEqual(intent.observerBinding, observerBinding, "Protected observer binding drift");
  assert.deepEqual(source, intent.source, "Execution source drift");
  assert.equal(account.id, destination.subscriptionId, "Wrong observer subscription");
  assert.equal(account.tenantId, destination.tenantId, "Wrong observer tenant");
  assert.equal(account.user?.type, "servicePrincipal", "Federated separate audit observer required");
  assert.equal(account.user.name.toLowerCase(), observerBinding.clientId.toLowerCase(), "Wrong observer identity");
  const observerAccount = { subscriptionId: account.id, tenantId: account.tenantId,
    user: { type: account.user.type, name: account.user.name.toLowerCase() } };
  const origin = loadOriginal(github, download, originalSource, now);
  const journal = [], reader = createManagementReader(azure, journal, clock, observerBinding), observations = [];
  observations.push(clock());
  const before = observe(reader, observerBinding); validateObservation(before, origin, intent);
  const after = observe(reader, observerBinding); validateObservation(after, origin, intent);
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
  const receipt = { version: intent.version, ...completionAssertions, destination, original, execution, source, resources: projectResources(after.resources),
    observer: { clientId: observerBinding.clientId, principalId: observerBinding.principalId, bindingSha256: stateHash(observerBinding) },
    historicalWriter: { clientId: original.writerClientId, principalId: original.writerPrincipalId, revocationVerified: false },
    observations, ownerAuthorizationReference: intent.ownerAuthorizationReference,
    ...(intent.version === 1 ? { freezeReference: intent.freezeReference } : {}),
    inspectionReference: intent.inspectionReference, approvalAuthentication: "external-owner-control-required",
    evidenceHashes: Object.fromEntries(Object.entries(encoded).map(([p, b]) => [p, sha256(b)])),
    unresolvedPrediction: { sha256: "dc69598ff7e2cb03a36f91f92100285cce0edfadd1739fac185f3fcfb26253ff", modifyResources: 3, deleteProperties: 5, acceptedAsNoise: false },
  };
  assertCompletionReceipt(receipt);
  for (const [p, bytes] of Object.entries(encoded)) if (p !== "historical-original.zip") assertNoSecretPayload(JSON.parse(bytes));
  return { receipt, files: encoded };
}
// Separate capability route: never invokes auditCompletion, receipt creation,
// authentication of completion, WhatIf, apply or any write-capable driver.
export function assertInspectionNativeContext(env = process.env) {
  assert.equal(env.GITHUB_JOB, "inspect", "Wrong native inspection job");
  return nativeContext(env, inspectionWorkflow);
}
function assertInspectionIntent(intent, execution, now) {
  assert.equal(intent?.version, 1, "Missing inspection intent");
  assert.equal(intent.kind, "bootstrap-inspection-intent", "Wrong inspection intent");
  assert.equal(intent.scope, "inspection-only-no-authority", "Inspection only");
  assert.equal(intent.owner, "cmbuyamba", "Wrong inspection owner");
  assert.deepEqual(Object.keys(intent).sort(), ["version", "kind", "scope", "owner", "execution", "original",
    "originalSource", "source", "environment", "observerBinding", "authorizedAt", "ownerAuthorizationReference",
    "reviewReferences", "baselineChangesSha256", "implementationChangesSha256"].sort(), "Unknown inspection intent; no snapshot/UI/freeze assertions");
  assert.deepEqual(intent.execution, { revision: execution.revision }, "Inspection exact SHA mismatch");
  assert.deepEqual(intent.original, original, "Wrong original evidence");
  assertReference(intent.ownerAuthorizationReference);
  assert.ok(Array.isArray(intent.reviewReferences) && intent.reviewReferences.length > 0 && intent.reviewReferences.length <= 10, "Missing bounded review references");
  intent.reviewReferences.forEach(assertReference);
  const age = now - Date.parse(intent.authorizedAt);
  assert.ok(age >= 0 && age <= 60 * 60 * 1000, "Stale inspection authorization context");
  assertObserverBinding(intent.observerBinding);
}
export function inspectionControls(intent, execution, github = gh, now = Date.now()) {
  assertInspectionIntent(intent, execution, now);
  const branch = github("branches/main"), protection = branch.protection;
  assert.equal(branch.protected, true, "Main must be protected");
  assert.equal(branch.commit?.sha, execution.revision, "Main SHA moved");
  const required = protection?.required_status_checks;
  for (const name of ["validate", "scan", "api"]) {
    assert.ok(required?.contexts?.includes(name) && required.checks?.some((c) => c.context === name && c.app_id === 15368), "Missing required native check");
  }
  const environment = github("environments/company-dev");
  assert.ok(Number.isSafeInteger(environment.id) && environment.node_id, "Missing environment identity");
  assert.equal(environment.name, "company-dev", "Wrong environment");
  if (intent.source.version === 4 || "can_admins_bypass" in environment) {
    assert.equal(environment.can_admins_bypass, false, "Missing/unsafe API bypass setting; inspection is not a UI observation");
  }
  assert.deepEqual(environment.deployment_branch_policy, { protected_branches: true, custom_branch_policies: false }, "Wrong environment branch policy");
  assert.ok(Array.isArray(environment.protection_rules)
    && environment.protection_rules.some((r) => r.type === "branch_policy"), "Missing native branch rule");
  assert.deepEqual(environment, intent.environment, "Environment snapshot drift");
  const run = github(`actions/runs/${execution.runId}/attempts/${execution.runAttempt}`);
  for (const [k, v] of Object.entries({ head_sha: execution.revision, head_branch: "main", event: "workflow_dispatch",
    path: inspectionWorkflow, name: "Company development inspection", status: "in_progress" })) assert.equal(run[k], v, "Wrong native inspection run");
  assert.equal(String(run.id), execution.runId, "Wrong run");
  assert.equal(String(run.run_attempt), execution.runAttempt, "Wrong attempt");
  for (const field of ["actor", "triggering_actor"]) assert.equal(run[field]?.login, "cmbuyamba", "Wrong owner actor");
  for (const field of ["repository", "head_repository"]) assert.equal(run[field]?.full_name, repository, "Foreign repository");
  const start = Date.parse(run.run_started_at);
  assert.ok(Number.isFinite(start) && start <= now && Date.parse(intent.authorizedAt) <= start, "Intent must precede dispatch");
  const jobs = github(`actions/runs/${execution.runId}/attempts/${execution.runAttempt}/jobs?per_page=100`);
  assert.equal(jobs.total_count, 1, "Unexpected/incomplete job inventory");
  assert.equal(jobs.jobs?.length, 1, "Missing native inspection job");
  const job = jobs.jobs[0];
  for (const [k, v] of Object.entries({ run_id: Number(execution.runId), run_attempt: Number(execution.runAttempt),
    head_sha: execution.revision, name: "inspect", status: "in_progress", conclusion: null })) assert.equal(job[k], v, "Native inspection job mismatch");
  assert.ok(Number.isSafeInteger(job.id) && job.id > 0, "Missing native job ID");
  const quality = ["ci.yml", "security.yml", "dast.yml"].map((workflow) => {
    const response = github(`actions/workflows/${workflow}/runs?head_sha=${execution.revision}&event=push&per_page=100`);
    assert.ok(Array.isArray(response.workflow_runs) && response.workflow_runs.length, "Missing quality runs");
    const latest = [...response.workflow_runs].sort((a, b) => b.id - a.id)[0];
    assert.ok(Number.isSafeInteger(latest.id) && latest.id > 0 && Number.isSafeInteger(latest.run_attempt) && latest.run_attempt > 0, "Incomplete quality metadata");
    for (const [k, v] of Object.entries({ path: `.github/workflows/${workflow}`, head_sha: execution.revision,
      head_branch: "main", event: "push", status: "completed", conclusion: "success" })) assert.equal(latest[k], v, "Latest exact-SHA push quality failed");
    return { workflow, id: latest.id, attempt: latest.run_attempt, sha: latest.head_sha };
  });
  // Job steps/run updated_at legitimately change across prepare/login/inspect.
  // Bind stable native identities, never those mutable progress fields.
  return { branch, environment, quality,
    ...(intent.source.version === 6 ? { adminBypassObservation: "can_admins_bypass" in environment ? environment.can_admins_bypass : "unobservable" } : {}),
    dispatch: {
    revision: run.head_sha, runId: String(run.id), runAttempt: String(run.run_attempt),
    actor: run.actor.login, triggeringActor: run.triggering_actor.login,
    createdAt: run.created_at, runStartedAt: run.run_started_at, path: run.path,
  }, job: { id: job.id, runId: job.run_id, runAttempt: job.run_attempt, revision: job.head_sha, name: job.name } };
}
function assertInspectionShape(snapshot, binding) {
  assert.equal(snapshot.subscription.subscriptionId, destination.subscriptionId, "Wrong subscription");
  assert.equal(snapshot.subscription.tenantId, destination.tenantId, "Wrong tenant");
  assert.equal(snapshot.subscription.state, "Enabled", "Disabled subscription");
  assert.ok(sameId(snapshot.group.id, rg) && snapshot.group.location === destination.location, "Wrong RG");
  const inventory = (rows) => rows.map((r) => ({ id: r.id.toLowerCase(), type: r.type.toLowerCase() })).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(inventory(snapshot.resources), inventory(bootstrapInventory()), "Wrong typed inventory");
  assert.deepEqual(inventory(snapshot.inventory), inventory(bootstrapInventory().filter((r) => !r.type.includes("/blobServices"))), "Incomplete inventory");
  projectResources(snapshot.resources);
  assert.deepEqual(snapshot.permissions.map((p) => p.scope), [rg, ...bootstrapInventory().map((r) => r.id)], "Missing permission scopes");
  const scopedReads = permittedReadActions.filter((a) => !["Microsoft.Resources/subscriptions/read", "Microsoft.Authorization/roleDefinitions/read"].includes(a));
  for (const p of snapshot.permissions) assertReadPermissions(p.permissions, scopedReads);
  assert.deepEqual(snapshot.roles.map((p) => p.scope), roleScopes, "Missing role scopes");
  assertAuditGrants(snapshot, binding);
  assert.equal(snapshot.history.length, 3, "Missing history");
  assert.deepEqual(snapshot.history.map((d) => d.name).sort(), [...names].sort(), "Wrong history");
  assert.equal(snapshot.deployments.length, 3, "Missing deployment objects");
  assert.equal(snapshot.operations.length, 3, "Missing operations");
  assert.deepEqual(snapshot.operations.map((g) => g.deploymentName).sort(), [...names].sort(), "Wrong operation groups");
  const text = (value) => typeof value === "string" && value.trim().length > 0;
  const timestamp = (value) => assert.ok(typeof value === "string" && Number.isFinite(Date.parse(value)), "Missing/invalid historical timestamp");
  // Validate evidence, not agreement with the original run. These checks must
  // remain outside the historical semantic diagnostic catch, on BOTH reads.
  // Require only fields consumed by the history contract, not optional SDK
  // metadata (e.g. duration/statusCode/resourceName or operation object id).
  for (const name of names) {
    for (const collection of [snapshot.history, snapshot.deployments]) {
      const d = collection.find((v) => v.name === name);
      assert.ok(d?.properties && !Array.isArray(d.properties)
        && sameId(d.id, `${rg}/providers/Microsoft.Resources/deployments/${name}`), "Wrong deployment/history object");
      assert.ok(text(d.properties.provisioningState), "Missing/invalid deployment/history state");
      assert.ok(typeof d.properties.correlationId === "string" && uuid.test(d.properties.correlationId), "Missing/invalid historical correlation");
      timestamp(d.properties.timestamp);
    }
    const rows = snapshot.operations.find((g) => g.deploymentName === name)?.operations;
    assert.ok(Array.isArray(rows) && rows.length, "Missing operation visibility");
    const seen = new Set(), signatures = [];
    for (const op of rows) {
      assert.ok(text(op.operationId) && !seen.has(op.operationId), "Missing/invalid/duplicate operation ID");
      seen.add(op.operationId);
      const p = op.properties, target = p?.targetResource;
      assert.ok(text(p?.provisioningState), "Missing/invalid operation state");
      timestamp(p.timestamp);
      assert.ok(["Create", "Read", "EvaluateDeploymentOutput"].includes(p.provisioningOperation), "Unknown/destructive operation");
      if (p.provisioningOperation === "EvaluateDeploymentOutput") {
        assert.ok(target === undefined || target === null, "Output target forbidden");
        signatures.push("EvaluateDeploymentOutput");
      } else {
        assert.ok(text(target?.id) && text(target.resourceType), "Missing/invalid operation target");
        signatures.push(`${p.provisioningOperation}:${target.id.toLowerCase()}:${target.resourceType.toLowerCase()}`);
      }
    }
    // Same closed root/nested/leaf targets and complete operation sets as
    // assertHistoricalState. Foreign scope/type and missing rows are not drift
    // diagnostics; complete state/correlation/time mismatches still can be.
    const child = name === names[0] ? names[1] : name === names[1] ? names[2] : null;
    const signature = (op, r) => `${op}:${r.id.toLowerCase()}:${r.type.toLowerCase()}`;
    const expected = child ? ["Create", "Read"].map((op) => signature(op, {
      id: `${rg}/providers/Microsoft.Resources/deployments/${child}`, type: "Microsoft.Resources/deployments",
    })) : [
      ...bootstrapInventory().map((r) => signature("Create", r)),
      ...bootstrapInventory().filter((r) => r.type.endsWith("/registries") || /-(api|migration)$/.test(r.id)).map((r) => signature("Read", r)),
    ];
    assert.deepEqual(signatures.sort(), [...expected, "EvaluateDeploymentOutput"].sort(), "Incomplete/foreign context-bound operations");
  }
  assert.equal(typeof snapshot.defender?.properties?.isEnabled, "boolean", "Missing Defender visibility");
}
export function inspectSnapshot({ intent, execution, originalSource, source, github = gh, download, azure, account, observerBinding,
  clock = () => new Date().toISOString(), now = Date.now() }) {
  const first = inspectionControls(intent, execution, github, now);
  assertObserverBinding(observerBinding);
  assert.deepEqual(observerBinding, intent.observerBinding, "Protected observer binding drift");
  assert.deepEqual(source, intent.source, "Inspection source drift");
  assert.equal(account.id, destination.subscriptionId, "Wrong observer subscription");
  assert.equal(account.tenantId, destination.tenantId, "Wrong observer tenant");
  assert.equal(account.user?.type, "servicePrincipal", "Secretless SP required");
  assert.ok(sameId(account.user.name, observerBinding.clientId), "Wrong observer identity");
  const origin = loadOriginal(github, download, originalSource, now);
  const journal = [], reader = createManagementReader(azure, journal, clock, observerBinding);
  const before = observe(reader, observerBinding); assertInspectionShape(before, observerBinding);
  const after = observe(reader, observerBinding); assertInspectionShape(after, observerBinding);
  assert.deepEqual(after, before, "Inspection state drift");
  const finalTime = Date.parse(clock());
  assert.deepEqual(loadOriginal(github, download, originalSource, finalTime), origin, "Original evidence drift");
  assert.deepEqual(inspectionControls(intent, execution, github, finalTime), first, "Final native/protection/quality drift");
  // Only this historical semantic validator may be diagnostic. Failed GETs,
  // malformed/incomplete visibility, caller rights, grants and guards are fatal.
  let historicalStateValidation = "accepted";
  try { assertHistoricalState(after, origin.checkpoint, origin.run); } catch { historicalStateValidation = "rejected"; }
  const inspection = { version: 1, kind: "bootstrap-inspection-evidence", mode: "inspection-only",
    execution, source, snapshotSha256: stateHash(after), observedAt: clock(), historicalStateValidation,
    auditCompleted: false, permissionsVerified: false, writerRevocationVerified: false,
    continuationAuthorized: false, securityHandoffVerified: false, pimVisibility: "unknown-not-measured" };
  const evidence = { "snapshot.json": after, "read-journal.json": journal, "source-review.json": intent,
    "controls.json": { ...first, observerAccount: { subscriptionId: account.id, tenantId: account.tenantId,
      user: { type: account.user.type, name: account.user.name.toLowerCase() } } },
    "historical-original.zip": origin.archive, "historical-incomplete-checkpoint.json": origin.files["checkpoint.json"],
    "original-bindings.json": { original, run: origin.run, artifact: origin.artifact, fileHashes: origin.fileHashes } };
  const files = Object.fromEntries(Object.entries(evidence).map(([path, value]) => {
    if (!Buffer.isBuffer(value)) assertNoSecretPayload(typeof value === "string" ? JSON.parse(value) : value);
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
    assert.ok(bytes.length > 0 && bytes.length <= (path.endsWith(".zip") ? 16 : 2) * 1024 * 1024, "Oversized inspection evidence");
    return [path, bytes];
  }));
  inspection.evidenceHashes = Object.fromEntries(Object.entries(files).map(([p, b]) => [p, sha256(b)]));
  return { inspection, files };
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
  // Version comes from a closed artifact name AND authenticated receipt bytes.
  const receiptVersion = artifact.name === `company-dev-bootstrap-completion-v2-${ref.sha}-${ref.runId}-${ref.runAttempt}` ? 2 : 1;
  assertArtifactMetadata(run, artifact, github(`actions/runs/${ref.runId}/artifacts?per_page=100`), ref, auditWorkflow, "success",
    `company-dev-bootstrap-completion-v${receiptVersion}-${ref.sha}-${ref.runId}-${ref.runAttempt}`, now);
  const archive = download(ref.artifactId);
  assert.equal(archive.length, artifact.size_in_bytes, "Receipt archive size mismatch");
  assert.equal(sha256(archive), ref.archiveSha256, "Receipt archive digest mismatch");
  // Nested ZIP is binary; archive extraction uses base64 for that single fixed
  // entry, with the same bounded path/size checks as text archives.
  const files = readReceiptArchive(archive);
  assert.equal(sha256(files["receipt.json"]), ref.receiptSha256, "Receipt byte digest mismatch");
  const receipt = assertCompletionReceipt(JSON.parse(files["receipt.json"]));
  assert.equal(receipt.version, receiptVersion, "Artifact/receipt version mismatch");
  assert.deepEqual(receipt.execution, { revision: ref.sha, runId: ref.runId, runAttempt: ref.runAttempt }, "Receipt execution mismatch");
  assert.deepEqual(Object.keys(receipt.evidenceHashes).sort(), receiptFiles.filter((p) => p !== "receipt.json").sort(), "Receipt evidence inventory mismatch");
  for (const [p, digest] of Object.entries(receipt.evidenceHashes)) assert.equal(sha256(files[p]), digest, "Receipt evidence digest mismatch");
  const intent = JSON.parse(files["source-review.json"]);
  assert.equal(intent.version, receipt.version, "Intent/receipt policy mismatch");
  assertIntent(intent, receipt.execution, Date.parse(receipt.observations[1]));
  assert.deepEqual(receipt.observer, { clientId: intent.observerBinding.clientId, principalId: intent.observerBinding.principalId,
    bindingSha256: stateHash(intent.observerBinding) }, "Receipt observer binding drift");
  for (const k of ["ownerAuthorizationReference", ...(receipt.version === 1 ? ["freezeReference"] : []), "inspectionReference"]) assert.equal(receipt[k], intent[k], "Receipt owner context drift");
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
    user: { type: "servicePrincipal", name: intent.observerBinding.clientId.toLowerCase() } }, "Receipt observing caller binding drift");
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
    && (intent.version === 2 || Date.parse(intent.manualUi.observedAt) <= Date.parse(run.run_started_at)), "Receipt authorization after dispatch");
  if (receipt.version === 2) assert.equal(context.adminBypassObservation,
    "can_admins_bypass" in context.environment ? context.environment.can_admins_bypass : "unobservable", "Receipt API assurance mismatch");
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
  }, [], undefined, intent.observerBinding);
  assert.deepEqual(observe(replay, intent.observerBinding), snapshot, "First journal state/provenance mismatch");
  assert.deepEqual(observe(replay, intent.observerBinding), snapshot, "Final journal state/provenance mismatch");
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
  const observerBinding = assertObserverBinding(JSON.parse(process.env.AUDIT_OBSERVER_BINDING ?? "null"));
  assert.equal(process.env.AUDIT_CLIENT_ID, observerBinding.clientId, "Wrong protected audit identity before OIDC");
  const intent = JSON.parse(process.env.AUDIT_INTENT ?? "null");
  assert.equal(intent?.version, 2, "New audit producer requires intent version 2");
  assertIntent(intent, execution);
  assert.deepEqual(intent.observerBinding, observerBinding, "Protected observer binding drift before OIDC");
  return { execution, intent, observerBinding, source: completionSource(execution.revision), originalSource: assertSourceReview(intent) };
}
function cli() {
  const mode = process.argv[2];
  if (mode === "inspect-prepare" || mode === "inspect") return inspectionCli(mode);
  assert.ok(["prepare", "audit"].includes(mode), "Only prepare/audit commands are supported");
  const bound = inputs();
  const context = controls(bound.intent, bound.execution);
  if (mode === "prepare") {
    assert.ok(process.env.GITHUB_OUTPUT, "Native output required");
    appendFileSync(process.env.GITHUB_OUTPUT, `audit_context=${stateHash({ ...bound, context })}\n`);
    console.log("Bound GET-only audit context; snapshot approval and fresh owner authorization remain external controls. API bypass absence is unobservable; no manual UI/freeze prerequisite.");
    return;
  }
  function inspectionInputs() {
    const execution = assertInspectionNativeContext();
    const raw = process.env.AUDIT_OBSERVER_BINDING ?? "";
    // Exact already-applied protected bytes; no new identity/federation/role plan.
    assert.equal(sha256(raw), "3471916410bbcbf38ba589ced35f3a17760bce2bc493df03d03063b4ee135f25", "Applied protected binding bytes mismatch");
    const observerBinding = assertObserverBinding(JSON.parse(raw));
    assert.equal(process.env.AUDIT_CLIENT_ID, observerBinding.clientId, "Protected client drift");
    assert.equal(observerBinding.clientId, "142bbb0f-118a-4dea-9f53-69e03d3f308b", "Wrong applied audit client");
    assert.equal(observerBinding.principalId, "c0f5fe98-9cb7-4a6b-a371-fbe549c6dfc1", "Wrong applied audit SP");
    const intent = JSON.parse(process.env.INSPECTION_INTENT ?? "null");
    assertInspectionIntent(intent, execution, Date.now());
    assert.deepEqual(intent.observerBinding, observerBinding, "Protected binding mismatch before OIDC");
    return { execution, intent, observerBinding, source: inspectionSource(execution.revision), originalSource: assertSourceReview(intent) };
  }
  function inspectionCli(mode) {
    const bound = inspectionInputs(), context = inspectionControls(bound.intent, bound.execution);
    const digest = stateHash({ ...bound, context });
    if (mode === "inspect-prepare") {
      assert.ok(process.env.GITHUB_OUTPUT, "Native output required");
      appendFileSync(process.env.GITHUB_OUTPUT, `inspection_context=${digest}\n`);
      console.log(`Inspection-only pre-OIDC context SHA256: ${digest}`);
      return;
    }
    assert.equal(process.env.INSPECTION_CONTEXT, digest, "Pre-OIDC inspection context drift");
    const account = JSON.parse(command("az", ["account", "show", "--output", "json", "--only-show-errors"]));
    const result = inspectSnapshot({ ...bound, account, azure: (args) => JSON.parse(command("az",
      [...args, "--subscription", destination.subscriptionId, "--output", "json", "--only-show-errors"])) });
    assert.deepEqual(inspectionInputs(), bound, "Final source/binding drift");
    mkdirSync("company-dev-inspection", { mode: 0o700 });
    for (const [path, bytes] of Object.entries(result.files)) writeFileSync(join("company-dev-inspection", path), bytes, { mode: 0o600, flag: "wx" });
    writeFileSync("company-dev-inspection/inspection.json", `${JSON.stringify(result.inspection, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    console.log(`Inspection snapshot SHA256: ${result.inspection.snapshotSha256}; no audit completion or execution authority.`);
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
    console.error("Evidence route rejected; no success receipt or execution authority. Stop and obtain authorized inspection; do not retry a deployment.");
    process.exitCode = 1;
  }
}
