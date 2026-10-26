// Shared read-only state/decision engine for the existing preview/apply routes.
// Kept separate to avoid duplicating security and re-entry checks in both CLI
// helpers. No Azure SDK, Blob data transport, grant or deployment capability.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertNoSecretPayload, assertVerificationSources, assertWhatIfCollections, bootstrapInventory, continuationInventory, destination, securityInventory } from "./company-development.mjs";
export { continuationInventory } from "./company-development.mjs";
import { armGuid, assertHumanGrantAssignments, readBootstrapState, recoveryOrigin } from "./company-development-apply.mjs";
import { projectResources, assertCompletionBasis } from "./company-development-completion-validation.mjs";
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
  assert.equal(p.malwareScanning.blobScanResultsOptions, "blobIndexTags", "Current readable index setting missing/drifted");
  assert.ok(!p.malwareScanning.operationStatus && !p.sensitiveDataDiscovery.operationStatus, "Failure/partial-success scan configuration status");
  const scannerPattern = new RegExp(`^/subscriptions/${destination.subscriptionId}(?:/resourceGroups/${destination.resourceGroup})?/providers/Microsoft.Security/dataScanners/[^/?#]+$`, "i");
  assert.match(context.scannerId ?? "", scannerPattern, "Wrong actual scanner destination");
  const scanner = get(read, `${context.scannerId}?api-version=2026-08-01`);
  assert.ok(sameId(scanner?.id, context.scannerId) && scanner.type?.toLowerCase() === "microsoft.security/datascanners", "Wrong scanner resource");
  assert.equal(scanner.identity?.type, "SystemAssigned", "Missing scanner service identity");
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
  const dataOwner = scannerRows[0];
  assert.ok(sameId(dataOwner.scope, storage.id) && sameId(dataOwner.roleDefinitionId, roleId("b7e6dc6d-f1e8-4753-8033-0f276bb0955b")) && dataOwner.principalType === "ServicePrincipal", "Scanner requires exact Storage Blob Data Owner");
  assert.ok(!dataOwner.condition && !dataOwner.conditionVersion, "Unreviewed scanner grant condition");
  assert.match(dataOwner.name ?? "", uuid, "Missing actual service-created assignment name");
  assert.ok(sameId(dataOwner.id, `${storage.id}/providers/Microsoft.Authorization/roleAssignments/${dataOwner.name}`), "Wrong service-created assignment ID");
  const other = rows.filter((r) => !workload.includes(r) && !scannerRows.includes(r));
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
    scanner: { id: scanner.id, identity: scanner.identity }, grants: rows.sort((a, b) => a.id.localeCompare(b.id)),
    bootstrap: projectResources(boot), internalTopology: "UNVERIFIED" });
}
// Structural/correlation checks only. The owner observes the harmless test in
// Azure; the authorized human operator verifies the owner's record.
// Blob tags are mutable and NEVER an automated security/data-admission proof.
export function validateFunctionalTest(test, security, now = Date.now()) {
  assert.ok(test, "Missing owner-confirmed synthetic functional test");
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
  return { testId: test.testId, observationReference: test.observationReference, sha256: stateHash(test),
    ownerConfirmation: "required in referenced owner evidence and native human review; not machine authenticated",
    internalTopology: "UNVERIFIED", automaticDataAdmission: false };
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
export function readStagePermissionReadiness(read, stage, phase, writeRequired = true) {
  assert.ok(["bootstrap", "continuation"].includes(stage) && ["preview", "apply"].includes(phase), "Unknown caller stage/phase");
  const resources = stage === "bootstrap" ? bootstrapInventory() : continuationInventory();
  const writes = [...new Set(resources.map((r) => `${r.type}/write`)), "Microsoft.Resources/deployments/write"];
  if (stage === "continuation") writes.push("Microsoft.OperationalInsights/workspaces/sharedKeys/action");
  const whatIf = "Microsoft.Resources/deployments/whatIf/action";
  const allowed = phase === "apply" ? [...writes, whatIf, "Microsoft.Resources/deployments/validate/action"] : [whatIf];
  const response = get(read, `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`);
  assert.ok(Array.isArray(response?.value) && response.value.length, "Missing stage caller permission visibility");
  for (const row of response.value) {
    for (const key of ["actions", "notActions", "dataActions", "notDataActions"]) assert.ok(Array.isArray(row[key]), "Incomplete stage permission read");
    assert.equal(row.dataActions.length, 0, "Workflow data authority forbidden");
    for (const action of row.actions) assert.ok(action.toLowerCase().endsWith("/read") || allowed.some((a) => a.toLowerCase() === action.toLowerCase()), "Caller authority outside exact proposed stage operation allowlist");
  }
  const required = phase === "apply" && writeRequired ? [...writes, whatIf] : [whatIf];
  for (const action of required) assert.ok(response.value.some((r) => r.actions.some((p) => wildcard(p, action)) && !r.notActions.some((p) => wildcard(p, action))), `Missing declared stage operation: ${action}`);
  return { scope: `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}`, phase, permissions: response.value,
    declaredTemplateOperationsOnly: true, acaMinimumPermissionProof: stage === "continuation" ? "EXTERNAL_REQUIRED" : "NOT_APPLICABLE" };
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
export function assertWriterRevoked(read, predecessor, phase = "apply", securityContext) {
  const account = phase === "apply" ? assertOriginalApplyCaller(read, predecessor) : read(["account", "show"]);
  assert.equal(account.id, destination.subscriptionId, "Wrong writer subscription");
  assert.equal(account.tenantId, destination.tenantId, "Wrong writer tenant");
  assert.equal(account.user?.type, "servicePrincipal", "Scoped workflow caller required");
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
    const response = get(read, `${id}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`);
    assert.ok(Array.isArray(response?.value) && response.value.length, "Missing effective caller permission visibility");
    for (const grant of response.value) {
      assert.ok(Array.isArray(grant.actions) && Array.isArray(grant.notActions) && Array.isArray(grant.dataActions) && Array.isArray(grant.notDataActions), "Incomplete effective permission read");
      for (const key of ["actions", "notActions", "dataActions", "notDataActions"]) assert.ok(grant[key].every((p) => typeof p === "string" && p.length), "Invalid effective permission pattern");
      for (const action of grant.dataActions) assert.ok(excluded(action, grant.notDataActions), "Workflow must never have Blob/data access");
      for (const action of grant.actions) assert.ok(excluded(action, grant.notActions)
        || action.toLowerCase().endsWith("/read") || allowed.some((a) => a.toLowerCase() === action.toLowerCase()),
      `Bootstrap/security writer authority outside closed allowlist: ${action}`);
    }
    reads.push({ scope: id, permissions: response.value });
  }
  return { callerClientId: account.user.name, phase, reads, limitations: "current caller effective context only; owner/native review covers equivalent, transitive and PIM authority" };
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
export function assessStage(read, plan, predecessor, now = Date.now(), phase = "apply") {
  assert.ok([2, 3].includes(plan.inputs.evidenceVersion), "Unknown staged policy version");
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
    const functionalTest = validateFunctionalTest(context.security.functionalTest, readableSecurity, now);
    // Existing revocation proof remains mandatory on preview AND apply; apply
    // additionally binds the actual original writer, never the audit observer.
    const writerPermissions = assertWriterRevoked(read, basis, phase, context.security);
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
    const permissionReadiness = readStagePermissionReadiness(read, "continuation", phase, true);
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
    functionalTest = validateFunctionalTest(context.security.functionalTest, readableSecurity, now);
    writerPermissions = assertWriterRevoked(read, predecessor, phase, context.security);
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
  const permissionReadiness = readStagePermissionReadiness(read, inputs.stage, phase, !completed);
  return { action: completed ? "noop" : "submit", resources: current, inspection, targetInspection, predecessorInspection, history, functionalTest, readableSecurity, writerPermissions, permissionReadiness,
    ...(transition ? { sourceTransition: transition, originalSuccess, verifiedBootstrap, originalCheckpoint: { ...context.predecessor, completed: false, deploymentName: predecessor.deploymentName, deploymentCommitSha: predecessor.commitSha } } : {}) };
}
export function executeReviewedStage({ plan, predecessor, read, preview, submit, now = Date.now(), phase = "apply" }) {
  const before = assessStage(read, plan, predecessor, now, phase);
  const fresh = preview();
  validateStageChanges(plan.whatIf, plan, before.action === "noop");
  validateStageChanges(fresh, plan, before.action === "noop");
  assert.equal(stateHash([...fresh.changes].sort((a, b) => a.resourceId.localeCompare(b.resourceId))), stateHash([...plan.whatIf.changes].sort((a, b) => a.resourceId.localeCompare(b.resourceId))), "Fresh canonical what-if drift");
  const final = assessStage(read, plan, predecessor, now, phase);
  assert.deepEqual(final, before, "Pre-submission actual state/security/permissions drift");
  if (before.action === "noop") return { ...before, action: "noop" };
  submit();
  return { ...before, action: "submitted" };
}
