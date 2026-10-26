import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  armParameters, assertAzureContext, assertReviewContext, currentRun, destination,
  foundationSource, guard, normalizedPreview, preserveWhatIfDiagnostics, validateInputs, workflowContext, loadStagePredecessor,
  assertBootstrapPreview, assertImplementedStage, assertNoSecretPayload, bootstrapInventory, sourcePaths, stageInventory, validatePreview,
} from "./company-development.mjs";
import { manifestPaths, assertCompletionBasis } from "./company-development-completion-validation.mjs";
import { readArchive } from "./company-development-completion.mjs";

const repository = "keyforta/keyforta-property";
const applyEnvironment = "company-dev-apply";
const fileNames = ["evidence.json", "inputs.json", "parameters.json", "review-context.json", "template.json", "what-if.json", "inventory.json"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function command(executable, args) {
  return execFileSync(executable, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
}
const github = (path) => JSON.parse(command("gh", ["api", `repos/${repository}/${path}`]));
function azure(args) {
  try {
    const stdout = command("az", [...args, "--subscription", destination.subscriptionId, "--output", "json", "--only-show-errors"]);
    if (args.slice(0, 3).join(" ") === "deployment group what-if") preserveWhatIfDiagnostics(stdout, "apply");
    return JSON.parse(stdout);
  }
  catch (error) {
    const match = /^ERROR: \((ResourceNotFound|DeploymentNotFound)\)/m.exec(error.stderr?.toString() ?? "");
    if (match) error.code = match[1]; // distinguish documented absence from 403/transport/unknown failures
    throw error;
  }
}
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });

// ARM guid() is RFC 4122 UUIDv5 with this documented namespace and '-' joined
// UTF-8 arguments. Keep full role definition resource IDs, not role GUIDs.
// https://learn.microsoft.com/azure/azure-resource-manager/templates/template-functions-string#guid
export function armGuid(...values) {
  assert.ok(values.length && values.every((value) => typeof value === "string" && value.length), "Missing ARM guid argument");
  const namespace = Buffer.from("11fb06fb712d4ddd98c7e71bbd588830", "hex");
  const bytes = createHash("sha1").update(namespace).update(values.join("-"), "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const text = bytes.toString("hex");
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

function identityBindings(state) {
  if (state?.kind === "bootstrap-completion-basis") assertCompletionBasis(state);
  else {
    assert.ok([2, 3].includes(state?.version), "Legacy/unknown/missing bootstrap predecessor");
    assert.equal(state.stage, "bootstrap", "Wrong predecessor stage");
    assert.deepEqual(state.destination, destination, "Wrong predecessor destination");
  }
  assert.ok(Array.isArray(state.resources), "Missing predecessor resource visibility");
  const inventory = (resources) => resources.map((r) => ({ id: r.id.toLowerCase(), type: r.type.toLowerCase() })).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(inventory(state.resources), inventory(bootstrapInventory()), "Missing/extra/foreign predecessor resources");
  return bootstrapInventory().filter((r) => r.type.endsWith("/userAssignedIdentities")).map(({ id }) => {
    const resource = state.resources.find((r) => r.id.toLowerCase() === id.toLowerCase());
    assert.equal(resource.properties?.tenantId, destination.tenantId, "Wrong identity tenant");
    for (const field of ["principalId", "clientId"]) assert.match(resource.properties[field] ?? "", uuid, `Missing identity ${field}`);
    return { resourceId: id, tenantId: resource.properties.tenantId, principalId: resource.properties.principalId.toLowerCase(), clientId: resource.properties.clientId.toLowerCase() };
  });
}

// Operator-only READ + command preparation, never execution. The predecessor
// comparison detects resource recreation/swap; its JSON/hash is review context,
// NOT independent provenance, rights-revocation or security approval.
export function prepareHumanGrants(read, deploymentName, predecessor) {
  const account = read(["account", "show"]);
  assertAzureContext(account);
  assert.equal(account.user?.type, "user", "Human grant preparation requires actual manual operator context, never workflow federation");
  assert.ok(account.user.name, "Missing actual operator context");
  const before = identityBindings(predecessor);
  const state = readBootstrapState(read, deploymentName);
  const bindings = identityBindings(state);
  assert.deepEqual(bindings, before, "Recreated/swapped UAMI principal/client binding; stop and review predecessor");
  const inventory = bootstrapInventory();
  const registry = inventory.find((r) => r.type.endsWith("/registries")).id;
  const container = inventory.find((r) => r.type.endsWith("/containers")).id;
  const role = (id) => `/subscriptions/${destination.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${id}`;
  const tuples = [
    ...bindings.map((identity) => ({ identity, scope: registry, roleDefinitionId: role("7f951dda-4ed3-4680-a7ca-43fe172d538d") })),
    { identity: bindings.find((identity) => identity.resourceId.endsWith("-api")), scope: container, roleDefinitionId: role("ba92f5b4-2d11-453d-a403-e96b0029c9fe") },
  ];
  const assignments = tuples.map(({ identity, scope, roleDefinitionId }) => {
    const name = armGuid(scope, identity.resourceId, roleDefinitionId);
    return {
      id: `${scope}/providers/Microsoft.Authorization/roleAssignments/${name}`, name, scope, roleDefinitionId,
      identityResourceId: identity.resourceId, principalId: identity.principalId,
      clientId: identity.clientId, principalType: "ServicePrincipal",
    };
  });
  assertApprovedHumanGrantPolicy(assignments);
  const observed = new Map();
  for (const scope of [registry, container]) {
    // Documented CLI reads include direct/inherited assignments visible at each
    // exact destination. Visibility is not proof of transitive group/PIM access.
    const rows = read(["role", "assignment", "list", "--scope", scope, "--include-inherited"]);
    assert.ok(Array.isArray(rows), "Missing role-assignment read visibility");
    for (const row of rows) {
      assert.ok(row && typeof row.id === "string" && typeof row.scope === "string" && typeof row.principalId === "string", "Incomplete role-assignment read visibility");
      const relevant = bindings.some((b) => b.principalId === row.principalId.toLowerCase())
        || assignments.some((a) => a.id.toLowerCase() === row.id.toLowerCase())
        || [registry, container].some((id) => id.toLowerCase() === row.scope.toLowerCase());
      if (!relevant) continue; // Other principals' inherited roles remain native human review context.
      const expected = assignments.find((a) => a.id.toLowerCase() === row.id.toLowerCase());
      assert.ok(expected, "Extra/inherited/broad-scope/foreign-principal grant; stop before preparing commands");
      assertHumanGrantTuple(row, expected);
      const prior = observed.get(row.id.toLowerCase());
      if (prior) assert.deepEqual(row, prior, "Conflicting assignment read snapshots");
      observed.set(row.id.toLowerCase(), row);
    }
  }
  const commands = assignments.filter((a) => !observed.has(a.id.toLowerCase())).map((a) => ({
    executable: "az", args: [
      "role", "assignment", "create", "--name", a.name, "--scope", a.scope, "--role", a.roleDefinitionId,
      "--assignee-object-id", a.principalId, "--assignee-principal-type", "ServicePrincipal",
      "--subscription", destination.subscriptionId, "--only-show-errors",
    ],
  }));
  return {
    version: 2, stage: "human-grant-preparation", destination, bootstrapDeploymentName: deploymentName,
    // Historical command/stage name: preparation may be run by an explicitly
    // owner-directed local agent in this actual user context. Still no execution
    // authority, authenticated consent, effective-access proof or workflow grants.
    operator: { tenantId: account.tenantId, user: { type: account.user.type, name: account.user.name } }, bindings, assignments, commands,
    observedAssignments: [...observed.values()],
    reviewContextOnly: true, workflowGrantAuthority: false, securityHandoffVerified: false,
  };
}

// Exact tuple/idempotency checker ONLY. It does not prove the completeness of a
// caller-supplied listing or transitive/PIM/effective rights. Existing conflicts,
// broader scopes, conditions and unexplained assignments cannot be reconciled.
export function assertHumanGrantAssignments(actual, expected) {
  assert.ok(Array.isArray(actual), "Missing role-assignment visibility");
  assertApprovedHumanGrantPolicy(expected);
  assert.equal(actual.length, expected.length, "Missing/extra/inherited role assignment; stop for review");
  const ids = new Set();
  for (const assignment of actual) {
    assert.ok(assignment && typeof assignment.id === "string", "Missing actual assignment ID");
    const id = assignment.id.toLowerCase();
    assert.ok(!ids.has(id), "Repeated role assignment");
    ids.add(id);
    const match = expected.find((item) => item.id.toLowerCase() === id);
    assert.ok(match, "Unexpected/conflicting role assignment ID/scope");
    assertHumanGrantTuple(assignment, match);
  }
  return expected.map((a) => a.id);
}

function assertApprovedHumanGrantPolicy(assignments) {
  assert.ok(Array.isArray(assignments) && assignments.length === 4, "Expected the four approved human grants");
  const inventory = bootstrapInventory();
  const registry = inventory.find((r) => r.type.endsWith("/registries")).id;
  const container = inventory.find((r) => r.type.endsWith("/containers")).id;
  const roles = {
    pull: `/subscriptions/${destination.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/7f951dda-4ed3-4680-a7ca-43fe172d538d`,
    blob: `/subscriptions/${destination.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe`,
  };
  const pulls = assignments.filter((a) => a.scope === registry && a.roleDefinitionId === roles.pull);
  const blobs = assignments.filter((a) => a.scope === container && a.roleDefinitionId === roles.blob);
  assert.equal(pulls.length, 3, "Unapproved registry role/scope policy");
  assert.equal(blobs.length, 1, "Unapproved container role/scope policy");
  const identities = inventory.filter((r) => r.type.endsWith("/userAssignedIdentities")).map((r) => r.id).sort();
  assert.deepEqual(pulls.map((a) => a.identityResourceId).sort(), identities, "Unapproved/foreign identity resource policy");
  assert.equal(new Set(pulls.map((a) => a.principalId)).size, 3, "Expected three distinct actual principals");
  assert.equal(new Set(pulls.map((a) => a.clientId)).size, 3, "Expected three distinct actual client IDs");
  const api = pulls.find((a) => a.identityResourceId.endsWith("-api"));
  for (const key of ["identityResourceId", "principalId", "clientId"]) assert.equal(blobs[0][key], api[key], `API container identity ${key} mismatch`);
  for (const a of assignments) {
    for (const field of ["principalId", "clientId"]) assert.match(a[field] ?? "", uuid, `Missing expected ${field}`);
    assert.equal(a.principalType, "ServicePrincipal", "Unexpected expected principal type");
    assert.equal(a.name, armGuid(a.scope, a.identityResourceId, a.roleDefinitionId), "Unapproved assignment name");
    assert.equal(a.id, `${a.scope}/providers/Microsoft.Authorization/roleAssignments/${a.name}`, "Unapproved assignment resource ID");
  }
}

function assertHumanGrantTuple(assignment, expected) {
  assert.equal(expected.name, armGuid(expected.scope, expected.identityResourceId, expected.roleDefinitionId), "Expected deterministic tuple mismatch");
  for (const key of ["id", "name", "principalId", "roleDefinitionId", "scope"]) {
    assert.equal(assignment[key]?.toLowerCase(), expected[key].toLowerCase(), `Role assignment ${key} mismatch`);
  }
  assert.equal(assignment.principalType, "ServicePrincipal", "Unexpected assignment principal type");
  assert.ok(!assignment.condition && !assignment.conditionVersion, "Conditional/equivalent authority needs separate review");
}

// Typed read-only transport. This is a bootstrap snapshot, NOT proof of effective
// RBAC, writer revocation, Defender backend readiness or security handoff.
export function readBootstrapState(read, deploymentName) {
  assert.match(deploymentName, /^companydev-bootstrap-[a-z0-9]+$/);
  const expected = bootstrapInventory();
  const inventory = (rows) => {
    assert.ok(Array.isArray(rows), "Missing actual resource inventory visibility");
    return rows.map((r) => ({ id: r.id.toLowerCase(), type: r.type.toLowerCase() })).sort((a, b) => a.id.localeCompare(b.id));
  };
  const listed = read(["resource", "list", "--resource-group", destination.resourceGroup]);
  assert.deepEqual(inventory(listed), inventory(expected.filter((r) => !r.type.includes("/blobServices"))), "Unexpected actual bootstrap resource inventory");
  const operations = [];
  const visited = new Set();
  const observed = new Set();
  const walk = (name) => {
    assert.ok(!visited.has(name), "Repeated deployment operation context");
    visited.add(name);
    const rows = read(["deployment", "operation", "group", "list", "--resource-group", destination.resourceGroup, "--name", name]);
    assert.ok(Array.isArray(rows) && rows.length, "Missing completed ARM operations visibility");
    operations.push({ deploymentName: name, operations: rows });
    for (const operation of rows) {
      const p = operation.properties;
      assert.equal(p?.provisioningState, "Succeeded", "Incomplete/failed actual ARM operation");
      if (p.provisioningOperation === "EvaluateDeploymentOutput") {
        assert.ok(!p.targetResource, "Unexpected output-evaluation resource target");
        continue; // Output evaluation establishes no resource creation/provenance.
      }
      if (p.provisioningOperation === "Read") {
        // ARM output references: foundation/stamp module outputs, then registry
        // loginServer and API/migration identity properties. Not arbitrary RG
        // reads, and never creation credit or another nested-deployment walk.
        const target = p.targetResource;
        assert.ok(target?.id && target.resourceType, "Missing actual ARM Read target");
        const child = name === deploymentName ? "foundation-keyforta-cdev"
          : name === "foundation-keyforta-cdev" ? "stamp-keyforta-cdev" : null;
        const allowed = child
          ? [{ id: `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/Microsoft.Resources/deployments/${child}`, type: "Microsoft.Resources/deployments" }]
          : expected.filter((r) => r.type === "Microsoft.ContainerRegistry/registries"
            || (r.type === "Microsoft.ManagedIdentity/userAssignedIdentities" && /-(api|migration)$/.test(r.id)));
        assert.ok(allowed.some((r) => r.id.toLowerCase() === target.id.toLowerCase() && r.type.toLowerCase() === target.resourceType.toLowerCase()), "Unexpected actual ARM Read target");
        continue;
      }
      assert.equal(p.provisioningOperation, "Create", "Unexpected/unknown bootstrap ARM operation");
      const target = p.targetResource;
      assert.ok(target?.id && target.resourceType, "Missing actual ARM operation target");
      if (target.resourceType === "Microsoft.Resources/deployments") {
        const child = target.id.split("/").at(-1);
        assert.ok(["foundation-keyforta-cdev", "stamp-keyforta-cdev"].includes(child), "Unexpected nested deployment");
        assert.equal(target.id.toLowerCase(), `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/Microsoft.Resources/deployments/${child}`.toLowerCase(), "Foreign nested deployment");
        walk(child);
      } else {
        assert.ok(expected.some((r) => r.id.toLowerCase() === target.id.toLowerCase() && r.type.toLowerCase() === target.resourceType.toLowerCase()), "Unexpected actual ARM target");
        observed.add(target.id.toLowerCase());
      }
    }
  };
  walk(deploymentName);
  assert.deepEqual([...observed].sort(), expected.map((r) => r.id.toLowerCase()).sort(), "ARM operations do not establish all seven bootstrap resources");
  const principals = new Set(), clients = new Set();
  const resources = expected.map((item) => {
    const apiVersion = item.type.startsWith("Microsoft.ManagedIdentity/") ? "2023-01-31"
      : item.type.startsWith("Microsoft.ContainerRegistry/") ? "2023-11-01-preview" : "2023-05-01";
    const actual = read(["resource", "show", "--ids", item.id, "--api-version", apiVersion]);
    assert.equal(actual?.id?.toLowerCase(), item.id.toLowerCase(), "Actual resource destination mismatch");
    assert.equal(actual.type.toLowerCase(), item.type.toLowerCase(), "Actual resource type mismatch");
    const p = actual.properties;
    assert.ok(p, "Missing actual resource properties/visibility");
    if (!item.type.includes("/blobServices")) assert.equal(actual.location, destination.location, "Actual resource region mismatch");
    if (item.type.endsWith("/userAssignedIdentities")) {
      assert.equal(p.tenantId, destination.tenantId, "Actual identity tenant mismatch");
      for (const field of ["principalId", "clientId"]) assert.match(p[field] ?? "", uuid, `Missing actual identity ${field}`);
      assert.ok(!principals.has(p.principalId.toLowerCase()) && !clients.has(p.clientId.toLowerCase()), "Duplicated/swapped actual identity binding");
      principals.add(p.principalId.toLowerCase()); clients.add(p.clientId.toLowerCase());
    } else if (item.type.endsWith("/registries")) {
      assert.equal(actual.sku?.name, "Basic", "Actual registry SKU drift");
      assert.equal(p.provisioningState, "Succeeded", "Actual registry provisioning incomplete");
      assert.equal(p.adminUserEnabled, false, "Actual registry admin security drift");
      assert.equal(p.publicNetworkAccess, "Enabled", "Actual registry network drift");
    } else if (item.type.endsWith("/storageAccounts")) {
      assert.equal(actual.sku?.name, "Standard_LRS", "Actual Storage SKU drift");
      assert.equal(actual.kind, "StorageV2", "Actual Storage kind drift");
      assert.equal(p.provisioningState, "Succeeded", "Actual Storage provisioning incomplete");
      for (const [key, value] of Object.entries({
        allowBlobPublicAccess: false, allowSharedKeyAccess: false, defaultToOAuthAuthentication: true,
        minimumTlsVersion: "TLS1_2", supportsHttpsTrafficOnly: true, publicNetworkAccess: "Enabled",
      })) assert.equal(p[key], value, `Actual Storage security drift: ${key}`);
    } else if (item.type.endsWith("/blobServices")) {
      assert.equal(p.deleteRetentionPolicy?.enabled, true, "Actual soft-delete disabled");
      assert.equal(p.deleteRetentionPolicy?.days, 7, "Actual soft-delete retention drift");
    } else assert.equal(p.publicAccess, "None", "Actual container is not private");
    return actual;
  });
  assert.ok([...principals].every((id) => !clients.has(id)), "Principal IDs cannot be substituted with client IDs");
  return { version: 2, stage: "bootstrap", destination, resources, operations, securityHandoffVerified: false };
}

export function assertPlan(files, run, artifact, expected, currentSourceSha256) {
  assert.deepEqual(Object.keys(files).sort(), [...fileNames].sort(), "Unexpected artifact file inventory");
  assertImplementedStage(expected);
  assert.equal(expected.evidenceVersion, 2, "Legacy standalone plan requires evidence version 2");
  assert.equal(String(run.id), expected.runId, "Preview run ID mismatch");
  assert.equal(String(run.run_attempt), expected.runAttempt, "Preview run attempt mismatch");
  assert.equal(run.head_sha, expected.sha, "Preview SHA mismatch");
  assert.equal(run.head_branch, "main", "Preview must be from main");
  assert.equal(run.event, "workflow_dispatch", "Preview must be manually dispatched");
  assert.equal(run.status, "completed", "Preview not completed");
  assert.equal(run.conclusion, "success", "Preview not successful");
  assert.equal(run.path, ".github/workflows/company-development-foundation.yml", "Wrong preview workflow");
  assert.equal(run.repository?.full_name, repository, "Wrong preview repository");
  assert.equal(run.head_repository?.full_name, repository, "Foreign preview source");
  assert.equal(String(artifact.id), expected.artifactId, "Artifact ID mismatch");
  assert.equal(artifact.expired, false, "Preview artifact expired");
  assert.equal(artifact.name, `company-dev-foundation-${expected.stage}-${expected.mode}-v2-plan-${expected.sha}-${expected.runId}-${expected.runAttempt}`, "Wrong artifact name");
  assert.equal(String(artifact.workflow_run?.id), expected.runId, "Artifact belongs to another run");
  assert.equal(artifact.workflow_run?.head_sha, expected.sha, "Artifact SHA mismatch");
  return assertPlanPayload(files, expected, currentSourceSha256);
}
function assertPlanPayload(files, expected, currentSourceSha256) {
  assert.deepEqual(Object.keys(files).sort(), [...fileNames].sort(), "Unexpected artifact file inventory");
  const evidence = JSON.parse(files["evidence.json"]);
  assert.equal(hash(files["evidence.json"]), expected.evidenceSha256, "Reviewed evidence.json hash mismatch");
  for (const field of ["stage", "mode", "evidenceVersion"]) assert.equal(evidence[field], expected[field], `Evidence ${field} mismatch`);
  assertImplementedStage(evidence);
  assert.equal(evidence.operation, "foundation-preview-only", "Not a foundation preview");
  assert.equal(evidence.commitSha, expected.sha, "Evidence SHA mismatch");
  assert.equal(evidence.runId, expected.runId, "Evidence run mismatch");
  assert.equal(evidence.runAttempt, expected.runAttempt, "Evidence attempt mismatch");
  assert.equal(evidence.executionApproved, false, "Unexpected preview evidence");
  assert.equal(evidence.planningCeilingUsdBeforeTax, "120.00", "Unreviewed cost ceiling");
  assert.equal(evidence.estimatedMonthlyUsdBeforeTax, "108.35", "Unreviewed cost estimate");
  assert.equal(evidence.sourceSha256, expected.sourceSha256, "Reviewed source hash mismatch");
  assert.equal(currentSourceSha256, expected.sourceSha256, "Current foundation source differs from reviewed source");
  assert.deepEqual(evidence.sourceFiles?.map((file) => file.path), manifestPaths(evidence.sourceManifestVersion), "Incomplete source dependency manifest");
  for (const file of evidence.sourceFiles) assert.match(file.sha256 ?? "", /^[a-f0-9]{64}$/, "Invalid source file hash");
  assert.equal(hash(JSON.stringify(evidence.sourceFiles)), evidence.sourceSha256, "Source manifest hash mismatch");
  for (const [file, field] of [["template.json", "templateSha256"], ["parameters.json", "parametersSha256"], ["what-if.json", "whatIfSha256"], ["inventory.json", "inventorySha256"]]) {
    assert.equal(hash(files[file]), expected[field], `Reviewed ${file} hash mismatch`);
    assert.equal(evidence[field], expected[field], `Evidence ${file} hash mismatch`);
  }
  const inputs = JSON.parse(files["inputs.json"]);
  for (const field of ["stage", "mode", "evidenceVersion"]) assert.equal(inputs[field], expected[field], `Input ${field} mismatch`);
  if (expected.evidenceVersion === 3) {
    assert.equal(evidence.sourceManifestVersion, 5, "Ordered plan requires current source profile");
    for (const item of [evidence, inputs, JSON.parse(files["inventory.json"])]) {
      assert.ok(!("changeFreeze" in item) && !("freezeReference" in item) && !("manualUi" in item), "Obsolete manual policy fields");
    }
  }
  assert.equal(hash(files["inputs.json"]), evidence.inputsSha256, "Evidence inputs.json hash mismatch");
  validateInputs(inputs, inputs); // structural only; external CIDR approval checked in protected job
  for (const key of Object.keys(inputs)) assert.deepEqual(evidence[key], inputs[key], `Evidence input mismatch: ${key}`);
  const parameters = JSON.parse(files["parameters.json"]);
  assert.deepEqual(parameters, armParameters(inputs), "Consumed parameters differ from approved input snapshot");
  assert.deepEqual(evidence.approvedParameters, parameters, "Approved parameters differ from consumed parameters");
  const reviewContext = JSON.parse(files["review-context.json"]);
  assert.equal(hash(files["review-context.json"]), evidence.reviewContextSha256, "Evidence review context hash mismatch");
  assert.deepEqual(evidence.reviewContext, reviewContext, "Preview review context mismatch");
  assert.equal(reviewContext.repository, repository, "Preview review repository mismatch");
  assert.equal(reviewContext.environment?.name, "company-dev", "Wrong preview environment");
  assert.equal(reviewContext.revision, expected.sha, "Preview review SHA mismatch");
  assert.equal(reviewContext.runId, expected.runId, "Preview review run mismatch");
  assert.equal(reviewContext.runAttempt, expected.runAttempt, "Preview review attempt mismatch");
  for (const field of ["stage", "mode", "evidenceVersion"]) assert.equal(reviewContext[field], expected[field], `Review ${field} mismatch`);
  const inventory = JSON.parse(files["inventory.json"]);
  assert.deepEqual(inventory, stageInventory(inputs), "Unreviewed baseline/expected stage inventory or handoff");
  assert.equal(reviewContext.inventorySha256, hash(JSON.stringify(stageInventory(inputs))), "Review inventory/change-freeze context mismatch");
  assert.match(evidence.previewClientId ?? "", uuid, "Missing preview principal binding");
  const template = JSON.parse(files["template.json"]);
  // Entry template can only dispatch to the exact company RG; no source scope.
  assert.ok(Array.isArray(template.resources) && template.resources.length === 1, "Unexpected template entry inventory");
  const entry = template.resources[0];
  assert.equal(entry.type, "Microsoft.Resources/deployments", "Unexpected template entry");
  assert.equal(entry.subscriptionId, destination.subscriptionId, "Wrong template subscription");
  assert.equal(entry.resourceGroup, destination.resourceGroup, "Wrong template RG");
  assert.equal(entry.properties?.mode, "Incremental", "Destructive template mode");
  const whatIf = JSON.parse(files["what-if.json"]);
  if (inputs.stage === "bootstrap" && inputs.mode === "initial") assertBootstrapPreview(whatIf);
  else validatePreview(whatIf, inputs.stage, inputs.mode);
  return { evidence, inputs, parameters, template, whatIf, inventory };
}

export function assertQuality(response, workflow, sha) {
  const runs = [...(response.workflow_runs ?? [])].sort((a, b) => b.id - a.id);
  assert.ok(runs.length, `Missing quality workflow ${workflow}`);
  const run = runs[0]; // latest including pending/failed; never select an older success
  assert.equal(run.path, `.github/workflows/${workflow}`, "Wrong quality workflow");
  assert.equal(run.head_sha, sha, "Quality SHA mismatch");
  assert.equal(run.head_branch, "main", "Quality workflow must target main");
  assert.equal(run.event, "push", "Quality workflow must validate protected main");
  assert.equal(run.status, "completed", "Quality workflow still pending");
  assert.equal(run.conclusion, "success", `Quality workflow ${workflow} failed; no audit/security waiver`);
  return { id: run.id, runAttempt: run.run_attempt ?? 1, path: run.path, sha };
}
export function assertFreshPreview(reviewed, fresh) {
  assert.equal(normalizedPreview(fresh), normalizedPreview(reviewed), "Fresh provider what-if drift; replan and obtain human authorization");
}
export function applyRequest(plan, sha) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  return {
    url: `https://management.azure.com/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/Microsoft.Resources/deployments/companydev-${plan.inputs.stage}-${sha.slice(0, 12)}?api-version=2025-04-01`,
    body: { properties: { mode: "Incremental", template: plan.template, parameters: plan.parameters.parameters } },
  };
}

export function assertExecutionCheckpoint(bytes, run, artifact, ref) {
  assert.notEqual(ref?.kind, "bootstrap-completion-receipt-ref", "Receipt is not an apply execution checkpoint");
  assert.equal(hash(bytes), ref.checkpointSha256, "Reviewed predecessor checkpoint hash mismatch");
  for (const [field, value] of Object.entries({ head_sha: ref.sha, head_branch: "main", event: "workflow_dispatch", status: "completed", path: ".github/workflows/company-development-foundation-apply.yml" })) assert.equal(run[field], value, `Predecessor ${field} mismatch`);
  assert.equal(String(run.id), ref.runId, "Predecessor run mismatch");
  assert.equal(String(run.run_attempt), ref.runAttempt, "Predecessor attempt mismatch");
  assert.ok(["success", "failure", "cancelled", "timed_out"].includes(run.conclusion), "Unknown predecessor outcome");
  assert.equal(run.repository?.full_name, repository, "Foreign predecessor repository");
  assert.equal(run.head_repository?.full_name, repository, "Foreign predecessor source");
  assert.equal(String(artifact.id), ref.artifactId, "Predecessor artifact ID mismatch");
  assert.equal(artifact.expired, false, "Predecessor artifact expired");
  assert.equal(String(artifact.workflow_run?.id), ref.runId, "Wrong predecessor artifact run");
  assert.equal(artifact.workflow_run?.head_sha, ref.sha, "Wrong predecessor artifact SHA");
  const checkpoint = JSON.parse(bytes);
  assert.ok(!checkpoint.kind && checkpoint.mode !== "audit-readonly", "Receipt cannot be loaded as execution checkpoint");
  assert.ok([2, 3].includes(checkpoint.version), "Unknown predecessor version");
  assert.equal(artifact.name, `company-dev-foundation-${ref.stage}-${ref.mode}-v${checkpoint.version}-apply-${ref.sha}-${ref.runId}-${ref.runAttempt}`, "Checkpoint artifact policy version mismatch");
  if (checkpoint.version === 3) {
    assert.equal(checkpoint.sourceManifestVersion, 5, "Wrong current checkpoint source profile");
    assert.ok(!("freezeReference" in checkpoint) && !("manualUi" in checkpoint), "Obsolete checkpoint fields");
  }
  assert.deepEqual(checkpoint.destination, destination, "Wrong predecessor destination");
  for (const [field, value] of Object.entries({ stage: ref.stage, mode: ref.mode, commitSha: ref.sha, runId: ref.runId, runAttempt: ref.runAttempt })) assert.equal(checkpoint[field], value, `Checkpoint ${field} mismatch`);
  assert.match(checkpoint.deploymentCommitSha ?? checkpoint.commitSha, /^[a-f0-9]{40}$/, "Invalid actual deployment SHA");
  assert.equal(checkpoint.deploymentName, `companydev-${checkpoint.stage}-${(checkpoint.deploymentCommitSha ?? checkpoint.commitSha).slice(0, 12)}`, "Checkpoint deployment identity mismatch");
  assert.equal(typeof checkpoint.completed, "boolean", "Missing predecessor outcome");
  // A later failed/cancelled job may retain a completed ARM checkpoint. It is
  // never permission to replay: assessStage requires actual Succeeded state,
  // exact resources/payload and fresh NoChange for verified no-PUT recovery.
  assert.match(checkpoint.applyClientId ?? "", uuid, "Missing actual bootstrap/apply caller binding");
  assert.deepEqual(checkpoint.sourceFiles?.map((v) => v.path), manifestPaths(checkpoint.sourceManifestVersion), "Incomplete predecessor source dependencies");
  for (const file of checkpoint.sourceFiles) assert.match(file.sha256 ?? "", /^[a-f0-9]{64}$/, "Invalid predecessor source hash");
  assert.equal(hash(JSON.stringify(checkpoint.sourceFiles)), checkpoint.sourceSha256, "Predecessor source manifest hash mismatch");
  for (const key of ["templateSha256", "parametersSha256"]) assert.match(checkpoint[key] ?? "", /^[a-f0-9]{64}$/, `Missing predecessor ${key}`);
  assert.ok(Array.isArray(checkpoint.resources), "Missing predecessor actual inventory");
  return checkpoint;
}

const recoveryOrigins = new WeakMap();
// Public artifact parser shared by the real loader and synthetic metadata tests.
// No caller-supplied boolean can establish this provenance.
export function assertRecoveryArtifact(files, run, artifact, ref, archiveSha256) {
  assert.match(ref.archiveSha256 ?? "", /^[a-f0-9]{64}$/, "Missing original archive digest");
  assert.equal(archiveSha256, ref.archiveSha256, "Original archive byte digest drift");
  assert.equal(artifact.digest, `sha256:${archiveSha256}`, "Original immutable artifact digest drift");
  assert.deepEqual(Object.keys(files).sort(), ["checkpoint.json", "fresh-what-if.json", "result.json", "reviewed-inputs.json", "submission.json", "template.json"], "Original failed verification artifact inventory mismatch");
  const checkpoint = assertExecutionCheckpoint(files["checkpoint.json"], run, artifact, ref);
  assert.equal(run.conclusion, "failure", "Transition requires terminal failed original workflow");
  assert.equal(checkpoint.completed, false, "Transition requires original incomplete checkpoint");
  assert.equal(checkpoint.stage, "bootstrap", "Transition requires bootstrap origin");
  assert.equal(checkpoint.mode, "initial", "Additional source transitions unsupported");
  assert.ok(!checkpoint.predecessor && !checkpoint.sourceTransition && !checkpoint.securityHandoff, "Additional transition/security handoff unsupported");
  assert.equal(checkpoint.deploymentCommitSha ?? checkpoint.commitSha, checkpoint.commitSha, "Original deployment source changed");
  const submission = JSON.parse(files["submission.json"]), result = JSON.parse(files["result.json"]);
  const execution = { revision: ref.sha, runId: ref.runId, runAttempt: ref.runAttempt };
  for (const item of [submission, result]) {
    assert.deepEqual(item.executionRun, execution, "Original execution context mismatch");
    for (const key of ["sourceSha256", "templateSha256", "parametersSha256"]) assert.equal(item.reviewed[key], checkpoint[key], "Original reviewed payload binding drift");
    assert.equal(item.reviewed.sha, ref.sha, "Original preview source mismatch");
    assert.equal(item.reviewed.stage, "bootstrap", "Original preview stage mismatch");
    assert.equal(item.reviewed.mode, "initial", "Original preview mode mismatch");
  }
  assert.deepEqual(submission.reviewed, result.reviewed, "Original success/submission plan mismatch");
  assert.equal(submission.reviewed.evidenceVersion, 2, "Original preview evidence version mismatch");
  for (const key of ["runId", "runAttempt", "artifactId"]) assert.match(submission.reviewed[key] ?? "", /^[1-9]\d*$/, "Missing original preview provenance");
  for (const key of ["inventorySha256", "evidenceSha256"]) assert.match(submission.reviewed[key] ?? "", /^[a-f0-9]{64}$/, "Missing original preview binding");
  const reviewed = JSON.parse(files["reviewed-inputs.json"]);
  for (const key of Object.keys(submission.reviewed)) assert.deepEqual(reviewed[key], submission.reviewed[key], "Original reviewed-inputs mismatch");
  const deploymentId = `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/Microsoft.Resources/deployments/${checkpoint.deploymentName}`;
  assert.equal(submission.url, `https://management.azure.com${deploymentId}?api-version=2025-04-01`, "Original submission destination mismatch");
  assert.equal(result.deploymentId, deploymentId, "Original success deployment mismatch");
  assert.equal(result.state, "Succeeded", "Original ARM result not successful");
  assert.equal(hash(files["template.json"]), checkpoint.templateSha256, "Original compiled template drift");
  assert.equal(hash(files["fresh-what-if.json"]), submission.reviewed.whatIfSha256, "Original what-if drift");
  assertBootstrapPreview(JSON.parse(files["fresh-what-if.json"]));
  const start = Date.parse(run.created_at), end = Date.parse(run.updated_at);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && start < end, "Missing original workflow time bounds");
  recoveryOrigins.set(checkpoint, { checkpointSha256: hash(JSON.stringify(checkpoint)), archiveSha256,
    ref: structuredClone(ref), submission, result, start, end });
  return checkpoint;
}
export function recoveryOrigin(checkpoint) {
  const origin = recoveryOrigins.get(checkpoint);
  assert.ok(origin, "Verification transition requires authenticated original failed-run archive");
  assert.equal(hash(JSON.stringify(checkpoint)), origin.checkpointSha256, "Original checkpoint manipulated after validation");
  return structuredClone(origin);
}

export function loadExecutionCheckpoint(ref) {
  assert.ok(ref, "Missing execution predecessor");
  assert.notEqual(ref.kind, "bootstrap-completion-receipt-ref", "Receipt requires authenticated completion loader");
  for (const key of ["runId", "runAttempt", "artifactId"]) assert.match(ref[key] ?? "", /^[1-9]\d*$/, `Missing predecessor ${key}`);
  const run = github(`actions/runs/${ref.runId}/attempts/${ref.runAttempt}`);
  const artifact = github(`actions/artifacts/${ref.artifactId}`);
  const listing = github(`actions/runs/${ref.runId}/artifacts?per_page=100`);
  assert.ok(listing.total_count <= 100, "Ambiguous predecessor artifact inventory");
  const matches = listing.artifacts.filter((a) => a.name === artifact.name);
  assert.equal(matches.length, 1, "Ambiguous predecessor artifact name");
  assert.equal(String(matches[0].id), ref.artifactId, "Predecessor immutable artifact drift");
  const directory = mkdtempSync(join(tmpdir(), "companydev-predecessor-"));
  try {
    if (ref.archiveSha256) {
      // Hash and extract the SAME immutable archive, rather than hashing one
      // download and trusting different bytes from a name-selected download.
      const archive = execFileSync("gh", ["api", `repos/${repository}/actions/artifacts/${ref.artifactId}/zip`], { maxBuffer: 16 * 1024 * 1024 });
      assert.equal(hash(archive), ref.archiveSha256, "Original archive byte digest drift");
      const zip = join(directory, "original.zip");
      writeFileSync(zip, archive, { mode: 0o600 });
      const names = command("unzip", ["-Z1", zip]).trim().split("\n");
      assert.equal(new Set(names).size, names.length, "Duplicate archive entry");
      const expected = ["checkpoint.json", "fresh-what-if.json", "result.json", "reviewed-inputs.json", "submission.json", "template.json"];
      assert.deepEqual([...names].sort(), expected, "Unexpected original archive entries");
      const files = Object.fromEntries(names.map((name) => {
        const text = command("unzip", ["-p", zip, name]);
        assert.ok(Buffer.byteLength(text) <= 2 * 1024 * 1024, "Oversized original artifact file");
        return [name, text];
      }));
      return assertRecoveryArtifact(files, run, artifact, ref, hash(archive));
    }
    command("gh", ["run", "download", ref.runId, "--repo", repository, "--name", artifact.name, "--dir", directory]);
    const allowed = ["reviewed-inputs.json", "template.json", "fresh-what-if.json", "submission.json", "result.json", "bootstrap-state.json", "checkpoint.json"];
    for (const file of readdirSync(directory)) {
      const stat = lstatSync(join(directory, file));
      assert.ok(allowed.includes(file) && stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2 * 1024 * 1024, "Unexpected predecessor file inventory");
    }
    return assertExecutionCheckpoint(readFileSync(join(directory, "checkpoint.json"), "utf8"), run, artifact, ref);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

const orderedWorkflow = ".github/workflows/company-development-foundation-apply.yml";
const digestFields = ["sourceSha256", "templateSha256", "parametersSha256", "whatIfSha256", "inventorySha256", "evidenceSha256"];
export function assertOrderedNativeContext(env = process.env) {
  for (const [key, value] of Object.entries({
    GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main", GITHUB_REF_PROTECTED: "true",
    GITHUB_WORKFLOW_REF: `${repository}/${orderedWorkflow}@refs/heads/main`,
    GITHUB_ACTOR: "cmbuyamba", GITHUB_TRIGGERING_ACTOR: "cmbuyamba",
  })) assert.equal(env[key], value, `Ordered native ${key} mismatch`);
  assert.equal(env.GITHUB_WORKFLOW_SHA, env.GITHUB_SHA, "Ordered workflow SHA mismatch");
  assert.match(env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/, "Ordered source SHA required");
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]) assert.match(env[key] ?? "", /^[1-9]\d*$/, "Ordered native run/attempt required");
  return { sha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT };
}
function orderedControls() {
  const current = assertOrderedNativeContext();
  const branch = github("branches/main");
  assert.equal(branch.protected, true, "Protected main required");
  assert.equal(branch.commit?.sha, current.sha, "Latest main moved; new operation required");
  quality();
  return current;
}
// Artifact metadata does NOT identify a producer job/attempt cryptographically.
// Assurance: exact approved workflow's sole matching producer + native attempt
// job, fixed needs success, upload outputs and temporal/artifact correlations.
export function assertOrderedPlan(files, run, artifact, listing, jobs, expected, currentSourceSha256, now = Date.now()) {
  assert.equal(expected.contract, "ordered-plan-apply-v1", "Unknown ordered contract");
  assert.equal(expected.evidenceVersion, 3, "Ordered evidence version required");
  assertImplementedStage(expected);
  for (const key of ["runId", "runAttempt", "artifactId"]) assert.match(expected[key] ?? "", /^[1-9]\d*$/, `Missing ordered ${key}`);
  assert.match(expected.sha ?? "", /^[a-f0-9]{40}$/, "Missing ordered source SHA");
  for (const value of [run.id, run.run_attempt, artifact.id]) assert.ok(Number.isSafeInteger(value) && value > 0, "Invalid native run/artifact ID");
  assert.match(expected.archiveSha256 ?? "", /^[a-f0-9]{64}$/, "Missing upload archive digest");
  for (const [key, value] of Object.entries({
    id: Number(expected.runId), run_attempt: Number(expected.runAttempt), head_sha: expected.sha,
    head_branch: "main", event: "workflow_dispatch", path: orderedWorkflow, status: "in_progress", conclusion: null,
  })) assert.equal(run[key], value, `Ordered run ${key} mismatch`);
  for (const key of ["repository", "head_repository"]) assert.equal(run[key]?.full_name, repository, "Foreign ordered repository");
  for (const key of ["actor", "triggering_actor"]) assert.equal(run[key]?.login, "cmbuyamba", "Ordered owner actor required");
  assert.ok(Number.isSafeInteger(jobs.total_count) && jobs.total_count <= 100 && jobs.total_count === jobs.jobs?.length, "Incomplete attempt job inventory");
  const jobNames = new Set();
  for (const nativeJob of jobs.jobs) {
    assert.ok(["preview_guard", "plan", "apply_guard", "apply"].includes(nativeJob.name) && !jobNames.has(nativeJob.name), "Unknown/duplicate ordered job");
    jobNames.add(nativeJob.name);
    for (const [key, value] of Object.entries({ run_id: Number(expected.runId), run_attempt: Number(expected.runAttempt), head_sha: expected.sha })) {
      assert.equal(nativeJob[key], value, "Foreign/prior-attempt job");
    }
  }
  const producers = jobs.jobs.filter((job) => job.name === "plan");
  assert.equal(producers.length, 1, "Missing/ambiguous current-attempt plan job");
  const job = producers[0];
  assert.ok(Number.isSafeInteger(job.id) && job.id > 0, "Missing producer job ID");
  for (const [key, value] of Object.entries({
    run_id: Number(expected.runId), run_attempt: Number(expected.runAttempt), head_sha: expected.sha,
    status: "completed", conclusion: "success",
  })) assert.equal(job[key], value, `Ordered producer ${key} mismatch`);
  const start = Date.parse(job.started_at), end = Date.parse(job.completed_at), runStart = Date.parse(run.run_started_at);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(runStart)
    && runStart <= start && start < end && end <= now, "Invalid producer time bounds");
  const uploads = job.steps?.filter((s) => s.name === "Upload immutable ordered plan") ?? [];
  assert.equal(uploads.length, 1, "Missing/ambiguous upload step");
  assert.equal(uploads[0].status, "completed", "Upload pending");
  assert.equal(uploads[0].conclusion, "success", "Upload failed/skipped");
  const uploadStart = Date.parse(uploads[0].started_at), uploadEnd = Date.parse(uploads[0].completed_at);
  assert.ok(start <= uploadStart && uploadStart <= uploadEnd && uploadEnd <= end, "Upload outside producer bounds");
  assert.equal(String(artifact.id), expected.artifactId, "Ordered artifact ID mismatch");
  assert.equal(artifact.name, `company-dev-foundation-${expected.stage}-${expected.mode}-v3-plan-${expected.sha}-${expected.runId}-${expected.runAttempt}`, "Ordered artifact name mismatch");
  assert.equal(artifact.expired, false, "Ordered artifact expired");
  assert.ok(Date.parse(artifact.expires_at) > now, "Ordered artifact expiry missing/stale");
  assert.equal(artifact.digest, `sha256:${expected.archiveSha256}`, "Upload artifact digest mismatch");
  assert.ok(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 16 * 1024 * 1024, "Invalid ordered artifact size");
  const created = Date.parse(artifact.created_at);
  assert.ok(uploadStart <= created && created <= uploadEnd && created <= now, "Artifact outside producer upload bounds");
  assert.equal(artifact.workflow_run?.id, Number(expected.runId), "Ordered artifact run mismatch");
  assert.equal(artifact.workflow_run?.head_sha, expected.sha, "Ordered artifact SHA mismatch");
  assert.equal(artifact.workflow_run?.head_branch, "main", "Ordered artifact branch mismatch");
  assert.equal(artifact.workflow_run?.repository_id, run.repository.id, "Ordered artifact repository mismatch");
  assert.equal(artifact.workflow_run?.head_repository_id, run.head_repository.id, "Ordered artifact head repository mismatch");
  for (const repo of [run.repository, run.head_repository]) assert.ok(Number.isSafeInteger(repo.id) && repo.id > 0, "Missing native repository ID");
  assert.ok(Number.isSafeInteger(listing.total_count) && listing.total_count <= 100 && listing.total_count === listing.artifacts?.length, "Incomplete artifact membership inventory");
  const matches = listing.artifacts.filter((a) => a.name === artifact.name);
  assert.equal(matches.length, 1, "Ambiguous ordered artifact membership");
  assert.deepEqual(matches[0], artifact, "Ordered artifact listing drift");
  const evidence = JSON.parse(files["evidence.json"]);
  const binding = { contract: expected.contract, evidenceVersion: 3, sha: expected.sha, stage: expected.stage, mode: expected.mode,
    runId: expected.runId, runAttempt: expected.runAttempt, producerJobId: String(job.id), artifactId: expected.artifactId,
    archiveSha256: expected.archiveSha256,
    sourceSha256: evidence.sourceSha256, templateSha256: hash(files["template.json"]),
    parametersSha256: hash(files["parameters.json"]), whatIfSha256: hash(files["what-if.json"]),
    inventorySha256: hash(files["inventory.json"]), evidenceSha256: hash(files["evidence.json"]) };
  for (const field of digestFields) {
    assert.match(binding[field] ?? "", /^[a-f0-9]{64}$/, "Invalid derived execution digest");
    if (field in expected) assert.equal(binding[field], expected[field], `Derived ${field} drift`);
  }
  if ("producerJobId" in expected) assert.equal(binding.producerJobId, expected.producerJobId, "Producer job drift");
  const plan = assertPlanPayload(files, binding, currentSourceSha256);
  return { plan, binding };
}
function loadOrderedPlan(expected) {
  const native = orderedControls();
  for (const key of ["sha", "runId", "runAttempt"]) assert.equal(expected[key], native[key], "Prior/foreign attempt plan; re-run the whole operation");
  const run = github(`actions/runs/${native.runId}/attempts/${native.runAttempt}`);
  const jobs = github(`actions/runs/${native.runId}/attempts/${native.runAttempt}/jobs?per_page=100`);
  const artifact = github(`actions/artifacts/${expected.artifactId}`);
  const listing = github(`actions/runs/${native.runId}/artifacts?per_page=100`);
  const archive = execFileSync("gh", ["api", `repos/${repository}/actions/artifacts/${expected.artifactId}/zip`], { maxBuffer: 16 * 1024 * 1024 });
  assert.equal(archive.length, artifact.size_in_bytes, "Ordered archive size mismatch");
  assert.equal(hash(archive), expected.archiveSha256, "Ordered archive byte digest mismatch");
  const files = readArchive(archive, fileNames); // same bytes, bounded extraction
  const authenticated = assertOrderedPlan(files, run, artifact, listing, jobs, expected, foundationSource().sha256);
  assertReviewContext(authenticated.plan.evidence.reviewContext, github("environments/company-dev"), currentRun());
  return authenticated;
}
function expectedPlan() {
  // New dispatch is exclusively ordered v3. Historical v2 validators/loaders
  // stay strict for archives/tests; no manual PLAN_/REVIEWED_ execution route.
  assert.equal(Number(process.env.EVIDENCE_VERSION), 3, "New operation requires evidence version 3");
  const native = assertOrderedNativeContext();
  if (process.env.GITHUB_JOB === "apply_guard") {
    assert.equal(process.env.ORDERED_PLAN_RESULT, "success", "Plan needs result must be success");
    assert.match(process.env.ORDERED_ARTIFACT_ID ?? "", /^[1-9]\d*$/, "Missing immutable upload artifact ID");
    assert.match(process.env.ORDERED_ARCHIVE_SHA256 ?? "", /^[a-f0-9]{64}$/, "Missing immutable upload digest");
    return { contract: "ordered-plan-apply-v1", evidenceVersion: 3, ...native,
      stage: process.env.FOUNDATION_STAGE, mode: process.env.FOUNDATION_MODE,
      artifactId: process.env.ORDERED_ARTIFACT_ID, archiveSha256: process.env.ORDERED_ARCHIVE_SHA256 };
  }
  assert.equal(process.env.GITHUB_JOB, "apply", "Wrong ordered consumer job");
  const binding = JSON.parse(process.env.PLAN_BINDING ?? "null");
  assert.ok(binding, "Missing guarded plan binding");
  assert.deepEqual(Object.keys(binding).sort(), ["contract", "evidenceVersion", "sha", "stage", "mode", "runId", "runAttempt", "producerJobId", "artifactId", "archiveSha256", ...digestFields].sort(), "Unknown/missing ordered binding fields");
  for (const key of ["sha", "runId", "runAttempt"]) assert.equal(binding[key], native[key], "Prior-attempt plan binding");
  for (const [key, value] of Object.entries({ stage: process.env.FOUNDATION_STAGE, mode: process.env.FOUNDATION_MODE, evidenceVersion: 3 })) assert.equal(binding[key], value, "Ordered dispatch input drift");
  return binding;
}
function quality() {
  return ["ci.yml", "security.yml", "dast.yml"].map((workflow) => assertQuality(
    github(`actions/workflows/${workflow}/runs?head_sha=${currentRun().revision}&event=push&per_page=100`),
    workflow, currentRun().revision,
  ));
}
function enabled() {
  workflowContext();
  assert.equal(process.env.COMPANY_DEV_APPLY_ENABLED, "true", "Apply route not externally activated");
}
async function guardApply() {
  enabled();
  const authenticated = loadOrderedPlan(expectedPlan());
  const { plan, binding: expected } = authenticated;
  if (plan.inputs.stageContext) await loadStagePredecessor(plan.inputs.stageContext, plan.inputs.stage);
  const checks = quality();
  guard({ expectedEnvironment: applyEnvironment, enabled: process.env.COMPANY_DEV_APPLY_ENABLED, inventory: plan.inventory });
  appendFileSync(process.env.GITHUB_OUTPUT, `plan_binding=${JSON.stringify(expected)}\n`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    "\n## Exact reviewed initial bootstrap APPLY inputs",
    "Automatically authenticated execution bindings, NOT human-reviewed digests. Explicit human deployment authorization remains required; no manual freeze/UI/copied-plan handoff.",
    "Confirm legal payer/cost owner, externally approved inputs, stage-scoped effective apply permissions and $120/month BEFORE TAX ceiling. Bootstrap MUST NOT grant roles or configure Defender/scanners. It is empty/unused and NOT foundation-ready.",
    "Separate preview and apply principals are mandatory. No apps/jobs/data/customer identity/public DNS/source cleanup. This does not authorize provider/RG/federation bootstrap.",
    "```json", JSON.stringify({ ...expected, qualityRuns: checks }, null, 2), "```", "",
  ].join("\n"));
}
async function verify() {
  enabled();
  const expected = expectedPlan();
  assert.deepEqual(JSON.parse(process.env.PLAN_BINDING ?? "null"), expected, "Guarded plan binding drift");
  const context = JSON.parse(process.env.REVIEW_CONTEXT ?? "null");
  assertReviewContext(context, github(`environments/${applyEnvironment}`), currentRun(), applyEnvironment);
  const { plan, binding } = loadOrderedPlan(expected);
  assert.deepEqual(binding, expected, "Reauthenticated plan binding drift");
  if (plan.inputs.stageContext) await loadStagePredecessor(plan.inputs.stageContext, plan.inputs.stage);
  for (const field of ["stage", "mode", "evidenceVersion"]) assert.equal(context[field], expected[field], `Apply review ${field} drift`);
  assert.equal(context.inventorySha256, hash(JSON.stringify(plan.inventory)), "Apply review inventory drift");
  validateInputs(plan.inputs, {
    vnetCidr: process.env.APPROVED_VNET_CIDR, acaSubnetCidr: process.env.APPROVED_ACA_SUBNET_CIDR,
    postgresSubnetCidr: process.env.APPROVED_POSTGRES_SUBNET_CIDR, networkApproval: process.env.APPROVED_NETWORK_REFERENCE,
  });
  assert.match(process.env.APPLY_CLIENT_ID ?? "", uuid, "Missing apply principal UUID");
  assert.notEqual(process.env.APPLY_CLIENT_ID.toLowerCase(), plan.evidence.previewClientId.toLowerCase(), "Apply and preview principals must be separate");
  return { plan, expected, context, qualityRuns: quality() };
}
function destinationContext(input) {
  const account = azure(["account", "show"]);
  assertAzureContext(account);
  assert.equal(account.user?.type, "servicePrincipal", "Apply must use scoped federation");
  assert.equal(account.user?.name?.toLowerCase(), process.env.APPLY_CLIENT_ID.toLowerCase(), "Wrong signed-in apply principal");
  for (const namespace of (input.stage === "bootstrap" ? ["Microsoft.ContainerRegistry", "Microsoft.ManagedIdentity", "Microsoft.Storage"]
    : ["Microsoft.ContainerRegistry", "Microsoft.ManagedIdentity", "Microsoft.Storage", "Microsoft.Network", "Microsoft.DBforPostgreSQL", "Microsoft.OperationalInsights", "Microsoft.App", "Microsoft.Security"])) {
    assert.equal(azure(["provider", "show", "--namespace", namespace]).registrationState, "Registered", `Unapproved/missing provider bootstrap: ${namespace}`);
  }
  const group = azure(["group", "show", "--name", destination.resourceGroup]);
  assert.equal(group.id.toLowerCase(), `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}`.toLowerCase(), "Wrong apply RG");
  assert.equal(group.location, destination.location, "Wrong apply RG location");
  if (!input.stageContext) {
    assert.deepEqual(azure(["resource", "list", "--resource-group", destination.resourceGroup]), [], "Apply requires empty destination; no replay/reconciliation or source actions");
    assert.deepEqual(azure(["deployment", "group", "list", "--resource-group", destination.resourceGroup]), [], "Existing ARM deployment history: inspect operations/outcome; no initial retry, timeout replay or automatic recovery");
  }
}

async function humanGrantPlan() {
  assert.notEqual(process.env.GITHUB_ACTIONS, "true", "Manual operator command only; never execute grant preparation in a workflow");
  const args = process.argv.slice(3);
  assert.equal(args.length, 6, "Required: --deployment NAME --predecessor FILE --predecessor-sha256 HASH");
  assert.deepEqual([args[0], args[2], args[4]], ["--deployment", "--predecessor", "--predecessor-sha256"], "Unexpected manual operator arguments");
  assert.match(args[5], /^[a-f0-9]{64}$/, "Invalid reviewed predecessor hash");
  const file = lstatSync(args[3]);
  assert.ok(file.isFile() && !file.isSymbolicLink() && file.size <= 2 * 1024 * 1024, "Invalid predecessor file");
  const bytes = readFileSync(args[3]);
  assert.equal(hash(bytes), args[5], "Reviewed predecessor file hash mismatch");
  const parsed = JSON.parse(bytes.toString("utf8"));
  const predecessor = parsed.kind === "bootstrap-completion-receipt-ref"
    ? await loadStagePredecessor({ predecessor: parsed }, "continuation") : parsed;
  const result = prepareHumanGrants(azure, args[1], predecessor);
  // Printed argv arrays ONLY; never spawn the prepared create commands.
  // This hash is byte binding/review context, not an authenticated approval.
  console.log(JSON.stringify({ ...result, predecessorFileSha256: args[5] }, null, 2));
}

async function apply() {
  const verified = await verify(); // supported API checks + actual protected job, no self-attestation
  destinationContext(verified.plan.inputs);
  const stateEngine = await import("./company-development-state.mjs");
  const predecessor = verified.plan.inputs.stageContext
    ? await loadStagePredecessor(verified.plan.inputs.stageContext, verified.plan.inputs.stage) : null;
  // Bind before any execution evidence/checkpoint can be written. Replays must
  // not launder the bootstrap writer into a replacement caller's checkpoint.
  if (predecessor) stateEngine.assertOriginalApplyCaller(azure, predecessor);
  if (!verified.plan.inputs.stageContext) stateEngine.readStagePermissionReadiness(azure, verified.plan.inputs.stage, "apply");
  mkdirSync("company-dev-apply", { recursive: true, mode: 0o700 });
  writeJson("company-dev-apply/reviewed-inputs.json", { ...verified.expected, reviewContext: verified.context, qualityRuns: verified.qualityRuns });
  writeJson("company-dev-apply/template.json", verified.plan.template);
  let acceptedPreview;
  const preview = () => {
    const fresh = azure([
    "deployment", "group", "what-if", "--resource-group", destination.resourceGroup,
    "--name", `companydev-plan-${verified.expected.runId}`,
    "--template-file", "company-dev-apply/template.json",
    "--parameters", JSON.stringify(verified.plan.parameters),
    "--validation-level", "ProviderNoRbac", "--result-format", "FullResourcePayloads", "--no-pretty-print",
    ]);
    assertNoSecretPayload(fresh);
    acceptedPreview = fresh; // do not put rejected responses in execution evidence
    return fresh;
  };
  const request = applyRequest(verified.plan, currentRun().revision);
  const name = `companydev-${verified.plan.inputs.stage}-${currentRun().revision.slice(0, 12)}`;
  function checkpoint(completed, resources, actualDeployment = { name, commitSha: currentRun().revision }, recovery = null) {
    writeJson("company-dev-apply/checkpoint.json", {
      version: 3, stage: verified.plan.inputs.stage, mode: verified.plan.inputs.mode, destination,
      completed, commitSha: currentRun().revision, runId: currentRun().runId, runAttempt: currentRun().runAttempt,
      applyClientId: predecessor?.applyClientId ?? process.env.APPLY_CLIENT_ID, deploymentName: actualDeployment.name, deploymentCommitSha: actualDeployment.commitSha,
      sourceManifestVersion: verified.plan.evidence.sourceManifestVersion,
      sourceSha256: verified.plan.evidence.sourceSha256, sourceFiles: verified.plan.evidence.sourceFiles,
      templateSha256: verified.plan.evidence.templateSha256, parametersSha256: verified.plan.evidence.parametersSha256,
      resources, predecessor: verified.plan.inputs.stageContext?.predecessor ?? null,
      securityHandoff: verified.plan.inputs.stageContext?.security ?? null,
      internalTopology: "UNVERIFIED", automaticDataAdmission: false,
      ...(recovery ? { sourceTransition: recovery.sourceTransition, originalCheckpoint: predecessor,
        originalCheckpointBinding: verified.plan.inputs.stageContext.predecessor, originalSuccess: recovery.originalSuccess } : {}),
    });
  }
  const submit = () => {
    const reauthenticated = loadOrderedPlan(verified.expected);
    assert.deepEqual(reauthenticated.binding, verified.expected, "Pre-PUT execution binding drift");
    assertReviewContext(verified.context, github(`environments/${applyEnvironment}`), currentRun(), applyEnvironment);
    quality(); workflowContext(); destinationContext(verified.plan.inputs);
    writeJson("company-dev-apply/fresh-what-if.json", acceptedPreview);
    writeJson("company-dev-apply/submission.json", { url: request.url, bodySha256: hash(JSON.stringify(request.body)), executionRun: currentRun(), reviewed: verified.expected });
    checkpoint(false, verified.plan.inventory.baseline);
    // The only write: reviewed ARM template/parameters inline. Never grants,
    // Defender/scanner writes, Blob/data operations, cleanup or automatic retry.
    command("az", ["rest", "--method", "put", "--url", request.url, "--body", JSON.stringify(request.body), "--subscription", destination.subscriptionId, "--output", "none", "--only-show-errors"]);
  };
  if (verified.plan.inputs.stageContext) {
    const decision = stateEngine.executeReviewedStage({ plan: verified.plan, predecessor, read: azure, preview, submit });
    if (decision.action === "noop") {
      writeJson("company-dev-apply/fresh-what-if.json", acceptedPreview);
      checkpoint(true, decision.resources, { name: decision.inspection.name, commitSha: decision.inspection.name === predecessor.deploymentName ? (predecessor.deploymentCommitSha ?? predecessor.commitSha) : currentRun().revision }, decision.sourceTransition ? decision : null);
      if (decision.sourceTransition) writeJson("company-dev-apply/bootstrap-state.json", { ...decision.verifiedBootstrap,
        sourceTransition: decision.sourceTransition, originalCheckpointBinding: verified.plan.inputs.stageContext.predecessor,
        originalSuccess: decision.originalSuccess });
      writeJson("company-dev-apply/result.json", { state: "VerifiedNoOp", deploymentName: decision.inspection.name, executionRun: currentRun(), reviewed: verified.expected,
        ...(decision.sourceTransition ? { sourceTransition: decision.sourceTransition, originalCheckpointBinding: verified.plan.inputs.stageContext.predecessor, originalSuccess: decision.originalSuccess } : {}) });
      console.log("Exact completed stage verified: NO ARM PUT. No Blob/data/app activation; internal topology UNVERIFIED.");
      return;
    }
  } else {
    const fresh = preview();
    assertFreshPreview(verified.plan.whatIf, fresh);
    submit();
  }
  for (let attempt = 0; attempt < 180; attempt++) {
    const deployment = azure(["deployment", "group", "show", "--resource-group", destination.resourceGroup, "--name", name]);
    const state = deployment.properties?.provisioningState;
    writeJson("company-dev-apply/result.json", { state, deploymentId: deployment.id, outputs: deployment.properties?.outputs, executionRun: currentRun(), reviewed: verified.expected });
    if (["Succeeded", "Failed", "Canceled"].includes(state) || !["Accepted", "Running"].includes(state)) {
      const resources = stateEngine.readResources(azure, verified.plan.inputs.stage, verified.plan.inputs.stageContext?.security);
      checkpoint(false, resources);
    }
    assert.ok(["Accepted", "Running", "Succeeded", "Failed", "Canceled"].includes(state), "Unknown ARM outcome; inspect existing deployment operations/inventory before any further write; no retry/deletion");
    if (state === "Succeeded") {
      if (verified.plan.inputs.stage === "bootstrap") writeJson("company-dev-apply/bootstrap-state.json", readBootstrapState(azure, name));
      const resources = stateEngine.readResources(azure, verified.plan.inputs.stage, verified.plan.inputs.stageContext?.security);
      assert.equal(resources.length, verified.plan.inventory.expected.length, "Stage completion inventory missing resources");
      stateEngine.assertCompletedResources(resources, verified.plan.inputs.stage);
      assert.equal(stateEngine.inspectDeployment(azure, name)?.status, "Succeeded", "Actual terminal stage operation verification missing");
      if (verified.plan.inputs.stage === "continuation") {
        const security = stateEngine.readSecurity(azure, verified.plan.inputs.stageContext.security, { resources });
        stateEngine.validateFunctionalTest(verified.plan.inputs.stageContext.security.functionalTest, security);
        stateEngine.assertWriterRevoked(azure, predecessor, "apply", verified.plan.inputs.stageContext.security);
      }
      checkpoint(true, resources);
      console.log("Stage ARM completion verified. No apps/customer data/data-admission authority. Human/native controls remain mandatory; internal topology UNVERIFIED.");
      return;
    }
    assert.ok(!["Failed", "Canceled"].includes(state), `Foundation ${state}; retain evidence, stop; no automatic rollback/deletion`);
    await delay(10000);
  }
  checkpoint(false, stateEngine.readResources(azure, verified.plan.inputs.stage, verified.plan.inputs.stageContext?.security));
  throw new Error("Foundation polling timed out; retain evidence and inspect exact destination; no automatic retry/deletion");
}

async function main() {
  try {
    switch (process.argv[2]) {
      case "preview-guard":
        enabled(); orderedControls();
        assert.equal(process.env.GITHUB_JOB, "preview_guard", "Wrong ordered preview guard");
        guard(); break;
      case "plan-verify":
        enabled(); orderedControls();
        assert.equal(process.env.GITHUB_JOB, "plan", "Wrong ordered producer");
        break;
      case "human-grant-plan": await humanGrantPlan(); break;
      case "guard": await guardApply(); break;
      case "verify": await verify(); console.log("Reviewed apply inputs and protected-environment snapshot verified; no Azure write."); break;
      case "apply": await apply(); break;
      default: throw new Error("Supported operations: guard, verify, apply; manual-only human-grant-plan (reads/command preparation only); no grant execution or cleanup");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
