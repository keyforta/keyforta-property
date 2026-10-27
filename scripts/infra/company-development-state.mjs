// Shared read-only state/decision engine for the existing preview/apply routes.
// Kept separate to avoid duplicating security and re-entry checks in both CLI
// helpers. No Azure SDK, Blob data transport, grant or deployment capability.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertNoSecretPayload, assertVerificationSources, assertWhatIfCollections, bootstrapInventory, continuationInventory, destination, securityInventory } from "./company-development.mjs";
export { continuationInventory } from "./company-development.mjs";
import { armGuid, assertHumanGrantAssignments, readBootstrapState, recoveryOrigin } from "./company-development-apply.mjs";
import { projectResources, assertCompletionBasis, historicalAuditGrants } from "./company-development-completion-validation.mjs";
export { projectResources } from "./company-development-completion-validation.mjs";

const scope = `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/`;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reference = /^https:\/\/github\.com\/keyforta\/keyforta-property\/(?:issues|pull)\/[1-9]\d*(?:#issuecomment-[1-9]\d*)?$/;
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => [k, canonical(value[k])]));
  return value;
}
export const stateHash = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const topLevelTypes = [
  "Microsoft.ManagedIdentity/userAssignedIdentities", "Microsoft.ContainerRegistry/registries", "Microsoft.Storage/storageAccounts",
  "Microsoft.Network/networkSecurityGroups", "Microsoft.Network/virtualNetworks", "Microsoft.Network/privateDnsZones",
  "Microsoft.OperationalInsights/workspaces", "Microsoft.DBforPostgreSQL/flexibleServers", "Microsoft.App/managedEnvironments",
  "Microsoft.EventGrid/systemTopics", "Microsoft.Security/dataScanners",
];
const apiVersions = {
  "Microsoft.ManagedIdentity": "2023-01-31", "Microsoft.ContainerRegistry": "2023-11-01-preview",
  "Microsoft.Storage": "2023-05-01", "Microsoft.Network": "2024-05-01", "Microsoft.DBforPostgreSQL": "2024-08-01",
  "Microsoft.OperationalInsights": "2023-09-01", "Microsoft.App": "2024-10-02-preview",
  "Microsoft.Security": "2026-08-01", "Microsoft.EventGrid": "2022-06-15",
};
function get(read, url) {
  return read(["rest", "--method", "get", "--url", `https://management.azure.com${url}`]);
}
function sameId(a, b) { return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase(); }
function roleId(id) { return `/subscriptions/${destination.subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${id}`; }
function assertReference(value, name) { assert.match(value ?? "", reference, `Missing ${name} native-human review reference`); }
const subscription = `/subscriptions/${destination.subscriptionId}`;
const group = `${subscription}/resourceGroups/${destination.resourceGroup}`;
const actualScanner = `${subscription}/providers/Microsoft.Security/datascanners/StorageDataScanner`;
const applyIdentity = { principalId: "e10f9e0f-274f-4643-8a8f-ad8f41b09c64", clientId: "63b65efc-7e8d-4d82-b13a-53b875df54f1" };
const previewIdentity = { principalId: "be3a876f-b205-42c7-bd95-4d33bd49a4ff", clientId: "684d29f1-1055-4030-b308-872dd2781d39" };
// Pin the approved human subject without publishing its private principal ID.
// Actual IDs stay in private operator evidence; no record can select this pin.
const operatorPrincipalSha256 = "6a0dae9369f346faf287190f74c65cbd420fea30bc3a529c972912cbecbd0280";
const boundedMode = "companydev-continuation-bounded-baseline";
const joins = ["networkSecurityGroups", "virtualNetworks", "privateDnsZones", "virtualNetworks/subnets"].map((t) => `Microsoft.Network/${t}/join/action`);
const continuationActions = [
  "Microsoft.Resources/subscriptions/resourceGroups/read", "Microsoft.Resources/subscriptions/resourceGroups/resources/read", "Microsoft.Resources/resources/read",
  "Microsoft.Resources/deployments/read", "Microsoft.Resources/deployments/operations/read", "Microsoft.Resources/deployments/operationStatuses/read",
  "Microsoft.Authorization/permissions/read", "Microsoft.Authorization/roleAssignments/read", "Microsoft.ManagedIdentity/userAssignedIdentities/read",
  "Microsoft.ContainerRegistry/registries/read", "Microsoft.Storage/storageAccounts/read", "Microsoft.Storage/storageAccounts/blobServices/read",
  "Microsoft.Storage/storageAccounts/blobServices/containers/read", "Microsoft.Security/defenderForStorageSettings/read", "Microsoft.EventGrid/systemTopics/read",
  ...continuationInventory().flatMap((r) => [`${r.type}/read`, `${r.type}/write`]), "Microsoft.Network/virtualNetworks/subnets/read",
  "Microsoft.Resources/deployments/write", "Microsoft.Resources/deployments/whatIf/action", "Microsoft.Resources/deployments/validate/action",
  "Microsoft.OperationalInsights/workspaces/sharedKeys/action", ...joins,
];
const continuationDefinitions = [
  { id: roleId("bf872e6a-3956-5e63-a78e-32f6eac66cd8"), actions: continuationActions, scopes: [group] },
  { id: roleId("1da8e8e3-8b63-50b6-bd68-dae38dfab689"), actions: ["Microsoft.Authorization/permissions/read", "Microsoft.EventGrid/systemTopics/read"], scopes: [group] },
  { id: roleId("c4f33b99-089a-5317-b4a7-941a276a5935"), actions: ["Microsoft.Authorization/roleDefinitions/read"], scopes: [subscription] },
  { id: roleId("f8eeb9a7-a177-5a0d-b6b0-dbb01620e323"), actions: ["Microsoft.Security/datascanners/read", "Microsoft.Authorization/permissions/read"], scopes: [subscription] },
];
const continuationAssignments = [
  ["b5ac29f1-10dc-5c07-b211-25a1f2c5578e", group, 0, applyIdentity.principalId],
  ["53f4cca3-2794-5964-a63c-75bfde969056", group, 1, previewIdentity.principalId],
  ["3bbb1331-93ab-5b29-8f95-ac5778e492a0", subscription, 2, applyIdentity.principalId],
  ["ade85cfb-1c37-5851-8856-e6079eca176a", subscription, 2, previewIdentity.principalId],
  ["bf5bb09c-999b-5ab8-ba02-e8f15464c9e4", actualScanner, 3, applyIdentity.principalId],
  ["f99db001-99ec-548d-a682-3d3b8a4590b2", actualScanner, 3, previewIdentity.principalId],
].map(([name, scope, i, principalId]) => ({ id: `${scope}/providers/Microsoft.Authorization/roleAssignments/${name}`, name, scope,
  roleDefinitionId: continuationDefinitions[i].id, principalId, principalType: "ServicePrincipal" }));
function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `Missing ${label}`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `Unknown/missing ${label} fields`);
}
function utc(value, label) {
  const t = Date.parse(value);
  assert.ok(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(value) && Number.isFinite(t), `Invalid UTC ${label}`);
  // ARM assignment timestamps can carry seven fractional digits. Compare at
  // the JS clock's millisecond precision without rewriting the retained bytes.
  const millis = value.includes(".") ? value.replace(/\.(\d+)Z$/, (_, fraction) => `.${fraction.padEnd(3, "0").slice(0, 3)}Z`) : value.replace(/Z$/, ".000Z");
  assert.equal(new Date(t).toISOString(), millis, `Invalid UTC ${label}`);
  return t;
}
function exactSet(actual, expected, label) {
  assert.ok(Array.isArray(actual) && actual.every((v) => typeof v === "string"), `Missing ${label}`);
  const lower = actual.map((v) => v.toLowerCase());
  assert.equal(new Set(lower).size, lower.length, `Duplicate ${label}`);
  assert.deepEqual(lower.sort(), expected.map((v) => v.toLowerCase()).sort(), `Unexpected ${label}`);
}
function assertDefinition(actual, { id, actions, scopes, type = "CustomRole", dataActions = [] }) {
  assert.ok(sameId(actual?.id, id) && sameId(actual.name, id.split("/").at(-1)), "Wrong observed role definition ID/name");
  assert.equal(actual.type, "Microsoft.Authorization/roleDefinitions", "Wrong role definition resource type");
  assert.equal(actual.properties?.type, type, "Wrong role definition kind");
  exactSet(actual.properties.assignableScopes, scopes, "role assignable scopes");
  assert.equal(actual.properties.permissions?.length, 1, "Exact single permission block required");
  const p = actual.properties.permissions[0];
  exactKeys(p, ["actions", "notActions", "dataActions", "notDataActions"], "role permission");
  exactSet(p.actions, actions, "role Actions");
  exactSet(p.dataActions, dataActions, "role DataActions");
  assert.deepEqual(p.notActions, [], "Role NotActions forbidden");
  assert.deepEqual(p.notDataActions, [], "Role NotDataActions forbidden");
}
function assertAssignment(actual, expected) {
  assert.ok(actual, "Missing observed assignment");
  for (const key of ["id", "name", "scope", "roleDefinitionId", "principalId"]) assert.ok(sameId(actual[key], expected[key]), `Wrong assignment ${key}`);
  assert.equal(actual.principalType, expected.principalType, "Wrong assignment principalType");
  assert.ok(!actual.condition && !actual.conditionVersion, "Conditional continuation/scanner assignment forbidden");
}
// Pure validation of an OPERATOR observation, not authentication of consent or
// a claim that workflow tokens can freshly enumerate assignments at the scanner.
function assertContinuationRecord(selection, phase, now) {
  assert.ok(["preview", "apply"].includes(phase), "Unknown bounded authority phase");
  assert.equal(selection?.stage, "continuation", "Bounded authority requires continuation selection");
  const a = selection.authority;
  exactKeys(a, ["version", "mode", "destination", "originalIdentity", "approval", "source", "attempt", "firstGrantAt", "deadline",
    "removalOwner", "providerAssumption", "definitions", "assignments", "collection"], "bounded authority");
  assert.equal(a.version, 1, "Unknown bounded authority version");
  assert.equal(a.mode, boundedMode, "Unknown bounded authority mode");
  assert.deepEqual(a.destination, destination, "Wrong bounded destination");
  assert.deepEqual(a.originalIdentity, applyIdentity, "Wrong original bounded identity");
  assert.deepEqual(a.approval, { authorizer: "cmbuyamba", approvedAt: "2026-10-27T00:09:09.558Z",
    reference: "session:673fdb9d-901b-4774-87a7-55f375793b45/2026-10-27T00:09:09.558Z" }, "Wrong actual human approval binding");
  exactKeys(a.source, ["commitSha", "sourceSha256"], "bounded source");
  assert.match(a.source.commitSha ?? "", /^[a-f0-9]{40}$/);
  assert.match(a.source.sourceSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.deepEqual(a.source, selection.source, "Bounded source mismatch");
  exactKeys(a.attempt, ["mode", "completionBasis"], "bounded attempt");
  assert.equal(a.attempt.mode, "single-initial-attempt", "No bounded renewal/second attempt");
  assert.deepEqual(a.attempt.completionBasis, selection.completionBasis, "Wrong bounded predecessor run/artifact binding");
  for (const key of ["runId", "runAttempt", "artifactId"]) assert.match(a.attempt.completionBasis?.[key] ?? "", /^[1-9]\d*$/, `Missing bounded predecessor ${key}`);
  assert.match(selection.run?.runId ?? "", /^[1-9]\d*$/, "Missing actual bounded workflow run");
  assert.equal(selection.run.runAttempt, "1", "No second bounded attempt/renewal");
  const start = utc(a.firstGrantAt, "firstGrantAt"), end = utc(a.deadline, "deadline");
  assert.ok(start >= utc(a.approval.approvedAt, "approvedAt") && start <= now && end > start && end <= start + 3600000, "Invalid bounded first grant/deadline window");
  assert.ok(now < end, "Bounded authority deadline expired; stop, human removal required; no retry/renewal");
  exactKeys(a.removalOwner, ["principalId", "fallbackAvailable", "reference"], "removal owner");
  assert.match(a.removalOwner.principalId ?? "", uuid, "Missing removal operator");
  assert.equal(createHash("sha256").update(a.removalOwner.principalId.toLowerCase()).digest("hex"), operatorPrincipalSha256, "Wrong approved removal operator");
  assert.equal(a.removalOwner.fallbackAvailable, true, "Available human cleanup fallback required");
  assertReference(a.removalOwner.reference, "removal fallback");
  assert.equal(a.providerAssumption, "Microsoft.App manages ME_keyforta_cdev_mxv24i2qhtib6; first additional authority requirement stops the attempt", "Unqualified/expanded provider assumption");
  assert.equal(a.definitions?.length, 4, "Exact four definitions required");
  for (const expected of continuationDefinitions) {
    const matches = a.definitions.filter((v) => sameId(v.id, expected.id));
    assert.equal(matches.length, 1, "Missing/duplicate continuation definition");
    assertDefinition(matches[0], expected);
  }
  assert.equal(a.assignments?.length, 6, "Exact six continuation assignments required");
  for (const expected of continuationAssignments) {
    const matches = a.assignments.filter((v) => sameId(v.id, expected.id));
    assert.equal(matches.length, 1, "Missing/duplicate continuation assignment");
    assertAssignment(matches[0], expected);
  }
  const c = a.collection;
  exactKeys(c, ["kind", "principalId", "tenantId", "subscriptionId", "reference", "commandsSha256", "collectedAt", "inventories"], "operator collection");
  assert.equal(c.kind, "operator-collected", "Not workflow-fresh assignment proof");
  assert.ok(sameId(c.principalId, a.removalOwner.principalId), "Wrong assignment evidence collector");
  assert.equal(c.tenantId, destination.tenantId); assert.equal(c.subscriptionId, destination.subscriptionId);
  assertReference(c.reference, "operator collection");
  assert.match(c.commandsSha256 ?? "", /^[a-f0-9]{64}$/);
  const collected = utc(c.collectedAt, "collectedAt");
  assert.ok(collected >= start && collected <= now && collected < end, "Assignment collection outside bounded window");
  const created = a.assignments.map((r) => utc(r.createdOn, "actual assignment createdOn"));
  assert.equal(Math.min(...created), start, "Common clock must start at FIRST temporary assignment");
  assert.ok(created.every((t) => t >= start && t <= collected), "Assignment chronology mismatch");
  assert.equal(c.inventories?.length, 3, "Complete S/G/D operator inventories required");
  const observed = new Map();
  for (const target of [subscription, group, actualScanner]) {
    const inventories = c.inventories.filter((r) => sameId(r.scope, target));
    assert.equal(inventories.length, 1, "Missing/duplicate operator inventory scope");
    const inventory = inventories[0];
    exactKeys(inventory, ["scope", "complete", "nextLink", "includeInherited", "includeDescendants", "assignments"], "operator inventory");
    assert.equal(inventory.complete, true, "Incomplete operator inventory");
    assert.equal(inventory.nextLink, null, "Outstanding operator pagination");
    assert.equal(inventory.includeInherited, true, "Inherited operator visibility required");
    assert.equal(inventory.includeDescendants, target === group, "RG descendant inventory required");
    assert.ok(Array.isArray(inventory.assignments), "Missing operator assignment rows");
    for (const assignment of a.assignments.filter((r) => sameId(r.scope, target) || target.toLowerCase().startsWith(`${r.scope.toLowerCase()}/`)
      || (target === group && r.scope.toLowerCase().startsWith(`${group.toLowerCase()}/`)))) {
      assert.deepEqual(inventory.assignments.find((r) => sameId(r.id, assignment.id)), assignment, "Incomplete available inherited/descendant inventory");
    }
    const seen = new Set();
    for (const r of inventory.assignments) {
      assert.ok(r?.id && r.scope && r.principalId && r.roleDefinitionId, "Incomplete operator assignment");
      assert.ok(!seen.has(r.id.toLowerCase()), "Duplicate operator assignment"); seen.add(r.id.toLowerCase());
      assert.ok(sameId(r.scope, target) || target.toLowerCase().startsWith(`${r.scope.toLowerCase()}/`)
        || (target === group && r.scope.toLowerCase().startsWith(`${group.toLowerCase()}/`)), "Foreign operator inventory row");
      if (observed.has(r.id.toLowerCase())) assert.deepEqual(observed.get(r.id.toLowerCase()), r, "Inconsistent operator observations");
      observed.set(r.id.toLowerCase(), r);
    }
  }
  for (const r of a.assignments) assert.deepEqual(observed.get(r.id.toLowerCase()), r, "Assignment not present in complete operator evidence");
  for (const r of observed.values()) {
    if (![applyIdentity.principalId, previewIdentity.principalId].some((id) => sameId(id, r.principalId))) continue;
    if (continuationAssignments.some((e) => sameId(e.id, r.id))) continue;
    const historical = historicalAuditGrants.find((e) => sameId(e.assignmentId, r.id) && sameId(e.principalId, r.principalId));
    assert.ok(historical, "Unexplained extra workflow authority; bootstrap role must remain absent");
    assertAssignment(r, { ...historical, id: historical.assignmentId, name: historical.assignmentId.split("/").at(-1), principalType: "ServicePrincipal" });
  }
  return a;
}
export function readContinuationAuthority(read, selection, phase, now = Date.now()) {
  const a = assertContinuationRecord(selection, phase, now);
  const account = read(["account", "show"]);
  assert.equal(account.id, destination.subscriptionId); assert.equal(account.tenantId, destination.tenantId);
  assert.equal(account.user?.type, "servicePrincipal", "Workflow caller required");
  assert.ok(sameId(account.user.name, (phase === "apply" ? applyIdentity : previewIdentity).clientId), "Wrong original bounded caller client");
  const definitions = continuationDefinitions.map((expected) => {
    const actual = get(read, `${expected.id}?api-version=2022-04-01`);
    assertDefinition(actual, expected);
    assert.deepEqual(actual, a.definitions.find((v) => sameId(v.id, expected.id)), "Actual role definition drift");
    return actual;
  });
  return { version: 1, mode: boundedMode, authoritySha256: stateHash(a), definitions, workflowRun: selection.run,
    assignmentReadProof: "operator-collected complete S/G/D inventories; NOT fresh workflow assignment GETs; native evidence review required",
    permissionProof: "independent current caller effective permissions still required; ACA minimum remains EXTERNAL_REQUIRED",
    cleanup: "human operator must remove six assignments immediately after attempt including verification/checkpoint, or failure/deadline; helpers never remove or attest cleanup" };
}
export function continuationSelection(plan, execution = { runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT }) {
  if (plan.inputs.stageContext?.continuationAuthority === undefined) return undefined;
  return { stage: plan.inputs.stage, authority: plan.inputs.stageContext.continuationAuthority,
    source: { commitSha: plan.evidence.commitSha, sourceSha256: plan.evidence.sourceSha256 },
    completionBasis: plan.inputs.stageContext.predecessor, run: execution.run ?? execution };
}
export function assertContinuationLifetime(selection, phase = "apply", now = Date.now()) {
  if (selection !== undefined) assertContinuationRecord(selection, phase, now);
}
function bindings(resources) {
  return bootstrapInventory().filter((r) => r.type.endsWith("/userAssignedIdentities")).map(({ id }) => {
    const r = resources.find((v) => sameId(v.id, id));
    assert.equal(r?.properties?.tenantId, destination.tenantId, "Wrong actual identity tenant");
    for (const k of ["principalId", "clientId"]) assert.match(r.properties[k] ?? "", uuid, `Missing actual ${k}`);
    return { id, principalId: r.properties.principalId.toLowerCase(), clientId: r.properties.clientId.toLowerCase() };
  });
}
function expectedGrants(ids) {
  const registry = bootstrapInventory().find((r) => r.type.endsWith("/registries")).id;
  const container = bootstrapInventory().find((r) => r.type.endsWith("/containers")).id;
  const tuples = [...ids.map((identity) => ({ identity, scope: registry, role: roleId("7f951dda-4ed3-4680-a7ca-43fe172d538d") })),
    { identity: ids.find((v) => v.id.endsWith("-api")), scope: container, role: roleId("ba92f5b4-2d11-453d-a403-e96b0029c9fe") }];
  return tuples.map(({ identity, scope: target, role }) => {
    const name = armGuid(target, identity.id, role);
    return { id: `${target}/providers/Microsoft.Authorization/roleAssignments/${name}`, name, scope: target, roleDefinitionId: role,
      identityResourceId: identity.id, principalId: identity.principalId, clientId: identity.clientId, principalType: "ServicePrincipal" };
  });
}
export function readSecurity(read, context, predecessor) {
  assert.ok(context, "Missing security handoff context");
  for (const field of ["ownerReviewReference", "writerRemovalReference", "permissionReviewReference"]) assertReference(context[field], field);
  const boot = bootstrapInventory().map((r) => read(["resource", "show", "--ids", r.id, "--api-version", apiVersions[r.type.split("/")[0]]]));
  const ids = bindings(boot);
  assert.deepEqual(ids, bindings(predecessor.resources), "Recreated/swapped bootstrap identity");
  assert.equal(new Set(ids.map((v) => v.principalId)).size, 3, "Duplicate actual principal");
  assert.equal(new Set(ids.map((v) => v.clientId)).size, 3, "Duplicate actual client ID");
  const storage = boot.find((r) => r.type.endsWith("/storageAccounts"));
  const container = boot.find((r) => r.type.endsWith("/containers"));
  const registry = boot.find((r) => r.type.endsWith("/registries"));
  for (const [k, value] of Object.entries({ allowBlobPublicAccess: false, allowSharedKeyAccess: false, defaultToOAuthAuthentication: true, minimumTlsVersion: "TLS1_2", supportsHttpsTrafficOnly: true, publicNetworkAccess: "Enabled" })) assert.equal(storage.properties[k], value, `Storage security drift ${k}`);
  assert.equal(registry.properties.adminUserEnabled, false, "Registry admin drift");
  assert.equal(container.properties.publicAccess, "None", "Container public access");
  const retention = boot.find((r) => r.type.endsWith("/blobServices")).properties.deleteRetentionPolicy;
  assert.ok(retention?.enabled && retention.days === 7, "Blob retention drift");
  const settings = get(read, `${storage.id}/providers/Microsoft.Security/defenderForStorageSettings/current?api-version=2025-06-01`);
  const p = settings?.properties;
  assert.equal(p?.isEnabled, true, "Defender not enabled/visible");
  assert.equal(p.overrideSubscriptionLevelSettings, true, "Defender override drift");
  assert.equal(p.sensitiveDataDiscovery?.isEnabled, false, "Discovery setting drift");
  assert.equal(p.malwareScanning?.onUpload?.isEnabled, true, "On-upload scanning disabled");
  assert.equal(p.malwareScanning.onUpload.capGBPerMonth, 100, "Full 100 GB scan cap required");
  for (const value of Object.values(p.malwareScanning.onUpload.filters ?? {})) assert.ok(value === null || (Array.isArray(value) && value.length === 0), "Scanning exclusions violate full on-upload coverage");
  // REST 2025-06-01 spells this blobIndexTags; Azure readback/SDK use
  // BlobIndexTags for the same index-tag mode. Compare only these two known
  // representations; retain the raw response for evidence hashes/drift checks.
  const indexMode = p.malwareScanning.blobScanResultsOptions;
  assert.equal(indexMode === "BlobIndexTags" ? "blobIndexTags" : indexMode, "blobIndexTags", "Current readable index setting missing/drifted");
  assert.ok(!p.malwareScanning.operationStatus && !p.sensitiveDataDiscovery.operationStatus, "Failure/partial-success scan configuration status");
  const scannerPattern = new RegExp(`^/subscriptions/${destination.subscriptionId}(?:/resourceGroups/${destination.resourceGroup})?/providers/Microsoft.Security/dataScanners/[^/?#]+$`, "i");
  assert.match(context.scannerId ?? "", scannerPattern, "Wrong actual scanner destination");
  const scanner = get(read, `${context.scannerId}?api-version=2026-08-01`);
  assert.ok(sameId(scanner?.id, context.scannerId) && scanner.type?.toLowerCase() === "microsoft.security/datascanners", "Wrong scanner resource");
  assert.ok(["SystemAssigned", "systemassigned"].includes(scanner.identity?.type), "Missing scanner service identity");
  assert.equal(scanner.identity.tenantId, destination.tenantId, "Wrong scanner tenant");
  assert.match(scanner.identity.principalId ?? "", uuid, "Missing actual scanner principal");
  assert.ok(!ids.some((v) => sameId(v.principalId, scanner.identity.principalId)), "Scanner cannot substitute a workload principal");
  const assignments = new Map();
  for (const target of [registry.id, container.id, storage.id]) {
    const rows = read(["role", "assignment", "list", "--scope", target, "--include-inherited"]);
    assert.ok(Array.isArray(rows), "Missing grant/inherited access visibility");
    for (const r of rows) {
      assert.ok(r?.id && r.scope && r.principalId && r.roleDefinitionId, "Incomplete role visibility");
      const prior = assignments.get(r.id.toLowerCase());
      if (prior) assert.deepEqual(prior, r, "Inconsistent actual grant reads");
      assignments.set(r.id.toLowerCase(), r);
    }
  }
  const rows = [...assignments.values()];
  const workload = rows.filter((r) => ids.some((v) => sameId(r.principalId, v.principalId)) || expectedGrants(ids).some((v) => sameId(r.id, v.id)));
  assertHumanGrantAssignments(workload, expectedGrants(ids));
  const scannerRows = rows.filter((r) => sameId(r.principalId, scanner.identity.principalId));
  assert.equal(scannerRows.length, 1, "Missing/extra scanner service grants; owner review required");
  const profile = context.scannerAccessProfile;
  if (profile !== undefined) {
    exactKeys(profile, ["version", "mode"], "scanner access profile");
    assert.equal(profile.version, 1, "Unknown scanner access profile version");
    assert.ok(["legacy-storage-blob-data-owner", "defender-storage-malware-data-scanner"].includes(profile.mode), "Unknown scanner access profile");
  }
  const leastPrivilege = profile?.mode === "defender-storage-malware-data-scanner";
  const dataOwner = scannerRows[0];
  assert.ok(sameId(dataOwner.scope, storage.id) && sameId(dataOwner.roleDefinitionId, roleId(leastPrivilege
    ? "cd50fd1f-0421-46f2-8cce-afc587dbcc77" : "b7e6dc6d-f1e8-4753-8033-0f276bb0955b")) && dataOwner.principalType === "ServicePrincipal",
  leastPrivilege ? "Scanner requires exact Defender Storage Malware Data Scanner" : "Scanner requires exact Storage Blob Data Owner");
  assert.ok(!dataOwner.condition && !dataOwner.conditionVersion, "Unreviewed scanner grant condition");
  assert.match(dataOwner.name ?? "", uuid, "Missing actual service-created assignment name");
  assert.ok(sameId(dataOwner.id, `${storage.id}/providers/Microsoft.Authorization/roleAssignments/${dataOwner.name}`), "Wrong service-created assignment ID");
  let scannerDefinition;
  if (leastPrivilege) {
    assert.ok(sameId(scanner.id, actualScanner), "Wrong approved actual scanner destination");
    assert.ok(sameId(p.dataScannerResourceId, scanner.id), "Defender setting/scanner correlation mismatch");
    const rules = storage.properties.networkAcls?.resourceAccessRules;
    assert.ok(Array.isArray(rules) && rules.length === 1 && sameId(rules[0].resourceId, scanner.id)
      && rules[0].tenantId === destination.tenantId, "Missing/extra/foreign Storage scanner resource access rule");
    exactKeys(rules[0], ["resourceId", "tenantId"], "scanner resource access rule");
    scannerDefinition = get(read, `${dataOwner.roleDefinitionId}?api-version=2022-04-01`);
    assertDefinition(scannerDefinition, { id: roleId("cd50fd1f-0421-46f2-8cce-afc587dbcc77"), type: "BuiltInRole", scopes: ["/"],
      actions: ["Microsoft.Storage/storageAccounts/blobServices/containers/read", "Microsoft.Storage/storageAccounts/fileServices/shares/read"],
      dataActions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read", "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/tags/write",
        "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/tags/read", "Microsoft.Storage/storageAccounts/fileServices/fileshares/files/read",
        "Microsoft.Storage/storageAccounts/fileServices/readFileBackupSemantics/action", "Microsoft.EventGrid/events/send/action"] });
  }
  const other = rows.filter((r) => !workload.includes(r) && !scannerRows.includes(r));
  assert.ok(!rows.some((r) => sameId(r.roleDefinitionId, roleId("bb60fd06-bbaa-56a9-a35c-a6a246597d9e"))
    || r.id.toLowerCase().endsWith("/16d6d244-a6ae-590d-b73d-d547d49ca16e")), "Temporary synthetic B must be absent in final security inventory");
  for (const r of other) {
    assert.ok([`/subscriptions/${destination.subscriptionId}`, `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}`].some((s) => sameId(s, r.scope)), "Unexpected direct/foreign service-principal access; only reviewed inherited operator context may remain");
    const review = context.inheritedAssignmentReview?.find((v) => sameId(v.id, r.id));
    assert.ok(review?.reason && review.sha256 === stateHash(r), "Unexplained extra/inherited access");
    assertReference(review.ownerReference, "inherited access");
  }
  const serviceResources = securityInventory(context).map((r) => {
    const actual = read(["resource", "show", "--ids", r.id, "--api-version", apiVersions[r.type.split("/")[0]]]);
    assert.ok(sameId(actual.id, r.id) && actual.type === r.type, "Foreign service security resource");
    if (r.type === "Microsoft.EventGrid/systemTopics") {
      assert.ok(sameId(actual.properties?.source, storage.id), "Wrong readable Event Grid source; never infer hidden topology");
      assert.equal(actual.properties.provisioningState, "Succeeded", "Event Grid resource not healthy/visible");
    } else assert.ok(sameId(actual.id, scanner.id), "Unrelated service scanner inventory");
    return actual;
  });
  return canonical({ destination, storageId: storage.id, containerId: container.id, settings: p, serviceResources: projectResources(serviceResources),
    scanner: { id: scanner.id, identity: scanner.identity, ...(leastPrivilege ? { accessProfile: profile, roleDefinition: scannerDefinition } : {}) }, grants: rows.sort((a, b) => a.id.localeCompare(b.id)),
    bootstrap: projectResources(boot), internalTopology: "UNVERIFIED" });
}
// Structural/correlation checks only, never authentication of consent or truth.
// Legacy records describe human observation; v2 explicitly describes a local
// owner-directed agent using an existing human operator's actual authority.
// Blob tags are mutable and NEVER an automated security/data-admission proof.
export function validateFunctionalTest(test, security, now = Date.now(), selection) {
  assert.ok(test, "Missing owner-authorized synthetic functional test");
  const version = test.version === undefined ? 1 : test.version;
  assert.ok([1, 2].includes(version), "Unknown functional record version");
  const bounded = selection !== undefined;
  if (bounded) assert.equal(version, 2, "Bounded access requires NEW functional v2 evidence");
  else assert.ok(!test.machineEvidence?.accessEvidence, "Transient access evidence requires explicit bounded selection");
  if (version === 1) {
    for (const field of ["executor", "observer", "operator", "authorization", "machineEvidence"]) {
      assert.ok(!(field in test), "Agent evidence requires functional record version 2; legacy is human observation only");
    }
  }
  assert.equal(test.owner, "cmbuyamba", "Wrong Azure technical owner");
  for (const field of ["observationReference", "executionAuthorizationReference"]) assertReference(test[field], field);
  assert.match(test.testId ?? "", uuid, "Missing unique synthetic test ID");
  assert.equal(test.storageId, security.storageId, "Functional test wrong Storage");
  assert.equal(test.containerId, security.containerId, "Functional test wrong container");
  assert.equal(test.readableSecuritySha256, stateHash(security), "Functional test current readable security/grant correlation mismatch");
  assert.equal(test.result, "No threats found", "Synthetic scan failed/error/not-scanned/missing");
  assert.equal(test.blob?.name, `synthetic-${test.testId}.txt`, "Wrong unique harmless synthetic blob identity");
  assert.ok((typeof test.blob.versionId === "string" && test.blob.versionId.length > 0) || (typeof test.blob.etag === "string" && test.blob.etag.length > 0), "Missing blob version/etag");
  for (const field of ["versionId", "etag"]) if (test.blob[field] !== undefined) assert.ok(test.blob[field].length <= 256 && !/[\r\n]/.test(test.blob[field]), "Invalid blob version/etag");
  assert.match(test.blob.contentSha256 ?? "", /^[a-f0-9]{64}$/, "Missing exact synthetic content hash");
  assert.ok(Number.isSafeInteger(test.blob.contentLength) && test.blob.contentLength > 0 && test.blob.contentLength <= 65536, "Bounded harmless file size required");
  const times = ["enabledAt", "startedAt", "uploadedAt", "scanTime", "observedAt"].map((field) => {
    assert.match(test[field] ?? "", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, `Missing UTC ${field}`);
    const value = Date.parse(test[field]);
    assert.ok(Number.isFinite(value) && value <= now && new Date(value).toISOString() === test[field], `Future/invalid ${field}`); return value;
  });
  for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], "Stale/mismatched scan/upload/enablement/test correlation");
  assert.ok(now - times[1] <= 24 * 60 * 60 * 1000 && now - times[4] <= 24 * 60 * 60 * 1000, "Synthetic evidence older than 24 hours; new owner review required");
  if (version === 2) {
    assert.equal(test.executor?.kind, "agent", "V2 requires actual agent executor");
    assert.equal(test.executor.context, "local", "Only owner-directed local execution, never workflow execution");
    assert.equal(test.observer?.kind, "agent", "V2 requires actual agent observer");
    for (const actor of [test.executor, test.observer]) assert.match(actor.id ?? "", /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/, "Missing actual agent identity");
    assert.equal(test.operator?.type, "user", "Existing authenticated human operator required, not service principal");
    assert.match(test.operator.principalId ?? "", uuid, "Missing actual operator principal ID");
    assert.equal(test.operator.tenantId, destination.tenantId, "Wrong operator tenant");
    assert.equal(test.operator.subscriptionId, destination.subscriptionId, "Wrong operator subscription");
    const authorization = test.authorization;
    assert.ok(authorization, "Missing scope-specific human authorization");
    assert.equal(authorization.authorizer, test.owner, "Owner authorizes; agent does not self-authorize");
    for (const [field, expected] of Object.entries({
      operatorPrincipalId: test.operator.principalId, executorId: test.executor.id, observerId: test.observer.id,
      containerId: test.containerId, testId: test.testId,
    })) assert.equal(authorization[field], expected, `Authorization ${field} mismatch`);
    const authorizedAt = Date.parse(authorization.authorizedAt);
    assert.ok(Number.isFinite(authorizedAt) && new Date(authorizedAt).toISOString() === authorization.authorizedAt
      && authorizedAt <= times[1], "Invalid/future authorization or authorization after test start");
    const evidence = test.machineEvidence;
    assert.ok(evidence, "Missing actual command/readback evidence");
    assertReference(evidence.reference, "machine evidence");
    for (const field of ["commandsSha256", "readbackSha256"]) assert.match(evidence[field] ?? "", /^[a-f0-9]{64}$/, `Missing actual ${field}`);
    assert.deepEqual(evidence.readback, {
      storageId: test.storageId, containerId: test.containerId, blob: test.blob,
      operatorPrincipalId: test.operator.principalId, observedAt: test.observedAt,
      tags: { "Malware scanning scan result": test.result, "Malware scanning scan time": test.scanTime },
    }, "Actual scan readback/version/hash/size/identity correlation mismatch");
    assert.equal(evidence.readbackSha256, stateHash(evidence.readback), "Machine readback hash mismatch");
    const accessEvidence = bounded ? assertSyntheticAccessEvidence(test, security, selection, now) : null;
    return { version, testId: test.testId, authorizer: test.owner, executor: test.executor,
      observer: test.observer, operator: test.operator, observationReference: test.observationReference,
      sha256: stateHash(test), authorizationAuthentication: "required in native owner review; references/hashes are not authenticated consent or observation",
      internalTopology: "UNVERIFIED", automaticDataAdmission: false, ...(accessEvidence ? { accessEvidence } : {}) };
  }
  return { testId: test.testId, observationReference: test.observationReference, sha256: stateHash(test),
    ownerConfirmation: "required in referenced owner evidence and native human review; not machine authenticated",
    internalTopology: "UNVERIFIED", automaticDataAdmission: false };
}
// No Blob/role transport. This binds actual operator observations and records
// their limits; mutable tags and hashes do not authenticate safety or consent.
export function assertSyntheticAccessEvidence(test, security, selection, now = Date.now()) {
    const a = assertContinuationRecord(selection, selection.phase ?? "apply", now);
    const e = test.machineEvidence?.accessEvidence;
    exactKeys(e, ["version", "mode", "source", "authoritySha256", "testId", "window", "grant", "definition", "s0", "s1",
      "grantReadbackAt", "removedAt", "absence", "upload"], "synthetic access evidence");
    assert.equal(e.version, 1, "Unknown synthetic access proof version");
    assert.equal(e.mode, "companydev-synthetic-transient-access", "Unknown synthetic access proof mode");
    assert.deepEqual(e.source, a.source, "Synthetic source mismatch");
    assert.equal(e.authoritySha256, stateHash(a), "Synthetic authority binding mismatch");
    assert.equal(test.testId, "c06587c9-df56-5258-a9ca-dc29608a4167", "Wrong approved synthetic test ID");
    assert.equal(e.testId, test.testId, "Access proof test ID mismatch");
    assert.deepEqual(e.window, { firstGrantAt: a.firstGrantAt, deadline: a.deadline }, "Wrong synthetic access common clock");
    const operatorPrincipal = a.removalOwner.principalId;
    assert.ok(sameId(test.operator?.principalId, operatorPrincipal), "Wrong approved synthetic operator");
    const container = bootstrapInventory().find((r) => r.type.endsWith("/containers")).id;
    assert.equal(test.containerId, container, "Wrong approved synthetic container");
    const syntheticRole = roleId("bb60fd06-bbaa-56a9-a35c-a6a246597d9e");
    assertDefinition(e.definition, { id: syntheticRole, scopes: [group], actions: [], dataActions: [
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/write",
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read",
      "Microsoft.Storage/storageAccounts/blobServices/containers/blobs/tags/read",
    ] });
    const name = "16d6d244-a6ae-590d-b73d-d547d49ca16e";
    const grant = { id: `${container}/providers/Microsoft.Authorization/roleAssignments/${name}`, name, scope: container,
      roleDefinitionId: syntheticRole, principalId: operatorPrincipal, principalType: "User" };
    for (const key of Object.keys(grant)) assert.equal(e.grant?.[key], grant[key], `Wrong synthetic assignment ${key}`);
    const condition = `(!(ActionMatches{'Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read'} AND SubOperationMatches{'Blob.List'})) AND (@Resource[Microsoft.Storage/storageAccounts/blobServices/containers/blobs:path] StringEquals 'synthetic-${test.testId}.txt') AND (@Environment[UtcNow] DateTimeGreaterThan '${a.firstGrantAt}') AND (@Environment[UtcNow] DateTimeLessThan '${a.deadline}')`;
    assert.equal(e.grant.conditionVersion, "2.0", "Synthetic ABAC version mismatch");
    assert.equal(e.grant.condition, condition, "Exact root-path/no-list/UTC synthetic condition required");
    exactKeys(e.upload, ["ifNoneMatch", "path", "contentSha256", "contentLength", "commandsSha256"], "synthetic upload");
    assert.deepEqual(e.upload, { ifNoneMatch: "*", path: test.blob.name, contentSha256: test.blob.contentSha256,
      contentLength: test.blob.contentLength, commandsSha256: test.machineEvidence.commandsSha256 }, "Conditional-create upload correlation mismatch");
    for (const snapshot of [e.s0, e.s1]) {
      exactKeys(snapshot, ["snapshot", "sha256", "observedAt", "reference"], "synthetic security snapshot");
      assertReference(snapshot.reference, "actual security observation");
      assert.equal(snapshot.sha256, stateHash(snapshot.snapshot), "Synthetic snapshot hash mismatch");
      assert.ok(Array.isArray(snapshot.snapshot?.grants) && !snapshot.snapshot.grants.some((r) => sameId(r.id, grant.id)
        || sameId(r.roleDefinitionId, syntheticRole)), "Temporary synthetic B must be absent in S0 and S1");
    }
    assert.deepEqual(canonical(e.s0.snapshot), canonical(e.s1.snapshot), "Canonical S0/S1 security drift");
    assert.deepEqual(canonical(e.s1.snapshot), canonical(security), "Fresh final security differs from S1; never retag an old functional hash");
    for (const assignment of a.assignments.filter((r) => sameId(r.scope, group) || sameId(r.scope, subscription))) {
      assert.deepEqual(security.grants.find((r) => sameId(r.id, assignment.id)), assignment, "Current available workflow assignment read differs from operator authority record");
    }
    assert.equal(test.readableSecuritySha256, e.s1.sha256, "Functional record must bind NEW S1 hash");
    exactKeys(e.absence, ["assignmentId", "observedAt", "reference", "result", "scope", "complete", "nextLink", "assignments"], "synthetic absence proof");
    assertReference(e.absence.reference, "actual synthetic removal");
    assert.equal(e.absence.assignmentId, grant.id); assert.equal(e.absence.scope, container);
    assert.equal(e.absence.result, "RoleAssignmentNotFound", "Actual absence GET required");
    assert.equal(e.absence.complete, true); assert.equal(e.absence.nextLink, null);
    assert.ok(Array.isArray(e.absence.assignments) && !e.absence.assignments.some((r) => sameId(r.id, grant.id)
      || sameId(r.roleDefinitionId, syntheticRole)), "Residual synthetic assignment");
    assert.deepEqual(canonical(e.absence.assignments), canonical(security.grants.filter((r) => sameId(r.scope, container))), "Actual final container inventory/absence mismatch");
    const times = [a.firstGrantAt, a.collection.collectedAt, e.s0.observedAt, e.grant.createdOn, e.grantReadbackAt,
      test.startedAt, test.uploadedAt, test.scanTime, test.observedAt, e.removedAt, e.absence.observedAt, e.s1.observedAt].map((t) => utc(t, "synthetic chronology"));
    for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], "Synthetic grant/upload/removal/S0/S1 chronology mismatch");
    assert.ok(times[3] > times[2] && times[9] > times[8] && times.at(-1) <= now && times.at(-1) < utc(a.deadline, "deadline"),
      "Synthetic access outside exact active window");
    return { version: 1, mode: e.mode, sha256: stateHash(e), temporaryAssignmentRemoved: "operator-evidence-not-workflow-cleanup",
      limitations: "native review authenticates observations; UtcNow expires data access only, metadata removal required; write can modify this one object during window, not an immutable write primitive" };
  }
function optional(read, args, code) {
  try { return read(args); } catch (error) { if (error.code === code) return null; throw error; }
}
export function readResources(read, stage, securityContext) {
  const expected = stage === "bootstrap" ? bootstrapInventory() : [...bootstrapInventory(), ...continuationInventory(), ...securityInventory(securityContext)];
  const listed = read(["resource", "list", "--resource-group", destination.resourceGroup]);
  assert.ok(Array.isArray(listed), "Missing actual resource inventory visibility");
  for (const r of listed) assert.ok(expected.some((e) => sameId(e.id, r.id) && e.type.toLowerCase() === r.type.toLowerCase()), "Unexpected extra resource/security inventory; stop");
  const resources = [];
  for (const item of expected) {
    const version = item.type.includes("/privateDnsZones") ? "2024-06-01" : apiVersions[item.type.split("/")[0]];
    const r = optional(read, ["resource", "show", "--ids", item.id, "--api-version", version], "ResourceNotFound");
    if (!r) continue;
    assert.ok(sameId(r.id, item.id) && r.type.toLowerCase() === item.type.toLowerCase(), "Foreign/swapped actual resource");
    resources.push(r);
  }
  const top = resources.filter((r) => topLevelTypes.includes(r.type));
  assert.deepEqual(top.map((r) => r.id.toLowerCase()).sort(), listed.map((r) => r.id.toLowerCase()).sort(), "Actual resource/list visibility mismatch");
  return projectResources(resources);
}
export function assertCompletedResources(resources, stage) {
  for (const r of resources) if (r.properties?.provisioningState !== undefined) assert.equal(r.properties.provisioningState, "Succeeded", "Actual resource provisioning not complete");
  if (stage === "bootstrap") return;
  const find = (type) => {
    const r = resources.find((v) => v.type === type); assert.ok(r?.properties, `Missing actual ${type} properties`); return r;
  };
  const pg = find("Microsoft.DBforPostgreSQL/flexibleServers"), p = pg.properties;
  assert.deepEqual(pg.sku, { name: "Standard_B1ms", tier: "Burstable" }, "PG sizing drift");
  assert.equal(p.state, "Ready", "PG not Ready");
  assert.equal(p.version, "16", "PG version drift");
  for (const [key, value] of Object.entries({ activeDirectoryAuth: "Enabled", passwordAuth: "Disabled", tenantId: destination.tenantId })) assert.equal(p.authConfig?.[key], value, "PG Entra-only/tenant drift");
  assert.equal(p.storage?.storageSizeGB, 32, "PG storage sizing drift");
  assert.equal(p.storage?.type, "Premium_LRS", "PG storage tier drift");
  assert.equal(p.backup?.backupRetentionDays, 7, "PG backup retention drift");
  assert.equal(p.backup?.geoRedundantBackup, "Disabled", "PG backup cost/design drift");
  assert.equal(p.highAvailability?.mode, "Disabled", "PG HA cost/design drift");
  assert.equal(p.network?.publicNetworkAccess, "Disabled", "PG public access drift");
  const vnet = continuationInventory().find((r) => r.type === "Microsoft.Network/virtualNetworks").id;
  const dns = continuationInventory().find((r) => r.type === "Microsoft.Network/privateDnsZones").id;
  assert.ok(sameId(p.network.delegatedSubnetResourceId, `${vnet}/subnets/postgres`) && sameId(p.network.privateDnsZoneArmResourceId, dns), "PG private network binding drift");
  const aca = find("Microsoft.App/managedEnvironments").properties;
  assert.deepEqual(aca.workloadProfiles?.map((v) => ({ name: v.name, workloadProfileType: v.workloadProfileType })), [{ name: "Consumption", workloadProfileType: "Consumption" }], "ACA Consumption-only drift");
  assert.equal(aca.zoneRedundant, false, "ACA cost/design drift");
  assert.equal(aca.vnetConfiguration?.internal, false, "ACA environment networking drift");
  assert.ok(sameId(aca.vnetConfiguration.infrastructureSubnetId, `${vnet}/subnets/aca-infrastructure`), "ACA subnet drift");
  assert.equal(aca.infrastructureResourceGroup, "ME_keyforta_cdev_mxv24i2qhtib6", "ACA managed infrastructure RG drift");
  assert.equal(find("Microsoft.OperationalInsights/workspaces").properties.retentionInDays, 30, "Log retention drift");
}

export function inspectDeployment(read, name) {
  assert.match(name ?? "", /^companydev-(bootstrap|continuation)-[a-f0-9]{12}$/);
  const deployment = optional(read, ["deployment", "group", "show", "--resource-group", destination.resourceGroup, "--name", name], "DeploymentNotFound");
  if (!deployment) return null;
  const status = deployment.properties?.provisioningState;
  assert.ok(["Succeeded", "Failed", "Canceled"].includes(status), "Existing deployment running/timeout/unknown; inspect before any write, never auto-retry");
  const rows = read(["deployment", "operation", "group", "list", "--resource-group", destination.resourceGroup, "--name", name]);
  assert.ok(Array.isArray(rows) && rows.length, "Missing actual deployment operation visibility");
  const operations = rows.map(({ operationId, properties: p }) => {
    assert.ok(p && ["Succeeded", "Failed", "Canceled"].includes(p.provisioningState), "Incomplete/unknown ARM operation");
    assert.ok(["Create", "Read", "EvaluateDeploymentOutput"].includes(p.provisioningOperation), "Unknown/destructive ARM operation");
    if (p.targetResource) {
      const target = p.targetResource;
      const stageWrites = name.startsWith("companydev-bootstrap-") ? bootstrapInventory() : continuationInventory();
      const allowedResources = p.provisioningOperation === "Read" ? [...bootstrapInventory(), ...continuationInventory()] : stageWrites;
      const allowed = allowedResources.some((r) => sameId(r.id, target.id) && r.type.toLowerCase() === target.resourceType?.toLowerCase());
      const nested = target.resourceType === "Microsoft.Resources/deployments" && ["foundation-keyforta-cdev", "stamp-keyforta-cdev"].some((n) => sameId(target.id, `${scope}Microsoft.Resources/deployments/${n}`));
      assert.ok(allowed || nested, "Unexpected ARM operation destination/type");
    }
    return { operationId: operationId ?? null, provisioningState: p.provisioningState, provisioningOperation: p.provisioningOperation, targetResource: p.targetResource ?? null };
  });
  return canonical({ name, status, operations });
}
function wildcard(pattern, action) {
  const regex = "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
  return new RegExp(regex, "i").test(action);
}
export function readStagePermissionReadiness(read, stage, phase, writeRequired = true, selection, now = Date.now()) {
  assert.ok(["bootstrap", "continuation"].includes(stage) && ["preview", "apply"].includes(phase), "Unknown caller stage/phase");
  if (selection) assert.equal(selection.stage, stage, "Wrong selected authority stage");
  const authority = selection === undefined ? null : readContinuationAuthority(read, selection, phase, now);
  const boundedApply = authority && stage === "continuation" && phase === "apply";
  const resources = stage === "bootstrap" ? bootstrapInventory() : continuationInventory();
  const writes = [...new Set(resources.map((r) => `${r.type}/write`)), "Microsoft.Resources/deployments/write"];
  if (stage === "continuation") writes.push("Microsoft.OperationalInsights/workspaces/sharedKeys/action");
  const whatIf = "Microsoft.Resources/deployments/whatIf/action";
  const allowed = phase === "apply" ? [...writes, whatIf, "Microsoft.Resources/deployments/validate/action", ...(boundedApply ? joins : [])] : [whatIf];
  const response = get(read, `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`);
  assert.ok(Array.isArray(response?.value) && response.value.length, "Missing stage caller permission visibility");
  for (const row of response.value) {
    for (const key of ["actions", "notActions", "dataActions", "notDataActions"]) assert.ok(Array.isArray(row[key]), "Incomplete stage permission read");
    assert.equal(row.dataActions.length, 0, "Workflow data authority forbidden");
    for (const action of row.actions) assert.ok(action.toLowerCase().endsWith("/read") || allowed.some((a) => a.toLowerCase() === action.toLowerCase()), "Caller authority outside exact proposed stage operation allowlist");
  }
  const required = [...(phase === "apply" && writeRequired ? [...writes, whatIf] : [whatIf]), ...(boundedApply ? joins : [])];
  for (const action of required) assert.ok(response.value.some((r) => r.actions.some((p) => wildcard(p, action)) && !r.notActions.some((p) => wildcard(p, action))), `Missing declared stage operation: ${action}`);
  return { scope: `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}`, phase, permissions: response.value,
    declaredTemplateOperationsOnly: !boundedApply, acaMinimumPermissionProof: stage === "continuation" ? "EXTERNAL_REQUIRED" : "NOT_APPLICABLE",
    ...(authority ? { continuationPermissionMode: "BOUNDED_BASELINE", authority } : {}) };
}

export function assertOriginalApplyCaller(read, predecessor) {
  const account = read(["account", "show"]);
  assert.equal(account.id, destination.subscriptionId, "Wrong writer subscription");
  assert.equal(account.tenantId, destination.tenantId, "Wrong writer tenant");
  assert.equal(account.user?.type, "servicePrincipal", "Scoped workflow caller required");
  const writer = predecessor.kind === "bootstrap-completion-basis"
    ? assertCompletionBasis(predecessor).historicalWriter.clientId : predecessor.applyClientId;
  assert.match(writer ?? "", uuid, "Missing original bootstrap workflow caller");
  assert.ok(sameId(account.user.name, writer), "Must verify original bootstrap workflow caller, not a different SP");
  return account;
}
export function assertWriterRevoked(read, predecessor, phase = "apply", securityContext, selection, now = Date.now()) {
  assert.ok(["apply", "preview"].includes(phase), "Unknown writer permission phase");
  const account = phase === "apply" ? assertOriginalApplyCaller(read, predecessor) : read(["account", "show"]);
  assert.equal(account.id, destination.subscriptionId, "Wrong writer subscription");
  assert.equal(account.tenantId, destination.tenantId, "Wrong writer tenant");
  assert.equal(account.user?.type, "servicePrincipal", "Scoped workflow caller required");
  const authority = selection === undefined ? null : readContinuationAuthority(read, selection, phase, now);
  const boundedApply = authority && phase === "apply";
  // Effective reads can include the exact continuation role inherited from
  // the RG. Retain those declared operations, never bootstrap/security writes.
  const allowed = [
    ...new Set(continuationInventory().map((r) => `${r.type}/write`)),
    "Microsoft.OperationalInsights/workspaces/sharedKeys/action",
    "Microsoft.Resources/deployments/write", "Microsoft.Resources/deployments/whatIf/action", "Microsoft.Resources/deployments/validate/action",
  ];
  // Subtraction is per permission row. A broad unknown pattern cannot be
  // proven read-only by sampling a finite blacklist of provider operations.
  const excluded = (pattern, exceptions) => exceptions.some((exception) => {
    if (exception.toLowerCase() === pattern.toLowerCase()) return true;
    if (!pattern.includes("*")) return wildcard(exception, pattern);
    // Only prove wildcard-set containment for an identical pattern or a
    // literal prefix followed by '*'. Never infer it from sample operations.
    const prefix = exception.endsWith("*") ? exception.slice(0, -1) : null;
    return prefix !== null && !prefix.includes("*") && pattern.toLowerCase().startsWith(prefix.toLowerCase());
  });
  const reads = [];
  const storage = bootstrapInventory().find((r) => r.type.endsWith("/storageAccounts"));
  const protectedScopes = [...bootstrapInventory().map((r) => r.id), ...(securityContext
    ? [securityContext.scannerId, `${storage.id}/providers/Microsoft.Security/defenderForStorageSettings/current`, ...securityInventory(securityContext).map((r) => r.id)] : [])];
  for (const id of [...new Set(protectedScopes)]) {
    const boundedScope = boundedApply && id.toLowerCase().startsWith(`${group.toLowerCase()}/`);
    const scopedAllowed = [...allowed, ...(boundedScope ? joins : [])];
    const response = get(read, `${id}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`);
    assert.ok(Array.isArray(response?.value) && response.value.length, "Missing effective caller permission visibility");
    for (const grant of response.value) {
      assert.ok(Array.isArray(grant.actions) && Array.isArray(grant.notActions) && Array.isArray(grant.dataActions) && Array.isArray(grant.notDataActions), "Incomplete effective permission read");
      for (const key of ["actions", "notActions", "dataActions", "notDataActions"]) assert.ok(grant[key].every((p) => typeof p === "string" && p.length), "Invalid effective permission pattern");
      for (const action of grant.dataActions) assert.ok(excluded(action, grant.notDataActions), "Workflow must never have Blob/data access");
      for (const action of grant.actions) assert.ok(excluded(action, grant.notActions)
        || action.toLowerCase().endsWith("/read") || scopedAllowed.some((a) => a.toLowerCase() === action.toLowerCase()),
      `Bootstrap/security writer authority outside closed allowlist: ${action}`);
    }
    if (boundedScope) for (const join of joins) assert.ok(response.value.some((r) => r.actions.some((p) => wildcard(p, join))
      && !r.notActions.some((p) => wildcard(p, join))), `Missing bounded join: ${join}`);
    reads.push({ scope: id, permissions: response.value });
  }
  return { callerClientId: account.user.name, phase, reads, limitations: "current caller effective context only; owner/native review covers equivalent, transitive and PIM authority",
    ...(authority ? { authority } : {}) };
}
export function validateStageChanges(preview, plan, completed) {
  assertNoSecretPayload(preview);
  assertWhatIfCollections(preview);
  if (plan.inputs.stageContext?.sourceTransition) {
    assert.ok(preview.changes?.every((c) => c.changeType === "NoChange" && (!c.delta || c.delta.length === 0)), "Verification-only requires exclusively NoChange without property deltas");
  }
  assert.ok(!preview.error && Array.isArray(preview.changes) && preview.changes.length, "Missing/failed staged what-if");
  const context = plan.inputs.stageContext;
  const allowed = plan.inputs.stage === "bootstrap" ? bootstrapInventory() : continuationInventory();
  const ids = new Set();
  for (const change of preview.changes) {
    const id = change.resourceId?.toLowerCase();
    assert.ok(id && !ids.has(id), "Repeated/missing what-if identity"); ids.add(id);
    if (change.after?.type === "Microsoft.Resources/deployments") {
      assert.ok(["foundation-keyforta-cdev", "stamp-keyforta-cdev"].some((n) => sameId(change.resourceId, `${scope}Microsoft.Resources/deployments/${n}`)), "Unexpected deployment record");
      assert.ok(["Create", "NoChange"].includes(change.changeType), "Unreviewed deployment record delta"); continue;
    }
    const item = allowed.find((r) => sameId(r.id, change.resourceId) && r.type.toLowerCase() === change.after?.type?.toLowerCase());
    assert.ok(item, "What-if outside exact stage inventory; bootstrap/security writes forbidden");
    assert.ok(["Create", "NoChange", "Modify"].includes(change.changeType), "Unknown/Delete/Ignore preview change");
    const existed = context.baseline.some((r) => sameId(r.id, item.id));
    assert.ok(change.changeType === "Create" ? !existed : existed, "What-if baseline existence mismatch");
    if (completed) assert.equal(change.changeType, "NoChange", "Completed stage property drift; not a no-op");
    if (change.changeType === "Modify") {
      assert.equal(plan.inputs.mode, "reviewed-reentry", "Modify requires reviewed re-entry");
      assert.ok(context.approvedChanges.some((v) => stateHash(v) === stateHash(change)), "Unreviewed exact property delta");
      assert.ok(Array.isArray(change.delta) && change.delta.length && change.delta.every((d) => d.path && d.propertyChangeType === "Modify"), "Unknown/non-targeted property delta");
    }
  }
  for (const r of allowed) assert.ok(ids.has(r.id.toLowerCase()), "Incomplete stage what-if inventory");
}
export function assessStage(read, plan, predecessor, now = Date.now(), phase = "apply", execution) {
  assert.ok([2, 3].includes(plan.inputs.evidenceVersion), "Unknown staged policy version");
  const selection = continuationSelection(plan, execution);
  if (selection) {
    selection.phase = phase;
    assert.equal(plan.inputs.mode, "initial", "Bounded authority cannot renew/retry through re-entry");
    readContinuationAuthority(read, selection, phase, now);
  }
  if (predecessor?.kind === "bootstrap-completion-basis") return assessReceiptContinuation(read, plan, predecessor, now, phase);
  const { inputs } = plan, context = inputs.stageContext;
  assert.ok(context && predecessor, "Missing staged predecessor/inventory evidence");
  assert.deepEqual(predecessor.destination, destination, "Wrong predecessor destination");
  assert.ok([2, 3].includes(predecessor.version), "Unknown predecessor version");
  const transition = context.sourceTransition;
  let origin = null;
  if (transition) {
    assert.ok(inputs.stage === "bootstrap" && inputs.mode === "reviewed-reentry", "Verification-only bootstrap re-entry required");
    origin = recoveryOrigin(predecessor);
    assert.deepEqual(context.predecessor, origin.ref, "Foreign recovery artifact context");
    assert.ok(!context.security && !context.targetInspection && !context.deploymentInspections?.length, "Verification-only cannot include security/target/additional transitions");
    assert.deepEqual(context.approvedChanges, [], "Verification-only cannot authorize property changes");
    assertVerificationSources(transition, plan.evidence, predecessor);
    assert.deepEqual(plan.inventory.expected, bootstrapInventory(), "Verification-only expected inventory drift");
    for (const key of ["templateSha256", "parametersSha256"]) assert.equal(plan.evidence[key], predecessor[key], `Verification-only ${key} drift`);
    const body = { properties: { mode: "Incremental", template: plan.template, parameters: plan.parameters.parameters } };
    assert.equal(createHash("sha256").update(JSON.stringify(body)).digest("hex"), origin.submission.bodySha256, "Original submitted template/parameters differ");
    assert.deepEqual(context.baseline, projectResources(predecessor.resources), "Verification-only original resource/property/principal drift");
    assert.equal(context.baseline.length, 7, "Verification-only requires complete original inventory");
    assert.equal(context.deploymentName, predecessor.deploymentName, "Verification-only must inspect original deployment");
  }
  function assessReceiptContinuation(read, plan, basis, now, phase) {
    const receipt = assertCompletionBasis(basis), context = plan.inputs.stageContext;
    assert.ok(Date.parse(receipt.observations[1]) <= now, "Completion evidence cannot be from the future");
    assert.equal(plan.inputs.stage, "continuation", "Receipt cannot authorize bootstrap re-entry");
    assert.equal(plan.inputs.mode, "initial", "Receipt is only an initial continuation completion basis");
    assert.deepEqual(context.predecessor, basis.ref, "Wrong authenticated continuation completion basis");
    assert.ok(!context.sourceTransition, "Receipt is not a verification-only checkpoint transition");
    if (plan.inputs.evidenceVersion === 2) assertReference(context.freezeReference, "change freeze");
    else assert.ok(!("freezeReference" in context), "Obsolete freezeReference");
    assertReference(context.inspectionReference, "ARM inspection");
    // This is a NEW plan with separate reviewed grants/Defender/functional test,
    // never a pre-handoff receipt snapshot used as current security approval.
    assert.ok(context.security?.writerRemovalReference, "Fresh independent human security handoff required");
    const current = readResources(read, "continuation", context.security);
    assert.deepEqual(current, context.baseline, "Actual reviewed continuation state drift");
    const boot = current.filter((r) => bootstrapInventory().some((b) => sameId(b.id, r.id)));
    assert.equal(boot.length, 7, "Missing immutable bootstrap identity inventory");
    assert.deepEqual(bindings(boot), bindings(receipt.resources), "Recreated bootstrap identities");
    const readableSecurity = readSecurity(read, context.security, { resources: receipt.resources });
    const functionalTest = validateFunctionalTest(context.security.functionalTest, readableSecurity, now, selection);
    // Existing revocation proof remains mandatory on preview AND apply; apply
    // additionally binds the actual original writer, never the audit observer.
    const writerPermissions = assertWriterRevoked(read, basis, phase, context.security, selection, now);
    const expectedName = `companydev-continuation-${plan.evidence.commitSha.slice(0, 12)}`;
    assert.equal(context.deploymentName, expectedName, "Wrong separately authorized continuation deployment");
    const inspection = inspectDeployment(read, expectedName);
    assert.equal(inspection, null, "Existing continuation requires its own execution checkpoint/re-entry");
    const predecessorInspection = inspectDeployment(read, receipt.original.deploymentName);
    assert.equal(predecessorInspection?.status, "Succeeded", "Historical bootstrap state changed");
    const history = read(["deployment", "group", "list", "--resource-group", destination.resourceGroup]);
    assert.ok(Array.isArray(history), "Missing complete deployment history");
    for (const entry of history) {
      if ([receipt.original.deploymentName, "foundation-keyforta-cdev", "stamp-keyforta-cdev"].includes(entry.name)) {
        assert.equal(entry.properties?.provisioningState, "Succeeded", "Historical deployment no longer successful");
      } else {
        const reviewed = context.deploymentInspections?.find((v) => v.name === entry.name);
        assert.ok(reviewed, "Unexpected continuation deployment history");
        assert.deepEqual(inspectDeployment(read, entry.name), reviewed, "Additional history drift");
      }
    }
    const permissionReadiness = readStagePermissionReadiness(read, "continuation", phase, true, selection, now);
    return { action: "submit", resources: current, inspection, targetInspection: null, predecessorInspection, history,
      functionalTest, readableSecurity, writerPermissions, permissionReadiness,
      completionBasis: basis.ref, receiptIsNotDeploymentAuthorization: true };
  }
  if (phase === "apply") assertOriginalApplyCaller(read, predecessor);
  assert.equal(context.predecessor.stage, predecessor.stage, "Predecessor stage mismatch");
  assert.equal(context.predecessor.sha, predecessor.commitSha, "Predecessor SHA mismatch");
  assert.equal(context.predecessor.runId, predecessor.runId, "Predecessor run mismatch");
  assert.equal(context.predecessor.runAttempt, predecessor.runAttempt, "Predecessor attempt mismatch");
  assert.equal(context.predecessor.mode, predecessor.mode, "Predecessor mode mismatch");
  if (inputs.evidenceVersion === 2) assertReference(context.freezeReference, "change freeze");
  else assert.ok(inputs.evidenceVersion === 3 && !("freezeReference" in context), "Unknown policy/obsolete freezeReference");
  assertReference(context.inspectionReference, "ARM inspection");
  const expectedName = `companydev-${inputs.stage}-${plan.evidence.commitSha.slice(0, 12)}`;
  const predecessorDeploymentSha = predecessor.deploymentCommitSha ?? predecessor.commitSha;
  const predecessorName = `companydev-${predecessor.stage}-${predecessorDeploymentSha.slice(0, 12)}`;
  assert.equal(predecessor.deploymentName, predecessorName, "Predecessor actual deployment name mismatch");
  if (inputs.mode === "initial") assert.equal(context.deploymentName, expectedName, "Wrong initial deployment name");
  else {
    assert.equal(predecessor.stage, inputs.stage, "Re-entry requires same-stage execution predecessor");
    assert.ok([expectedName, predecessorName].includes(context.deploymentName), "Wrong exact deployment inspection name");
  }
  const current = readResources(read, inputs.stage, context.security);
  assert.deepEqual(current, context.baseline, "Actual reviewed inventory/property drift");
  const observedIdentities = current.filter((r) => r.type === "Microsoft.ManagedIdentity/userAssignedIdentities");
  for (const identity of observedIdentities) {
    assert.equal(identity.properties.tenantId, destination.tenantId, "Wrong first-observed UAMI tenant");
    for (const field of ["principalId", "clientId"]) assert.match(identity.properties[field] ?? "", uuid, "Missing actual UAMI principal/client");
  }
  for (const field of ["principalId", "clientId"]) assert.equal(new Set(observedIdentities.map((r) => r.properties[field].toLowerCase())).size, observedIdentities.length, "Duplicate observed UAMI identity");
  const currentBoot = current.filter((r) => bootstrapInventory().some((b) => sameId(b.id, r.id)));
  const previousBoot = projectResources(predecessor.resources).filter((r) => bootstrapInventory().some((b) => sameId(b.id, r.id)));
  if (inputs.stage === "bootstrap" && predecessor.completed === false) {
    for (const r of previousBoot) assert.deepEqual(currentBoot.find((v) => sameId(v.id, r.id)), r, "Partial bootstrap principal/property drift");
  } else assert.deepEqual(currentBoot, previousBoot, "Bootstrap recreation/property/security drift");
  if (inputs.stage === "continuation" && predecessor.stage === "bootstrap") {
    assert.equal(predecessor.completed, true, "Continuation requires verified completed bootstrap");
    assert.equal(currentBoot.length, 7, "Missing bootstrap resources");
  }
  const predecessorInspection = inspectDeployment(read, predecessor.deploymentName);
  assert.ok(predecessorInspection, "Missing predecessor deployment visibility");
  if (predecessor.completed) assert.equal(predecessorInspection.status, "Succeeded", "Completed predecessor ARM state changed");
  const history = read(["deployment", "group", "list", "--resource-group", destination.resourceGroup]);
  assert.ok(Array.isArray(history), "Missing complete deployment history visibility");
  if (transition) assert.ok(history.every((e) => [predecessor.deploymentName, "foundation-keyforta-cdev", "stamp-keyforta-cdev"].includes(e.name) && e.properties?.provisioningState === "Succeeded"), "Verification-only foreign/unsuccessful deployment history");
  for (const entry of history) {
    assert.ok(entry?.name && entry.properties?.provisioningState, "Incomplete deployment history");
    if ([expectedName, predecessor.deploymentName, `companydev-bootstrap-${plan.evidence.commitSha.slice(0, 12)}`, `companydev-bootstrap-${predecessorDeploymentSha.slice(0, 12)}`, "foundation-keyforta-cdev", "stamp-keyforta-cdev"].includes(entry.name)) {
      assert.ok(["Succeeded", "Failed", "Canceled"].includes(entry.properties.provisioningState), "Running/unknown existing deployment; inspect before any write");
      if (entry.name.startsWith("companydev-")) inspectDeployment(read, entry.name);
    } else {
      const reviewed = context.deploymentInspections?.find((v) => v.name === entry.name);
      assert.ok(reviewed, "Unexpected deployment history; no blanket nonempty acceptance");
      assert.deepEqual(inspectDeployment(read, entry.name), reviewed, "Reviewed additional deployment operation drift");
    }
  }
  const inspection = inspectDeployment(read, context.deploymentName);
  const targetInspection = context.deploymentName === expectedName ? inspection : inspectDeployment(read, expectedName);
  if (targetInspection && context.deploymentName !== expectedName) assert.deepEqual(targetInspection, context.targetInspection, "Unexpected target deployment; fresh exact inspection required");
  if (inputs.mode === "reviewed-reentry") {
    assert.ok(inspection && context.inspection, "Reviewed re-entry requires actual frozen terminal ARM inspection");
    assert.deepEqual(inspection, context.inspection, "Frozen ARM operation/inspection drift");
  } else assert.equal(inspection, null, "Existing deployment must be inspected through reviewed re-entry");
  if (targetInspection?.status === "Succeeded" && expectedName !== predecessor.deploymentName) {
    assert.fail("Succeeded current target requires its own verified completion checkpoint; no recovery PUT");
  }
  const completed = predecessor.stage === inputs.stage && inspection?.status === "Succeeded"
    && current.length === plan.inventory.expected.length;
  let originalSuccess = null, verifiedBootstrap = null;
  if (transition) {
    assert.ok(completed && !targetInspection, "Verification-only requires successful original ARM and absent current target; never submit");
    assert.deepEqual(current, projectResources(predecessor.resources), "Verification-only original actual inventory drift");
    const verified = readBootstrapState(read, predecessor.deploymentName);
    verifiedBootstrap = verified;
    assert.deepEqual(projectResources(verified.resources), current, "Verification-only typed resource drift");
    const inOriginalRun = (timestamp) => {
      const t = Date.parse(timestamp);
      assert.ok(Number.isFinite(t) && t >= origin.start && t <= origin.end, "Success provenance outside original failed workflow");
    };
    for (const group of verified.operations) for (const op of group.operations) inOriginalRun(op.properties.timestamp);
    originalSuccess = [predecessor.deploymentName, "foundation-keyforta-cdev", "stamp-keyforta-cdev"].map((name) => {
      const d = read(["deployment", "group", "show", "--resource-group", destination.resourceGroup, "--name", name]);
      assert.equal(d.id?.toLowerCase(), `${scope}Microsoft.Resources/deployments/${name}`.toLowerCase(), "Foreign original successful deployment");
      assert.equal(d.name, name, "Wrong original deployment name");
      assert.equal(d.properties?.provisioningState, "Succeeded", "Original root/nested ARM not successful");
      assert.match(d.properties.correlationId ?? "", uuid, "Missing original success correlation");
      inOriginalRun(d.properties.timestamp);
      return d;
    });
    assert.deepEqual(originalSuccess, context.originalSuccess, "Frozen original success provenance drift");
  }
  if (predecessor.stage === inputs.stage && predecessor.completed) {
    assert.ok(completed, "Completed same-stage checkpoint requires verified no-op with complete inventory; no write recovery");
  }
  if (completed) {
    assert.equal(inputs.mode, "reviewed-reentry", "Completed stage requires reviewed inspection/no-op");
    for (const key of (transition ? ["templateSha256", "parametersSha256"] : ["sourceSha256", "templateSha256", "parametersSha256"])) assert.equal(plan.evidence[key], predecessor[key], `Completed stage ${key} drift`);
    if (predecessor.completed) assert.deepEqual(current, predecessor.resources, "Completed inventory drift");
    assertCompletedResources(current, inputs.stage);
  }
  let functionalTest = null, readableSecurity = null, writerPermissions = null;
  if (inputs.stage === "continuation") {
    assert.ok(predecessor.stage === "bootstrap" ? predecessor.completed : inputs.mode === "reviewed-reentry", "Continuation requires completed bootstrap or reviewed same-stage recovery");
    readableSecurity = readSecurity(read, context.security, { ...predecessor, resources: current });
    functionalTest = validateFunctionalTest(context.security.functionalTest, readableSecurity, now, selection);
    writerPermissions = assertWriterRevoked(read, predecessor, phase, context.security, selection, now);
  } else if (!completed || transition) {
    assert.equal(predecessor.stage, "bootstrap", "Wrong bootstrap recovery predecessor");
    assert.equal(predecessor.completed, false, "Completed bootstrap must never regain write authority");
    assert.ok(!context.security, "Bootstrap cannot resume after human security handoff");
    // No human grants/Defender may have been enabled during a partial bootstrap.
    const knownPrincipals = current.filter((v) => v.type.endsWith("/userAssignedIdentities")).map((v) => v.properties.principalId);
    // Scoped reads include ancestors, never descendants: the existing private
    // container must be queried independently before any recovery preview/write.
    for (const r of current.filter((v) => v.type.endsWith("/registries") || v.type.endsWith("/storageAccounts") || v.type.endsWith("/containers"))) {
      const rows = read(["role", "assignment", "list", "--scope", r.id, "--include-inherited"]);
      assert.ok(Array.isArray(rows), "Missing pre-handoff role visibility");
      assert.ok(!rows.some((a) => sameId(a.scope, r.id) || knownPrincipals.some((p) => sameId(a.principalId, p))), "Bootstrap grants already exist; no write/recreation");
      if (r.type.endsWith("/storageAccounts")) {
        const settings = get(read, `${r.id}/providers/Microsoft.Security/defenderForStorageSettings/current?api-version=2025-06-01`);
        assert.equal(settings?.properties?.isEnabled, false, "Bootstrap cannot resume after enabled/missing-visibility Defender handoff");
        assert.notEqual(settings.properties.malwareScanning?.onUpload?.isEnabled, true, "Bootstrap cannot resume after on-upload scanning enabled");
      }
    }
  }
  const permissionReadiness = readStagePermissionReadiness(read, inputs.stage, phase, !completed, selection, now);
  return { action: completed ? "noop" : "submit", resources: current, inspection, targetInspection, predecessorInspection, history, functionalTest, readableSecurity, writerPermissions, permissionReadiness,
    ...(transition ? { sourceTransition: transition, originalSuccess, verifiedBootstrap, originalCheckpoint: { ...context.predecessor, completed: false, deploymentName: predecessor.deploymentName, deploymentCommitSha: predecessor.commitSha } } : {}) };
}
export function executeReviewedStage({ plan, predecessor, read, preview, submit, now = Date.now(), phase = "apply", execution }) {
  const selection = continuationSelection(plan, execution);
  const before = assessStage(read, plan, predecessor, now, phase, execution);
  const fresh = preview();
  validateStageChanges(plan.whatIf, plan, before.action === "noop");
  validateStageChanges(fresh, plan, before.action === "noop");
  assert.equal(stateHash([...fresh.changes].sort((a, b) => a.resourceId.localeCompare(b.resourceId))), stateHash([...plan.whatIf.changes].sort((a, b) => a.resourceId.localeCompare(b.resourceId))), "Fresh canonical what-if drift");
  const final = assessStage(read, plan, predecessor, selection ? Date.now() : now, phase, execution);
  assert.deepEqual(final, before, "Pre-submission actual state/security/permissions drift");
  if (before.action === "noop") return { ...before, action: "noop" };
  assertContinuationLifetime(selection, phase); // real clock AFTER slow preview/reads
  submit();
  return { ...before, action: "submitted" };
}
