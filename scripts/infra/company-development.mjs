import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { destination, bootstrapInventory, assertNoSecretPayload, currentSourcePaths } from "./company-development-completion-validation.mjs";
export { destination, bootstrapInventory, assertNoSecretPayload } from "./company-development-completion-validation.mjs";
const environmentName = "company-dev";
const repository = "keyforta/keyforta-property";
const cidrNames = ["vnetCidr", "acaSubnetCidr", "postgresSubnetCidr"];
const approvalNames = [...cidrNames, "networkApproval"];
const stageInputNames = ["stage", "mode", "evidenceVersion", "changeFreeze"];
export const sourcePaths = Object.freeze([
  "infra/bicep/company-development.bicep",
  "infra/bicep/modules/company-development-resources.bicep",
  "infra/bicep/modules/foundation-resources.bicep",
  "scripts/infra/company-development.mjs",
  "scripts/infra/company-development-apply.mjs",
  "scripts/infra/company-development-state.mjs",
  ".github/workflows/company-development-foundation.yml",
  ".github/workflows/company-development-foundation-apply.yml",
  "scripts/verify/company-foundation-parser.py",
]);

export function assertImplementedStage(input) {
  assert.equal(input.evidenceVersion, 2, "Only evidence version 2 is supported; legacy full plans cannot apply");
  assert.ok(["bootstrap", "continuation"].includes(input.stage), "Unknown foundation stage");
  assert.ok(["initial", "reviewed-reentry"].includes(input.mode), "Unknown stage mode");
  if (input.stageContext?.sourceTransition) assert.ok(input.stage === "bootstrap" && input.mode === "reviewed-reentry", "Source transition is verification-only bootstrap re-entry");
}

export function continuationInventory() {
  const scope = `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/`;
  const suffix = "mxv24i2qhtib6";
  const zone = `${scope}Microsoft.Network/privateDnsZones/companydev.postgres.database.azure.com`;
  const pg = `${scope}Microsoft.DBforPostgreSQL/flexibleServers/psql-keyforta-cdev-${suffix}`;
  return [
    { type: "Microsoft.Network/networkSecurityGroups", id: `${scope}Microsoft.Network/networkSecurityGroups/nsg-keyforta-cdev-postgres-${suffix}` },
    { type: "Microsoft.Network/virtualNetworks", id: `${scope}Microsoft.Network/virtualNetworks/vnet-keyforta-cdev-${suffix}` },
    { type: "Microsoft.Network/privateDnsZones", id: zone },
    { type: "Microsoft.Network/privateDnsZones/virtualNetworkLinks", id: `${zone}/virtualNetworkLinks/keyforta-cdev` },
    { type: "Microsoft.OperationalInsights/workspaces", id: `${scope}Microsoft.OperationalInsights/workspaces/log-keyforta-cdev-${suffix}` },
    { type: "Microsoft.DBforPostgreSQL/flexibleServers", id: pg },
    { type: "Microsoft.DBforPostgreSQL/flexibleServers/configurations", id: `${pg}/configurations/azure.extensions` },
    { type: "Microsoft.DBforPostgreSQL/flexibleServers/databases", id: `${pg}/databases/keyforta` },
    { type: "Microsoft.App/managedEnvironments", id: `${scope}Microsoft.App/managedEnvironments/cae-keyforta-cdev-${suffix}` },
  ].sort((a, b) => a.id.localeCompare(b.id));
}

export function stageInventory(input) {
  assertImplementedStage(input);
  if (input.stage !== "bootstrap" || input.mode !== "initial") {
    const context = input.stageContext;
    assert.ok(context && Array.isArray(context.baseline) && Array.isArray(context.approvedChanges), "Missing reviewed stage context/baseline/deltas");
    assert.ok(context.predecessor, "Missing predecessor provenance");
    for (const k of ["runId", "runAttempt", "artifactId"]) assert.match(context.predecessor[k] ?? "", /^[1-9]\d*$/, `Missing predecessor ${k}`);
    assert.match(context.predecessor.sha ?? "", /^[a-f0-9]{40}$/, "Missing predecessor SHA");
    if (context.predecessor.kind === "bootstrap-completion-receipt-ref") {
      assert.equal(input.stage, "continuation", "Completion receipt cannot select bootstrap recovery");
      for (const k of ["receiptSha256", "archiveSha256"]) assert.match(context.predecessor[k] ?? "", /^[a-f0-9]{64}$/, "Missing completion artifact hash");
    } else assert.match(context.predecessor.checkpointSha256 ?? "", /^[a-f0-9]{64}$/, "Missing predecessor checkpoint hash");
    if (context.predecessor.kind === "bootstrap-completion-receipt-ref") {
      assert.equal(context.predecessor.stage, "bootstrap", "Receipt completion basis must be bootstrap");
      assert.equal(context.predecessor.mode, "audit-readonly", "Receipt completion basis must retain its audit mode");
    } else assert.ok(["bootstrap", "continuation"].includes(context.predecessor.stage) && ["initial", "reviewed-reentry"].includes(context.predecessor.mode), "Wrong predecessor stage/mode");
    const expected = input.stage === "bootstrap" ? bootstrapInventory() : [...bootstrapInventory(), ...continuationInventory(), ...securityInventory(context.security)];
    for (const resource of context.baseline) assert.ok(expected.some((r) => r.id.toLowerCase() === resource.id?.toLowerCase() && r.type.toLowerCase() === resource.type?.toLowerCase()), "Unexpected baseline resource");
    if (input.stage === "continuation") assert.ok(context.security?.functionalTest && context.security.writerRemovalReference, "Missing human security/functional handoff");
    return { version: 2, stage: input.stage, mode: input.mode, destination, baseline: context.baseline, expected,
      predecessor: context.predecessor, securityHandoff: context.security ?? null, changeFreeze: input.changeFreeze, stageContext: context };
  }

  assert.equal(input.stageContext, undefined, "Initial bootstrap must not consume a populated-stage context");
  return {
    version: 2, stage: input.stage, mode: input.mode, destination,
    baseline: [], expected: bootstrapInventory(),
    predecessor: null, securityHandoff: null, changeFreeze: input.changeFreeze,
  };
}

export function securityInventory(context) {
  const rows = context?.resourceInventory ?? [];
  assert.ok(Array.isArray(rows), "Missing readable security inventory");
  const prefix = `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/`;
  const seen = new Set();
  for (const r of rows) {
    assert.ok(["Microsoft.EventGrid/systemTopics", "Microsoft.Security/dataScanners"].includes(r.type), "Unsupported security resource type; no inferred backend topology");
    assert.ok(typeof r.id === "string" && r.id.toLowerCase().startsWith(`${prefix}${r.type}/`.toLowerCase())
      && r.id.length > `${prefix}${r.type}/`.length && !/[/?#]/.test(r.id.slice(`${prefix}${r.type}/`.length)), "Foreign/invalid reviewed security resource ID");
    assert.ok(!seen.has(r.id.toLowerCase()), "Duplicate security inventory"); seen.add(r.id.toLowerCase());
  }
  return rows;
}

export function assertBootstrapPreview(preview) {
  validatePreview(preview);
  const actual = preview.changes.filter((change) => change.after.type !== "Microsoft.Resources/deployments")
    .map((change) => ({ id: change.resourceId, type: change.after.type })).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(actual, bootstrapInventory(), "Preview must write the exact seven reviewed bootstrap resources");
}

function cidr(value) {
  assert.equal(typeof value, "string", "CIDR must be an explicit string");
  const match = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\/(0|[1-9]\d?)$/.exec(value);
  assert.ok(match, `Invalid CIDR: ${value}`);
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  assert.ok(octets.every((part) => part <= 255) && prefix <= 32, "Invalid CIDR range");
  const start = octets.reduce((address, part) => (address << 8n) + BigInt(part), 0n);
  const size = 1n << BigInt(32 - prefix);
  assert.equal(start % size, 0n, "CIDR contains host bits");
  return { start, end: start + size - 1n, prefix };
}
const contains = (outer, inner) => outer.start <= inner.start && inner.end <= outer.end;
const overlaps = (left, right) => left.start <= right.end && right.start <= left.end;

export function validateInputs(input, approved) {
  for (const [name, value] of Object.entries(destination)) {
    assert.equal(input[name], value, `Wrong destination ${name}`);
  }
  assertImplementedStage(input);
  stageInventory(input);
  assert.match(input.changeFreeze ?? "", /^https:\/\/github\.com\/keyforta\/keyforta-property\/(?:issues|pull)\/[1-9]\d*(?:#issuecomment-[1-9]\d*)?$/, "Missing external change-freeze review reference (not an attestation)");
  assert.match(input.networkApproval ?? "", /^https:\/\/github\.com\/keyforta\/keyforta-property\/(?:issues|pull)\/[1-9]\d*$/, "Missing network-owner approval reference");
  for (const name of approvalNames) {
    assert.ok(approved[name] && input[name] === approved[name], `Missing or mismatched external approval: ${name}`);
  }
  const ranges = Object.fromEntries(cidrNames.map((name) => [name, cidr(input[name])]));
  const privateRanges = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].map(cidr);
  assert.ok(privateRanges.some((range) => contains(range, ranges.vnetCidr)), "VNet CIDR must be within an RFC1918 range");
  assert.equal(ranges.acaSubnetCidr.prefix, 26, "Approved ACA subnet must be /26");
  assert.equal(ranges.postgresSubnetCidr.prefix, 28, "Approved PostgreSQL subnet must be /28");
  for (const name of ["acaSubnetCidr", "postgresSubnetCidr"]) {
    assert.ok(contains(ranges.vnetCidr, ranges[name]), `${name} subnet is outside VNet CIDR`);
  }
  assert.ok(!overlaps(ranges.acaSubnetCidr, ranges.postgresSubnetCidr), "Delegated subnets overlap");
  // Conservatively reserve the whole published ACA platform ranges, including
  // 100.100.0.0/16 (also excluded by RFC1918). Corporate overlaps still need an owner.
  for (const reserved of ["169.254.0.0/16", "172.30.0.0/16", "172.31.0.0/16", "192.0.2.0/24", "100.100.0.0/16"]) {
    assert.ok(!overlaps(ranges.vnetCidr, cidr(reserved)), `VNet CIDR overlaps platform range ${reserved}`);
  }
  return { ...Object.fromEntries([...Object.keys(destination), ...approvalNames, ...stageInputNames].map((name) => [name, input[name]])),
    ...(input.stageContext === undefined ? {} : { stageContext: input.stageContext }) };
}

export function assertAzureContext(account) {
  assert.equal(account.id, destination.subscriptionId, "Wrong destination subscription");
  assert.equal(account.tenantId, destination.tenantId, "Wrong destination tenant");
  assert.equal(account.state, "Enabled", "Destination subscription is not Enabled");
}

export function assertEnvironmentProtection(environment, expectedEnvironment = environmentName) {
  assert.ok(["company-dev", "company-dev-apply"].includes(expectedEnvironment), "Unsupported GitHub environment");
  assert.equal(environment.name, expectedEnvironment, "Wrong GitHub environment");
  assert.ok(Number.isSafeInteger(environment.id) && environment.id > 0, "Missing actual GitHub environment ID");
  assert.ok(typeof environment.node_id === "string" && environment.node_id.length > 0, "Missing actual GitHub environment node ID");
  assert.equal(environment.deployment_branch_policy?.protected_branches, true, "Environment must restrict protected branches");
  // An empty rule inventory is valid: independent environment review is not
  // required. Still reject unreadable metadata and bind every actual rule.
  assert.ok(Array.isArray(environment.protection_rules), "Missing environment protection rule inventory");
}

// Review context only: this snapshot is NOT an approval or no-bypass attestation.
export function environmentSnapshot(environment, expectedEnvironment = environmentName) {
  assertEnvironmentProtection(environment, expectedEnvironment);
  return {
    id: environment.id, nodeId: environment.node_id, name: environment.name,
    updatedAt: environment.updated_at ?? null,
    branchPolicy: environment.deployment_branch_policy,
    rules: environment.protection_rules.map((rule) => ({
      id: rule.id ?? null, type: rule.type,
      preventSelfReview: rule.prevent_self_review ?? null,
      waitTimer: rule.wait_timer ?? null,
      reviewers: (rule.reviewers ?? []).map((entry) => ({
        type: entry.type ?? null, id: entry.reviewer?.id ?? null,
      })),
    })),
  };
}
const hashJson = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function assertReviewRun(context, current) {
  assert.ok(context, "Missing review context from prerequisite GitHub job");
  assert.equal(context.repository, repository, "Review repository mismatch");
  for (const field of ["revision", "runId", "runAttempt"]) {
    assert.equal(context[field], current[field], `Review ${field} mismatch`);
  }
  assert.equal(context.environmentSha256, hashJson(context.environment), "Review environment snapshot hash mismatch");
}
export function assertReviewContext(context, environment, current, expectedEnvironment = environmentName) {
  assertReviewRun(context, current);
  const snapshot = environmentSnapshot(environment, expectedEnvironment);
  assert.deepEqual(context.environment, snapshot, "Review environment snapshot changed; fresh context required");
}

const resourceTypes = new Set([
  "Microsoft.Resources/deployments",
  "Microsoft.ContainerRegistry/registries",
  "Microsoft.ManagedIdentity/userAssignedIdentities",
  "Microsoft.Storage/storageAccounts",
  "Microsoft.Storage/storageAccounts/blobServices",
  "Microsoft.Storage/storageAccounts/blobServices/containers",
].map((type) => type.toLowerCase()));

// ARM 2025-04-01 WhatIfOperationProperties has optional array fields; the
// flattened CLI/SDK model also emits null for unset collections. Never coerce
// truthy/falsy values or discard warnings/potential changes.
export function assertWhatIfCollections(preview) {
  assert.ok(preview && typeof preview === "object" && !Array.isArray(preview), "Missing what-if response");
  assert.ok(preview.error === undefined || preview.error === null, "ARM preview failed");
  assert.ok(preview.status === undefined || preview.status === "Succeeded", "Unsuccessful/unknown what-if status");
  for (const key of ["diagnostics", "potentialChanges"]) {
    assert.ok(preview[key] === undefined || preview[key] === null || (Array.isArray(preview[key]) && preview[key].length === 0),
      "What-if diagnostics/potential changes; stop for review");
  }
}

// Diagnostic-only structural JSON, NEVER a plan or execution input. Do not
// upload arbitrary provider messages, property values, keys, paths or IDs:
// those can contain personal data/credentials even without a sensitive key.
// Keep the exact stdout digest, collection shapes and known change enums.
// The original response remains untouched in memory for all semantic gates.
export function preserveWhatIfDiagnostics(stdout, phase, root = process.cwd()) {
  assert.ok(["preview", "apply"].includes(phase), "Unknown diagnostic phase");
  const response = JSON.parse(stdout); // parsing/provider errors are not fallback success
  assertNoSecretPayload(response); // no file/directory on resolved secrets
  const enumValue = (v, allowed) => allowed.includes(v) ? v : "<not-retained>";
  const shape = (v, project) => v === undefined ? undefined : v === null ? null
    : Array.isArray(v) ? v.map(project) : { malformed: true };
  const changes = (v) => shape(v, (c) => ({
    changeType: enumValue(c?.changeType, ["Create", "NoChange", "Modify", "Delete", "Ignore", "Deploy", "Unsupported"]),
    delta: shape(c?.delta, (d) => ({ propertyChangeType: enumValue(d?.propertyChangeType, ["Create", "Modify", "Delete", "Array"]) })),
  }));
  const record = {
    version: 1, purpose: "what-if-diagnostic-only", phase, executionApproved: false,
    responseSha256: createHash("sha256").update(stdout).digest("hex"),
    sanitization: "Structural projection only; free text, identifiers, paths and property values not retained",
    response: !response || typeof response !== "object" || Array.isArray(response) ? { malformed: true } : {
      status: response?.status === undefined ? undefined : enumValue(response.status, ["Succeeded", "Failed", "Canceled", "Running", "Accepted"]),
      error: response?.error === undefined ? undefined : response.error === null ? null : { present: true },
      diagnostics: shape(response?.diagnostics, (d) => ({ level: enumValue(d?.level, ["Warning", "Error", "Info"]) })),
      potentialChanges: changes(response?.potentialChanges), changes: changes(response?.changes),
    },
  };
  const directory = join(root, "company-dev-whatif-diagnostics");
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  const stat = lstatSync(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o700, "Unsafe diagnostic directory");
  const folder = mkdtempSync(join(directory, `${phase}-`));
  const file = join(folder, "response.json");
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return file;
}

export function validatePreview(preview, stage = "bootstrap", mode = "initial") {
  assertNoSecretPayload(preview);
  assertWhatIfCollections(preview);
  assert.ok(Array.isArray(preview.changes) && preview.changes.length > 0, "Missing preview changes");
  const scope = `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/`.toLowerCase();
  for (const change of preview.changes) {
    // This route is ONLY a new, empty foundation, not general reconciliation.
    assert.ok((stage === "bootstrap" && mode === "initial" ? ["Create"] : ["Create", "NoChange", "Modify"]).includes(change.changeType), `Unexpected preview change ${change.changeType}; stop for review`);
    assert.ok(change.resourceId?.toLowerCase().startsWith(scope), "Preview resource outside destination scope");
    const types = stage === "bootstrap" ? resourceTypes : new Set(["microsoft.resources/deployments", ...continuationInventory().map((r) => r.type.toLowerCase())]);
    assert.ok(types.has(change.after?.type?.toLowerCase()), `Unexpected preview resource type ${change.after?.type}`);
  }
}

// Historical manifests are read from immutable Git blobs, never supplied hashes.
export function committedSource(revision, root = process.cwd()) {
  assert.match(revision ?? "", /^[a-f0-9]{40}$/, "Immutable source revision required");
  const files = sourcePaths.map((path) => ({ path, sha256: createHash("sha256").update(
    execFileSync("git", ["-C", root, "show", `${revision}:${path}`], { stdio: ["ignore", "pipe", "pipe"] }),
  ).digest("hex") }));
  return { revision, files, sha256: hashJson(files) };
}

export function assertVerificationSources(transition, evidence, predecessor) {
  assert.deepEqual(Object.keys(transition).sort(), ["from", "kind", "ownerReviewReference", "to", "version"], "Unsupported source transition fields");
  assert.equal(transition.version, 1, "Unsupported source transition version");
  assert.equal(transition.kind, "bootstrap-verification-only", "Unsupported source transition");
  assert.match(transition.ownerReviewReference ?? "", /^https:\/\/github\.com\/keyforta\/keyforta-property\/(?:issues|pull)\/[1-9]\d*(?:#issuecomment-[1-9]\d*)?$/, "Missing transition owner review context (not approval proof)");
  assert.equal(transition.from.revision, predecessor.commitSha, "Foreign transition origin");
  assert.equal(transition.to.revision, evidence.commitSha, "Foreign transition target");
  assert.notEqual(transition.from.revision, transition.to.revision, "Source transition requires distinct revisions");
  // Existing workflows deliberately retain checkout defaults. A shallow checkout
  // needs historical objects for byte/ancestry checks. Read only the fixed
  // repository; the ephemeral helper uses the job's existing read token, never
  // changes credentials/settings or the checked-out HEAD.
  if (execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() === "true") {
    execFileSync("git", ["-c", "credential.helper=!gh auth git-credential", "fetch", "--no-tags", "--unshallow",
      "https://github.com/keyforta/keyforta-property.git", "main"], { stdio: ["ignore", "pipe", "pipe"] });
  }
  for (const binding of [transition.from, transition.to]) assert.deepEqual(binding, committedSource(binding.revision), "Transition manifest differs from immutable source");
  assert.deepEqual(transition.from.files, predecessor.sourceFiles, "Original source manifest drift");
  assert.equal(transition.from.sha256, predecessor.sourceSha256, "Original source digest drift");
  assert.deepEqual(transition.to.files, evidence.sourceFiles, "Current source manifest drift");
  assert.equal(transition.to.sha256, evidence.sourceSha256, "Current source digest drift");
  execFileSync("git", ["merge-base", "--is-ancestor", transition.from.revision, transition.to.revision]);
  const code = ["scripts/infra/company-development.mjs", "scripts/infra/company-development-apply.mjs", "scripts/infra/company-development-state.mjs"];
  const nonExecutable = [".github/tests/company-development-apply.test.mjs", ".github/tests/company-development.test.mjs",
    ".github/tests/company-development-source.test.mjs", "infra/README.md", "docs/adr/ADR-016-company-development-private-foundation.md"];
  const changed = execFileSync("git", ["diff", "--name-only", "--no-renames", transition.from.revision, transition.to.revision], { encoding: "utf8" }).trim().split("\n");
  assert.ok(changed.some((p) => code.includes(p)), "No verifier source transition");
  assert.ok(changed.every((p) => [...code, ...nonExecutable].includes(p)), "Change outside approved verification-only surfaces");
  for (const file of transition.from.files) if (!code.includes(file.path)) {
    assert.deepEqual(transition.to.files.find((v) => v.path === file.path), file, "Workflow/Bicep/parser contract changed");
  }
}

export function foundationSource({ root = process.cwd(), revision = process.env.GITHUB_SHA, version = 3 } = {}) {
  assert.match(revision ?? "", /^[a-f0-9]{40}$/, "Source revision must be the exact workflow SHA");
  assert.equal(command("git", ["-C", root, "rev-parse", "HEAD"]).trim(), revision, "Source HEAD must equal reviewed workflow SHA");
  assert.ok(version === 1 || version === 3, "Unknown source manifest version");
  const files = (version === 1 ? sourcePaths : currentSourcePaths).map((path) => {
    // Raw committed blob bytes, not git diff/status (which can hide index flags)
    // or worktree-only hashes. Missing/untracked-at-revision paths fail closed.
    const committed = execFileSync("git", ["-C", root, "show", `${revision}:${path}`], { stdio: ["ignore", "pipe", "pipe"] });
    const file = join(root, path);
    assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), `Invalid foundation source file: ${path}`);
    assert.ok(committed.equals(readFileSync(file)), `Foundation source differs from committed bytes: ${path}`);
    return { path, sha256: createHash("sha256").update(committed).digest("hex") };
  });
  return { files, sha256: hashJson(files) };
}
// The ref discriminant is the ONLY alternate route. Legacy checkpoint loading
// remains v2-only; no JSON receipt is promoted into completed=true.
export async function loadStagePredecessor(context, stage) {
  if (context.predecessor?.kind === "bootstrap-completion-receipt-ref") {
    assert.equal(stage, "continuation", "Completion receipt is not bootstrap recovery");
    const { loadCompletionReceipt } = await import("./company-development-completion.mjs");
    const { completionBasis } = await import("./company-development-completion-validation.mjs");
    return completionBasis(loadCompletionReceipt(context.predecessor));
  }
  const { loadExecutionCheckpoint } = await import("./company-development-apply.mjs");
  return loadExecutionCheckpoint(context.predecessor);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export function normalizedPreview(preview, stage = "bootstrap", mode = "initial") {
  validatePreview(preview, stage, mode);
  return JSON.stringify(canonical([...preview.changes].sort((a, b) => a.resourceId.localeCompare(b.resourceId))));
}

function command(executable, args) {
  return execFileSync(executable, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
}
function azure(args) {
  try {
    const stdout = command("az", [...args, "--subscription", destination.subscriptionId, "--output", "json", "--only-show-errors"]);
    if (args.slice(0, 3).join(" ") === "deployment group what-if") preserveWhatIfDiagnostics(stdout, "preview");
    return JSON.parse(stdout);
  }
  catch (error) {
    const match = /^ERROR: \((ResourceNotFound|DeploymentNotFound)\)/m.exec(error.stderr?.toString() ?? "");
    if (match) error.code = match[1];
    throw error;
  }
}
function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

export function workflowContext() {
  assert.equal(process.env.GITHUB_REPOSITORY, repository, "Wrong GitHub repository");
  assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch", "Manual reviewed preview only");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main", "Reviewed main revision only");
  assert.equal(command("git", ["rev-parse", "HEAD"]).trim(), process.env.GITHUB_SHA, "Checkout must equal workflow SHA");
  foundationSource(); // reject targeted dirty/missing/uncommitted source BEFORE OIDC
}
function readInputs() {
  const input = {
    ...destination,
    stage: process.env.FOUNDATION_STAGE,
    mode: process.env.FOUNDATION_MODE,
    evidenceVersion: Number(process.env.EVIDENCE_VERSION),
    changeFreeze: process.env.CHANGE_FREEZE,
    stageContext: process.env.STAGE_CONTEXT ? JSON.parse(process.env.STAGE_CONTEXT) : undefined,
    vnetCidr: process.env.VNET_CIDR,
    acaSubnetCidr: process.env.ACA_SUBNET_CIDR,
    postgresSubnetCidr: process.env.POSTGRES_SUBNET_CIDR,
    networkApproval: process.env.NETWORK_APPROVAL,
  };
  return validateInputs(input, {
    vnetCidr: process.env.APPROVED_VNET_CIDR,
    acaSubnetCidr: process.env.APPROVED_ACA_SUBNET_CIDR,
    postgresSubnetCidr: process.env.APPROVED_POSTGRES_SUBNET_CIDR,
    networkApproval: process.env.APPROVED_NETWORK_REFERENCE,
  });
}

export function guard({ expectedEnvironment = environmentName, enabled = process.env.COMPANY_DEV_PLAN_ENABLED, inventory } = {}) {
  workflowContext();
  assert.equal(enabled, "true", "Route is not externally approved for activation");
  const environment = JSON.parse(command("gh", ["api", `repos/${repository}/environments/${expectedEnvironment}`]));
  const snapshot = environmentSnapshot(environment, expectedEnvironment);
  const stage = {
    stage: process.env.FOUNDATION_STAGE, mode: process.env.FOUNDATION_MODE,
    evidenceVersion: Number(process.env.EVIDENCE_VERSION),
  };
  assertImplementedStage(stage);
  const reviewedInventory = inventory ?? stageInventory({ ...stage, changeFreeze: process.env.CHANGE_FREEZE,
    stageContext: process.env.STAGE_CONTEXT ? JSON.parse(process.env.STAGE_CONTEXT) : undefined });
  const context = {
    repository, ...currentRun(), ...stage, inventorySha256: hashJson(reviewedInventory),
    environment: snapshot, environmentSha256: hashJson(snapshot),
  };
  assert.ok(process.env.GITHUB_OUTPUT && process.env.GITHUB_STEP_SUMMARY, "Native GitHub job output/summary required");
  appendFileSync(process.env.GITHUB_OUTPUT, `review_context=${JSON.stringify(context)}\n`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    `## Independent ${expectedEnvironment} reviewer checklist`,
    `Repository: \`${repository}\`; exact SHA: \`${context.revision}\`.`,
    `Run: \`${context.runId}\`; attempt: \`${context.runAttempt}\`.`,
    `Environment: \`${snapshot.name}\`; ID: \`${snapshot.id}\`; node ID: \`${snapshot.nodeId}\`.`,
    `API protection snapshot SHA256: \`${context.environmentSha256}\`.`,
    `Stage: \`${stage.stage}\`; mode: \`${stage.mode}\`; evidence version: \`${stage.evidenceVersion}\`.`,
    `Canonical baseline/expected inventory SHA256: \`${context.inventorySha256}\` (review context, NOT security approval).`,
    "```json", JSON.stringify(reviewedInventory, null, 2), "```",
    "",
    `- The authorized operator must inspect the live ${expectedEnvironment} environment settings; no independent reviewer or initiator/re-run actor separation is required.`,
    "- Verify protected branches and that **Allow administrators to bypass configured protection rules is disabled**. The documented API does not prove this UI-only setting.",
    `- Compare this exact SHA/run/attempt and snapshot with the ${expectedEnvironment} job; review its foundation-only inputs and scope.`,
    "- Confirm required CI/security checks, including dependency audit, pass for this exact SHA. Reject blocked checks; this manual control is not an audit waiver.",
    "- Preserve the exact SHA, run/attempt, environment ID, snapshot hash and manual no-bypass verification with the operator's explicit human merge/deploy authorization; no native environment approval comment is required.",
    "- Reject on mismatch, missing evidence or changed settings. Obtain fresh context after any environment or revision change.",
    "- Bootstrap only: review the exact seven-resource inventory, change freeze and stage-scoped effective caller permissions. NO role/Defender/scanner/security writes, apps, uploads, data or migrations. Empty unused Storage before Defender is owner-approved, NOT foundation readiness.",
    "- Before human grants/security handoff, cmbuyamba must verify removal of ALL bootstrap writer authority, including inherited/equivalent/PIM authority. Continuation rechecks the original apply caller's effective permission reads; do not infer completeness from lists.",
    "- For continuation: inspect cmbuyamba's actual harmless synthetic-file result and separate execution authorization, exact blob name/version-or-etag/content hash/UTC scan correlation, and current readable security snapshot hash. Confirm the record is genuinely owner-authored; JSON/hashes alone are NOT approval.",
    "- Blob index tags are mutable, not tamper-resistant: NEVER use them alone as a security/data-admission control. Internal scanner/Event Grid topology stays UNVERIFIED. No apps/customer data/workflow Blob access are authorized.",
    "- Permission review must establish the concrete minimum custom-VNet ACA caller operations without broad subscription RG/Network authority. Missing ACA proof, eligibility or capacity evidence still blocks activation; code/tests do not establish live sufficiency.",
    "",
    "Explicit human merge/deploy authorization remains required for this workflow's exact scope and reviewed inputs. Independent environment review is not required. This summary/output and activation flags are NOT authorization or machine proof of no-admin-bypass.",
    "",
  ].join("\n"));
  console.log("Environment context bound to exact SHA/run/snapshot; explicit human authorization remains required, not independent environment review. No Azure sign-in in guard.");
  return context;
}

export function currentRun() {
  assert.match(process.env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/, "Review revision must be a full SHA");
  assert.match(process.env.GITHUB_RUN_ID ?? "", /^[1-9]\d*$/, "Missing GitHub review run");
  assert.match(process.env.GITHUB_RUN_ATTEMPT ?? "", /^[1-9]\d*$/, "Missing GitHub review run attempt");
  return { revision: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT };
}

export function armParameters(input) {
  return {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: Object.fromEntries(["stage", ...approvalNames].map((name) => [name, { value: input[name] }])),
  };
}

function assertStageContext(context, input) {
  for (const field of ["stage", "mode", "evidenceVersion"]) assert.equal(context?.[field], input[field], `Review ${field} drift`);
  assert.equal(context.inventorySha256, hashJson(stageInventory(input)), "Review inventory/change-freeze drift");
}

async function prepare() {
  workflowContext();
  const input = readInputs();
  assert.match(process.env.PREVIEW_CLIENT_ID ?? "", /^[a-fA-F0-9-]{36}$/, "Missing destination preview client UUID");
  // Runs ONLY inside the company-dev environment job. Revalidate the actual
  // snapshot before OIDC even when no reviewer protection rules are configured.
  const reviewContext = JSON.parse(process.env.REVIEW_CONTEXT ?? "null");
  const environment = JSON.parse(command("gh", ["api", `repos/${repository}/environments/${environmentName}`]));
  assertReviewContext(reviewContext, environment, currentRun());
  assertStageContext(reviewContext, input);
  if (input.stageContext) {
    await loadStagePredecessor(input.stageContext, input.stage);
  }
  mkdirSync("company-dev-plan", { recursive: true, mode: 0o700 });
  writeJson("company-dev-plan/review-context.json", reviewContext);
  writeJson("company-dev-plan/parameters.json", armParameters(input));
  writeJson("company-dev-plan/inputs.json", input);
  writeJson("company-dev-plan/inventory.json", stageInventory(input));
  console.log("Explicit approved network inputs validated; no default CIDRs.");
}

async function preview() {
  workflowContext();
  const input = readInputs();
  const reviewContext = JSON.parse(process.env.REVIEW_CONTEXT ?? "null");
  assertReviewRun(reviewContext, currentRun());
  assertStageContext(reviewContext, input);
  assert.deepEqual(JSON.parse(readFileSync("company-dev-plan/review-context.json", "utf8")), reviewContext, "Review context drifted");
  assert.deepEqual(JSON.parse(readFileSync("company-dev-plan/inputs.json", "utf8")), input, "Inputs drifted");
  assert.deepEqual(JSON.parse(readFileSync("company-dev-plan/inventory.json", "utf8")), stageInventory(input), "Inventory drifted");
  const parameters = armParameters(input);
  assert.deepEqual(
    JSON.parse(readFileSync("company-dev-plan/parameters.json", "utf8")),
    parameters,
    "ARM parameters drifted from exact approved parameters",
  );
  // Pass this immutable in-memory snapshot to Azure CLI, NOT @parameters.json.
  // A file mutation after the comparison cannot change ARM's approved inputs.
  const consumedParameters = `${JSON.stringify(parameters, null, 2)}\n`;
  assertAzureContext(azure(["account", "show"]));
  for (const namespace of (input.stage === "bootstrap" ? ["Microsoft.ContainerRegistry", "Microsoft.ManagedIdentity", "Microsoft.Storage"]
    : ["Microsoft.ContainerRegistry", "Microsoft.ManagedIdentity", "Microsoft.Storage", "Microsoft.Network", "Microsoft.DBforPostgreSQL", "Microsoft.OperationalInsights", "Microsoft.App", "Microsoft.Security"])) {
    const provider = azure(["provider", "show", "--namespace", namespace]);
    assert.equal(provider.registrationState, "Registered", `${namespace} requires separately approved registration; this route never registers`);
  }
  const group = azure(["group", "show", "--name", destination.resourceGroup]);
  assert.equal(group.id.toLowerCase(), `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}`.toLowerCase(), "Wrong destination RG");
  assert.equal(group.location, destination.location, "Wrong destination RG region");
  const stateEngine = await import("./company-development-state.mjs");
  stateEngine.readStagePermissionReadiness(azure, input.stage, "preview");
  if (!input.stageContext) {
    assert.deepEqual(azure(["resource", "list", "--resource-group", destination.resourceGroup]), [], "Foundation-only preview requires an empty destination RG; stop for inventory review");
    assert.deepEqual(azure(["deployment", "group", "list", "--resource-group", destination.resourceGroup]), [], "Existing ARM deployment history: inspect operations/outcomes; initial bootstrap never retries a partial or unknown deployment");
  }
  // Local compilation only. Templates embed shared modules, so their content is
  // included in this digest. No package/tool installation is performed here.
  const template = JSON.parse(command("az", ["bicep", "build", "--file", "infra/bicep/company-development.bicep", "--stdout"]));
  assertNoSecretPayload(template);
  writeJson("company-dev-plan/template.json", template);
  const predecessor = input.stageContext
    ? await loadStagePredecessor(input.stageContext, input.stage) : null;
  const plan = { inputs: input, inventory: stageInventory(input), template, parameters,
    evidence: { commitSha: process.env.GITHUB_SHA, sourceManifestVersion: 3, sourceSha256: foundationSource().sha256, sourceFiles: foundationSource().files,
      templateSha256: digest("company-dev-plan/template.json"), parametersSha256: createHash("sha256").update(consumedParameters).digest("hex") } };
  // The new route must stop BEFORE provider what-if on any origin/state mismatch.
  const before = input.stageContext?.sourceTransition || predecessor?.kind === "bootstrap-completion-basis"
    ? stateEngine.assessStage(azure, plan, predecessor, Date.now(), "preview") : null;
  const result = azure([
    "deployment", "group", "what-if",
    "--resource-group", destination.resourceGroup,
    "--name", `companydev-plan-${process.env.GITHUB_RUN_ID}`,
    "--template-file", "company-dev-plan/template.json",
    "--parameters", consumedParameters,
    "--validation-level", "ProviderNoRbac",
    "--result-format", "FullResourcePayloads",
    "--no-pretty-print",
  ]);
  if (!input.stageContext) assertBootstrapPreview(result);
  else {
    const { assessStage, validateStageChanges } = await import("./company-development-state.mjs");
    const checked = assessStage(azure, plan, predecessor, Date.now(), "preview");
    if (before) assert.deepEqual(checked, before, "Post-preview original recovery state drift");
    validateStageChanges(result, plan, checked.action === "noop");
  }
  // Empty RG / creates only: no existing resource keys or data are queried.
  writeFileSync("company-dev-plan/parameters.json", consumedParameters, { mode: 0o600 });
  writeJson("company-dev-plan/what-if.json", result);
  writeJson("company-dev-plan/evidence.json", {
    operation: "foundation-preview-only",
    commitSha: process.env.GITHUB_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    previewClientId: process.env.PREVIEW_CLIENT_ID,
    sourceManifestVersion: 3, sourceSha256: foundationSource().sha256,
    sourceFiles: foundationSource().files,
    reviewContext,
    reviewPolicy: "Explicit human authorization and operator manual no-bypass verification; no independent environment reviewer required; context is not approval or machine verification",
    ...input,
    planningCeilingUsdBeforeTax: "120.00",
    estimatedMonthlyUsdBeforeTax: "108.35",
    templateSha256: digest("company-dev-plan/template.json"),
    approvedParameters: parameters,
    parametersSha256: createHash("sha256").update(consumedParameters).digest("hex"),
    whatIfSha256: digest("company-dev-plan/what-if.json"),
    inventorySha256: digest("company-dev-plan/inventory.json"),
    inputsSha256: digest("company-dev-plan/inputs.json"),
    reviewContextSha256: digest("company-dev-plan/review-context.json"),
    executionApproved: false,
  });
  console.log(`Version 2 ${input.stage}/${input.mode} preview validated. No CI security/Blob writes or app/data activation; internal topology UNVERIFIED.`);
}

async function main() {
  try {
    switch (process.argv[2]) {
      case "guard": guard(); break;
      case "prepare": await prepare(); break;
      case "preview": await preview(); break;
      default: throw new Error("Supported operations: guard, prepare, preview (no deploy operation)");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
