import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import YAML from "yaml";
import { completionFixture } from "./fixtures/company-completion.mjs";
import { sourceFixture, sourcePaths } from "./fixtures/company-source.mjs";
import { zipFixture } from "./fixtures/company-zip.mjs";

const controls = () => import("../../scripts/infra/company-development-apply.mjs");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha = "a".repeat(40);
const subscriptionId = "891e5e6e-8ae3-4455-9184-8d7606223d91";
const resourceGroup = "rg-keyforta-companydev-san";
const input = {
  stage: "bootstrap", mode: "initial", evidenceVersion: 2,
  changeFreeze: "https://github.com/keyforta/keyforta-property/issues/159#issuecomment-123",
  subscriptionId, resourceGroup, tenantId: "8019a048-e7d6-48e8-984a-b902f641a21b", location: "southafricanorth",
  vnetCidr: "10.84.0.0/24", acaSubnetCidr: "10.84.0.0/26", postgresSubnetCidr: "10.84.0.64/28",
  networkApproval: "https://github.com/keyforta/keyforta-property/issues/123",
};
function actualResources(expected) {
  return expected.map(({ id, type }, index) => ({
    id, type, location: "southafricanorth",
    ...(type.endsWith("/registries") ? { sku: { name: "Basic" } }
      : type.endsWith("/storageAccounts") ? { sku: { name: "Standard_LRS" }, kind: "StorageV2" } : {}),
    properties: type.endsWith("/userAssignedIdentities")
      ? { tenantId: input.tenantId, principalId: `11111111-1111-4111-8111-00000000000${index}`, clientId: `22222222-2222-4222-8222-00000000000${index}` }
      : type.endsWith("/registries") ? { provisioningState: "Succeeded", adminUserEnabled: false, publicNetworkAccess: "Enabled" }
      : type.endsWith("/storageAccounts") ? { provisioningState: "Succeeded", allowBlobPublicAccess: false, allowSharedKeyAccess: false, defaultToOAuthAuthentication: true, minimumTlsVersion: "TLS1_2", supportsHttpsTrafficOnly: true, publicNetworkAccess: "Enabled" }
      : type.endsWith("/blobServices") ? { deleteRetentionPolicy: { days: 7, enabled: true } }
      : { publicAccess: "None" },
  }));
}

function continuationResources(state) {
  const inventory = state.continuationInventory();
  const vnet = inventory.find((r) => r.type === "Microsoft.Network/virtualNetworks").id;
  const dns = inventory.find((r) => r.type === "Microsoft.Network/privateDnsZones").id;
  return inventory.map(({ id, type }) => ({
    id, type, location: "southafricanorth",
    ...(type === "Microsoft.DBforPostgreSQL/flexibleServers" ? { sku: { name: "Standard_B1ms", tier: "Burstable" } } : {}),
    properties: { provisioningState: "Succeeded",
      ...(type === "Microsoft.DBforPostgreSQL/flexibleServers" ? { state: "Ready", version: "16", authConfig: { activeDirectoryAuth: "Enabled", passwordAuth: "Disabled", tenantId: input.tenantId },
        storage: { storageSizeGB: 32, type: "Premium_LRS" }, backup: { backupRetentionDays: 7, geoRedundantBackup: "Disabled" }, highAvailability: { mode: "Disabled" },
        network: { publicNetworkAccess: "Disabled", delegatedSubnetResourceId: `${vnet}/subnets/postgres`, privateDnsZoneArmResourceId: dns } } : {}),
      ...(type === "Microsoft.App/managedEnvironments" ? { workloadProfiles: [{ name: "Consumption", workloadProfileType: "Consumption" }],
        vnetConfiguration: { infrastructureSubnetId: `${vnet}/subnets/aca-infrastructure`, internal: false }, infrastructureResourceGroup: "ME_keyforta_cdev_mxv24i2qhtib6", zoneRedundant: false } : {}),
      ...(type === "Microsoft.OperationalInsights/workspaces" ? { retentionInDays: 30 } : {}),
    },
  }));
}

async function stagedFixture(bootstrapResources) {
  const state = await import("../../scripts/infra/company-development-state.mjs");
  const { bootstrapInventory, destination } = await import("../../scripts/infra/company-development.mjs");
  const now = Date.parse("2026-10-25T21:00:00.000Z");
  const boot = bootstrapResources ?? actualResources(bootstrapInventory());
  const scanner = {
    id: `/subscriptions/${subscriptionId}/providers/Microsoft.Security/dataScanners/synthetic-actual-scanner`,
    type: "Microsoft.Security/dataScanners",
    identity: { type: "SystemAssigned", tenantId: destination.tenantId, principalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    properties: {},
  };
  const defender = { properties: { isEnabled: true, overrideSubscriptionLevelSettings: true, sensitiveDataDiscovery: { isEnabled: false }, malwareScanning: { onUpload: { isEnabled: true, capGBPerMonth: 100 }, blobScanResultsOptions: "blobIndexTags" } } };
  const previousState = { version: 2, stage: "bootstrap", destination, resources: boot };
  const { prepareHumanGrants } = await controls();
  const tuples = prepareHumanGrants(bootstrapRead(boot), "companydev-bootstrap-synthetic", previousState).assignments;
  const owner = {
    id: `${boot.find((r) => r.type.endsWith("/storageAccounts")).id}/providers/Microsoft.Authorization/roleAssignments/dddddddd-dddd-4ddd-8ddd-dddddddddddd`,
    name: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", principalId: scanner.identity.principalId, principalType: "ServicePrincipal",
    roleDefinitionId: `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/b7e6dc6d-f1e8-4753-8033-0f276bb0955b`,
    scope: boot.find((r) => r.type.endsWith("/storageAccounts")).id,
  };
  const assignments = [...tuples.map(({ id, name, principalId, principalType, roleDefinitionId, scope }) => ({ id, name, principalId, principalType, roleDefinitionId, scope })), owner];
  const ref = "https://github.com/keyforta/keyforta-property/issues/159#issuecomment-123";
  const predecessor = {
    version: 2, stage: "bootstrap", mode: "initial", destination, completed: true,
    commitSha: sha, runId: "123", runAttempt: "1", applyClientId: "22222222-2222-4222-8222-222222222222",
    sourceSha256: "b".repeat(64), templateSha256: "c".repeat(64), parametersSha256: "d".repeat(64),
    resources: state.projectResources(boot), deploymentName: `companydev-bootstrap-${sha.slice(0, 12)}`,
  };
  predecessor.sourceFiles = sourcePaths.map((path) => ({ path, sha256: "b".repeat(64) }));
  predecessor.sourceSha256 = hash(JSON.stringify(predecessor.sourceFiles));
  const context = {
    predecessor: { runId: "123", runAttempt: "1", artifactId: "456", stage: "bootstrap", mode: "initial", sha, checkpointSha256: "e".repeat(64) },
    baseline: state.projectResources(boot), deploymentName: `companydev-continuation-${sha.slice(0, 12)}`,
    freezeReference: ref, inspectionReference: ref, approvedChanges: [],
    security: { scannerId: scanner.id, ownerReviewReference: ref, writerRemovalReference: ref, permissionReviewReference: ref },
  };
  const transport = { resources: boot, assignments, scanner, defender, permissions: [{ actions: ["*/read", "Microsoft.Resources/deployments/write"], notActions: [], dataActions: [], notDataActions: [] }],
    stagePermissions: [{ actions: ["*/read", ...new Set(state.continuationInventory().map((r) => `${r.type}/write`)), "Microsoft.Resources/deployments/write", "Microsoft.Resources/deployments/whatIf/action", "Microsoft.OperationalInsights/workspaces/sharedKeys/action"], notActions: [], dataActions: [], notDataActions: [] }],
    predecessorDeployment: { name: predecessor.deploymentName, properties: { provisioningState: "Succeeded" } }, deployment: null, extraDeployments: [] };
  const calls = [];
  const read = (a) => {
    calls.push(a);
    if (a[0] === "account") return { id: subscriptionId, tenantId: destination.tenantId, state: "Enabled", user: { type: "servicePrincipal", name: predecessor.applyClientId } };
    if (a[0] === "resource" && a[1] === "list") return transport.resources.filter((r) => state.topLevelTypes.includes(r.type));
    if (a[0] === "resource" && a[1] === "show") {
      const id = a[a.indexOf("--ids") + 1];
      const found = transport.resources.find((r) => r.id.toLowerCase() === id.toLowerCase());
      if (!found) throw Object.assign(new Error("ResourceNotFound"), { code: "ResourceNotFound" });
      return found;
    }
    if (a[0] === "role") {
      const target = a[a.indexOf("--scope") + 1].toLowerCase();
      return transport.assignments.filter((r) => r.scope.toLowerCase() === target
        || (a.includes("--include-inherited") && target.startsWith(`${r.scope.toLowerCase()}/`)));
    }
    if (a[0] === "deployment" && a[2] === "list") return [transport.predecessorDeployment, transport.deployment, ...transport.extraDeployments].filter(Boolean);
    if (a[0] === "deployment" && a[2] === "show") {
      const found = [transport.predecessorDeployment, transport.deployment].find((d) => d?.name === a[a.indexOf("--name") + 1]);
      if (!found) throw Object.assign(new Error("DeploymentNotFound"), { code: "DeploymentNotFound" });
      return found;
    }
    if (a[0] === "deployment" && a[1] === "operation") {
      const target = a[a.indexOf("--name") + 1].includes("-bootstrap-") ? boot.find((r) => r.type.endsWith("/storageAccounts")) : state.continuationInventory().at(-1);
      return [{ properties: { provisioningState: "Succeeded", targetResource: { id: target.id, resourceType: target.type }, provisioningOperation: "Create" } }];
    }
    if (a[0] === "rest" && a.includes("get")) {
      const url = a[a.indexOf("--url") + 1];
      if (url.includes(`/resourceGroups/${resourceGroup}/providers/Microsoft.Authorization/permissions?`)) return { value: transport.stagePermissions };
      if (url.includes("/permissions?")) return { value: transport.permissions };
      if (url.includes("/defenderForStorageSettings/")) return transport.defender;
      if (url.includes("/dataScanners/")) return transport.scanner;
    }
    throw new Error(`Unexpected read ${JSON.stringify(a)}`);
  };
  const security = state.readSecurity(read, context.security, previousState);
  context.security.functionalTest = {
    owner: "cmbuyamba", observationReference: ref, executionAuthorizationReference: ref,
    testId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    storageId: owner.scope, containerId: boot.find((r) => r.type.endsWith("/containers")).id,
    blob: { name: "synthetic-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.txt", etag: '"synthetic-etag"', contentSha256: "f".repeat(64), contentLength: 36 },
    enabledAt: "2026-10-25T20:00:00.000Z", startedAt: "2026-10-25T20:10:00.000Z",
    uploadedAt: "2026-10-25T20:11:00.000Z", scanTime: "2026-10-25T20:12:00.000Z", observedAt: "2026-10-25T20:13:00.000Z",
    result: "No threats found", readableSecuritySha256: state.stateHash(security),
  };
  const plan = {
    inputs: { ...input, stage: "continuation", stageContext: context },
    inventory: { baseline: context.baseline, expected: [...bootstrapInventory(), ...state.continuationInventory()] },
    evidence: { commitSha: sha, sourceSha256: predecessor.sourceSha256, templateSha256: "1".repeat(64), parametersSha256: "2".repeat(64) },
  };
  return { state, now, boot, read, transport, calls, context, predecessor, plan, security };
}

async function bootstrapRecoveryFixture() {
  const f = await stagedFixture();
  const { bootstrapInventory } = await import("../../scripts/infra/company-development.mjs");
  f.transport.assignments = [];
  f.transport.defender = { properties: { isEnabled: false } };
  f.transport.predecessorDeployment.properties.provisioningState = "Failed";
  f.predecessor.completed = false;
  f.plan.inputs.stage = "bootstrap"; f.plan.inputs.mode = "reviewed-reentry";
  delete f.context.security;
  f.context.deploymentName = f.predecessor.deploymentName;
  f.context.inspection = f.state.inspectDeployment(f.read, f.context.deploymentName);
  f.plan.inventory = { baseline: f.context.baseline, expected: bootstrapInventory() };
  f.transport.stagePermissions = [{ actions: ["*/read", ...new Set(bootstrapInventory().map((r) => `${r.type}/write`)), "Microsoft.Resources/deployments/write", "Microsoft.Resources/deployments/whatIf/action"], notActions: [], dataActions: [], notDataActions: [] }];
  f.plan.whatIf = { changes: bootstrapInventory().map(({ id, type }) => ({ resourceId: id, changeType: "NoChange", after: { type } })) };
  return f;
}

test("typed completion basis supports only separately authorized continuation and manual grant preparation", async () => {
  const { auditCompletion } = await import("../../scripts/infra/company-development-completion.mjs");
  const { authenticateCompletion, completionBasis, original } = await import("../../scripts/infra/company-development-completion-validation.mjs");
  const audit = completionFixture();
  try {
    const receipt = auditCompletion(audit.options()).receipt;
    // Unit fixture marker only: the real immutable-archive loader has its own
    // metadata/digest/normal-workflow tamper tests. No marker survives JSON.
    const ref = { kind: "bootstrap-completion-receipt-ref", stage: "bootstrap", mode: "audit-readonly",
      sha: audit.revision, runId: "9001", runAttempt: "1", artifactId: "9002", receiptSha256: "a".repeat(64), archiveSha256: "b".repeat(64) };
    const basis = completionBasis(authenticateCompletion(receipt, ref));
    const f = await stagedFixture(audit.snapshot.resources);
    f.now = audit.now;
    f.predecessor.applyClientId = original.writerClientId;
    f.predecessor.deploymentName = original.deploymentName;
    f.transport.predecessorDeployment.name = original.deploymentName;
    f.context.predecessor = ref;
    const result = f.state.assessStage(f.read, f.plan, basis, f.now, "apply");
    assert.equal(result.action, "submit"); // existing separate apply gate ONLY
    assert.equal(result.receiptIsNotDeploymentAuthorization, true);
    assert.equal("completed" in basis, false);
    for (const mutate of [
      () => { delete f.context.security.writerRemovalReference; },
      () => { f.transport.permissions[0].actions.push("Microsoft.Storage/storageAccounts/write"); },
      () => { f.transport.permissions[0].actions.push("*"); },
      () => { f.transport.defender.properties.isEnabled = false; },
      () => { f.transport.assignments.pop(); },
      () => { delete f.context.security.functionalTest.executionAuthorizationReference; },
      () => { f.predecessor.applyClientId = original.previewClientId; },
      () => { f.plan.inputs.stage = "bootstrap"; },
    ]) {
      const context = structuredClone(f.context), transport = structuredClone(f.transport), caller = f.predecessor.applyClientId;
      mutate();
      assert.throws(() => f.state.assessStage(f.read, f.plan, basis, f.now, "apply"));
      Object.assign(f.context, context); Object.assign(f.transport, transport);
      f.predecessor.applyClientId = caller; f.plan.inputs.stage = "continuation";
    }
    assert.throws(() => f.state.assessStage(f.read, f.plan, JSON.parse(JSON.stringify(basis)), f.now, "apply"), /Authenticated/i);
    const { stageInventory, loadStagePredecessor } = await import("../../scripts/infra/company-development.mjs");
    assert.equal(stageInventory(f.plan.inputs).predecessor.kind, ref.kind);
    assert.throws(() => stageInventory({ ...f.plan.inputs, stage: "bootstrap", mode: "reviewed-reentry" }), /bootstrap|continuation/i);
    await assert.rejects(loadStagePredecessor({ predecessor: ref }, "bootstrap"), /bootstrap/i);
    const { prepareHumanGrants } = await controls();
    const commands = prepareHumanGrants(bootstrapRead(audit.snapshot.resources), original.deploymentName, basis);
    assert.equal(commands.assignments.length, 4);
    assert.equal(commands.commands.length, 4);
    assert.throws(() => prepareHumanGrants(bootstrapRead(audit.snapshot.resources), original.deploymentName, receipt), /Legacy/i);
    const changes = { changes: [{ resourceId: audit.snapshot.resources[0].id, changeType: "Modify", after: { type: audit.snapshot.resources[0].type } }] };
    assert.throws(() => f.state.validateStageChanges(changes, f.plan, false), /bootstrap|outside exact/i);
  } finally { rmSync(audit.root, { recursive: true, force: true }); }
});

let verificationSources;
after(() => { if (verificationSources) rmSync(verificationSources.root, { recursive: true, force: true }); });
async function verificationRecoveryFixture(from, to, root) {
  const f = await bootstrapRecoveryFixture();
  const { committedSource, armParameters } = await import("../../scripts/infra/company-development.mjs");
  if (!from) {
    if (!verificationSources) {
      verificationSources = sourceFixture();
      verificationSources.from = committedSource(verificationSources.revision, verificationSources.root);
      writeFileSync(join(verificationSources.root, "scripts/infra/company-development-apply.mjs"), "// synthetic verifier correction\n");
      verificationSources.git("add", "--", "scripts/infra/company-development-apply.mjs");
      verificationSources.git("commit", "--quiet", "--no-verify", "-m", "Synthetic verifier correction");
      verificationSources.to = committedSource(verificationSources.git("rev-parse", "HEAD"), verificationSources.root);
    }
    ({ from, to, root } = verificationSources);
  }
  from = structuredClone(from); to = structuredClone(to);
  // Exercise the public engine against a real immutable synthetic Git history,
  // including on shallow CI checkouts. No private function/hash bypass.
  f.execute = (args) => {
    const previous = process.cwd();
    try { process.chdir(root); return f.state.executeReviewedStage(args); }
    finally { process.chdir(previous); }
  };
  const prior = f.predecessor;
  Object.assign(prior, { commitSha: from.revision, sourceSha256: from.sha256, sourceFiles: from.files,
    deploymentName: `companydev-bootstrap-${from.revision.slice(0, 12)}` });
  f.plan.template = JSON.parse(fixture().files["template.json"]);
  f.plan.parameters = armParameters(input);
  Object.assign(prior, { templateSha256: hash(encode(f.plan.template)), parametersSha256: hash(encode(f.plan.parameters)) });
  Object.assign(f.plan.evidence, { commitSha: to.revision, sourceSha256: to.sha256, sourceFiles: to.files,
    templateSha256: prior.templateSha256, parametersSha256: prior.parametersSha256 });
  Object.assign(f.context.predecessor, { sha: from.revision });
  f.context.deploymentName = prior.deploymentName;
  const replay = await bootstrapOutputReadFixture();
  replay.rows[prior.deploymentName] = replay.rows[replay.root]; delete replay.rows[replay.root];
  f.operations = replay.rows;
  for (const rows of Object.values(f.operations)) for (const op of rows) {
    op.properties.timestamp = "2026-10-25T20:00:00.000Z";
    op.id = op.id.replace(replay.root, prior.deploymentName);
  }
  f.deployments = [prior.deploymentName, replay.foundation, replay.stamp].map((name) => ({
    name, id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${name}`,
    properties: { provisioningState: "Succeeded", timestamp: "2026-10-25T20:00:01.000Z", correlationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
  }));
  f.transport.predecessorDeployment = f.deployments[0];
  const baseRead = f.read;
  f.read = (args) => {
    if (args[0] === "deployment" && args[1] === "operation") return f.operations[args[args.indexOf("--name") + 1]];
    if (args[0] === "deployment" && args[2] === "show") {
      const found = f.deployments.find((d) => d.name === args[args.indexOf("--name") + 1]);
      if (found) return found;
    }
    return baseRead(args);
  };
  f.context.inspection = f.state.inspectDeployment(f.read, prior.deploymentName);
  f.context.originalSuccess = structuredClone(f.deployments);
  f.context.sourceTransition = { kind: "bootstrap-verification-only", version: 1, from, to, ownerReviewReference: input.changeFreeze };
  const executionRun = { revision: from.revision, runId: prior.runId, runAttempt: prior.runAttempt };
  const originalWhatIf = { changes: f.plan.whatIf.changes.map((c) => ({ ...c, changeType: "Create" })) };
  const reviewed = { stage: "bootstrap", mode: "initial", evidenceVersion: 2, sha: from.revision,
    runId: "122", runAttempt: "1", artifactId: "455", inventorySha256: "c".repeat(64), evidenceSha256: "d".repeat(64),
    sourceSha256: from.sha256, templateSha256: prior.templateSha256, parametersSha256: prior.parametersSha256,
    whatIfSha256: hash(encode(originalWhatIf)) };
  f.originalFiles = {
    "checkpoint.json": encode(prior), "template.json": encode(f.plan.template), "fresh-what-if.json": encode(originalWhatIf),
    "reviewed-inputs.json": encode(reviewed),
    "submission.json": encode({ url: `https://management.azure.com${f.deployments[0].id}?api-version=2025-04-01`,
      bodySha256: hash(JSON.stringify({ properties: { mode: "Incremental", template: f.plan.template, parameters: f.plan.parameters.parameters } })), executionRun, reviewed }),
    "result.json": encode({ state: "Succeeded", deploymentId: f.deployments[0].id, executionRun, reviewed }),
  };
  f.archive = execFileSync("python3", ["-c", "import sys,json,zipfile,io; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); [(z.writestr(k,v)) for k,v in json.load(sys.stdin).items()]; z.close(); sys.stdout.buffer.write(b.getvalue())"], { input: JSON.stringify(f.originalFiles) });
  Object.assign(f.context.predecessor, { checkpointSha256: hash(f.originalFiles["checkpoint.json"]), archiveSha256: hash(f.archive) });
  f.run = { id: Number(prior.runId), run_attempt: 1, head_sha: from.revision, head_branch: "main",
    event: "workflow_dispatch", status: "completed", conclusion: "failure",
    path: ".github/workflows/company-development-foundation-apply.yml",
    repository: { full_name: "keyforta/keyforta-property" }, head_repository: { full_name: "keyforta/keyforta-property" },
    created_at: "2026-10-25T19:59:00.000Z", updated_at: "2026-10-25T20:01:00.000Z" };
  f.artifact = { id: 456, expired: false, digest: `sha256:${hash(f.archive)}`,
    name: `company-dev-foundation-bootstrap-initial-v2-apply-${from.revision}-${prior.runId}-1`,
    workflow_run: { id: Number(prior.runId), head_sha: from.revision } };
  f.authenticate = () => {
    f.predecessor = (f.controls.assertRecoveryArtifact)(f.originalFiles, f.run, f.artifact, f.context.predecessor, hash(f.archive));
  };
  f.controls = await controls();
  f.authenticate();
  return f;
}

test("verification-only transition replays the successful ARM / incomplete checkpoint source-binding block", async () => {
  const f = await verificationRecoveryFixture();
  let previews = 0, puts = 0;
  const original = structuredClone(f.predecessor);
  const result = f.execute({
    plan: f.plan, predecessor: f.predecessor, read: f.read, now: f.now,
    preview: () => { previews++; return f.plan.whatIf; }, submit: () => { puts++; },
  });
  assert.equal(result.action, "noop");
  assert.equal(previews, 1); assert.equal(puts, 0);
  assert.deepEqual(f.predecessor, original);
  assert.equal(f.predecessor.completed, false);
  assert.equal(Object.values(f.operations).flat().length, 17);
});

test("verification-only transition rejects every origin/state mismatch before preview and never submits", async () => {
  const mutations = [
    (f) => { delete f.context.sourceTransition; },
    (f) => { f.context.sourceTransition.version = 2; },
    (f) => { f.context.sourceTransition.kind = "ignore-source"; },
    (f) => { f.context.sourceTransition.allowSourceDrift = true; },
    (f) => { delete f.context.sourceTransition.ownerReviewReference; },
    (f) => { f.context.sourceTransition.from.revision = "f".repeat(40); },
    (f) => { f.context.sourceTransition.to.revision = "f".repeat(40); },
    (f) => { f.context.sourceTransition.from.files[0].sha256 = "f".repeat(64); },
    (f) => { f.context.sourceTransition.to.sha256 = "f".repeat(64); },
    (f) => { f.plan.evidence.sourceFiles = []; },
    (f) => { f.plan.evidence.templateSha256 = "f".repeat(64); },
    (f) => { f.plan.evidence.parametersSha256 = "f".repeat(64); },
    (f) => { f.plan.parameters.parameters.vnetCidr.value = "10.85.0.0/24"; },
    (f) => { f.plan.template.resources[0].resourceGroup = "foreign"; },
    (f) => { f.plan.inventory.expected = f.plan.inventory.expected.slice(1); },
    (f) => { f.context.predecessor.artifactId = "999"; },
    (f) => { f.context.predecessor.archiveSha256 = "f".repeat(64); },
    (f) => { f.predecessor.completed = true; },
    (f) => { f.predecessor.resources[0].properties.changed = true; },
    (f) => { f.predecessor = structuredClone(f.predecessor); },
    (f) => { f.plan.inputs.mode = "initial"; },
    (f) => { f.plan.inputs.stage = "continuation"; },
    (f) => { f.context.security = {}; },
    (f) => { f.transport.defender.properties.isEnabled = true; },
    (f) => { f.transport.assignments = [{ scope: f.boot.find((r) => r.type.endsWith("/containers")).id }]; },
    (f) => { f.context.approvedChanges = [{ changeType: "Modify" }]; },
    (f) => { f.context.baseline.pop(); },
    (f) => { f.transport.resources.pop(); },
    (f) => { f.transport.resources.push({ id: "/foreign", type: "Microsoft.Storage/storageAccounts", properties: {} }); },
    (f) => { f.transport.resources[0].properties.adminUserEnabled = true; },
    (f) => { f.transport.resources.find((r) => r.type.endsWith("/userAssignedIdentities")).properties.principalId = "ffffffff-ffff-4fff-8fff-ffffffffffff"; },
    ...["Failed", "Canceled", "Running", "Unknown"].map((s) => (f) => { f.deployments[0].properties.provisioningState = s; }),
    (f) => { f.deployments[1].properties.provisioningState = "Failed"; },
    (f) => { f.deployments[0].properties.timestamp = "2026-10-26T20:00:00Z"; },
    (f) => { f.deployments[1].properties.correlationId = "ffffffff-ffff-4fff-8fff-ffffffffffff"; },
    (f) => { f.operations["stamp-keyforta-cdev"].pop(); f.operations["stamp-keyforta-cdev"][0].properties.provisioningState = "Failed"; },
    (f) => { f.operations["stamp-keyforta-cdev"][0].properties.timestamp = "2026-10-26T20:00:00Z"; },
    (f) => { f.transport.extraDeployments = [{ name: "foreign", properties: { provisioningState: "Succeeded" } }]; },
    (f) => { f.context.deploymentName = `companydev-bootstrap-${f.plan.evidence.commitSha.slice(0, 12)}`; },
  ];
  for (const [i, mutate] of mutations.entries()) {
    const f = await verificationRecoveryFixture(); mutate(f);
    let previews = 0, puts = 0;
    assert.throws(() => f.execute({ plan: f.plan, predecessor: f.predecessor, read: f.read,
      preview: () => { previews++; return f.plan.whatIf; }, submit: () => { puts++; } }), i === 0 ? /Completed stage sourceSha256 drift/ : undefined, `mutation ${i}`);
    assert.equal(previews, 0, `mutation ${i}`); assert.equal(puts, 0, `mutation ${i}`);
  }
});

test("verification-only artifact parser rejects forged/stale metadata, origin and success bindings", async () => {
  for (const mutate of [
    (f) => { f.run.conclusion = "success"; },
    (f) => { f.run.status = "in_progress"; },
    (f) => { f.run.head_sha = "f".repeat(40); },
    (f) => { f.run.run_attempt = 2; },
    (f) => { f.run.repository.full_name = "foreign/repo"; },
    (f) => { f.run.head_repository.full_name = "foreign/repo"; },
    (f) => { f.run.created_at = ""; },
    (f) => { f.artifact.expired = true; },
    (f) => { f.artifact.digest = `sha256:${"f".repeat(64)}`; },
    (f) => { f.artifact.workflow_run.id = 999; },
    (f) => { f.artifact.name += "-foreign"; },
    (f) => { f.originalFiles["bootstrap-state.json"] = "{}"; },
    (f) => { f.originalFiles["template.json"] = "{}"; },
    (f) => { const v = JSON.parse(f.originalFiles["result.json"]); v.state = "Failed"; f.originalFiles["result.json"] = encode(v); },
    (f) => { const v = JSON.parse(f.originalFiles["submission.json"]); v.executionRun.revision = "f".repeat(40); f.originalFiles["submission.json"] = encode(v); },
    (f) => { const v = JSON.parse(f.originalFiles["checkpoint.json"]); v.sourceTransition = {}; f.originalFiles["checkpoint.json"] = encode(v); f.context.predecessor.checkpointSha256 = hash(f.originalFiles["checkpoint.json"]); },
  ]) {
    const f = await verificationRecoveryFixture(); mutate(f);
    assert.throws(f.authenticate);
  }
});

test("verification-only fresh what-if must be diagnostic-free NoChange; post-preview drift never submits", async () => {
  for (const fields of [{}, { diagnostics: null }, { potentialChanges: null },
    { diagnostics: null, potentialChanges: null }, { diagnostics: [], potentialChanges: [] }]) {
    const f = await verificationRecoveryFixture();
    const fresh = { ...structuredClone(f.plan.whatIf), status: "Succeeded", error: null, ...fields };
    let puts = 0;
    const decision = f.execute({ plan: f.plan, predecessor: f.predecessor, read: f.read,
      preview: () => fresh, submit: () => { puts++; } });
    assert.equal(decision.action, "noop");
    assert.equal(puts, 0);
  }
  for (const change of [
    (p) => { p.changes[0].changeType = "Create"; },
    (p) => { p.changes[0].changeType = "Modify"; },
    (p) => { p.changes[0].changeType = "Delete"; },
    (p) => { p.changes[0].changeType = "Ignore"; },
    (p) => { p.changes[0].delta = [{ path: "x", propertyChangeType: "Modify" }]; },
    (p) => { p.diagnostics = [{ message: "unresolved" }]; },
    (p) => { p.potentialChanges = [{}]; },
    ...["diagnostics", "potentialChanges"].flatMap((key) => [false, 0, "", {}, "unknown", [null]].map((value) => (p) => { p[key] = value; })),
    (p) => { p.status = "Failed"; },
    (p) => { p.error = { code: "ProviderFailure", message: "synthetic provider failure" }; },
    (p) => { p.changes.push({ resourceId: "/foreign", changeType: "NoChange", after: { type: "Unknown" } }); },
    (p) => { p.changes.pop(); },
  ]) {
    const f = await verificationRecoveryFixture();
    const fresh = structuredClone(f.plan.whatIf); change(fresh);
    let puts = 0;
    assert.throws(() => f.execute({ plan: f.plan, predecessor: f.predecessor, read: f.read,
      preview: () => fresh, submit: () => { puts++; } }));
    assert.equal(puts, 0);
  }
  // Genuine CLI response shape: null collections do not hide the independent
  // three-Modify/five-Delete-property blocker. Synthetic values only.
  {
    const f = await verificationRecoveryFixture();
    const fresh = { ...structuredClone(f.plan.whatIf), status: "Succeeded", error: null, diagnostics: null, potentialChanges: null };
    for (const [index, count] of [[0, 2], [1, 1], [2, 2]]) {
      fresh.changes[index].changeType = "Modify";
      fresh.changes[index].delta = Array.from({ length: count }, (_, n) => ({ path: `properties.synthetic${n}`, propertyChangeType: "Delete", before: false, after: null }));
    }
    let puts = 0;
    assert.throws(() => f.execute({ plan: f.plan, predecessor: f.predecessor, read: f.read,
      preview: () => fresh, submit: () => { puts++; } }), /exclusively NoChange without property deltas/);
    assert.equal(puts, 0);
  }
  const f = await verificationRecoveryFixture();
  let puts = 0;
  assert.throws(() => f.execute({ plan: f.plan, predecessor: f.predecessor, read: f.read,
    preview: () => { f.deployments[1].properties.timestamp = "2026-10-25T20:00:02Z"; return f.plan.whatIf; },
    submit: () => { puts++; } }));
  assert.equal(puts, 0);
});

test("verification-only immutable source boundary rejects workflows, Bicep, parser, auth and other executable changes", async () => {
  const { committedSource } = await import("../../scripts/infra/company-development.mjs");
  const script = resolve("scripts/infra/company-development.mjs");
  for (const changed of [
    ".github/workflows/company-development-foundation.yml", "infra/bicep/company-development.bicep",
    "scripts/verify/company-foundation-parser.py", "packages/auth/foreign.mjs", "package.json",
  ]) {
    const fixture = sourceFixture();
    try {
      const from = committedSource(fixture.revision, fixture.root);
      writeFileSync(join(fixture.root, "scripts/infra/company-development-apply.mjs"), "// synthetic verifier change\n");
      // git hash-object permits an exact committed tree addition without
      // creating directories or executing any fixture source.
      const blob = execFileSync("git", ["-C", fixture.root, "hash-object", "-w", "--stdin"], { input: "// forbidden executable change\n", encoding: "utf8" }).trim();
      fixture.git("add", "--", "scripts/infra/company-development-apply.mjs");
      fixture.git("update-index", "--add", "--cacheinfo", "100644", blob, changed);
      fixture.git("commit", "--quiet", "--no-verify", "-m", "Synthetic forbidden transition");
      const to = committedSource(fixture.git("rev-parse", "HEAD"), fixture.root);
      const transition = { kind: "bootstrap-verification-only", version: 1, from, to, ownerReviewReference: input.changeFreeze };
      const evidence = { commitSha: to.revision, sourceSha256: to.sha256, sourceFiles: to.files };
      const predecessor = { commitSha: from.revision, sourceSha256: from.sha256, sourceFiles: from.files };
      const result = spawnSync(process.execPath, ["--input-type=module", "-e",
        `import {assertVerificationSources} from ${JSON.stringify(script)}; assertVerificationSources(${JSON.stringify(transition)},${JSON.stringify(evidence)},${JSON.stringify(predecessor)});`],
      { cwd: fixture.root, encoding: "utf8" });
      assert.equal(result.status, 1, changed);
      assert.match(result.stderr, /outside approved verification-only|Workflow\/Bicep\/parser contract changed/, changed);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  }
});

test("verification-only source history works with unchanged shallow workflow checkout and fixed read-only fetch", async () => {
  const { committedSource } = await import("../../scripts/infra/company-development.mjs");
  const fixture = sourceFixture(), shallow = sourceFixture();
  const actualGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  try {
    fixture.git("branch", "-M", "main");
    const from = committedSource(fixture.revision, fixture.root);
    writeFileSync(join(fixture.root, "scripts/infra/company-development-apply.mjs"), "// synthetic verifier correction\n");
    fixture.git("add", "--", "scripts/infra/company-development-apply.mjs");
    fixture.git("commit", "--quiet", "--no-verify", "-m", "Synthetic shallow verifier transition");
    const to = committedSource(fixture.git("rev-parse", "HEAD"), fixture.root);
    rmSync(shallow.root, { recursive: true, force: true });
    execFileSync(actualGit, ["clone", "--quiet", "--depth=1", `file://${fixture.root}`, shallow.root]);
    const shim = join(shallow.root, "git");
    writeFileSync(shim, `#!/usr/bin/env node
const fs=require("node:fs"),cp=require("node:child_process"),a=process.argv.slice(2);
let args=a;
if(a.includes("fetch")){
 if(JSON.stringify(a)!==JSON.stringify(["-c","credential.helper=!gh auth git-credential","fetch","--no-tags","--unshallow","https://github.com/keyforta/keyforta-property.git","main"]))process.exit(9);
 fs.writeFileSync("fetch-proof",JSON.stringify(a));
 args=["fetch","--no-tags","--unshallow",${JSON.stringify(`file://${fixture.root}`)},"main"];
}
const r=cp.spawnSync(${JSON.stringify(actualGit)},args,{stdio:"inherit"});process.exit(r.status??1);
`);
    chmodSync(shim, 0o700);
    const transition = { kind: "bootstrap-verification-only", version: 1, from, to, ownerReviewReference: input.changeFreeze };
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import {assertVerificationSources} from ${JSON.stringify(resolve("scripts/infra/company-development.mjs"))};
      assertVerificationSources(${JSON.stringify(transition)},${JSON.stringify({ commitSha: to.revision, sourceSha256: to.sha256, sourceFiles: to.files })},${JSON.stringify({ commitSha: from.revision, sourceSha256: from.sha256, sourceFiles: from.files })});`],
    { cwd: shallow.root, env: { ...process.env, PATH: `${shallow.root}:${process.env.PATH}` }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(join(shallow.root, "fetch-proof"), "utf8"), /keyforta-property\.git/);
    assert.equal(execFileSync(actualGit, ["-C", shallow.root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), to.revision);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(shallow.root, { recursive: true, force: true });
  }
});

test("PR161 output evaluation without a target is valid only when successful; Create targets remain exact", async () => {
  const f = await stagedFixture();
  const { readBootstrapState } = await controls();
  const output = { operationId: "08585205573948283761", properties: {
    provisioningOperation: "EvaluateDeploymentOutput", provisioningState: "Succeeded",
    timestamp: "2026-10-25T20:00:00Z", duration: "PT0.003S", statusCode: "OK",
  } };
  const read = (operation) => (args) => args[0] === "deployment"
    ? [...bootstrapRead(f.boot)(args), structuredClone(operation)] : bootstrapRead(f.boot)(args);
  assert.equal(readBootstrapState(read(output), "companydev-bootstrap-synthetic").resources.length, 7);
  for (const properties of [
    { ...output.properties, provisioningState: "Failed" },
    { ...output.properties, provisioningOperation: "Unknown" },
    { provisioningState: "Succeeded", provisioningOperation: "Create" },
    { provisioningState: "Succeeded", provisioningOperation: "Create", targetResource: { id: "/foreign", resourceType: "Microsoft.Storage/storageAccounts" } },
  ]) assert.throws(() => readBootstrapState(read({ properties }), "companydev-bootstrap-synthetic"));
});

for (const completed of [false, true]) {
  test(`PR161 bootstrap caller replacement stops before preview or submit (completed=${completed})`, async () => {
    const f = await bootstrapRecoveryFixture();
    f.predecessor.completed = completed;
    f.transport.predecessorDeployment.properties.provisioningState = completed ? "Succeeded" : "Failed";
    f.context.inspection = f.state.inspectDeployment(f.read, f.context.deploymentName);
    Object.assign(f.plan.evidence, {
      sourceSha256: f.predecessor.sourceSha256, templateSha256: f.predecessor.templateSha256,
      parametersSha256: f.predecessor.parametersSha256,
    });
    const replacement = "99999999-9999-4999-8999-999999999999";
    const read = (args) => args[0] === "account"
      ? { ...f.read(args), user: { type: "servicePrincipal", name: replacement } } : f.read(args);
    let previews = 0, puts = 0;
    assert.throws(() => f.state.executeReviewedStage({
      plan: f.plan, predecessor: f.predecessor, read, now: f.now,
      preview: () => { previews++; return f.plan.whatIf; }, submit: () => { puts++; },
    }), /original.*caller|caller.*changed/i);
    assert.equal(previews, 0); assert.equal(puts, 0);
  });
}

test("PR161 protected scopes use effective closed permissions, including resource-only lifecycle mutation", async () => {
  const f = await stagedFixture();
  const scope = f.boot.find((r) => r.type.endsWith("/storageAccounts")).id;
  const check = (grant) => f.state.assertWriterRevoked((args) => {
    if (args[0] === "rest" && args[args.indexOf("--url") + 1].toLowerCase().includes(`${scope}/providers/Microsoft.Authorization/permissions?`.toLowerCase())) return { value: [grant] };
    return f.read(args);
  }, f.predecessor, "apply", f.context.security);
  const base = { actions: ["*/read"], notActions: [], dataActions: [], notDataActions: [] };
  assert.doesNotThrow(() => check(f.transport.stagePermissions[0]), "Exact inherited continuation operations remain allowed");
  for (const action of [
    "Microsoft.Storage/storageAccounts/managementPolicies/write",
    "Microsoft.Storage/storageAccounts/localUsers/write",
    "Microsoft.Storage/storageAccounts/restoreBlobRanges/action", "Microsoft.Unknown/resources/write", "*",
  ]) assert.throws(() => check({ ...base, actions: [...base.actions, action] }), /authority|allowlist/);
  assert.doesNotThrow(() => check({ ...base, actions: [...base.actions, "Microsoft.Storage/storageAccounts/managementPolicies/write"], notActions: ["Microsoft.Storage/storageAccounts/managementPolicies/*"] }));
  assert.doesNotThrow(() => check({ ...base, dataActions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"], notDataActions: ["Microsoft.Storage/*"] }));
  assert.throws(() => check({ ...base, dataActions: ["*"], notDataActions: ["Microsoft.Storage/*"] }), /data/);
  // NotActions is per grant, not a deny that can cancel a separate grant.
  assert.throws(() => f.state.assertWriterRevoked((args) => args[0] === "rest" && args.includes("get")
    ? { value: [{ ...base, actions: ["Microsoft.Storage/storageAccounts/managementPolicies/write"] }, { ...base, notActions: ["*"] }] }
    : f.read(args), f.predecessor), /authority|allowlist/);
});

test("PR161 older failed predecessor cannot resubmit a distinct succeeded current target", async () => {
  const f = await bootstrapRecoveryFixture();
  const currentSha = "f".repeat(40);
  f.plan.evidence.commitSha = currentSha;
  f.transport.deployment = { name: `companydev-bootstrap-${currentSha.slice(0, 12)}`, properties: { provisioningState: "Succeeded" } };
  f.context.targetInspection = f.state.inspectDeployment(f.read, f.transport.deployment.name);
  let puts = 0, previews = 0;
  assert.throws(() => f.state.executeReviewedStage({
    plan: f.plan, predecessor: f.predecessor, read: f.read, now: f.now,
    preview: () => { previews++; return f.plan.whatIf; }, submit: () => { puts++; },
  }), /target.*checkpoint|checkpoint.*target/i);
  assert.equal(puts, 0); assert.equal(previews, 0);
});

test("PR161 completed continuation with missing server and children stops instead of write recovery", async () => {
  const f = await stagedFixture();
  const all = [...f.boot, ...continuationResources(f.state)];
  const complete = { ...f.predecessor, stage: "continuation", deploymentName: f.context.deploymentName,
    completed: true, resources: f.state.projectResources(all),
    templateSha256: f.plan.evidence.templateSha256, parametersSha256: f.plan.evidence.parametersSha256 };
  f.transport.resources = all.filter((r) => !r.type.startsWith("Microsoft.DBforPostgreSQL/"));
  f.context.baseline = f.plan.inventory.baseline = f.state.projectResources(f.transport.resources);
  f.context.predecessor.stage = "continuation";
  f.plan.inputs.mode = "reviewed-reentry";
  f.transport.deployment = { name: f.context.deploymentName, properties: { provisioningState: "Succeeded" } };
  f.context.inspection = f.state.inspectDeployment(f.read, f.context.deploymentName);
  f.plan.whatIf = { changes: f.state.continuationInventory().map(({ id, type }) => ({
    resourceId: id, changeType: type.startsWith("Microsoft.DBforPostgreSQL/") ? "Create" : "NoChange", after: { type },
  })) };
  let puts = 0, previews = 0;
  assert.throws(() => f.state.executeReviewedStage({
    plan: f.plan, predecessor: complete, read: f.read, now: f.now,
    preview: () => { previews++; return f.plan.whatIf; }, submit: () => { puts++; },
  }), /Completed.*inventory|completed.*no-op/i);
  assert.equal(puts, 0); assert.equal(previews, 0);
});

for (const path of ["human grant preparation", "continuation security", "partial bootstrap"]) {
  test(`review fix scoped role CLI compatibility: ${path}`, async () => {
    const f = path === "partial bootstrap" ? await bootstrapRecoveryFixture() : await stagedFixture();
    const scopes = [];
    const compatible = (read) => (args) => {
      if (args[0] === "role") {
        if (args.includes("--scope") && args.includes("--all")) throw new Error("group or scope are not required when --all is used");
        assert.ok(args.includes("--scope") && args.includes("--include-inherited"), "Keep exact scope and inherited visibility");
        scopes.push(args[args.indexOf("--scope") + 1]);
      }
      return read(args);
    };
    if (path === "human grant preparation") {
      const { prepareHumanGrants } = await controls();
      assert.equal(prepareHumanGrants(compatible(bootstrapRead(f.boot)), "companydev-bootstrap-synthetic", f.predecessor).assignments.length, 4);
    } else if (path === "continuation security") {
      assert.doesNotThrow(() => f.state.readSecurity(compatible(f.read), f.context.security, f.predecessor));
    } else assert.equal(f.state.assessStage(compatible(f.read), f.plan, f.predecessor, f.now).action, "submit");
    assert.ok(scopes.some((s) => s.includes("/registries/")));
    assert.ok(scopes.some((s) => s.includes("/containers/")), "Container requires its own scoped read");
  });
}

test("review fix partial bootstrap rejects container-only human grant before preview or submit", async () => {
  const f = await bootstrapRecoveryFixture();
  const container = f.boot.find((r) => r.type.endsWith("/containers"));
  const api = f.boot.find((r) => r.id.endsWith("-api"));
  f.transport.assignments = [{
    id: `${container.id}/providers/Microsoft.Authorization/roleAssignments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    scope: container.id, principalId: api.properties.principalId, principalType: "ServicePrincipal",
    roleDefinitionId: `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe`,
  }];
  const accountId = f.boot.find((r) => r.type.endsWith("/storageAccounts")).id;
  assert.deepEqual(f.read(["role", "assignment", "list", "--scope", accountId, "--include-inherited"]), [], "Account scope must not see descendant container grants");
  f.calls.length = 0;
  let previews = 0, submits = 0;
  assert.throws(() => f.state.executeReviewedStage({
    plan: f.plan, predecessor: f.predecessor, read: f.read, now: f.now,
    preview: () => { previews++; return f.plan.whatIf; }, submit: () => { submits++; },
  }), /Bootstrap grants already exist/);
  assert.equal(previews, 0); assert.equal(submits, 0);
  assert.ok(f.calls.some((a) => a[0] === "role" && a[a.indexOf("--scope") + 1].toLowerCase() === container.id.toLowerCase()));
  f.transport.assignments = [];
  for (const failure of [undefined, new Error("403 missing container role visibility")]) {
    const read = (a) => {
      if (a[0] === "role" && a[a.indexOf("--scope") + 1].toLowerCase() === container.id.toLowerCase()) {
        if (failure instanceof Error) throw failure;
        return failure;
      }
      return f.read(a);
    };
    assert.throws(() => f.state.executeReviewedStage({
      plan: f.plan, predecessor: f.predecessor, read, now: f.now,
      preview: () => { previews++; return f.plan.whatIf; }, submit: () => { submits++; },
    }), /visibility/);
    assert.equal(previews, 0); assert.equal(submits, 0);
  }
});

test("owner-confirmed synthetic handoff is correlated, fresh, non-tag-authoritative and never reads blob data", async () => {
  const f = await stagedFixture();
  const checked = f.state.validateFunctionalTest(f.context.security.functionalTest, f.security, f.now);
  assert.equal(checked.internalTopology, "UNVERIFIED");
  assert.equal(checked.automaticDataAdmission, false);
  for (const change of [
    { result: "Error" }, { result: "Not scanned" }, { result: "Malicious" }, { owner: "other" },
    { observationReference: "" }, { executionAuthorizationReference: "" }, { readableSecuritySha256: "0".repeat(64) },
    { storageId: "foreign" }, { containerId: "foreign" },
    { scanTime: "2026-10-25T20:09:00.000Z" }, { scanTime: "2026-10-25T22:00:00.000Z" },
    { observedAt: "2026-10-24T20:13:00.000Z" },
    { blob: { ...f.context.security.functionalTest.blob, etag: undefined } },
    { blob: { ...f.context.security.functionalTest.blob, contentSha256: "" } },
    { blob: { ...f.context.security.functionalTest.blob, name: "../foreign.txt" } },
  ]) assert.throws(() => f.state.validateFunctionalTest({ ...f.context.security.functionalTest, ...change }, f.security, f.now));
  assert.throws(() => f.state.validateFunctionalTest(undefined, f.security, f.now));
  assert.ok(f.calls.every((a) => a[0] !== "storage"), "Workflow must never perform blob/tag/data operations");
});

test("positive human handoff reaches continuation submission; completed replay is verified no-PUT and drift blocks", async () => {
  const f = await stagedFixture();
  let puts = 0, previews = 0;
  const fresh = { changes: f.state.continuationInventory().map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })) };
  f.plan.whatIf = fresh;
  const result = f.state.executeReviewedStage({
    plan: f.plan, predecessor: f.predecessor, read: f.read, now: f.now,
    preview: () => { previews++; return structuredClone(fresh); }, submit: () => { puts++; },
  });
  assert.equal(result.action, "submitted");
  assert.equal(puts, 1); assert.equal(previews, 1);
  assert.equal(result.functionalTest.internalTopology, "UNVERIFIED");
  const runtime = continuationResources(f.state);
  f.transport.resources = [...f.boot, ...runtime];
  const complete = { ...f.predecessor, stage: "continuation", deploymentName: f.context.deploymentName, resources: f.state.projectResources(f.transport.resources), completed: true, templateSha256: f.plan.evidence.templateSha256, parametersSha256: f.plan.evidence.parametersSha256 };
  f.context.baseline = complete.resources;
  f.context.predecessor.stage = "continuation";
  f.plan.inputs.mode = "reviewed-reentry";
  f.plan.inventory.baseline = complete.resources;
  f.plan.whatIf = { changes: f.state.continuationInventory().map(({ id, type }) => ({ resourceId: id, changeType: "NoChange", after: { type } })) };
  f.transport.deployment = { name: f.context.deploymentName, properties: { provisioningState: "Succeeded" } };
  f.context.inspection = f.state.inspectDeployment(f.read, f.context.deploymentName);
  assert.equal(f.state.executeReviewedStage({ plan: f.plan, predecessor: complete, read: f.read, now: f.now, preview: () => f.plan.whatIf, submit: () => { puts++; } }).action, "noop");
  assert.equal(puts, 1);
  f.plan.evidence.commitSha = "f".repeat(40); // new commit, identical complete dependencies/payload
  assert.equal(f.state.executeReviewedStage({ plan: f.plan, predecessor: complete, read: f.read, now: f.now, preview: () => f.plan.whatIf, submit: () => { puts++; } }).action, "noop");
  assert.equal(puts, 1);
  f.transport.resources.at(-1).properties.unreviewed = true;
  assert.throws(() => f.state.executeReviewedStage({ plan: f.plan, predecessor: complete, read: f.read, now: f.now, preview: () => f.plan.whatIf, submit: () => { puts++; } }));
  assert.equal(puts, 1);
});

test("v3 recovery/continuation remove freeze only; inspection and security handoff remain mandatory", async () => {
  const recovery = await bootstrapRecoveryFixture();
  recovery.plan.inputs.evidenceVersion = 3;
  delete recovery.plan.inputs.changeFreeze;
  delete recovery.context.freezeReference;
  assert.doesNotThrow(() => recovery.state.assessStage(recovery.read, recovery.plan, recovery.predecessor, recovery.now));
  const ref = recovery.context.inspectionReference;
  delete recovery.context.inspectionReference;
  assert.throws(() => recovery.state.assessStage(recovery.read, recovery.plan, recovery.predecessor, recovery.now), /inspection/i);
  recovery.context.inspectionReference = ref;
  recovery.context.freezeReference = ref;
  assert.throws(() => recovery.state.assessStage(recovery.read, recovery.plan, recovery.predecessor, recovery.now), /obsolete/i);
  const f = await stagedFixture();
  f.plan.inputs.evidenceVersion = 3; delete f.plan.inputs.changeFreeze; delete f.context.freezeReference;
  assert.doesNotThrow(() => f.state.assessStage(f.read, f.plan, { ...f.predecessor, version: 3 }, f.now));
  delete f.context.security.writerRemovalReference;
  assert.throws(() => f.state.assessStage(f.read, f.plan, f.predecessor, f.now));
});

test("continuation blocks missing/changed security, grants, writer rights and foreign/recreated predecessor before PUT", async () => {
  for (const mutate of [
    (f) => { delete f.context.security.functionalTest; },
    (f) => { f.transport.defender.properties.malwareScanning.onUpload.capGBPerMonth = 99; },
    (f) => { f.transport.defender.properties.malwareScanning.operationStatus = { code: "Failure" }; },
    (f) => { f.transport.scanner.identity.tenantId = "foreign"; },
    (f) => { f.transport.assignments.pop(); },
    (f) => { f.transport.assignments[0].scope = `/subscriptions/${subscriptionId}`; },
    (f) => { f.transport.assignments[0].principalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; },
    (f) => { f.transport.permissions[0].actions.push("Microsoft.Storage/storageAccounts/write"); },
    (f) => { f.transport.permissions[0].actions.push("Microsoft.Authorization/roleAssignments/write"); },
    (f) => { f.transport.permissions[0].dataActions.push("Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"); },
    (f) => { f.predecessor.resources.find((r) => r.type.endsWith("/userAssignedIdentities")).properties.principalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; },
    (f) => { f.context.security.writerRemovalReference = ""; },
  ]) {
    const f = await stagedFixture(); mutate(f); let puts = 0;
    assert.throws(() => f.state.executeReviewedStage({ plan: f.plan, predecessor: f.predecessor, read: f.read, now: f.now, preview: () => ({ changes: [] }), submit: () => { puts++; } }));
    assert.equal(puts, 0);
  }
});

test("reviewed partial re-entry inspects terminal operations, permits only exact delta, stops timeout/unknown/extras", async () => {
  const f = await stagedFixture();
  const first = f.state.continuationInventory()[0];
  f.transport.resources.push({ ...first, properties: { provisioningState: "Succeeded", tags: { approved: "old" } } });
  f.context.baseline = f.state.projectResources(f.transport.resources);
  f.plan.inventory.baseline = f.context.baseline;
  f.plan.inputs.mode = "reviewed-reentry";
  f.plan.evidence.commitSha = "f".repeat(40); // fresh source SHA; inspect OLD failed deployment before a new write
  const partial = { ...f.predecessor, stage: "continuation", deploymentName: f.context.deploymentName, completed: false, resources: f.context.baseline };
  f.context.predecessor.stage = "continuation";
  f.transport.deployment = { name: f.context.deploymentName, properties: { provisioningState: "Failed" } };
  f.context.inspection = f.state.inspectDeployment(f.read, f.context.deploymentName);
  const modify = { resourceId: first.id, changeType: "Modify", before: { type: first.type, properties: { tags: { approved: "old" } } }, after: { type: first.type, properties: { tags: { approved: "new" } } }, delta: [{ path: "properties.tags.approved", propertyChangeType: "Modify", before: "old", after: "new" }] };
  f.context.approvedChanges = [modify];
  f.plan.whatIf = { changes: [modify, ...f.state.continuationInventory().slice(1).map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } }))] };
  let puts = 0;
  const run = () => f.state.executeReviewedStage({ plan: f.plan, predecessor: partial, read: f.read, now: f.now, preview: () => structuredClone(f.plan.whatIf), submit: () => { puts++; } });
  assert.equal(run().action, "submitted"); assert.equal(puts, 1);
  for (const status of ["Running", "Accepted", "Unknown", undefined]) {
    f.transport.deployment.properties.provisioningState = status;
    assert.throws(run); assert.equal(puts, 1);
  }
  f.transport.deployment.properties.provisioningState = "Failed";
  for (const change of ["Delete", "Ignore", "Unsupported"]) {
    f.plan.whatIf.changes[0].changeType = change; assert.throws(run); assert.equal(puts, 1);
  }
  f.plan.whatIf.changes[0].changeType = "Modify";
  f.context.approvedChanges = []; assert.throws(run); assert.equal(puts, 1);
});

test("predecessor checkpoint requires real run/artifact provenance, exact stage/version/attempt and complete hashed dependencies", async () => {
  const f = await stagedFixture();
  const { assertExecutionCheckpoint } = await controls();
  const bytes = encode(f.predecessor);
  const ref = { ...f.context.predecessor, checkpointSha256: hash(bytes) };
  const run = { id: 123, run_attempt: 1, head_sha: sha, head_branch: "main", event: "workflow_dispatch", status: "completed", conclusion: "success", path: ".github/workflows/company-development-foundation-apply.yml", repository: { full_name: "keyforta/keyforta-property" }, head_repository: { full_name: "keyforta/keyforta-property" } };
  const artifact = { id: 456, expired: false, name: `company-dev-foundation-bootstrap-initial-v2-apply-${sha}-123-1`, workflow_run: { id: 123, head_sha: sha } };
  assert.deepEqual(assertExecutionCheckpoint(bytes, run, artifact, ref), f.predecessor);
  // A later job/upload/cleanup failure does not authorize another PUT. Preserve
  // the checkpoint but require actual terminal inventory + fresh NoChange in
  // reviewed re-entry; success is still mandatory for the NEW preview artifact.
  assert.deepEqual(assertExecutionCheckpoint(bytes, { ...run, conclusion: "failure" }, artifact, ref), f.predecessor);
  for (const mutation of [
    { run: { ...run, run_attempt: 2 } }, { run: { ...run, event: "pull_request" } },
    { artifact: { ...artifact, id: 999 } }, { artifact: { ...artifact, expired: true } },
    { ref: { ...ref, stage: "continuation" } }, { ref: { ...ref, checkpointSha256: "0".repeat(64) } },
    { bytes: encode({ ...f.predecessor, version: 1 }) },
    { bytes: encode({ ...f.predecessor, sourceFiles: f.predecessor.sourceFiles.slice(1) }) },
  ]) assert.throws(() => assertExecutionCheckpoint(mutation.bytes ?? bytes, mutation.run ?? run, mutation.artifact ?? artifact,
    mutation.ref ?? (mutation.bytes ? { ...ref, checkpointSha256: hash(mutation.bytes) } : ref)));
});

test("continuation inspects successful predecessor and rejects foreign/unknown ARM history or incomplete bootstrap", async () => {
  for (const mutation of [
    (f) => { f.transport.predecessorDeployment.properties.provisioningState = "Running"; },
    (f) => { f.transport.predecessorDeployment.properties.provisioningState = "Failed"; },
    (f) => { f.transport.predecessorDeployment = null; },
    (f) => { f.transport.extraDeployments.push({ name: "foreign", properties: { provisioningState: "Succeeded" } }); },
    (f) => { f.predecessor.completed = false; },
    (f) => { f.transport.defender.properties.malwareScanning.onUpload.filters = { excludeBlobsWithSuffix: [".txt"] }; },
  ]) {
    const f = await stagedFixture(); mutation(f);
    let puts = 0;
    f.plan.whatIf = { changes: f.state.continuationInventory().map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })) };
    assert.throws(() => f.state.executeReviewedStage({ plan: f.plan, predecessor: f.predecessor, read: f.read, now: f.now, preview: () => f.plan.whatIf, submit: () => { puts++; } }));
    assert.equal(puts, 0);
  }
});

test("exact reviewed service-created security inventory is read and bound, never inferred or deployed by continuation", async () => {
  const f = await stagedFixture();
  const topic = { id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.EventGrid/systemTopics/actual-reviewed-service-topic`,
    type: "Microsoft.EventGrid/systemTopics", properties: { source: f.security.storageId, provisioningState: "Succeeded" } };
  f.transport.resources = [...f.boot, topic];
  f.context.security.resourceInventory = [{ id: topic.id, type: topic.type }];
  f.context.baseline = f.plan.inventory.baseline = f.state.projectResources(f.transport.resources);
  f.plan.inventory.expected.push({ id: topic.id, type: topic.type });
  f.context.security.functionalTest.readableSecuritySha256 = f.state.stateHash(f.state.readSecurity(f.read, f.context.security, f.predecessor));
  f.plan.whatIf = { changes: f.state.continuationInventory().map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })) };
  let puts = 0;
  const execute = () => f.state.executeReviewedStage({ plan: f.plan, predecessor: f.predecessor, read: f.read, now: f.now, preview: () => f.plan.whatIf, submit: () => { puts++; } });
  assert.equal(execute().action, "submitted"); assert.equal(puts, 1);
  topic.properties.source = "foreign"; assert.throws(execute); assert.equal(puts, 1);
  topic.properties.source = f.security.storageId;
  f.plan.whatIf.changes.push({ resourceId: topic.id, changeType: "Create", after: { type: topic.type } });
  assert.throws(execute); assert.equal(puts, 1);
});

test("stage permission readiness checks only documented template operations, rejects broad/security/data writers and does not claim full ACA proof", async () => {
  const f = await stagedFixture();
  const operations = [...new Set(f.state.continuationInventory().map((r) => `${r.type}/write`)), "Microsoft.Resources/deployments/write", "Microsoft.Resources/deployments/whatIf/action", "Microsoft.OperationalInsights/workspaces/sharedKeys/action"];
  const grant = { actions: ["*/read", ...operations], notActions: [], dataActions: [], notDataActions: [] };
  const checked = f.state.readStagePermissionReadiness(() => ({ value: [grant] }), "continuation", "apply");
  assert.equal(checked.acaMinimumPermissionProof, "EXTERNAL_REQUIRED");
  for (const change of [
    { actions: ["*"] }, { actions: [...grant.actions, "Microsoft.Network/*"] },
    { actions: [...grant.actions, "Microsoft.Authorization/roleAssignments/write"] },
    { dataActions: ["*"] }, { actions: ["*/read"] }, { notActions: [operations[0]] },
  ]) assert.throws(() => f.state.readStagePermissionReadiness(() => ({ value: [{ ...grant, ...change }] }), "continuation", "apply"));
  assert.throws(() => f.state.readStagePermissionReadiness(() => ({ value: [] }), "continuation", "apply"));
  assert.throws(() => f.state.readStagePermissionReadiness(() => { throw new Error("403 missing visibility"); }, "continuation", "apply"));
  assert.doesNotThrow(() => f.state.readStagePermissionReadiness(() => ({ value: [{ ...grant, actions: ["*/read", "Microsoft.Resources/deployments/whatIf/action"] }] }), "continuation", "preview"));
});

test("continuation what-if cannot retain resolved Log Analytics keys, including scalar delta values", async () => {
  const f = await stagedFixture();
  f.plan.whatIf = { changes: f.state.continuationInventory().map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })) };
  const aca = f.plan.whatIf.changes.find((r) => r.after.type === "Microsoft.App/managedEnvironments");
  aca.after.properties = { appLogsConfiguration: { logAnalyticsConfiguration: { sharedKey: "synthetic-secret-do-not-persist" } } };
  assert.throws(() => f.state.validateStageChanges(f.plan.whatIf, f.plan, false), /secret/i);
  aca.after.properties.appLogsConfiguration.logAnalyticsConfiguration.sharedKey = "[listKeys(resourceId('logs'), '2023-09-01').primarySharedKey]";
  assert.doesNotThrow(() => f.state.validateStageChanges(f.plan.whatIf, f.plan, false));
  aca.delta = [{ path: "properties.appLogsConfiguration.logAnalyticsConfiguration.sharedKey", propertyChangeType: "Modify", before: "synthetic-secret-do-not-persist", after: "*****" }];
  assert.throws(() => f.state.validateStageChanges(f.plan.whatIf, f.plan, false), /secret/i);
});

test("partial bootstrap recovery allows only reviewed first-observed resources before handoff and completed timeout recovery performs no PUT", async () => {
  const f = await stagedFixture();
  const { bootstrapInventory } = await import("../../scripts/infra/company-development.mjs");
  const storage = f.boot.find((r) => r.type.endsWith("/storageAccounts"));
  f.transport.resources = [f.boot.find((r) => r.type.endsWith("/userAssignedIdentities")), storage];
  f.transport.assignments = []; f.transport.defender = { properties: { isEnabled: false } };
  f.context.baseline = f.state.projectResources(f.transport.resources);
  f.plan.inputs.stage = "bootstrap"; f.plan.inputs.mode = "reviewed-reentry"; delete f.context.security;
  f.context.deploymentName = f.predecessor.deploymentName;
  f.context.inspection = f.state.inspectDeployment(f.read, f.context.deploymentName);
  f.predecessor.completed = false; f.predecessor.resources = [];
  f.predecessor.templateSha256 = f.plan.evidence.templateSha256; f.predecessor.parametersSha256 = f.plan.evidence.parametersSha256;
  f.plan.inventory = { expected: bootstrapInventory(), baseline: f.context.baseline };
  f.transport.predecessorDeployment.properties.provisioningState = "Failed";
  f.context.inspection = f.state.inspectDeployment(f.read, f.context.deploymentName);
  f.transport.stagePermissions = [{ actions: ["*/read", ...new Set(bootstrapInventory().map((r) => `${r.type}/write`)), "Microsoft.Resources/deployments/write", "Microsoft.Resources/deployments/whatIf/action"], notActions: [], dataActions: [], notDataActions: [] }];
  f.plan.whatIf = { changes: bootstrapInventory().map(({ id, type }) => ({ resourceId: id, after: { type }, changeType: f.transport.resources.some((r) => r.id === id) ? "NoChange" : "Create" })) };
  let puts = 0;
  const run = () => f.state.executeReviewedStage({ plan: f.plan, predecessor: f.predecessor, read: f.read, now: f.now, preview: () => structuredClone(f.plan.whatIf), submit: () => { puts++; } });
  assert.equal(run().action, "submitted"); assert.equal(puts, 1);
  f.transport.defender.properties.isEnabled = true; assert.throws(run); assert.equal(puts, 1);
  f.transport.defender.properties.isEnabled = false;
  f.transport.resources = f.boot; f.context.baseline = f.state.projectResources(f.boot);
  f.plan.inventory.baseline = f.context.baseline;
  f.transport.predecessorDeployment.properties.provisioningState = "Succeeded";
  f.context.inspection = f.state.inspectDeployment(f.read, f.context.deploymentName);
  f.plan.whatIf.changes.forEach((c) => { c.changeType = "NoChange"; });
  assert.equal(run().action, "noop"); assert.equal(puts, 1);
});

test("direct security-scope writer authority cannot hide beneath otherwise read-only bootstrap permissions", async () => {
  const f = await stagedFixture();
  f.plan.whatIf = { changes: f.state.continuationInventory().map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })) };
  let puts = 0;
  const read = (a) => a[0] === "rest" && a.some((v) => v.includes("/dataScanners/") && v.includes("/permissions?"))
    ? { value: [{ actions: ["Microsoft.Security/dataScanners/write"], notActions: [], dataActions: [], notDataActions: [] }] } : f.read(a);
  assert.throws(() => f.state.executeReviewedStage({ plan: f.plan, predecessor: f.predecessor, read, now: f.now, preview: () => f.plan.whatIf, submit: () => { puts++; } }));
  assert.equal(puts, 0);
});

test("completed continuation verifies actual PG sizing/private Entra-only/backup state and ACA Consumption rather than inventory count alone", async () => {
  const f = await stagedFixture(), resources = continuationResources(f.state);
  assert.doesNotThrow(() => f.state.assertCompletedResources([...f.boot, ...resources], "continuation"));
  for (const mutation of [
    (r) => { r.find((v) => v.type === "Microsoft.DBforPostgreSQL/flexibleServers").properties.authConfig.passwordAuth = "Enabled"; },
    (r) => { r.find((v) => v.type === "Microsoft.DBforPostgreSQL/flexibleServers").properties.storage.storageSizeGB = 64; },
    (r) => { r.find((v) => v.type === "Microsoft.DBforPostgreSQL/flexibleServers").properties.network.publicNetworkAccess = "Enabled"; },
    (r) => { r.find((v) => v.type === "Microsoft.DBforPostgreSQL/flexibleServers").properties.state = "Updating"; },
    (r) => { r.find((v) => v.type === "Microsoft.App/managedEnvironments").properties.workloadProfiles.push({ name: "paid", workloadProfileType: "D4" }); },
    (r) => { delete r.find((v) => v.type === "Microsoft.App/managedEnvironments").properties.vnetConfiguration; },
    (r) => { r[0].properties.provisioningState = "Failed"; },
  ]) { const changed = structuredClone(resources); mutation(changed); assert.throws(() => f.state.assertCompletedResources([...f.boot, ...changed], "continuation")); }
});
function bootstrapRead(resources, { account, assignments = [] } = {}) {
  const defaults = { id: subscriptionId, tenantId: input.tenantId, state: "Enabled", user: { name: "synthetic-operator@example.invalid", type: "user" } };
  return (args) => {
    if (args[0] === "account") return account ?? defaults;
    if (args[0] === "role") {
      assert.deepEqual(args.slice(0, 3), ["role", "assignment", "list"]);
      assert.ok(args.includes("--include-inherited"));
      assert.ok(!args.includes("--all"), "Azure CLI rejects --all with --scope");
      return assignments;
    }
    if (args[0] === "deployment") return resources.map((r) => ({ properties: {
      provisioningState: "Succeeded", provisioningOperation: "Create", targetResource: { id: r.id, resourceType: r.type },
    } }));
    if (args[1] === "list") return resources.filter((r) => !r.type.includes("/blobServices"));
    assert.deepEqual(args.slice(0, 2), ["resource", "show"]);
    return resources.find((r) => r.id.toLowerCase() === args[args.indexOf("--ids") + 1].toLowerCase());
  };
}

test("human grant preparation uses actual tenant/resource/principal/client IDs and ARM-compatible deterministic names; never grants", async () => {
  const { prepareHumanGrants, assertHumanGrantAssignments, armGuid } = await controls();
  const { bootstrapInventory } = await import("../../scripts/infra/company-development.mjs");
  const resources = actualResources(bootstrapInventory());
  const previous = { version: 2, stage: "bootstrap", destination: { subscriptionId, tenantId: input.tenantId, resourceGroup, location: input.location }, resources };
  const calls = [];
  const read = bootstrapRead(resources);
  const plan = prepareHumanGrants((args) => { calls.push(args); return read(args); }, "companydev-bootstrap-synthetic", previous);
  assert.equal(plan.commands.length, 4);
  assert.equal(plan.assignments.length, 4);
  assert.equal(plan.securityHandoffVerified, false);
  assert.equal(plan.workflowGrantAuthority, false);
  assert.equal(plan.bindings.length, 3);
  assert.deepEqual(plan.bindings.map((b) => b.principalId).sort(), resources.filter((r) => r.type.endsWith("/userAssignedIdentities")).map((r) => r.properties.principalId).sort());
  const expectedNames = plan.assignments.map((a) => {
    const body = `${a.scope}-${a.identityResourceId}-${a.roleDefinitionId}`;
    // Independent standard-library UUIDv5 oracle, not an implementation clone.
    return execFileSync("python3", ["-c", "import uuid,sys; print(uuid.uuid5(uuid.UUID('11fb06fb-712d-4ddd-98c7-e71bbd588830'),sys.argv[1]))", body], { encoding: "utf8" }).trim();
  });
  assert.deepEqual(plan.assignments.map((a) => a.name), expectedNames);
  assert.equal(armGuid("a", "b"), "2d796349-8c7e-55ec-9624-54ece82ed031");
  for (let i = 0; i < 4; i++) {
    const assignment = plan.assignments[i];
    const command = plan.commands[i];
    assert.equal(command.executable, "az");
    assert.deepEqual(command.args.slice(0, 3), ["role", "assignment", "create"]);
    for (const [flag, value] of [
      ["--scope", assignment.scope], ["--name", expectedNames[i]], ["--role", assignment.roleDefinitionId],
      ["--assignee-object-id", assignment.principalId], ["--assignee-principal-type", "ServicePrincipal"], ["--subscription", subscriptionId],
    ]) assert.equal(command.args[command.args.indexOf(flag) + 1], value);
    assert.match(assignment.roleDefinitionId, new RegExp(`^/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/`));
    assert.ok(!command.args.includes(assignment.clientId), "Client IDs must never be used as assignee object IDs");
  }
  assert.ok(calls.every((args) => args[0] !== "role" || args.slice(0, 3).join(" ") === "role assignment list"), "Preparation may only read assignments");
  assert.equal(calls.filter((args) => args[0] === "role").length, 2);
  const matches = plan.assignments.map(({ id, name, principalId, principalType, roleDefinitionId, scope }) => ({ id, name, principalId, principalType, roleDefinitionId, scope }));
  assert.doesNotThrow(() => assertHumanGrantAssignments(matches, plan.assignments));
  assert.deepEqual(prepareHumanGrants(bootstrapRead(resources, { assignments: matches }), "companydev-bootstrap-synthetic", previous).commands, [], "Exact existing tuple must be idempotent, no duplicate grant command");
  assert.equal(prepareHumanGrants(bootstrapRead(resources, { assignments: matches.slice(1) }), "companydev-bootstrap-synthetic", previous).commands.length, 1);
  assert.deepEqual(plan.assignments.map((a) => a.scope).sort(), [
    ...Array(3).fill(resources.find((r) => r.type.endsWith("/registries")).id),
    resources.find((r) => r.type.endsWith("/containers")).id,
  ].sort());
});

test("human grant tuple verification rejects inherited/broad/extra roles, foreign same-tenant SP, swapped/recreated identities and missing visibility", async () => {
  const { prepareHumanGrants, assertHumanGrantAssignments, armGuid } = await controls();
  const { bootstrapInventory } = await import("../../scripts/infra/company-development.mjs");
  const resources = actualResources(bootstrapInventory());
  const previous = { version: 2, stage: "bootstrap", destination: { subscriptionId, tenantId: input.tenantId, resourceGroup, location: input.location }, resources };
  const plan = prepareHumanGrants(bootstrapRead(resources), "companydev-bootstrap-synthetic", previous);
  const assignments = plan.assignments.map(({ id, name, principalId, principalType, roleDefinitionId, scope }) => ({ id, name, principalId, principalType, roleDefinitionId, scope }));
  for (const mutate of [
    (a) => { a.pop(); },
    (a) => { a.push({ ...a[0], id: `${a[0].scope}/providers/Microsoft.Authorization/roleAssignments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` }); },
    (a) => { a[0].principalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; },
    (a) => { a[0].scope = `/subscriptions/${subscriptionId}`; },
    (a) => { a[0].scope = a[0].scope.replace(resourceGroup, "foreign-rg"); },
    (a) => { a[0].scope = a[0].scope.replace(subscriptionId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); },
    (a) => { a[0].roleDefinitionId = `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`; },
    (a) => { a[0].roleDefinitionId = a[0].roleDefinitionId.split("/").at(-1); },
    (a) => { a[0].principalType = "User"; },
    (a) => { a[0].principalId = plan.assignments[0].clientId; },
    (a) => { a[0].condition = "@Resource[anything]"; a[0].conditionVersion = "2.0"; },
    (a) => { a[0].name = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; },
    (a) => { a[0].id = a[0].id.replace(resourceGroup, "foreign-rg"); },
  ]) {
    const changed = structuredClone(assignments); mutate(changed);
    assert.throws(() => assertHumanGrantAssignments(changed, plan.assignments));
    // Missing grants are prepared, but any conflicting/broad/extra actual
    // assignment must stop preparation rather than emit corrective commands.
    if (changed.length >= assignments.length) {
      assert.throws(() => prepareHumanGrants(bootstrapRead(resources, { assignments: changed }), "companydev-bootstrap-synthetic", previous));
    }
  }
  for (const mutate of [
    (r) => { r.find((x) => x.type.endsWith("/userAssignedIdentities")).properties.principalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; },
    (r) => { const identities = r.filter((x) => x.type.endsWith("/userAssignedIdentities")); [identities[0].properties, identities[1].properties] = [identities[1].properties, identities[0].properties]; },
    (r) => { r.find((x) => x.type.endsWith("/userAssignedIdentities")).properties.tenantId = "foreign"; },
  ]) {
    const changed = structuredClone(resources); mutate(changed);
    assert.throws(() => prepareHumanGrants(bootstrapRead(changed), "companydev-bootstrap-synthetic", previous));
  }
  for (const account of [
    { id: subscriptionId, tenantId: input.tenantId, state: "Enabled", user: { type: "servicePrincipal", name: "workflow" } },
    { id: "foreign", tenantId: input.tenantId, state: "Enabled", user: { type: "user", name: "human" } },
    { id: subscriptionId, tenantId: "foreign", state: "Enabled", user: { type: "user", name: "human" } },
  ]) assert.throws(() => prepareHumanGrants(bootstrapRead(resources, { account }), "companydev-bootstrap-synthetic", previous));
  assert.throws(() => prepareHumanGrants(() => { throw new Error("403 missing visibility"); }, "companydev-bootstrap-synthetic", previous), /missing visibility/);
  assert.throws(() => assertHumanGrantAssignments(undefined, plan.assignments), /visibility/i);
  for (const mutate of [
    (a) => { a[0].roleDefinitionId = `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`; },
    (a) => { a[0].scope = `/subscriptions/${subscriptionId}`; },
    (a) => { a[0].identityResourceId = a[0].identityResourceId.replace(resourceGroup, "foreign-rg"); },
    (a) => { a[3].principalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; },
  ]) {
    const proposed = structuredClone(plan.assignments); mutate(proposed);
    for (const a of proposed) {
      a.name = armGuid(a.scope, a.identityResourceId, a.roleDefinitionId);
      a.id = `${a.scope}/providers/Microsoft.Authorization/roleAssignments/${a.name}`;
    }
    assert.throws(() => assertHumanGrantAssignments(proposed, proposed), "Caller-updated JSON/names must not broaden the approved tuple policy");
  }
});

test("manual human-grant-plan CLI binds predecessor bytes, reads fixed destination only, and emits commands without executing them", async () => {
  const { bootstrapInventory, destination } = await import("../../scripts/infra/company-development.mjs");
  const resources = actualResources(bootstrapInventory());
  const previous = { version: 2, stage: "bootstrap", destination, resources };
  const { root: dir } = sourceFixture();
  const path = join(dir, "bootstrap-state.json");
  const bytes = encode(previous);
  writeFileSync(path, bytes);
  const tool = `#!/usr/bin/env node
const fs=require("node:fs"),a=process.argv.slice(2),e=process.env;
fs.appendFileSync(e.TOOL_LOG,JSON.stringify(a)+"\\n");
const resources=JSON.parse(e.FAKE_RESOURCES); let value;
if(a[0]==="account")value={id:"${subscriptionId}",tenantId:"${input.tenantId}",state:"Enabled",user:{type:"user",name:"synthetic-operator@example.invalid"}};
else if(a[0]==="role"&&a[2]==="list")value=[];
else if(a[0]==="deployment")value=resources.map(r=>({properties:{provisioningState:"Succeeded",provisioningOperation:"Create",targetResource:{id:r.id,resourceType:r.type}}}));
else if(a[0]==="resource"&&a[1]==="list")value=resources.filter(r=>!r.type.includes("/blobServices"));
else if(a[0]==="resource"&&a[1]==="show")value=resources.find(r=>r.id===a[a.indexOf("--ids")+1]);
else {console.error("Unexpected/non-read operation");process.exit(9)}
console.log(JSON.stringify(value));
`;
  writeFileSync(join(dir, "az"), tool); chmodSync(join(dir, "az"), 0o700);
  const env = { ...process.env, GITHUB_ACTIONS: "false", PATH: `${dir}:${process.env.PATH}`, TOOL_LOG: join(dir, "tools.jsonl"), FAKE_RESOURCES: JSON.stringify(resources) };
  const args = [resolve("scripts/infra/company-development-apply.mjs"), "human-grant-plan", "--deployment", "companydev-bootstrap-synthetic", "--predecessor", path, "--predecessor-sha256", hash(bytes)];
  try {
    const run = (changes = {}, arguments_ = args) => spawnSync(process.execPath, arguments_, { cwd: dir, env: { ...env, ...changes }, encoding: "utf8" });
    const ci = run({ GITHUB_ACTIONS: "true" });
    assert.equal(ci.status, 1);
    assert.match(ci.stderr, /manual.*operator|workflow/i);
    const wrong = run({}, [...args.slice(0, -1), "0".repeat(64)]);
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /predecessor.*hash/i);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.predecessorFileSha256, hash(bytes));
    assert.equal(plan.commands.length, 4);
    assert.equal(plan.reviewContextOnly, true);
    const calls = readFileSync(env.TOOL_LOG, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(calls.length, 12);
    for (const a of calls) {
      assert.equal(a[a.indexOf("--subscription") + 1], subscriptionId);
      assert.ok(!a.includes("create") && !a.includes("put") && !a.includes("delete"));
    }
    assert.equal(run({}, [...args, "--unexpected", "value"]).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
function fixture(sha = "a".repeat(40)) {
  const parameters = {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: Object.fromEntries(["stage", "vnetCidr", "acaSubnetCidr", "postgresSubnetCidr", "networkApproval"].map((key) => [key, { value: input[key] }])),
  };
  const template = { resources: [{ type: "Microsoft.Resources/deployments", subscriptionId, resourceGroup, properties: { mode: "Incremental" } }] };
  const inventory = {
    version: 2, stage: "bootstrap", mode: "initial",
    destination: { subscriptionId, tenantId: input.tenantId, resourceGroup, location: input.location },
    baseline: [],
    expected: [
      ...["api", "web", "migration"].map((name) => ({ type: "Microsoft.ManagedIdentity/userAssignedIdentities", name: `id-keyforta-cdev-${name}` })),
      { type: "Microsoft.ContainerRegistry/registries", name: "acrkeyfortacdevmxv24i2qhtib6" },
      { type: "Microsoft.Storage/storageAccounts", name: "stakeyfortacdevmxv24i2qh" },
      { type: "Microsoft.Storage/storageAccounts/blobServices", name: "stakeyfortacdevmxv24i2qh/default" },
      { type: "Microsoft.Storage/storageAccounts/blobServices/containers", name: "stakeyfortacdevmxv24i2qh/default/tenant-applications" },
    ].map(({ type, name }) => {
      const segments = type.split("/");
      const names = name.split("/");
      return { type, id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${segments[0]}/${segments.slice(1).map((part, i) => `${part}/${names[i]}`).join("/")}` };
    }).sort((a, b) => a.id.localeCompare(b.id)),
    predecessor: null, securityHandoff: null, changeFreeze: input.changeFreeze,
  };
  const whatIf = { changes: inventory.expected.map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })) };
  const context = { repository: "keyforta/keyforta-property", revision: sha, runId: "123", runAttempt: "1", stage: "bootstrap", mode: "initial", evidenceVersion: 2, inventorySha256: hash(JSON.stringify(inventory)), environment: { name: "company-dev" } };
  const files = {
    "inputs.json": encode(input), "parameters.json": encode(parameters),
    "template.json": encode(template), "what-if.json": encode(whatIf), "review-context.json": encode(context),
    "inventory.json": encode(inventory),
  };
  const sourceFiles = sourcePaths.map((path) => ({ path, sha256: "b".repeat(64) }));
  const evidence = {
    ...input, operation: "foundation-preview-only", commitSha: sha, runId: "123", runAttempt: "1",
    reviewContext: context, approvedParameters: parameters, executionApproved: false,
    planningCeilingUsdBeforeTax: "120.00", estimatedMonthlyUsdBeforeTax: "108.35",
    previewClientId: "11111111-1111-4111-8111-111111111111",
    sourceSha256: hash(JSON.stringify(sourceFiles)), sourceFiles,
    inventorySha256: hash(files["inventory.json"]),
    inputsSha256: hash(files["inputs.json"]), reviewContextSha256: hash(files["review-context.json"]),
    templateSha256: hash(files["template.json"]), parametersSha256: hash(files["parameters.json"]), whatIfSha256: hash(files["what-if.json"]),
  };
  files["evidence.json"] = encode(evidence);
  return {
    files, whatIf,
    expected: {
      sha, stage: input.stage, mode: input.mode, evidenceVersion: 2,
      runId: "123", runAttempt: "1", artifactId: "456", sourceSha256: evidence.sourceSha256,
      evidenceSha256: hash(files["evidence.json"]), inventorySha256: evidence.inventorySha256,
      templateSha256: evidence.templateSha256, parametersSha256: evidence.parametersSha256, whatIfSha256: evidence.whatIfSha256,
    },
    run: { id: 123, run_attempt: 1, head_sha: sha, head_branch: "main", status: "completed", conclusion: "success", event: "workflow_dispatch", path: ".github/workflows/company-development-foundation.yml", repository: { full_name: "keyforta/keyforta-property" }, head_repository: { full_name: "keyforta/keyforta-property" } },
    artifact: { id: 456, expired: false, name: `company-dev-foundation-bootstrap-initial-v2-plan-${sha}-123-1`, workflow_run: { id: 123, head_sha: sha } },
  };
}

test("staged apply rejects legacy evidence, wrong stage/version, incomplete dependencies and inventory tampering", async () => {
  const { assertPlan } = await controls();
  for (const mutation of [
    (f) => { delete f.files["inventory.json"]; },
    (f) => { const e = JSON.parse(f.files["evidence.json"]); e.evidenceVersion = 1; f.files["evidence.json"] = encode(e); },
    (f) => { const e = JSON.parse(f.files["evidence.json"]); e.stage = "continuation"; f.files["evidence.json"] = encode(e); },
    (f) => { const e = JSON.parse(f.files["evidence.json"]); e.sourceFiles.pop(); e.sourceSha256 = f.expected.sourceSha256 = hash(JSON.stringify(e.sourceFiles)); f.files["evidence.json"] = encode(e); },
    (f) => { const i = JSON.parse(f.files["inventory.json"]); i.expected.pop(); f.files["inventory.json"] = encode(i); },
    (f) => { f.expected.mode = "reviewed-reentry"; },
  ]) {
    const f = fixture();
    mutation(f);
    // Updating actor-supplied hashes cannot make invalid semantics acceptable.
    f.expected.evidenceSha256 = hash(f.files["evidence.json"]);
    const e = JSON.parse(f.files["evidence.json"]);
    assert.throws(() => assertPlan(f.files, f.run, f.artifact, f.expected, e.sourceSha256));
  }
});

// Synthetic replay of the 17-operation ARM shape from run 40262729364:
// seven resource Creates, two module Creates, five output Reads, three evaluations.
// No live operation IDs, principal/client bindings, timestamps or response bodies.
async function bootstrapOutputReadFixture() {
  const { bootstrapInventory } = await import("../../scripts/infra/company-development.mjs");
  const resources = actualResources(bootstrapInventory());
  const root = "companydev-bootstrap-synthetic";
  const foundation = "foundation-keyforta-cdev", stamp = "stamp-keyforta-cdev";
  const scope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/`;
  const nested = (name) => ({ id: `${scope}Microsoft.Resources/deployments/${name}`, type: "Microsoft.Resources/deployments" });
  let sequence = 0;
  const operation = (name, kind, resource = null) => {
    const operationId = `synthetic-${++sequence}`;
    return {
      id: `${nested(name).id}/operations/${operationId}`, operationId, resourceGroup,
      properties: {
        provisioningOperation: kind, provisioningState: "Succeeded",
        statusCode: kind === "Create" ? "Created" : "OK",
        request: null, response: null, statusMessage: null,
        targetResource: resource && {
          id: resource.id, resourceType: resource.type, resourceGroup,
          resourceName: resource.id.split("/").at(-1),
          apiVersion: resource.type === "Microsoft.Resources/deployments" ? "2025-04-01"
            : resource.type.startsWith("Microsoft.ContainerRegistry/") ? "2023-11-01-preview"
              : resource.type.startsWith("Microsoft.ManagedIdentity/") ? "2023-01-31" : "2023-05-01",
          extension: null, identifiers: null, symbolicName: null,
        },
      },
    };
  };
  const outputResources = [
    resources.find((r) => r.type.endsWith("/registries")),
    ...["migration", "api"].map((name) => resources.find((r) => r.id.endsWith(`-${name}`))),
  ];
  const rows = {
    [root]: [operation(root, "Create", nested(foundation)), operation(root, "Read", nested(foundation)), operation(root, "EvaluateDeploymentOutput")],
    [foundation]: [operation(foundation, "Create", nested(stamp)), operation(foundation, "Read", nested(stamp)), operation(foundation, "EvaluateDeploymentOutput")],
    [stamp]: [
      ...resources.map((r) => operation(stamp, "Create", r)),
      ...outputResources.map((r) => operation(stamp, "Read", r)),
      operation(stamp, "EvaluateDeploymentOutput"),
    ],
  };
  const read = (args) => {
    if (args[0] === "deployment") return rows[args[args.indexOf("--name") + 1]];
    if (args[1] === "list") return resources.filter((r) => !r.type.includes("/blobServices"));
    assert.equal(args[0], "resource"); assert.equal(args[1], "show");
    assert.ok(args.includes("--api-version"));
    return resources.find((r) => r.id === args[args.indexOf("--ids") + 1]);
  };
  return { root, foundation, stamp, rows, resources, read };
}

test("bootstrap ARM output Read replay preserves exact resources and all 17 operations", async () => {
  const { readBootstrapState } = await controls();
  const f = await bootstrapOutputReadFixture();
  const result = readBootstrapState(f.read, f.root);
  assert.deepEqual(result.resources, f.resources);
  assert.deepEqual(result.operations, [f.root, f.foundation, f.stamp].map((deploymentName) => ({ deploymentName, operations: f.rows[deploymentName] })));
  assert.equal(result.operations.flatMap((r) => r.operations).length, 17);
  assert.equal(result.securityHandoffVerified, false);
});

test("bootstrap ARM output Reads never supply missing Create provenance", async () => {
  const { readBootstrapState } = await controls();
  for (const name of ["api", "migration", "registries"]) {
    const f = await bootstrapOutputReadFixture();
    f.rows[f.stamp] = f.rows[f.stamp].filter(({ properties: p }) =>
      !(p.provisioningOperation === "Create" && (name === "registries" ? p.targetResource.resourceType.endsWith("/registries") : p.targetResource.id.endsWith(`-${name}`))));
    assert.throws(() => readBootstrapState(f.read, f.root), /do not establish all seven/);
  }
});

test("bootstrap ARM output Reads fail closed on missing, foreign, unrelated or unsuccessful targets", async () => {
  const { readBootstrapState } = await controls();
  for (const mutate of [
    (p) => { p.provisioningOperation = "Unknown"; },
    (p) => { p.targetResource = null; },
    (p) => { delete p.targetResource.id; },
    (p) => { delete p.targetResource.resourceType; },
    (p) => { p.targetResource.id = p.targetResource.id.replace(subscriptionId, "foreign"); },
    (p) => { p.targetResource.resourceType = "Microsoft.Storage/storageAccounts"; },
    (p) => { p.targetResource.id += "-extra"; },
    ...["Failed", "Running", "Canceled", undefined].map((state) => (p) => { p.provisioningState = state; }),
  ]) {
    const f = await bootstrapOutputReadFixture();
    mutate(f.rows[f.stamp].find((r) => r.properties.provisioningOperation === "Read").properties);
    assert.throws(() => readBootstrapState(f.read, f.root));
  }
  // Even other bootstrap resources (web/Storage), or a valid target at the
  // wrong module scope, are not output Reads in the authoritative template.
  for (const suffix of ["-web", "/stakeyfortacdevmxv24i2qh"]) {
    const f = await bootstrapOutputReadFixture();
    const resource = f.resources.find((r) => r.id.endsWith(suffix));
    const p = f.rows[f.stamp].find((r) => r.properties.provisioningOperation === "Read").properties;
    p.targetResource = { id: resource.id, resourceType: resource.type };
    assert.throws(() => readBootstrapState(f.read, f.root), /Read target/);
  }
  for (const name of ["root", "foundation"]) {
    const f = await bootstrapOutputReadFixture();
    f.rows[f[name]].find((r) => r.properties.provisioningOperation === "Read").properties.targetResource =
      f.rows[f.stamp].find((r) => r.properties.provisioningOperation === "Read").properties.targetResource;
    assert.throws(() => readBootstrapState(f.read, f.root), /Read target/);
  }
  for (const kind of ["Create", "EvaluateDeploymentOutput"]) {
    const f = await bootstrapOutputReadFixture();
    const extra = structuredClone(f.rows[f.stamp][0]);
    extra.properties.provisioningOperation = kind;
    extra.properties.targetResource.id += "-extraneous";
    f.rows[f.stamp].push(extra);
    assert.throws(() => readBootstrapState(f.read, f.root), /target/i);
  }
  const f = await bootstrapOutputReadFixture();
  assert.throws(() => readBootstrapState((args) => {
    if (args[0] === "deployment" && args.includes(f.stamp)) throw new Error("403 operation visibility");
    return f.read(args);
  }, f.root), /403 operation visibility/);
});

test("bootstrap actual reads reject foreign tenant, wrong destination, duplicated principals, failed provisioning and security drift", async () => {
  const { readBootstrapState } = await controls();
  const { bootstrapInventory } = await import("../../scripts/infra/company-development.mjs");
  const expected = bootstrapInventory();
  const resources = actualResources(expected);
  const read = (actual) => (args) => {
    if (args[0] === "deployment") return actual.map((r) => ({ properties: { provisioningState: "Succeeded", provisioningOperation: "Create", targetResource: { id: r.id, resourceType: r.type } } }));
    if (args[1] === "list") return actual.filter((r) => !r.type.includes("/blobServices"));
    assert.equal(args[0], "resource"); assert.equal(args[1], "show");
    assert.ok(args.includes("--api-version"));
    return actual.find((r) => r.id === args[args.indexOf("--ids") + 1]);
  };
  assert.equal(readBootstrapState(read(resources), "companydev-bootstrap-synthetic").resources.length, 7);
  for (const mutate of [
    (r) => { r.find((x) => x.type.endsWith("/userAssignedIdentities")).properties.tenantId = "foreign"; },
    (r) => { r[0].id = r[0].id.replace(subscriptionId, "foreign"); },
    (r) => { const ids = r.filter((x) => x.type.endsWith("/userAssignedIdentities")); ids[1].properties.principalId = ids[0].properties.principalId; },
    (r) => { r.find((x) => x.type.endsWith("/registries")).properties.provisioningState = "Failed"; },
    (r) => { r.find((x) => x.type.endsWith("/storageAccounts")).properties.allowSharedKeyAccess = true; },
    (r) => { r.find((x) => x.type.endsWith("/containers")).properties.publicAccess = "Blob"; },
    (r) => { r.find((x) => x.type.endsWith("/registries")).sku.name = "Premium"; },
    (r) => { r.find((x) => x.type.endsWith("/storageAccounts")).sku.name = "Standard_GRS"; },
    (r) => { r.push({ id: "extra-role", type: "Microsoft.Authorization/roleAssignments" }); },
    (r) => { r.pop(); },
  ]) {
    const actual = structuredClone(resources); mutate(actual);
    assert.throws(() => readBootstrapState(read(actual), "companydev-bootstrap-synthetic"));
  }
  assert.throws(() => readBootstrapState(() => { throw new Error("403 missing visibility"); }, "companydev-bootstrap-synthetic"), /visibility/);
  assert.throws(() => readBootstrapState((args) => {
    const value = read(resources)(args);
    if (args[0] === "deployment") value[0].properties.provisioningOperation = "Unknown";
    return value;
  }, "companydev-bootstrap-synthetic"), /operation/i);
});

test("apply accepts only exact successful preview run/artifact/SHA and every reviewed content hash", async () => {
  const { assertPlan } = await controls();
  const f = fixture();
  assert.equal(assertPlan(f.files, f.run, f.artifact, f.expected, f.expected.sourceSha256).evidence.commitSha, sha);
  for (const file of ["template.json", "parameters.json", "what-if.json"]) {
    assert.throws(() => assertPlan({ ...f.files, [file]: `${f.files[file]} ` }, f.run, f.artifact, f.expected, f.expected.sourceSha256), /hash/i);
  }
  assert.throws(() => assertPlan(f.files, f.run, f.artifact, f.expected, "c".repeat(64)), /source/i);
  for (const changes of [
    { head_sha: "c".repeat(40) }, { conclusion: "failure" }, { event: "pull_request" },
    { path: ".github/workflows/deploy.yml" }, { run_attempt: 2 }, { head_branch: "other" },
  ]) assert.throws(() => assertPlan(f.files, { ...f.run, ...changes }, f.artifact, f.expected, "b".repeat(64)));
  assert.throws(() => assertPlan(f.files, f.run, { ...f.artifact, expired: true }, f.expected, "b".repeat(64)));
  assert.throws(() => assertPlan(f.files, f.run, { ...f.artifact, id: 999 }, f.expected, "b".repeat(64)));
});

test("apply rejects superseded destination and source plans even with recomputed reviewed hashes", async () => {
  const { assertPlan } = await controls();
  for (const rejectedSubscription of [
    "212bf9c5-2326-4852-846e-7227bac81fd5",
    "f9809805-ff42-4ece-b3da-43ebd70e0fb7",
  ]) {
    for (const templateOnly of [false, true]) {
      const f = fixture();
      const template = JSON.parse(f.files["template.json"]);
      template.resources[0].subscriptionId = rejectedSubscription;
      f.files["template.json"] = encode(template);
      const evidence = JSON.parse(f.files["evidence.json"]);
      evidence.templateSha256 = f.expected.templateSha256 = hash(f.files["template.json"]);
      if (!templateOnly) {
        const inputs = { ...input, subscriptionId: rejectedSubscription };
        f.files["inputs.json"] = encode(inputs);
        evidence.subscriptionId = rejectedSubscription;
      }
      f.files["evidence.json"] = encode(evidence);
      f.expected.evidenceSha256 = hash(f.files["evidence.json"]);
      assert.throws(() => assertPlan(f.files, f.run, f.artifact, f.expected, f.expected.sourceSha256), /destination subscription|template subscription|inputs.json hash/i);
    }
  }
});

test("apply rejects semantic approval drift and any extra artifact file even when actor updates raw hashes", async () => {
  const { assertPlan } = await controls();
  const f = fixture();
  const parameters = JSON.parse(f.files["parameters.json"]);
  parameters.parameters.vnetCidr.value = "10.84.0.0/23";
  const changed = encode(parameters);
  const evidence = JSON.parse(f.files["evidence.json"]);
  evidence.parametersSha256 = hash(changed);
  assert.throws(() => assertPlan({ ...f.files, "parameters.json": changed, "evidence.json": encode(evidence) }, f.run, f.artifact, { ...f.expected, evidenceSha256: hash(encode(evidence)), parametersSha256: hash(changed) }, f.expected.sourceSha256), /parameter/i);
  assert.throws(() => assertPlan({ ...f.files, "unexpected.json": "{}" }, f.run, f.artifact, f.expected, "b".repeat(64)), /artifact/i);
});

test("apply requires latest green exact-SHA CI/security/DAST, never an audit waiver or stale successful run", async () => {
  const { assertQuality } = await controls();
  const run = { id: 789, head_sha: sha, head_branch: "main", event: "push", status: "completed", conclusion: "success", path: ".github/workflows/ci.yml" };
  assert.equal(assertQuality({ workflow_runs: [run] }, "ci.yml", sha).id, 789);
  for (const changes of [{ conclusion: "failure" }, { status: "in_progress" }, { head_sha: "b".repeat(40) }, { event: "pull_request" }]) {
    assert.throws(() => assertQuality({ workflow_runs: [{ ...run, id: 790, ...changes }, run] }, "ci.yml", sha), /quality|CI|SHA|workflow/i);
  }
});

test("apply re-previews create-only destination changes and rejects any semantic drift before building write request", async () => {
  const { assertFreshPreview, applyRequest, assertPlan } = await controls();
  const f = fixture();
  assert.doesNotThrow(() => assertFreshPreview(f.whatIf, structuredClone(f.whatIf)));
  const drift = structuredClone(f.whatIf);
  drift.changes[0].after.name = "different";
  assert.throws(() => assertFreshPreview(f.whatIf, drift), /drift/i);
  for (const changeType of ["Delete", "Modify", "Ignore", "NoChange"]) {
    assert.throws(() => assertFreshPreview(f.whatIf, { changes: [{ ...f.whatIf.changes[0], changeType }] }));
  }
  const plan = assertPlan(f.files, f.run, f.artifact, f.expected, f.expected.sourceSha256);
  const request = applyRequest(plan, sha);
  assert.match(request.url, new RegExp(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/`));
  assert.equal(request.body.properties.mode, "Incremental");
  assert.deepEqual(request.body.properties.template, JSON.parse(f.files["template.json"]));
  assert.deepEqual(request.body.properties.parameters, JSON.parse(f.files["parameters.json"]).parameters);
  assert.equal(request.body.properties.onErrorDeployment, undefined);
});

test("apply route has a distinct protected environment/principal, no bootstrap or source route, and same concurrency lock", () => {
  const workflow = YAML.parse(readFileSync(".github/workflows/company-development-foundation-apply.yml", "utf8"));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.concurrency.group, "company-dev-foundation");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  for (const key of ["stage", "mode", "evidence_version", "vnet_cidr", "network_approval"]) {
    assert.equal(workflow.on.workflow_dispatch.inputs[key].required, true);
  }
  assert.equal(workflow.env.FOUNDATION_STAGE, "${{ inputs.stage }}");
  assert.equal(workflow.jobs.apply.environment, "company-dev-apply");
  assert.equal(workflow.jobs.apply_guard.permissions["id-token"], undefined);
  assert.equal(workflow.jobs.preview_guard.permissions["id-token"], undefined);
  assert.equal(workflow.jobs.apply.permissions["id-token"], "write");
  assert.deepEqual(workflow.jobs.apply.needs, ["apply_guard"]);
  const steps = workflow.jobs.apply.steps;
  const login = steps.find((step) => step.uses?.startsWith("azure/login@"));
  assert.equal(login.with["subscription-id"], subscriptionId);
  assert.equal(login.with["tenant-id"], input.tenantId);
  assert.equal(login.with["client-id"], "${{ env.APPLY_CLIENT_ID }}");
  assert.equal(login.with["subscription-id"], subscriptionId);
  assert.ok(steps.findIndex((step) => step.run?.endsWith("company-development-apply.mjs verify")) < steps.indexOf(login));
  const text = readFileSync(".github/workflows/company-development-foundation-apply.yml", "utf8");
  assert.match(text, /COMPANY_DEV_APPLY_CLIENT_ID/);
  assert.match(text, /COMPANY_DEV_APPLY_ENABLED/);
  assert.doesNotMatch(text, /vars\.AZURE_|rg-keyforta-dev-san|provider register|role assignment create|group create/);
  for (const job of Object.values(workflow.jobs)) for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
});

test("mocked apply CLI makes no write on failed quality, drift, nonempty RG or shared principal; success PUT uses exact reviewed in-memory body", async () => {
  const { foundationSource, stageInventory, armParameters, environmentSnapshot } = await import("../../scripts/infra/company-development.mjs");
  const source = sourceFixture();
  const { root: dir } = source;
  const { committedSource } = await import("../../scripts/infra/company-development.mjs");
  const recoveryFrom = committedSource(source.revision, dir);
  writeFileSync(join(dir, "scripts/infra/company-development-apply.mjs"), "// synthetic verification-only correction\n");
  source.git("add", "--", "scripts/infra/company-development-apply.mjs");
  source.git("commit", "--quiet", "--no-verify", "-m", "Synthetic verifier transition");
  const revision = source.git("rev-parse", "HEAD");
  const recoveryTo = committedSource(revision, dir);
  const f = fixture(revision);
  f.expected.sourceSha256 = foundationSource({ root: dir, revision }).sha256;
  const evidence = JSON.parse(f.files["evidence.json"]);
  evidence.sourceSha256 = f.expected.sourceSha256;
  evidence.sourceFiles = foundationSource({ root: dir, revision }).files;
  evidence.sourceManifestVersion = 5;
  evidence.evidenceVersion = 3; evidence.runId = "777"; delete evidence.changeFreeze;
  const orderedInput = { ...input, evidenceVersion: 3 }; delete orderedInput.changeFreeze;
  const inventory = stageInventory(orderedInput);
  const previewEnvironment = { id: 456, node_id: "preview-environment-node", name: "company-dev",
    deployment_branch_policy: { protected_branches: true }, protection_rules: [] };
  const previewSnapshot = environmentSnapshot(previewEnvironment);
  const previewContext = { ...JSON.parse(f.files["review-context.json"]), runId: "777", evidenceVersion: 3,
    inventorySha256: hash(JSON.stringify(inventory)), environment: previewSnapshot,
    environmentSha256: hash(JSON.stringify(previewSnapshot)) };
  f.files["inputs.json"] = encode(orderedInput);
  f.files["inventory.json"] = encode(inventory);
  f.files["parameters.json"] = encode(armParameters(orderedInput));
  f.files["review-context.json"] = encode(previewContext);
  evidence.reviewContext = previewContext;
  for (const [file, field] of [["inputs", "inputs"], ["inventory", "inventory"], ["parameters", "parameters"], ["review-context", "reviewContext"]]) {
    evidence[`${field}Sha256`] = hash(f.files[`${file}.json`]);
  }
  f.files["evidence.json"] = encode(evidence);
  f.expected.evidenceSha256 = hash(f.files["evidence.json"]);
  let script = resolve("scripts/infra/company-development-apply.mjs");
  const environment = {
    id: 789, node_id: "apply-environment-node", name: "company-dev-apply",
    deployment_branch_policy: { protected_branches: true },
    protection_rules: [],
  };
  const tool = `#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path");
const name=path.basename(process.argv[1]),a=process.argv.slice(2),e=process.env;
fs.appendFileSync(e.TOOL_LOG,JSON.stringify({name,args:a})+"\\n");
const json=(key)=>JSON.parse(e[key]);
let value;
if(name==="gh"){
 if(!e.GH_TOKEN){console.error("To use GitHub CLI in a GitHub Actions workflow, set GH_TOKEN");process.exit(4)}
 if(a[0]==="run"){
  const folder=a[a.indexOf("--dir")+1], predecessor=a[a.indexOf("--name")+1].includes("-apply-");
  const files=predecessor?{"checkpoint.json":e.FAKE_CHECKPOINT}:json("FAKE_FILES");
  for(const [file,text]of Object.entries(files))fs.writeFileSync(path.join(folder,file),text);
  process.exit(0)
 }
 const api=a[1];
 if(e.RECOVERY!=="true" && e.PREVIEW_PHASE!=="true" && api.endsWith("/environments/company-dev"))value=json("FAKE_PREVIEW_ENVIRONMENT");
 else if(api.includes("/environments/"))value=json("FAKE_ENVIRONMENT");
 else if(api.endsWith("/branches/main"))value={protected:true,commit:{sha:e.GITHUB_SHA}};
 else if(api.endsWith("/jobs?per_page=100"))value=json("FAKE_PLAN_JOBS");
 else if(e.RECOVERY!=="true" && api.endsWith("/actions/artifacts/"+e.ORDERED_ARTIFACT_ID+"/zip")){process.stdout.write(Buffer.from(e.ORDERED_ARCHIVE,"base64"));process.exit(0)}
 else if(e.RECOVERY==="true" && api.endsWith("/zip")){process.stdout.write(Buffer.from(e.FAKE_ARCHIVE,"base64"));process.exit(0)}
 else if(e.STAGED==="true" && api.includes("/actions/runs/"+e.PREDECESSOR_RUN_ID+"/attempts/"))value=json("FAKE_PREDECESSOR_RUN");
 else if(e.STAGED==="true" && api.includes("/actions/artifacts/"+e.PREDECESSOR_ARTIFACT_ID))value=json("FAKE_PREDECESSOR_ARTIFACT");
 else if(e.STAGED==="true" && api.includes("/actions/runs/"+e.PREDECESSOR_RUN_ID+"/artifacts?"))value={total_count:1,artifacts:[json("FAKE_PREDECESSOR_ARTIFACT")]};
 else if(api.includes("/actions/workflows/")){
  const workflow=/workflows\\/([^/]+)\\//.exec(api)[1];
  value={workflow_runs:[{id:999,head_sha:e.GITHUB_SHA,head_branch:"main",event:"push",status:"completed",conclusion:e.FAIL_QUALITY==="true" || (e.FAIL_PRESUBMIT_QUALITY==="true" && fs.existsSync("previewed"))?"failure":"success",path:".github/workflows/"+workflow}]};
  if(e.PENDING_QUALITY==="true" || (e.PENDING_PRESUBMIT_QUALITY==="true" && fs.existsSync("previewed")))value.workflow_runs.unshift({...value.workflow_runs[0],id:1000,status:"in_progress",conclusion:null});
 }else if(api.includes("/artifacts?"))value={total_count:1,artifacts:[json("FAKE_ARTIFACT")]};
 else if(api.includes("/actions/artifacts/"))value=json("FAKE_ARTIFACT");
 else value=json("FAKE_RUN");
}else if(name==="az"){
 if(a[0]==="account")value={id:"${subscriptionId}",tenantId:"${input.tenantId}",state:"Enabled",user:{type:"servicePrincipal",name:e.PREVIEW_PHASE==="true"?e.PREVIEW_CLIENT_ID:e.APPLY_CLIENT_ID}};
 else if(a[0]==="bicep"){console.log(e.FAKE_TEMPLATE);process.exit(0)}
 else if(a[0]==="provider")value={registrationState:"Registered"};
 else if(a[0]==="group")value={id:"/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}",location:"southafricanorth"};
 else if(a[0]==="resource"){
  const resources=[...json("FAKE_RESOURCES"),...(e.STAGED==="true" && fs.existsSync("continued")?json("FAKE_CONTINUATION_RESOURCES"):[])];
  if(a[1]==="show"){
   value=resources.find(r=>r.id.toLowerCase()===a[a.indexOf("--ids")+1].toLowerCase());
   if(!value){console.error("ERROR: (ResourceNotFound) synthetic absent");process.exit(3)}
  }
  else if(e.STAGED==="true")value=resources.filter(r=>json("FAKE_TOP_TYPES").includes(r.type));
  else value=e.NONEMPTY==="true"?[{id:"unexpected"}]:fs.existsSync("submitted")?json("FAKE_RESOURCES").filter(r=>!r.type.includes("/blobServices")):[];
 }
 else if(a[0]==="role" && a[2]==="list"){
  if(a.includes("--scope") && a.includes("--all")){console.error("group or scope are not required when --all is used");process.exit(2)}
  const scope=a[a.indexOf("--scope")+1].toLowerCase();
  value=json("FAKE_ASSIGNMENTS").filter(r=>r.scope.toLowerCase()===scope || (a.includes("--include-inherited") && scope.startsWith(r.scope.toLowerCase()+"/")));
 }
 else if(a[0]==="rest"){
  if(a.includes("get")){
   const url=a[a.indexOf("--url")+1];
   if(url.includes("/resourceGroups/${resourceGroup}/providers/Microsoft.Authorization/permissions?"))value={value:e.PREVIEW_PHASE==="true"?[{actions:["*/read","Microsoft.Resources/deployments/whatIf/action"],notActions:[],dataActions:[],notDataActions:[]}]:json("FAKE_STAGE_PERMISSIONS")};
   else if(url.includes("/permissions?"))value={value:json("FAKE_PERMISSIONS")};
   else if(url.includes("/defenderForStorageSettings/"))value=json("FAKE_DEFENDER");
   else if(url.includes("/dataScanners/"))value=json("FAKE_SCANNER");
   else {console.error("Unsupported synthetic GET");process.exit(2)}
  }else {fs.writeFileSync(e.STAGED==="true"?"continued":"submitted","true");process.exit(0)}
 }
 else if(a[1]==="operation")value=e.RECOVERY==="true"?json("FAKE_OPERATIONS")[a[a.indexOf("--name")+1]]:json(e.STAGED==="true" && a[a.indexOf("--name")+1].includes("-continuation-")?"FAKE_CONTINUATION_RESOURCES":"FAKE_RESOURCES").map(r=>({properties:{provisioningState:"Succeeded",provisioningOperation:"Create",targetResource:{id:r.id,resourceType:r.type}}}));
 else if(a[2]==="list")value=e.RECOVERY==="true"?json("FAKE_DEPLOYMENTS"):e.STAGED==="true"?[{name:e.BOOTSTRAP_DEPLOYMENT,properties:{provisioningState:"Succeeded"}},...(fs.existsSync("continued")?[{name:e.CONTINUATION_DEPLOYMENT,properties:{provisioningState:"Succeeded"}}]:[])]:e.EXISTING_DEPLOYMENT==="true"?[{name:"previous",properties:{provisioningState:e.PREVIOUS_STATE||"Running"}}]:[];
 else if(a[2]==="what-if"){
  if(e.PROVIDER_ERROR==="true"){console.error("ERROR: (ProviderFailure) synthetic original provider error");process.exit(3)}
  value=json("FAKE_WHAT_IF");if(e.DRIFT==="true")value.changes[0].after.name="drift";
  if(e.FAIL_PRESUBMIT_QUALITY==="true" || e.PENDING_PRESUBMIT_QUALITY==="true")fs.writeFileSync("previewed","true");
 }
 else if(a[2]==="show"){
  const name=a[a.indexOf("--name")+1];
  if(e.RECOVERY==="true"){
   const deployment=json("FAKE_DEPLOYMENTS").find(d=>d.name===name);
   if(!deployment){console.error("ERROR: (DeploymentNotFound) synthetic absent");process.exit(3)}
   console.log(JSON.stringify(deployment));process.exit(0)
  }
  if(e.STAGED==="true" && name!==e.BOOTSTRAP_DEPLOYMENT && !fs.existsSync("continued")){console.error("ERROR: (DeploymentNotFound) synthetic absent");process.exit(3)}
  value={name,id:"companydev-test-deployment",properties:{provisioningState:e.RESULT_STATE||"Succeeded",outputs:{}}};
 }
 else {console.error("Unexpected Azure command");process.exit(2)}
}
console.log(JSON.stringify(value));
`;
  const env = {
    ...process.env, GH_TOKEN: "synthetic-actions-token", PATH: `${dir}:${process.env.PATH}`, TOOL_LOG: join(dir, "tools.jsonl"),
    GITHUB_REPOSITORY: "keyforta/keyforta-property", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: revision, GITHUB_RUN_ID: "777", GITHUB_RUN_ATTEMPT: "1",
    GITHUB_ACTOR: "cmbuyamba", GITHUB_TRIGGERING_ACTOR: "cmbuyamba", GITHUB_ACTIONS: "true",
    GITHUB_REF_PROTECTED: "true", GITHUB_WORKFLOW_SHA: revision,
    GITHUB_WORKFLOW_REF: "keyforta/keyforta-property/.github/workflows/company-development-foundation-apply.yml@refs/heads/main",
    GITHUB_JOB: "apply_guard", ORDERED_PLAN_RESULT: "success",
    GITHUB_OUTPUT: join(dir, "outputs"), GITHUB_STEP_SUMMARY: join(dir, "summary"),
    COMPANY_DEV_APPLY_ENABLED: "true", PLAN_RUN_ID: "123", PLAN_RUN_ATTEMPT: "1", PLAN_ARTIFACT_ID: "456",
    FOUNDATION_STAGE: "bootstrap", FOUNDATION_MODE: "initial", EVIDENCE_VERSION: "3",
    REVIEWED_SOURCE_SHA256: f.expected.sourceSha256, REVIEWED_TEMPLATE_SHA256: f.expected.templateSha256,
    REVIEWED_PARAMETERS_SHA256: f.expected.parametersSha256, REVIEWED_WHAT_IF_SHA256: f.expected.whatIfSha256,
    REVIEWED_INVENTORY_SHA256: f.expected.inventorySha256, REVIEWED_EVIDENCE_SHA256: f.expected.evidenceSha256,
    APPROVED_VNET_CIDR: input.vnetCidr, APPROVED_ACA_SUBNET_CIDR: input.acaSubnetCidr,
    APPROVED_POSTGRES_SUBNET_CIDR: input.postgresSubnetCidr, APPROVED_NETWORK_REFERENCE: input.networkApproval,
    APPLY_CLIENT_ID: "22222222-2222-4222-8222-222222222222",
    FAKE_FILES: JSON.stringify(f.files), FAKE_RUN: JSON.stringify(f.run), FAKE_ARTIFACT: JSON.stringify(f.artifact),
    FAKE_ENVIRONMENT: JSON.stringify(environment), FAKE_WHAT_IF: JSON.stringify(f.whatIf),
    FAKE_PREVIEW_ENVIRONMENT: JSON.stringify(previewEnvironment),
    FAKE_RESOURCES: JSON.stringify(actualResources(JSON.parse(f.files["inventory.json"]).expected)),
    FAKE_STAGE_PERMISSIONS: JSON.stringify([{ actions: ["*/read", ...new Set(JSON.parse(f.files["inventory.json"]).expected.map((r) => `${r.type}/write`)), "Microsoft.Resources/deployments/write", "Microsoft.Resources/deployments/whatIf/action"], notActions: [], dataActions: [], notDataActions: [] }]),
  };
  const bindOrdered = (files, runId, stage = "bootstrap", mode = "initial") => {
    const archive = zipFixture(files), end = Date.now() - 1000, start = end - 10000;
    const run = { ...f.run, id: Number(runId), path: ".github/workflows/company-development-foundation-apply.yml",
      status: "in_progress", conclusion: null, actor: { login: "cmbuyamba" }, triggering_actor: { login: "cmbuyamba" },
      repository: { full_name: "keyforta/keyforta-property", id: 42 }, head_repository: { full_name: "keyforta/keyforta-property", id: 42 },
      run_started_at: new Date(start - 10000).toISOString() };
    const artifact = { ...f.artifact, name: `company-dev-foundation-${stage}-${mode}-v3-plan-${revision}-${runId}-1`,
      workflow_run: { id: Number(runId), head_sha: revision, head_branch: "main", repository_id: 42, head_repository_id: 42 },
      digest: `sha256:${hash(archive)}`, size_in_bytes: archive.length, created_at: new Date(end - 500).toISOString(),
      expires_at: new Date(end + 86400000).toISOString() };
    const jobs = { total_count: 1, jobs: [{ id: 8001, run_id: Number(runId), run_attempt: 1, head_sha: revision,
      name: "plan", status: "completed", conclusion: "success", started_at: new Date(start).toISOString(), completed_at: new Date(end).toISOString(),
      steps: [{ name: "Upload immutable ordered plan", status: "completed", conclusion: "success",
        started_at: new Date(end - 1000).toISOString(), completed_at: new Date(end).toISOString() }] }] };
    Object.assign(env, { FAKE_FILES: JSON.stringify(files), FAKE_RUN: JSON.stringify(run), FAKE_ARTIFACT: JSON.stringify(artifact),
      FAKE_PLAN_JOBS: JSON.stringify(jobs), ORDERED_ARTIFACT_ID: "456", ORDERED_ARCHIVE_SHA256: hash(archive),
      ORDERED_ARCHIVE: archive.toString("base64") });
  };
  bindOrdered(f.files, "777");
  try {
    for (const name of ["gh", "az"]) { writeFileSync(join(dir, name), tool); chmodSync(join(dir, name), 0o700); }
    const run = (operation, changes = {}) => spawnSync(process.execPath, [script, operation], { cwd: dir, env: { ...env, ...changes }, encoding: "utf8" });
    const guard = run("guard");
    assert.equal(guard.status, 0, guard.stderr);
    const summary = readFileSync(env.GITHUB_STEP_SUMMARY, "utf8");
    assert.match(summary, /explicit human.*authorization/i);
    assert.doesNotMatch(summary, /independent required reviewer|must.*approval comment|prevent self-review/i);
    for (const line of readFileSync(env.GITHUB_OUTPUT, "utf8").trim().split("\n")) {
      const split = line.indexOf("=");
      env[line.slice(0, split).toUpperCase()] = line.slice(split + 1);
    }
    env.GITHUB_JOB = "apply";
    assert.equal(run("verify").status, 0);
    const sourcePath = join(dir, "infra/bicep/company-development.bicep");
    const committedSource = readFileSync(sourcePath);
    writeFileSync(sourcePath, "// dirty source with unchanged HEAD\n");
    for (const operation of ["guard", "verify", "apply"]) {
      const dirty = run(operation);
      assert.equal(dirty.status, 1);
      assert.match(dirty.stderr, /source differs from committed bytes/i);
    }
    writeFileSync(sourcePath, committedSource);
    const diagnosticRoot = join(dir, "company-dev-whatif-diagnostics");
    for (const field of ["diagnostics", "potentialChanges"]) {
      const payload = { ...JSON.parse(env.FAKE_WHAT_IF), status: "Succeeded", error: null,
        [field]: [{ message: "synthetic-private@example.invalid Bearer private-test-token" }] };
      const rejected = run("apply", { FAKE_WHAT_IF: JSON.stringify(payload) });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /diagnostics\/potential changes/);
      const files = readdirSync(diagnosticRoot).map((folder) => join(diagnosticRoot, folder, "response.json"));
      const record = files.map((file) => JSON.parse(readFileSync(file, "utf8"))).find((v) => v.responseSha256 === hash(`${JSON.stringify(payload)}\n`));
      assert.ok(record, "Actual CLI stdout hash must be retained before validation throws");
      for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), /synthetic-private|private-test-token/);
      assert.equal(existsSync(join(dir, "company-dev-apply/fresh-what-if.json")), false);
      assert.equal(existsSync(join(dir, "company-dev-apply/submission.json")), false);
    }
    const diagnosticCount = readdirSync(diagnosticRoot).length;
    const secret = run("apply", { FAKE_WHAT_IF: JSON.stringify({ ...JSON.parse(env.FAKE_WHAT_IF), accessToken: "synthetic-private-test-token" }) });
    assert.equal(secret.status, 1);
    assert.match(secret.stderr, /Resolved secret/);
    assert.doesNotMatch(secret.stderr, /synthetic-private-test-token/);
    assert.equal(readdirSync(diagnosticRoot).length, diagnosticCount);
    const providerError = run("apply", { PROVIDER_ERROR: "true" });
    assert.equal(providerError.status, 1);
    assert.match(providerError.stderr, /ProviderFailure.*synthetic original provider error/);
    assert.equal(readdirSync(diagnosticRoot).length, diagnosticCount);
    for (const changes of [
      { FAIL_QUALITY: "true" }, { DRIFT: "true" }, { NONEMPTY: "true" }, { APPLY_CLIENT_ID: evidence.previewClientId },
      ...["Running", "Failed", "Succeeded", "Canceled", "Unknown"].map((state) => ({ EXISTING_DEPLOYMENT: "true", PREVIOUS_STATE: state })),
      { FOUNDATION_STAGE: "continuation" }, { FOUNDATION_MODE: "reviewed-reentry" }, { EVIDENCE_VERSION: "1" },
    ]) {
      assert.equal(run("apply", changes).status, 1, JSON.stringify(changes));
    }
    const calls = () => readFileSync(env.TOOL_LOG, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(calls().filter((call) => call.name === "az" && call.args[0] === "rest" && call.args.includes("put")).length, 0);
    for (const flag of ["PENDING_QUALITY", "FAIL_PRESUBMIT_QUALITY", "PENDING_PRESUBMIT_QUALITY"]) {
      const failed = run("apply", { [flag]: "true" });
      assert.equal(failed.status, 1, failed.stderr);
      assert.match(failed.stderr, /quality|workflow/i);
      rmSync(join(dir, "previewed"), { force: true });
    }
    for (const key of ["FAKE_ENVIRONMENT", "FAKE_PREVIEW_ENVIRONMENT"]) {
      const before = JSON.parse(env[key]); before.id++;
      assert.equal(run("verify", { [key]: JSON.stringify(before) }).status, 1, key);
    }
    assert.equal(run("verify", { GITHUB_RUN_ATTEMPT: "2" }).status, 1, "Apply-only rerun must reject old plan binding");
    for (const outcome of ["failure", "skipped", null]) {
      const jobs = JSON.parse(env.FAKE_PLAN_JOBS); jobs.jobs[0].conclusion = outcome;
      assert.equal(run("verify", { FAKE_PLAN_JOBS: JSON.stringify(jobs) }).status, 1);
    }
    const archiveBad = Buffer.from(env.ORDERED_ARCHIVE, "base64"); archiveBad[0] ^= 1;
    assert.equal(run("verify", { ORDERED_ARCHIVE: archiveBad.toString("base64") }).status, 1);
    assert.equal(calls().filter((call) => call.name === "az" && call.args[0] === "rest" && call.args.includes("put")).length, 0);
    const result = run("apply");
    assert.equal(result.status, 0, result.stderr);
    const state = JSON.parse(readFileSync(join(dir, "company-dev-apply/bootstrap-state.json"), "utf8"));
    const validatedBootstrapCheckpoint = readFileSync(join(dir, "company-dev-apply/checkpoint.json"), "utf8");
    assert.equal(state.resources.length, 7);
    assert.equal(state.securityHandoffVerified, false);
    // Initial mode cannot replay completion. Reviewed re-entry/no-op uses the
    // separate inventory + terminal-inspection route exercised below.
    assert.equal(run("apply").status, 1);
    const writes = calls().filter((call) => call.name === "az" && call.args[0] === "rest" && call.args.includes("put"));
    assert.equal(writes.length, 1);
    const args = writes[0].args;
    assert.equal(args[args.indexOf("--method") + 1], "put");
    assert.match(args[args.indexOf("--url") + 1], new RegExp(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/`));
    const body = JSON.parse(args[args.indexOf("--body") + 1]);
    assert.deepEqual(body.properties.template, JSON.parse(f.files["template.json"]));
    assert.deepEqual(body.properties.parameters, JSON.parse(f.files["parameters.json"]).parameters);
    assert.equal(calls().filter((call) => call.name === "az" && call.args[0] === "rest" && call.args.includes("put")).length, 1);
    rmSync(join(dir, "submitted"));
    const unknown = spawnSync(process.execPath, [script, "apply"], {
      cwd: dir, env: { ...env, RESULT_STATE: "Unknown" }, encoding: "utf8", timeout: 10000,
    });
    assert.equal(unknown.status, 1, "Unknown ARM outcome must stop immediately, not poll or retry");
    assert.match(unknown.stderr, /unknown.*inspect/i);
    assert.equal(run("apply").status, 1, "Unknown submission cannot be retried against retained resources");
    assert.equal(calls().filter((call) => call.name === "az" && call.args[0] === "rest" && call.args.includes("put")).length, 2);
    // Exercise BOTH real protected CLIs (all subprocesses synthetic): immutable
    // bootstrap checkpoint -> native preview context -> prepare/actual reads ->
    // seven-file plan -> native apply context -> single continuation PUT -> a
    // fresh reviewed-reentry plan and verified completed NO-PUT replay.
    const staged = await stagedFixture();
    const stageContext = staged.context; delete stageContext.freezeReference;
    stageContext.baseline = JSON.parse(validatedBootstrapCheckpoint).resources;
    stageContext.deploymentName = `companydev-continuation-${revision.slice(0, 12)}`;
    const setPredecessor = (bytes, runId, artifactId) => {
      const cp = JSON.parse(bytes);
      stageContext.predecessor = { runId, runAttempt: "1", artifactId, stage: cp.stage, mode: cp.mode, sha: revision, checkpointSha256: hash(bytes) };
      Object.assign(env, { FAKE_CHECKPOINT: bytes, PREDECESSOR_RUN_ID: runId, PREDECESSOR_ARTIFACT_ID: artifactId,
        FAKE_PREDECESSOR_RUN: JSON.stringify({ ...f.run, id: Number(runId), path: ".github/workflows/company-development-foundation-apply.yml" }),
        FAKE_PREDECESSOR_ARTIFACT: JSON.stringify({ id: Number(artifactId), expired: false, name: `company-dev-foundation-${cp.stage}-${cp.mode}-v${cp.version}-apply-${revision}-${runId}-1`, workflow_run: { id: Number(runId), head_sha: revision } }) });
    };
    setPredecessor(validatedBootstrapCheckpoint, "777", "888");
    const relativeUtc = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
    Object.assign(stageContext.security.functionalTest, { enabledAt: relativeUtc(60), startedAt: relativeUtc(50), uploadedAt: relativeUtc(49), scanTime: relativeUtc(48), observedAt: relativeUtc(47) });
    const runtime = continuationResources(staged.state);
    Object.assign(env, { STAGED: "true", FOUNDATION_STAGE: "continuation",
      COMPANY_DEV_PLAN_ENABLED: "true", PREVIEW_CLIENT_ID: evidence.previewClientId,
      VNET_CIDR: input.vnetCidr, ACA_SUBNET_CIDR: input.acaSubnetCidr, POSTGRES_SUBNET_CIDR: input.postgresSubnetCidr, NETWORK_APPROVAL: input.networkApproval,
      BOOTSTRAP_DEPLOYMENT: JSON.parse(validatedBootstrapCheckpoint).deploymentName, CONTINUATION_DEPLOYMENT: stageContext.deploymentName,
      FAKE_TEMPLATE: f.files["template.json"], FAKE_CONTINUATION_RESOURCES: JSON.stringify(runtime), FAKE_TOP_TYPES: JSON.stringify(staged.state.topLevelTypes),
      FAKE_ASSIGNMENTS: JSON.stringify(staged.transport.assignments), FAKE_DEFENDER: JSON.stringify(staged.transport.defender),
      FAKE_SCANNER: JSON.stringify(staged.transport.scanner), FAKE_PERMISSIONS: JSON.stringify(staged.transport.permissions),
      FAKE_STAGE_PERMISSIONS: JSON.stringify(staged.transport.stagePermissions) });
    const outputs = () => {
      for (const line of readFileSync(env.GITHUB_OUTPUT, "utf8").trim().split("\n")) {
        const i = line.indexOf("="); env[line.slice(0, i).toUpperCase()] = line.slice(i + 1);
      }
    };
    const protectedStage = (mode, previewId, applyId) => {
      Object.assign(env, { FOUNDATION_MODE: mode, STAGE_CONTEXT: JSON.stringify(stageContext), GITHUB_RUN_ID: applyId,
        PREVIEW_PHASE: "true", FAKE_ENVIRONMENT: JSON.stringify({ ...environment, name: "company-dev" }) });
      env.FAKE_WHAT_IF = JSON.stringify({ changes: staged.state.continuationInventory().map(({ id, type }) => ({ resourceId: id, changeType: mode === "initial" ? "Create" : "NoChange", after: { type } })) });
      const previewScript = resolve("scripts/infra/company-development.mjs");
      const previewWorkflow = YAML.parse(readFileSync(resolve(".github/workflows/company-development-foundation.yml"), "utf8"));
      const previewRun = (op, omitToken = false) => {
        const job = previewWorkflow.jobs[op === "guard" ? "guard" : "plan"];
        const step = job.steps.find((s) => s.run?.endsWith(`company-development.mjs ${op}`));
        const stepEnv = { ...env };
        delete stepEnv.GH_TOKEN; delete stepEnv.GITHUB_TOKEN;
        const token = step.env?.GH_TOKEN ?? job.env?.GH_TOKEN ?? previewWorkflow.env?.GH_TOKEN;
        if (!omitToken && token === "${{ github.token }}") stepEnv.GH_TOKEN = "synthetic-actions-token";
        return spawnSync(process.execPath, [previewScript, op], { cwd: dir, env: stepEnv, encoding: "utf8" });
      };
      for (const op of ["guard", "prepare", "preview"]) {
        if (op === "preview") {
          const missingToken = previewRun(op, true);
          assert.equal(missingToken.status, 1);
          assert.match(missingToken.stderr, /set GH_TOKEN/);
        }
        const result = previewRun(op); assert.equal(result.status, 0, `${op}: ${result.stderr}`); outputs();
      }
      const files = Object.fromEntries(Object.keys(f.files).map((name) => [name, readFileSync(join(dir, "company-dev-plan", name), "utf8")]));
      const planEvidence = JSON.parse(files["evidence.json"]);
      Object.assign(env, { GITHUB_RUN_ID: applyId, PREVIEW_PHASE: "false", FAKE_ENVIRONMENT: JSON.stringify(environment),
        FAKE_PREVIEW_ENVIRONMENT: JSON.stringify({ ...environment, name: "company-dev" }),
        PLAN_RUN_ID: previewId, FAKE_FILES: JSON.stringify(files),
        FAKE_RUN: JSON.stringify({ ...f.run, id: Number(previewId) }),
        FAKE_ARTIFACT: JSON.stringify({ ...f.artifact, name: `company-dev-foundation-continuation-${mode}-v2-plan-${revision}-${previewId}-1`, workflow_run: { id: Number(previewId), head_sha: revision } }),
        REVIEWED_SOURCE_SHA256: planEvidence.sourceSha256, REVIEWED_TEMPLATE_SHA256: planEvidence.templateSha256,
        REVIEWED_PARAMETERS_SHA256: planEvidence.parametersSha256, REVIEWED_WHAT_IF_SHA256: planEvidence.whatIfSha256,
        REVIEWED_INVENTORY_SHA256: planEvidence.inventorySha256, REVIEWED_EVIDENCE_SHA256: hash(files["evidence.json"]) });
      bindOrdered(files, applyId, "continuation", mode);
      for (const op of ["guard", "verify", "apply"]) {
        env.GITHUB_JOB = op === "guard" ? "apply_guard" : "apply";
        const result = run(op); assert.equal(result.status, 0, `${mode} ${op}: ${result.stderr}`); outputs();
      }
      return readFileSync(join(dir, "company-dev-apply/checkpoint.json"), "utf8");
    };
    const beforeContinuation = calls().length;
    const continuationCheckpoint = protectedStage("initial", "124", "999");
    assert.equal(JSON.parse(continuationCheckpoint).stage, "continuation");
    assert.equal(JSON.parse(continuationCheckpoint).completed, true);
    assert.equal(calls().slice(beforeContinuation).filter((c) => c.name === "az" && c.args[0] === "rest" && c.args.includes("put")).length, 1);
    setPredecessor(continuationCheckpoint, "999", "889");
    stageContext.baseline = JSON.parse(continuationCheckpoint).resources;
    stageContext.inspection = staged.state.canonical({ name: stageContext.deploymentName, status: "Succeeded",
      operations: runtime.map((r) => ({ operationId: null, provisioningState: "Succeeded", provisioningOperation: "Create", targetResource: { id: r.id, resourceType: r.type } })) });
    const beforeNoop = calls().length;
    const noopCheckpoint = protectedStage("reviewed-reentry", "125", "1001");
    assert.equal(JSON.parse(noopCheckpoint).completed, true);
    assert.equal(JSON.parse(readFileSync(join(dir, "company-dev-apply/result.json"), "utf8")).state, "VerifiedNoOp");
    assert.equal(calls().slice(beforeNoop).filter((c) => c.name === "az" && c.args[0] === "rest" && c.args.includes("put")).length, 0);
    // Preserve the historical v1 CLI contract using its exact baseline driver
    // bytes. The NEW v3 closure cannot be laundered into a nine-path v1
    // transition; that boundary is separately asserted by completion tests.
    const legacyDriver = join(realpathSync(dir), "historical-v1-driver");
    mkdirSync(legacyDriver);
    for (const name of ["company-development.mjs", "company-development-state.mjs", "company-development-apply.mjs"]) {
      writeFileSync(join(legacyDriver, name), execFileSync("git", ["show", `6fccaa9ca066e32fde2870858adc1334525a7423:scripts/infra/${name}`]));
    }
    script = join(legacyDriver, "company-development-apply.mjs");
    const recovery = await verificationRecoveryFixture(recoveryFrom, recoveryTo, dir);
    recovery.context.predecessor.artifactId = "888";
    recovery.artifact.id = 888;
    recovery.authenticate();
    rmSync(join(dir, "continued"));
    rmSync(join(dir, "company-dev-apply/bootstrap-state.json"));
    const beforeRecovery = calls().length;
    Object.assign(env, {
      RECOVERY: "true", FOUNDATION_STAGE: "bootstrap", FOUNDATION_MODE: "reviewed-reentry", STAGE_CONTEXT: JSON.stringify(recovery.context),
      EVIDENCE_VERSION: "2", CHANGE_FREEZE: input.changeFreeze,
      BOOTSTRAP_DEPLOYMENT: recovery.predecessor.deploymentName, GITHUB_RUN_ID: "126", PREVIEW_PHASE: "true",
      FAKE_ENVIRONMENT: JSON.stringify({ ...environment, name: "company-dev" }),
      PREDECESSOR_RUN_ID: recovery.predecessor.runId, PREDECESSOR_ARTIFACT_ID: "888",
      FAKE_PREDECESSOR_RUN: JSON.stringify(recovery.run), FAKE_PREDECESSOR_ARTIFACT: JSON.stringify(recovery.artifact),
      FAKE_ARCHIVE: recovery.archive.toString("base64"), FAKE_OPERATIONS: JSON.stringify(recovery.operations),
      FAKE_DEPLOYMENTS: JSON.stringify(recovery.deployments), FAKE_WHAT_IF: JSON.stringify(recovery.plan.whatIf),
      FAKE_STAGE_PERMISSIONS: JSON.stringify(recovery.transport.stagePermissions),
      FAKE_ASSIGNMENTS: JSON.stringify(recovery.transport.assignments), FAKE_DEFENDER: JSON.stringify(recovery.transport.defender),
    });
    const previewScript = join(legacyDriver, "company-development.mjs");
    const previewRun = (op, changes = {}) => spawnSync(process.execPath, [previewScript, op], { cwd: dir, env: { ...env, ...changes }, encoding: "utf8" });
    for (const op of ["guard", "prepare"]) {
      const result = previewRun(op); assert.equal(result.status, 0, result.stderr); outputs();
    }
    const whatIfCalls = () => calls().filter((c) => c.name === "az" && c.args.includes("what-if")).length;
    const beforeBadPreview = whatIfCalls();
    const badDeployments = structuredClone(recovery.deployments);
    badDeployments[0].properties.provisioningState = "Failed";
    const badPreview = previewRun("preview", { FAKE_DEPLOYMENTS: JSON.stringify(badDeployments) });
    assert.equal(badPreview.status, 1);
    assert.equal(whatIfCalls(), beforeBadPreview, "Origin mismatch stops before provider preview");
    const freshPreview = previewRun("preview");
    assert.equal(freshPreview.status, 0, freshPreview.stderr);
    const recoveryFiles = Object.fromEntries(Object.keys(f.files).map((name) => [name, readFileSync(join(dir, "company-dev-plan", name), "utf8")]));
    const recoveryEvidence = JSON.parse(recoveryFiles["evidence.json"]);
    assert.deepEqual(recoveryEvidence.stageContext.sourceTransition, recovery.context.sourceTransition);
    Object.assign(env, { PREVIEW_PHASE: "false", GITHUB_RUN_ID: "1002", FAKE_ENVIRONMENT: JSON.stringify(environment),
      PLAN_RUN_ID: "126", FAKE_FILES: JSON.stringify(recoveryFiles),
      FAKE_RUN: JSON.stringify({ ...f.run, id: 126 }),
      FAKE_ARTIFACT: JSON.stringify({ ...f.artifact, name: `company-dev-foundation-bootstrap-reviewed-reentry-v2-plan-${revision}-126-1`, workflow_run: { id: 126, head_sha: revision } }),
      REVIEWED_SOURCE_SHA256: recoveryEvidence.sourceSha256, REVIEWED_TEMPLATE_SHA256: recoveryEvidence.templateSha256,
      REVIEWED_PARAMETERS_SHA256: recoveryEvidence.parametersSha256, REVIEWED_WHAT_IF_SHA256: recoveryEvidence.whatIfSha256,
      REVIEWED_INVENTORY_SHA256: recoveryEvidence.inventorySha256, REVIEWED_EVIDENCE_SHA256: hash(recoveryFiles["evidence.json"]) });
    for (const op of ["guard", "verify"]) {
      const result = run(op); assert.equal(result.status, 0, `${op}: ${result.stderr}`); outputs();
    }
    const badApply = run("apply", { FAKE_DEPLOYMENTS: JSON.stringify(badDeployments) });
    assert.equal(badApply.status, 1);
    assert.equal(whatIfCalls(), beforeBadPreview + 1, "Apply origin mismatch stops before fresh preview");
    assert.equal(readFileSync(join(dir, "company-dev-apply/checkpoint.json"), "utf8"), noopCheckpoint, "Rejected transition cannot replace checkpoint");
    const recovered = run("apply");
    assert.equal(recovered.status, 0, recovered.stderr);
    const recoveredCheckpoint = JSON.parse(readFileSync(join(dir, "company-dev-apply/checkpoint.json"), "utf8"));
    assert.equal(recoveredCheckpoint.completed, true);
    assert.equal(recoveredCheckpoint.commitSha, revision);
    assert.equal(recoveredCheckpoint.deploymentCommitSha, recoveryFrom.revision);
    assert.equal(recoveredCheckpoint.deploymentName, recovery.predecessor.deploymentName);
    assert.deepEqual(recoveredCheckpoint.originalCheckpoint, recovery.predecessor);
    assert.equal(recoveredCheckpoint.originalCheckpoint.completed, false);
    assert.deepEqual(recoveredCheckpoint.sourceTransition, recovery.context.sourceTransition);
    const recoveredState = JSON.parse(readFileSync(join(dir, "company-dev-apply/bootstrap-state.json"), "utf8"));
    assert.equal(recoveredState.securityHandoffVerified, false);
    assert.equal(recoveredState.operations.flatMap((v) => v.operations).length, 17);
    assert.deepEqual(recoveredState.resources, recovery.boot);
    assert.equal(calls().slice(beforeRecovery).filter((c) => c.name === "az" && c.args[0] === "rest" && c.args.includes("put")).length, 0);
    assert.equal(whatIfCalls(), beforeBadPreview + 2, "Fresh preview then fresh apply what-if");
    assert.ok(calls().slice(beforeContinuation).filter((c) => c.name === "az").every((c) => c.args[0] !== "storage" && (c.args[0] !== "role" || c.args[2] === "list")), "No workflow Blob access or role grant");
    for (const call of calls().filter((call) => call.name === "az" && call.args[0] !== "bicep")) assert.equal(call.args[call.args.indexOf("--subscription") + 1], subscriptionId);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
