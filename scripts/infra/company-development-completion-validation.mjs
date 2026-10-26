// Transport-free contracts shared by the historical v2 routes and the new audit.
// No CLI, filesystem, authentication, token export or deployment capability.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const repository = "keyforta/keyforta-property";
export const destination = Object.freeze({
  subscriptionId: "891e5e6e-8ae3-4455-9184-8d7606223d91",
  tenantId: "8019a048-e7d6-48e8-984a-b902f641a21b",
  resourceGroup: "rg-keyforta-companydev-san", location: "southafricanorth",
});
export const rg = `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}`;
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .filter((k) => value[k] !== undefined).map((k) => [k, canonical(value[k])]));
  return value;
}
export const stateHash = (value) => sha256(JSON.stringify(canonical(value)));
export const sameId = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function assertReference(value) {
  assert.match(value ?? "", /^https:\/\/github\.com\/keyforta\/keyforta-property\/(?:issues|pull)\/[1-9]\d*(?:#issuecomment-[1-9]\d*)?$/, "Missing native owner review reference");
}
export function bootstrapInventory() {
  const scope = `${rg}/providers/`;
  return [
    ...["api", "web", "migration"].map((name) => ({
      type: "Microsoft.ManagedIdentity/userAssignedIdentities",
      id: `${scope}Microsoft.ManagedIdentity/userAssignedIdentities/id-keyforta-cdev-${name}`,
    })),
    { type: "Microsoft.ContainerRegistry/registries", id: `${scope}Microsoft.ContainerRegistry/registries/acrkeyfortacdevmxv24i2qhtib6` },
    { type: "Microsoft.Storage/storageAccounts", id: `${scope}Microsoft.Storage/storageAccounts/stakeyfortacdevmxv24i2qh` },
    { type: "Microsoft.Storage/storageAccounts/blobServices", id: `${scope}Microsoft.Storage/storageAccounts/stakeyfortacdevmxv24i2qh/blobServices/default` },
    { type: "Microsoft.Storage/storageAccounts/blobServices/containers", id: `${scope}Microsoft.Storage/storageAccounts/stakeyfortacdevmxv24i2qh/blobServices/default/containers/tenant-applications` },
  ].sort((a, b) => a.id.localeCompare(b.id));
}
// Preserve the existing full projection (including RP defaults), not a selected
// security-field subset. Historical shared-key placeholders remain placeholders.
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [
    k, /^(sharedKey|primarySharedKey|secondarySharedKey)$/i.test(k) ? "<not-retained>" : scrub(v),
  ]));
  return typeof value === "string" && value.toLowerCase().startsWith("/subscriptions/") ? value.toLowerCase() : value;
}
export function projectResources(resources) {
  assert.ok(Array.isArray(resources), "Missing actual resource visibility");
  return resources.map((r) => {
    assert.ok(r?.id && r.type && (r.properties || (r.type === "Microsoft.Security/dataScanners" && r.identity)), "Incomplete resource visibility");
    return canonical(scrub(Object.fromEntries(["id", "type", "location", "sku", "kind", "identity", "properties"]
      .filter((k) => r[k] !== undefined).map((k) => [k, r[k]]))));
  }).sort((a, b) => a.id.localeCompare(b.id));
}
export function assertNoSecretPayload(value) {
  const sensitive = /^(?:sharedKey|primarySharedKey|secondarySharedKey|password|clientSecret|accessToken|sasToken)$/i;
  const check = (v) => assert.ok(v === undefined || v === null || v === "" || (typeof v === "string"
    && (/^\[.*\]$/s.test(v) || /^(?:\*{3,}|<redacted>|<not-retained>)$/i.test(v))), "Resolved secret in provider payload; stop without persisting it");
  const visit = (v) => {
    if (!v || typeof v !== "object") return;
    if (typeof v.path === "string" && sensitive.test(v.path.split(".").at(-1))) { check(v.before); check(v.after); }
    for (const [key, child] of Object.entries(v)) { if (sensitive.test(key)) check(child); else visit(child); }
  };
  visit(value);
}
export function assertAuditPayload(value) {
  assertNoSecretPayload(value);
  const visit = (v) => {
    if (typeof v === "string") assert.ok(!/(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[?&]sig=|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i.test(v), "Secret-bearing audit payload");
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(value);
}
export const original = Object.freeze({
  sha: "6216a0c95b49f522fecf1c28d8ba3405f1a93a43", runId: "40262729364", runAttempt: "1", artifactId: "12625346104",
  archiveSha256: "7278e893f44a6fd23633f3bc74ed378c515f8e8576c33c384a72a48243a8d37c",
  checkpointSha256: "9b9cbb2835a95de67d638da4269968e9cd7cba2511f34036aad9b69f74bd4836",
  templateSha256: "b34d57a55b6e7f2d4cdc82403130da8ce58acd3560fa528645b336f3c8468ec0",
  parametersSha256: "83e1708ed2b4f4f1aa01f0ec3deea1563019768a1b60e9a5e9ac4bd5103183f9",
  bodySha256: "96d14b3172c5e7e871c6b28b97f225e97de48fdd8fe5b3300e0d1f19ecde2110",
  deploymentName: "companydev-bootstrap-6216a0c95b49", writerClientId: "63b65efc-7e8d-4d82-b13a-53b875df54f1",
  writerPrincipalId: "e10f9e0f-274f-4643-8a8f-ad8f41b09c64",
  previewClientId: "684d29f1-1055-4030-b308-872dd2781d39",
  correlationId: "40db5d42-f65c-47c2-9710-ece3d0b09eb2",
});
export const baselineRevision = "6fccaa9ca066e32fde2870858adc1334525a7423";
const previewWorkflow = ".github/workflows/company-development-foundation.yml";
const applyWorkflow = ".github/workflows/company-development-foundation-apply.yml";
export const auditWorkflow = ".github/workflows/company-development-bootstrap-completion.yml";
export const reviewedWorkflowProfiles = Object.freeze({
  [original.sha]: {
    [previewWorkflow]: "927f28dee6ec34a317175b78c8fdf7d92c1826cff2791717e4624fff750c2397",
    [applyWorkflow]: "f3044fdb0661c32ebc36b25923dd3329049506fc742379c35f0145630d61aa4b",
  },
  [baselineRevision]: {
    [previewWorkflow]: "1513636deea8103e3388a456e9af7c6e804eddc3966f3125d2d17efa6735a6b9",
    [applyWorkflow]: "b2c11ad6cd16a70112e5aa0f91f20e5ed4ddf4be46833c50ceaa32cceaf172e9",
  },
});
// v1 nine-path manifest is immutable historical artifact semantics. New routes
// MUST use version 3 and the complete closure, including both consumer drivers.
export const historicalSourcePaths = Object.freeze([
  "infra/bicep/company-development.bicep", "infra/bicep/modules/company-development-resources.bicep",
  "infra/bicep/modules/foundation-resources.bicep", "scripts/infra/company-development.mjs",
  "scripts/infra/company-development-apply.mjs", "scripts/infra/company-development-state.mjs",
  previewWorkflow, applyWorkflow, "scripts/verify/company-foundation-parser.py",
]);
export const currentSourcePaths = Object.freeze([...historicalSourcePaths,
  "scripts/infra/company-development-completion-validation.mjs",
  "scripts/infra/company-development-completion.mjs", auditWorkflow]);
export function manifestPaths(version) {
  assert.ok(version === undefined || version === 3, "Unknown source manifest version");
  return version === 3 ? currentSourcePaths : historicalSourcePaths;
}
export const permittedReadActions = Object.freeze([
  "Microsoft.Resources/subscriptions/read", "Microsoft.Resources/subscriptions/resourceGroups/read",
  "Microsoft.Resources/subscriptions/resourceGroups/resources/read", "Microsoft.Resources/deployments/read",
  "Microsoft.Resources/deployments/operations/read", "Microsoft.Authorization/permissions/read",
  "Microsoft.Authorization/roleAssignments/read", "Microsoft.Authorization/roleDefinitions/read",
  "Microsoft.ContainerRegistry/registries/read", "Microsoft.ManagedIdentity/userAssignedIdentities/read",
  "Microsoft.Storage/storageAccounts/read", "Microsoft.Storage/storageAccounts/blobServices/read",
  "Microsoft.Storage/storageAccounts/blobServices/containers/read", "Microsoft.Security/defenderForStorageSettings/read",
]);
export function assertReadPermissions(rows) {
  assert.ok(Array.isArray(rows) && rows.length, "Missing permission visibility");
  const allowed = new Set(permittedReadActions.map((a) => a.toLowerCase()));
  for (const row of rows) {
    for (const field of ["actions", "notActions", "dataActions", "notDataActions"]) {
      assert.ok(Array.isArray(row[field]) && row[field].every((v) => typeof v === "string" && v.length), "Incomplete permission read");
      assert.ok(row[field].every((v) => !v.includes("*") && !v.includes("?")), "Wildcard authority forbidden, including exclusions");
    }
    assert.equal(row.dataActions.length, 0, "Data authority forbidden");
    assert.equal(row.notDataActions.length, 0, "Data authority/exclusions forbidden");
    for (const action of [...row.actions, ...row.notActions]) assert.ok(allowed.has(action.toLowerCase()), `Authority outside closed exact read set: ${action}`);
  }
  assert.ok(rows.some((r) => r.actions.some((a) => !r.notActions.some((n) => n.toLowerCase() === a.toLowerCase()))), "Missing effective read permission visibility");
}
export const historicalFiles = Object.freeze(["checkpoint.json", "fresh-what-if.json", "result.json", "reviewed-inputs.json", "submission.json", "template.json"]);
export function assertArtifactMetadata(run, artifact, listing, ref, workflow, conclusion, name, now = Date.now()) {
  for (const [k, v] of Object.entries({ head_sha: ref.sha, head_branch: "main", event: "workflow_dispatch",
    status: "completed", conclusion, path: workflow })) assert.equal(run[k], v, `Artifact run ${k} mismatch`);
  assert.equal(String(run.id), ref.runId, "Artifact run ID mismatch");
  assert.equal(String(run.run_attempt), ref.runAttempt, "Artifact attempt mismatch");
  assert.equal(run.name, workflow === auditWorkflow ? "Company development bootstrap completion audit" : "Company development foundation apply", "Artifact workflow name mismatch");
  for (const field of ["repository", "head_repository"]) assert.equal(run[field]?.full_name, repository, "Foreign artifact repository");
  assert.equal(String(artifact.id), ref.artifactId, "Artifact ID mismatch");
  assert.equal(artifact.expired, false, "Artifact expired");
  assert.ok(Date.parse(artifact.expires_at) > now, "Artifact missing/stale expiry");
  assert.equal(artifact.name, name, "Artifact name mismatch");
  assert.equal(String(artifact.workflow_run?.id), ref.runId, "Artifact workflow run mismatch");
  assert.equal(artifact.workflow_run?.head_sha, ref.sha, "Artifact source mismatch");
  assert.equal(artifact.digest, `sha256:${ref.archiveSha256}`, "Artifact digest mismatch");
  assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 16 * 1024 * 1024, "Artifact size invalid");
  const created = Date.parse(artifact.created_at), start = Date.parse(run.created_at), end = Date.parse(run.updated_at);
  assert.ok(Number.isFinite(created) && Number.isFinite(start) && Number.isFinite(end)
    && created >= start && created <= end && created <= now && start < end, "Artifact/run time correlation mismatch");
  assert.ok(Number.isSafeInteger(listing.total_count) && listing.total_count <= 100
    && listing.total_count === listing.artifacts?.length, "Incomplete artifact inventory");
  const matches = listing.artifacts.filter((a) => a.name === name);
  assert.equal(matches.length, 1, "Ambiguous artifact name");
  assert.deepEqual(matches[0], artifact, "Artifact listing metadata drift");
}
export function assertOriginalFiles(files, source) {
  assert.deepEqual(Object.keys(files).sort(), [...historicalFiles].sort(), "Original file inventory mismatch");
  for (const text of Object.values(files)) assertAuditPayload(JSON.parse(text));
  assert.equal(sha256(files["checkpoint.json"]), original.checkpointSha256, "Original checkpoint digest mismatch");
  assert.equal(sha256(files["template.json"]), original.templateSha256, "Original template digest mismatch");
  const cp = JSON.parse(files["checkpoint.json"]), submission = JSON.parse(files["submission.json"]);
  const result = JSON.parse(files["result.json"]), reviewed = JSON.parse(files["reviewed-inputs.json"]);
  for (const [k, v] of Object.entries({ version: 2, stage: "bootstrap", mode: "initial", completed: false,
    commitSha: original.sha, runId: original.runId, runAttempt: original.runAttempt, applyClientId: original.writerClientId,
    deploymentName: original.deploymentName, templateSha256: original.templateSha256, parametersSha256: original.parametersSha256 })) assert.equal(cp[k], v, `Original checkpoint ${k} mismatch`);
  assert.deepEqual(cp.destination, destination, "Original destination mismatch");
  assert.ok(!cp.predecessor && !cp.sourceTransition && !cp.securityHandoff, "Original transition/handoff forbidden");
  assert.deepEqual(cp.sourceFiles, source.files, "Original source manifest mismatch");
  assert.equal(cp.sourceSha256, source.sha256, "Original source hash mismatch");
  assert.deepEqual(submission.reviewed, result.reviewed, "Original submission/result mismatch");
  for (const item of [submission, result]) {
    assert.deepEqual(item.executionRun, { revision: original.sha, runId: original.runId, runAttempt: original.runAttempt }, "Original execution mismatch");
    for (const k of ["sourceSha256", "templateSha256", "parametersSha256"]) assert.equal(item.reviewed[k], cp[k], "Original reviewed digest mismatch");
    assert.equal(item.reviewed.sha, original.sha, "Original preview source mismatch");
    assert.equal(item.reviewed.stage, "bootstrap", "Original preview stage mismatch");
    assert.equal(item.reviewed.mode, "initial", "Original preview mode mismatch");
    assert.equal(item.reviewed.evidenceVersion, 2, "Original preview version mismatch");
  }
  for (const k of Object.keys(submission.reviewed)) assert.deepEqual(reviewed[k], submission.reviewed[k], "Original reviewed input mismatch");
  // The immutable six-file archive retains the actual body digest, not the
  // parameter file. Pin that authentic binding; never reconstruct parameters
  // from template defaults or substitute a recompilation.
  assert.equal(submission.bodySha256, original.bodySha256, "Original submission body binding mismatch");
  assert.equal(submission.url, `https://management.azure.com${rg}/providers/Microsoft.Resources/deployments/${original.deploymentName}?api-version=2025-04-01`, "Original submission destination mismatch");
  assert.equal(result.deploymentId, `${rg}/providers/Microsoft.Resources/deployments/${original.deploymentName}`, "Original result identity mismatch");
  assert.equal(result.state, "Succeeded", "Original ARM result failed");
  assert.equal(sha256(files["fresh-what-if.json"]), submission.reviewed.whatIfSha256, "Original what-if digest mismatch");
  return { checkpoint: cp, submission, result, fileHashes: Object.fromEntries(Object.entries(files).map(([p, b]) => [p, sha256(b)])) };
}
export function assertHistoricalState(snapshot, checkpoint, run) {
  assert.deepEqual(projectResources(snapshot.resources), projectResources(checkpoint.resources), "Original property/principal drift");
  assert.equal(snapshot.resources.length, 7, "Missing bootstrap resource");
  const inv = (rows) => rows.map((r) => ({ id: r.id.toLowerCase(), type: r.type.toLowerCase() })).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(inv(snapshot.resources), inv(bootstrapInventory()), "Foreign typed resource");
  assert.deepEqual(inv(snapshot.inventory), inv(bootstrapInventory().filter((r) => !r.type.includes("/blobServices"))), "Unexpected generic inventory");
  const principals = new Set(), clients = new Set();
  for (const r of snapshot.resources) {
    if (r.properties.provisioningState !== undefined) assert.equal(r.properties.provisioningState, "Succeeded", "Resource not Succeeded");
    if (r.type.endsWith("/userAssignedIdentities")) {
      assert.equal(r.properties.tenantId, destination.tenantId, "Wrong UAMI tenant");
      for (const k of ["principalId", "clientId"]) assert.match(r.properties[k] ?? "", uuid, "Missing UAMI binding");
      principals.add(r.properties.principalId.toLowerCase()); clients.add(r.properties.clientId.toLowerCase());
    }
  }
  assert.equal(principals.size, 3, "Duplicate principals"); assert.equal(clients.size, 3, "Duplicate clients");
  assert.ok([...principals].every((p) => !clients.has(p)), "Principal/client substitution");
  const names = [original.deploymentName, "foundation-keyforta-cdev", "stamp-keyforta-cdev"];
  assert.deepEqual(snapshot.history.map((d) => d.name).sort(), [...names].sort(), "Foreign/missing deployment history");
  const start = Date.parse(run.created_at), end = Date.parse(run.updated_at);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && start < end, "Missing original run bounds");
  const time = (t) => assert.ok(Number.isFinite(Date.parse(t)) && Date.parse(t) >= start && Date.parse(t) <= end, "Success outside original workflow bounds");
  const seen = new Set(), creates = new Set();
  let count = 0, reads = 0, outputs = 0, nested = 0;
  assert.equal(snapshot.deployments.length, 3, "Missing deployment visibility");
  assert.equal(snapshot.operations.length, 3, "Missing operation pages");
  for (const name of names) {
    const d = snapshot.deployments.find((v) => v.name === name);
    assert.ok(d, "Missing original deployment");
    assert.ok(sameId(d.id, `${rg}/providers/Microsoft.Resources/deployments/${name}`), "Foreign deployment");
    assert.equal(d.properties?.provisioningState, "Succeeded", "Deployment not Succeeded");
    assert.equal(d.properties.correlationId, original.correlationId, "Original correlation drift"); time(d.properties.timestamp);
    assert.equal(snapshot.history.find((v) => v.name === name)?.properties?.provisioningState, "Succeeded", "History state drift");
    const group = snapshot.operations.find((g) => g.deploymentName === name);
    assert.ok(group && Array.isArray(group.operations) && group.operations.length, "Missing operations");
    const actualSignatures = [];
    for (const op of group.operations) {
      assert.ok(op.operationId && !seen.has(`${name}/${op.operationId}`), "Duplicate operation"); seen.add(`${name}/${op.operationId}`); count++;
      const p = op.properties, target = p?.targetResource;
      assert.equal(p?.provisioningState, "Succeeded", "Operation not Succeeded"); time(p.timestamp);
      if (p.provisioningOperation === "EvaluateDeploymentOutput") {
        assert.ok(!target, "Output target forbidden"); actualSignatures.push("EvaluateDeploymentOutput"); outputs++; continue;
      }
      assert.ok(target?.id && target.resourceType, "Unknown operation target");
      actualSignatures.push(`${p.provisioningOperation}:${target.id.toLowerCase()}:${target.resourceType.toLowerCase()}`);
      const child = name === names[0] ? names[1] : name === names[1] ? names[2] : null;
      const childTarget = child && sameId(target.id, `${rg}/providers/Microsoft.Resources/deployments/${child}`) && target.resourceType === "Microsoft.Resources/deployments";
      if (p.provisioningOperation === "Read") {
        assert.ok(childTarget || (!child && bootstrapInventory().some((r) => sameId(r.id, target.id) && sameId(r.type, target.resourceType)
          && (r.type.endsWith("/registries") || /-(api|migration)$/.test(r.id)))), "Unknown context-bound Read");
        reads++; continue;
      }
      assert.equal(p.provisioningOperation, "Create", "Unknown/destructive operation");
      if (childTarget) { nested++; continue; }
      assert.equal(name, names[2], "Create outside original leaf context");
      assert.ok(bootstrapInventory().some((r) => sameId(r.id, target.id) && sameId(r.type, target.resourceType)), "Foreign Create");
      assert.ok(!creates.has(target.id.toLowerCase()), "Duplicate Create"); creates.add(target.id.toLowerCase());
    }
    const childName = name === names[0] ? names[1] : name === names[1] ? names[2] : null;
    const signature = (op, r) => `${op}:${r.id.toLowerCase()}:${r.type.toLowerCase()}`;
    const expectedSignatures = childName ? ["Create", "Read"].map((op) => signature(op, {
      id: `${rg}/providers/Microsoft.Resources/deployments/${childName}`, type: "Microsoft.Resources/deployments",
    })) : [
      ...bootstrapInventory().map((r) => signature("Create", r)),
      ...bootstrapInventory().filter((r) => r.type.endsWith("/registries") || /-(api|migration)$/.test(r.id)).map((r) => signature("Read", r)),
    ];
    expectedSignatures.push("EvaluateDeploymentOutput");
    assert.deepEqual(actualSignatures.sort(), expectedSignatures.sort(), "Incomplete/duplicate context-bound operation set");
  }
  assert.deepEqual({ count, reads, outputs, nested, resources: creates.size }, { count: 17, reads: 5, outputs: 3, nested: 2, resources: 7 }, "Incomplete original operation set");
  for (const rows of snapshot.roles) {
    assert.ok(Array.isArray(rows.assignments), "Missing pre-handoff role visibility");
    for (const a of rows.assignments) {
      assert.ok(a.properties?.scope && a.properties.principalId, "Incomplete role visibility");
      assert.ok(!sameId(a.properties.scope, rows.scope) && !principals.has(a.properties.principalId.toLowerCase()), "Unexpected pre-handoff grant");
    }
  }
  assert.equal(snapshot.defender?.properties?.isEnabled, false, "Missing/active Defender");
  assert.notEqual(snapshot.defender.properties.malwareScanning?.onUpload?.isEnabled, true, "Scanning enabled");
  return projectResources(snapshot.resources);
}
export const completionAssertions = Object.freeze({
  kind: "bootstrap-completion-receipt", mode: "audit-readonly", historicalArmStatus: "Succeeded",
  originalWorkflowConclusion: "failure", originalCheckpointCompleted: false, currentStateVerified: true,
  reapplyAuthorized: false, continuationAuthorized: false, securityHandoffVerified: false, automaticDataAdmission: false,
  whatIfStatus: "not-evaluated-for-this-contract", propertyDeltas: "UNRESOLVED",
});
export const receiptEvidencePaths = Object.freeze(["historical-original.zip", "historical-incomplete-checkpoint.json",
  "original-bindings.json", "actual-state.json", "read-journal.json", "source-review.json", "controls.json"]);
export function assertCompletionReceipt(receipt) {
  assert.equal(receipt?.version, 1, "Unknown receipt version");
  for (const [k, v] of Object.entries(completionAssertions)) assert.equal(receipt[k], v, `Receipt ${k} mismatch`);
  assert.ok(receipt.source && receipt.evidenceHashes && receipt.execution && receipt.original && receipt.observations, "Missing receipt binding evidence");
  assert.deepEqual(Object.keys(receipt).sort(), ["version", ...Object.keys(completionAssertions), "destination", "original",
    "execution", "source", "resources", "observer", "historicalWriter", "observations", "ownerAuthorizationReference",
    "freezeReference", "inspectionReference", "approvalAuthentication", "evidenceHashes", "unresolvedPrediction"].sort(), "Unknown/missing receipt fields");
  assert.deepEqual(receipt.original, original, "Original provenance mismatch");
  assert.match(receipt.execution.revision ?? "", /^[a-f0-9]{40}$/, "Missing execution source");
  assert.equal(receipt.source.version, 3, "Wrong source closure");
  assert.equal(receipt.source.revision, receipt.execution.revision, "Source/execution mismatch");
  assert.deepEqual(receipt.source.files?.map((f) => f.path), currentSourcePaths, "Incomplete source closure");
  assert.equal(receipt.source.sha256, sha256(JSON.stringify(receipt.source.files)), "Source digest mismatch");
  for (const f of receipt.source.files) assert.match(f.sha256, /^[a-f0-9]{64}$/, "Missing source blob");
  for (const k of ["runId", "runAttempt"]) assert.match(receipt.execution[k] ?? "", /^[1-9]\d*$/, "Missing receipt run");
  assert.deepEqual(receipt.destination, destination, "Wrong receipt destination");
  assert.deepEqual(receipt.observer, { clientId: original.previewClientId }, "Wrong observer");
  assert.deepEqual(receipt.historicalWriter, { clientId: original.writerClientId, principalId: original.writerPrincipalId, revocationVerified: false }, "Wrong historical writer/revocation assertion");
  for (const k of ["ownerAuthorizationReference", "freezeReference", "inspectionReference"]) assertReference(receipt[k]);
  assert.ok(receipt.observations.length === 2 && receipt.observations.every((t) => Number.isFinite(Date.parse(t)))
    && Date.parse(receipt.observations[0]) <= Date.parse(receipt.observations[1]), "Missing observations");
  assert.deepEqual(Object.keys(receipt.evidenceHashes).sort(), [...receiptEvidencePaths].sort(), "Incomplete receipt evidence inventory");
  for (const digest of Object.values(receipt.evidenceHashes)) assert.match(digest, /^[a-f0-9]{64}$/, "Invalid evidence hash");
  assert.equal(receipt.approvalAuthentication, "external-owner-control-required", "Receipt is not approval");
  assert.deepEqual(receipt.unresolvedPrediction, { sha256: "dc69598ff7e2cb03a36f91f92100285cce0edfadd1739fac185f3fcfb26253ff",
    modifyResources: 3, deleteProperties: 5, acceptedAsNoise: false }, "Unresolved delta provenance mismatch");
  assert.ok(Array.isArray(receipt.resources) && receipt.resources.length === 7, "Missing typed receipt resources");
  assertAuditPayload(receipt);
  assert.ok(!("completed" in receipt) && !("applyClientId" in receipt), "Receipt cannot masquerade as checkpoint");
  return receipt;
}
const authenticated = new WeakMap();
// Only the authenticated archive loader calls this, after full metadata/source/
// evidence validation. A serialized object loses this process-local provenance.
export function authenticateCompletion(receipt, ref) {
  assertCompletionReceipt(receipt);
  authenticated.set(receipt, { hash: stateHash(receipt), ref: structuredClone(ref) });
  return receipt;
}
export function completionBasis(receipt) {
  const binding = authenticated.get(receipt);
  assert.ok(binding && binding.hash === stateHash(receipt), "Authenticated completion receipt required");
  return { kind: "bootstrap-completion-basis", receipt, resources: receipt.resources, ref: structuredClone(binding.ref) };
}
export function assertCompletionBasis(basis) {
  assert.equal(basis?.kind, "bootstrap-completion-basis", "Wrong completion basis");
  assert.deepEqual(completionBasis(basis.receipt).ref, basis.ref, "Completion reference drift");
  assert.deepEqual(basis.resources, basis.receipt.resources, "Completion resources drift");
  return basis.receipt;
}
