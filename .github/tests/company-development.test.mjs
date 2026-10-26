import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";
import { sourceFixture } from "./fixtures/company-source.mjs";

const read = (file) => readFileSync(file, "utf8");
const controls = async () => import("../../scripts/infra/company-development.mjs");

test("what-if diagnostics preserve only a safe structural response before rejection, never raw free text", async () => {
  const { preserveWhatIfDiagnostics, validatePreview, bootstrapInventory } = await controls();
  const dir = mkdtempSync(join(tmpdir(), "whatif-diagnostics-"));
  const value = { status: "Succeeded", error: null, diagnostics: null, potentialChanges: null,
    changes: bootstrapInventory().map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })) };
  const raw = `${JSON.stringify(value)}\n`;
  try {
    const record = preserveWhatIfDiagnostics(raw, "preview", dir);
    assert.equal(lstatSync(record).mode & 0o777, 0o600);
    assert.equal(lstatSync(join(dir, "company-dev-whatif-diagnostics")).mode & 0o777, 0o700);
    const saved = JSON.parse(read(record));
    assert.equal(saved.responseSha256, createHash("sha256").update(raw).digest("hex"));
    assert.equal(saved.executionApproved, false);
    assert.deepEqual(saved.response.diagnostics, null);
    assert.equal(saved.response.changes.length, 7);
    assert.equal(saved.response.changes[0].changeType, "Create");
    validatePreview(value);
    for (const key of ["diagnostics", "potentialChanges"]) {
      for (const bad of [[{ message: "private-person@example.invalid Bearer synthetic-token" }], {}, false, 0, "", "unknown"]) {
        const rejected = { ...value, [key]: bad, unknown: "private-person@example.invalid" };
        const file = preserveWhatIfDiagnostics(JSON.stringify(rejected), "preview", dir);
        assert.throws(() => validatePreview(rejected), /diagnostics\/potential changes/);
        assert.doesNotMatch(read(file), /private-person|synthetic-token|Bearer|unknown":/);
      }
    }
    const secret = { ...value, password: "synthetic-secret-do-not-retain" };
    const count = readdirSync(join(dir, "company-dev-whatif-diagnostics")).length;
    assert.throws(() => preserveWhatIfDiagnostics(JSON.stringify(secret), "apply", dir), /Resolved secret/);
    assert.equal(readdirSync(join(dir, "company-dev-whatif-diagnostics")).length, count);
    assert.throws(() => preserveWhatIfDiagnostics("{broken", "preview", dir), SyntaxError);
    assert.throws(() => preserveWhatIfDiagnostics(raw, "../escape", dir));
    for (const status of ["Failed", "Running", null, {}, "unknown"]) assert.throws(() => validatePreview({ ...value, status }));
    assert.throws(() => validatePreview({ ...value, error: { code: "ProviderFailure" } }), /ARM preview failed/);
    const hostile = mkdtempSync(join(tmpdir(), "whatif-symlink-"));
    try {
      symlinkSync(dir, join(hostile, "company-dev-whatif-diagnostics"));
      assert.throws(() => preserveWhatIfDiagnostics(raw, "preview", hostile), /diagnostic directory/);
    } finally { rmSync(hostile, { recursive: true, force: true }); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("actual workflows upload diagnostics on route failure separately from successful plans/execution", () => {
  for (const [file, job, operation] of [
    ["company-development-foundation.yml", "plan", "preview"],
    ["company-development-foundation-apply.yml", "apply", "apply"],
  ]) {
    const steps = YAML.parse(read(`.github/workflows/${file}`)).jobs[job].steps;
    const route = steps.find((s) => s.run?.endsWith(`.mjs ${operation}`));
    const diagnostic = steps.find((s) => s.with?.path === "company-dev-whatif-diagnostics/**/*.json");
    assert.ok(diagnostic, "Failure diagnostics must have a distinct upload");
    assert.equal(route.id, "what-if-route");
    assert.equal(diagnostic.if, "failure() && steps.what-if-route.outcome == 'failure'");
    assert.match(diagnostic.with.name, /-whatif-diagnostics-/);
    assert.equal(diagnostic.with["retention-days"], 7);
    assert.equal(diagnostic.with["if-no-files-found"], "ignore");
    assert.ok(steps.indexOf(diagnostic) > steps.indexOf(route));
    const approved = steps.find((s) => s.with?.path?.includes(job === "plan" ? "company-dev-plan/" : "company-dev-apply/"));
    assert.doesNotMatch(approved.with.path, /diagnostics/);
    if (job === "plan") assert.equal(approved.if, undefined, "Failed previews cannot upload plans");
  }
});
const valid = {
  stage: "bootstrap", mode: "initial", evidenceVersion: 2,
  changeFreeze: "https://github.com/keyforta/keyforta-property/issues/159#issuecomment-123",
  subscriptionId: "891e5e6e-8ae3-4455-9184-8d7606223d91",
  tenantId: "8019a048-e7d6-48e8-984a-b902f641a21b",
  resourceGroup: "rg-keyforta-companydev-san",
  location: "southafricanorth",
  vnetCidr: "10.84.0.0/24",
  acaSubnetCidr: "10.84.0.0/26",
  postgresSubnetCidr: "10.84.0.64/28",
  networkApproval: "https://github.com/keyforta/keyforta-property/issues/123",
};
const approved = {
  vnetCidr: valid.vnetCidr,
  acaSubnetCidr: valid.acaSubnetCidr,
  postgresSubnetCidr: valid.postgresSubnetCidr,
  networkApproval: valid.networkApproval,
};

// Evaluate only the ARM condition grammar emitted for the stage selectors.
// Unknown expressions fail the test; never assume that an unparsed condition
// means an inactive resource.
function armCondition(expression, stage, privateNetwork = {}) {
  const parse = (text) => {
    text = text.trim();
    if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1);
    if (/^\d+$/.test(text)) return Number(text);
    const property = /^(.*\))\.(\w+)$/.exec(text);
    if (property) return parse(property[1])[property[2]];
    const match = /^(\w+)\((.*)\)$/.exec(text);
    assert.ok(match, `Unsupported compiled condition: ${text}`);
    let depth = 0, quoted = false, start = 0;
    const args = [];
    for (let i = 0; i < match[2].length; i++) {
      const char = match[2][i];
      if (char === "'") quoted = !quoted;
      if (!quoted && char === "(") depth++;
      if (!quoted && char === ")") depth--;
      if (!quoted && depth === 0 && char === ",") {
        args.push(match[2].slice(start, i)); start = i + 1;
      }
    }
    if (match[2].length) args.push(match[2].slice(start));
    const values = args.map(parse);
    switch (match[1]) {
      case "parameters":
        assert.ok(["companyStage", "privateNetwork"].includes(values[0]));
        return values[0] === "companyStage" ? stage : privateNetwork;
      case "equals": return values[0] === values[1];
      case "not": return !values[0];
      case "empty": return Object.keys(values[0]).length === 0;
      case "and": return values.every(Boolean);
      case "if": return values[0] ? values[1] : values[2];
      case "createObject": return Object.fromEntries(values.reduce((pairs, value, i) => i % 2 ? pairs : [...pairs, [value, values[i + 1]]], []));
      case "createArray": return values;
      case "union": return Object.assign({}, ...values);
      case "false": return false;
      case "variables":
        assert.ok(["baseName", "suffix"].includes(values[0]));
        return values[0] === "baseName" ? "keyforta-cdev" : "synthetic";
      case "format": return values[0].replace(/\{(\d+)\}/g, (_, i) => values[Number(i) + 1]);
      case "resourceId":
        assert.equal(values[0], "Microsoft.OperationalInsights/workspaces");
        return "synthetic-log-resource-id";
      case "reference":
        assert.deepEqual(values, ["synthetic-log-resource-id", "2023-09-01"]);
        return { customerId: "synthetic-customer-id" };
      case "listKeys":
        assert.deepEqual(values, ["synthetic-log-resource-id", "2023-09-01"]);
        return { primarySharedKey: "synthetic-key-never-consumed" };
      default: assert.fail(`Unsupported compiled function: ${match[1]}`);
    }
  };
  return expression === undefined || parse(expression.slice(1, -1));
}

test("compiled stages write seven bootstrap resources, never CI security, and preserve default full security", () => {
  const compile = (file) => JSON.parse(execFileSync("az", ["bicep", "build", "--file", file, "--stdout"], { encoding: "utf8" }));
  const company = compile("infra/bicep/company-development.bicep");
  assert.deepEqual(company.parameters.stage.allowedValues, ["bootstrap", "continuation"]);
  assert.equal(company.parameters.stage.defaultValue, undefined);
  const shared = compile("infra/bicep/modules/foundation-resources.bicep");
  const source = compile("infra/bicep/foundation.bicep");
  assert.equal(source.resources[0].properties.parameters.companyStage, undefined);
  const sourceShared = source.resources[0].properties.template;
  assert.equal(sourceShared.parameters.companyStage.defaultValue, "full");
  assert.deepEqual(sourceShared.resources, shared.resources, "Actual source wrapper must embed the unchanged default resource payloads");
  assert.equal(shared.parameters.companyStage.defaultValue, "full");
  const selected = (stage) => shared.resources.filter((r) => armCondition(r.condition, stage));
  const bootstrap = selected("bootstrap");
  assert.deepEqual(bootstrap.map((r) => r.type).sort(), [
    ...Array(3).fill("Microsoft.ManagedIdentity/userAssignedIdentities"),
    "Microsoft.ContainerRegistry/registries", "Microsoft.Storage/storageAccounts",
    "Microsoft.Storage/storageAccounts/blobServices", "Microsoft.Storage/storageAccounts/blobServices/containers",
  ].sort());
  const continuation = selected("continuation");
  assert.deepEqual(continuation.map((r) => r.type).sort(), [
    "Microsoft.OperationalInsights/workspaces", "Microsoft.DBforPostgreSQL/flexibleServers",
    "Microsoft.DBforPostgreSQL/flexibleServers/configurations",
    "Microsoft.DBforPostgreSQL/flexibleServers/databases", "Microsoft.App/managedEnvironments",
  ].sort());
  for (const stage of ["bootstrap", "continuation"]) {
    assert.ok(!selected(stage).some((r) => /roleAssignments|defender|datascanners|containerApps|jobs/i.test(r.type)));
  }
  const full = selected("full");
  // Captured from the actual unmodified compiled shared module at fe9128ad.
  // Hash resource payloads, not source text or compiler metadata/conditions.
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const payloads = full.map((r) => Object.fromEntries(
    ["type", "apiVersion", "name", "sku", "kind", "location", "properties"].filter((key) => key in r).map((key) => [key, r[key]]),
  ));
  assert.equal(createHash("sha256").update(JSON.stringify(canonical(payloads))).digest("hex"), "20ae486785a7714420fca3ebc1265ae36719d5753e96fcacac32ac7e40db6333");
  assert.equal(full.filter((r) => r.type === "Microsoft.Authorization/roleAssignments").length, 4);
  const defender = full.find((r) => r.type === "Microsoft.Security/defenderForStorageSettings");
  assert.deepEqual(defender.properties.malwareScanning.onUpload, {
    capGBPerMonth: 100, isEnabled: true, blobScanResultsOptions: "BlobIndexTags",
  });
  assert.equal(defender.properties.isEnabled, true);
  assert.equal(defender.properties.sensitiveDataDiscovery.isEnabled, false);
  const storage = bootstrap.find((r) => r.type === "Microsoft.Storage/storageAccounts");
  assert.deepEqual(storage.properties, {
    allowBlobPublicAccess: false, allowSharedKeyAccess: false, defaultToOAuthAuthentication: true,
    minimumTlsVersion: "TLS1_2", publicNetworkAccess: "Enabled", supportsHttpsTrafficOnly: true,
  });
  assert.equal(bootstrap.find((r) => r.type.endsWith("/registries")).properties.adminUserEnabled, false);
  assert.deepEqual(bootstrap.find((r) => r.type.endsWith("/blobServices")).properties.deleteRetentionPolicy, { days: 7, enabled: true });
  assert.equal(bootstrap.find((r) => r.type.endsWith("/containers")).properties.publicAccess, "None");
  const resources = company.resources[0].properties.template;
  for (const resource of resources.resources.filter((r) => r.type.startsWith("Microsoft.Network/"))) {
    assert.ok(!armCondition(resource.condition, "bootstrap"));
    assert.ok(armCondition(resource.condition, "continuation"));
  }
  const privateContinuation = shared.resources.filter((r) => armCondition(r.condition, "continuation", { postgresSubnetId: "synthetic" }));
  assert.ok(!privateContinuation.some((r) => r.type.endsWith("/firewallRules")));
  const privateNetwork = {
    postgresSubnetId: "synthetic-pg-subnet", postgresDnsZoneId: "synthetic-private-dns",
    acaSubnetId: "synthetic-aca-subnet", infrastructureResourceGroup: "synthetic-managed-rg",
  };
  const pg = privateContinuation.find((r) => r.type === "Microsoft.DBforPostgreSQL/flexibleServers");
  assert.deepEqual(pg.sku, { name: "Standard_B1ms", tier: "Burstable" });
  assert.equal(pg.properties.version, "16");
  assert.equal(pg.properties.authConfig.passwordAuth, "Disabled");
  assert.equal(pg.properties.authConfig.activeDirectoryAuth, "Enabled");
  assert.equal(pg.properties.backup.backupRetentionDays, 7);
  assert.deepEqual(armCondition(pg.properties.storage, "continuation", privateNetwork), { storageSizeGB: 32, type: "Premium_LRS" });
  assert.deepEqual(armCondition(pg.properties.network, "continuation", privateNetwork), {
    publicNetworkAccess: "Disabled", delegatedSubnetResourceId: privateNetwork.postgresSubnetId,
    privateDnsZoneArmResourceId: privateNetwork.postgresDnsZoneId,
  });
  const aca = privateContinuation.find((r) => r.type === "Microsoft.App/managedEnvironments");
  const acaProperties = armCondition(aca.properties, "continuation", privateNetwork);
  assert.deepEqual(acaProperties.workloadProfiles, [{ name: "Consumption", workloadProfileType: "Consumption" }]);
  assert.deepEqual(acaProperties.vnetConfiguration, { infrastructureSubnetId: privateNetwork.acaSubnetId, internal: false });
  assert.equal(privateContinuation.find((r) => r.type.endsWith("/workspaces")).properties.retentionInDays, 30);
});

test("company foundation has an isolated wrapper with no CIDR defaults", () => {
  const template = read("infra/bicep/company-development.bicep");
  for (const name of ["vnetCidr", "acaSubnetCidr", "postgresSubnetCidr", "networkApproval"]) {
    assert.match(template, new RegExp(`param ${name} string\\s*\\n`));
    assert.doesNotMatch(template, new RegExp(`param ${name} string\\s*=`));
  }
  assert.match(template, /scope: resourceGroup\('891e5e6e-8ae3-4455-9184-8d7606223d91', 'rg-keyforta-companydev-san'\)/);
  const resources = read("infra/bicep/modules/company-development-resources.bicep");
  assert.match(resources, /environment: 'cdev'/);
  assert.match(resources, /Microsoft\.App\/environments/);
  assert.match(resources, /Microsoft\.DBforPostgreSQL\/flexibleServers/);
  assert.match(resources, /registrationEnabled: false/);
  assert.match(resources, /privateNetwork:/);
  assert.doesNotMatch(resources, /Microsoft\.App\/(?:containerApps|jobs)|privateEndpoints|natGateways/);
});

test("shared foundation preserves dev defaults and conditions the broad firewall", () => {
  const template = read("infra/bicep/modules/foundation-resources.bicep");
  assert.match(template, /param privateNetwork object = \{\}/);
  assert.match(template, /resource azureServicesFirewall[^\n]+ = if \(companyStage == 'full' && empty\(privateNetwork\)\)/);
  assert.match(template, /delegatedSubnetResourceId: privateNetwork!?\.postgresSubnetId/);
  assert.match(template, /privateDnsZoneArmResourceId: privateNetwork!?\.postgresDnsZoneId/);
  assert.match(template, /publicNetworkAccess: 'Disabled'/);
  assert.match(template, /workloadProfileType: 'Consumption'/);
  assert.match(template, /infrastructureSubnetId: privateNetwork!?\.acaSubnetId/);
  for (const invariant of [
    "passwordAuth: 'Disabled'", "activeDirectoryAuth: 'Enabled'",
    "capGBPerMonth: 100", "blobScanResultsOptions: 'BlobIndexTags'",
    "retentionInDays: 30", "backupRetentionDays: 7", "allowSharedKeyAccess: false",
    "adminUserEnabled: false", "minimumTlsVersion: 'TLS1_2'",
  ]) assert.ok(template.includes(invariant), invariant);
  assert.doesNotMatch(read("infra/bicep/foundation.bicep"), /privateNetwork/);
});

test("company input validation binds destination and explicit externally approved CIDRs", async () => {
  const { validateInputs } = await controls();
  assert.deepEqual(validateInputs(valid, approved), valid);
  for (const key of ["subscriptionId", "tenantId", "resourceGroup", "location"]) {
    assert.throws(() => validateInputs({ ...valid, [key]: "source-or-other" }, approved), /destination/i);
  }
  assert.throws(() => validateInputs(valid, {}), /approval/i);
  assert.throws(() => validateInputs({ ...valid, networkApproval: "" }, approved), /approval/i);
  assert.throws(() => validateInputs(valid, { ...approved, acaSubnetCidr: "10.84.0.128/26" }), /approval/i);
});

test("CIDR validation rejects overlap, host bits, non-RFC1918 and platform reservations", async () => {
  const { validateInputs } = await controls();
  const reject = (changes) => {
    const input = { ...valid, ...changes };
    assert.throws(() => validateInputs(input, { ...approved, ...changes }), /CIDR|subnet|range|overlap/i);
  };
  reject({ acaSubnetCidr: "10.84.0.32/26" });
  reject({ postgresSubnetCidr: "10.84.0.0/28" });
  reject({ postgresSubnetCidr: "10.85.0.64/28" });
  reject({ acaSubnetCidr: "10.84.0.0/28" });
  reject({ postgresSubnetCidr: "10.84.0.64/29" });
  reject({ vnetCidr: "8.8.0.0/16" });
  reject({ vnetCidr: "172.30.0.0/16", acaSubnetCidr: "172.30.0.0/26", postgresSubnetCidr: "172.30.0.64/28" });
  reject({ vnetCidr: "10.84.0.0/24; false" });
  reject({ vnetCidr: "" });
});

test("superseded destination and source subscriptions are rejected at every preview boundary", async () => {
  const { validateInputs, assertAzureContext, validatePreview } = await controls();
  for (const subscriptionId of [
    "212bf9c5-2326-4852-846e-7227bac81fd5",
    "f9809805-ff42-4ece-b3da-43ebd70e0fb7",
  ]) {
    assert.throws(() => validateInputs({ ...valid, subscriptionId }, approved), /destination/i);
    assert.throws(() => assertAzureContext({ id: subscriptionId, tenantId: valid.tenantId, state: "Enabled" }), /destination subscription/i);
    assert.throws(() => validatePreview({ changes: [{
      resourceId: `/subscriptions/${subscriptionId}/resourceGroups/${valid.resourceGroup}/providers/Microsoft.Network/virtualNetworks/test`,
      changeType: "Create", after: { type: "Microsoft.Network/virtualNetworks" },
    }] }), /outside destination scope/i);
  }
});

test("Azure context and environment protection fail closed", async () => {
  const { assertAzureContext, assertEnvironmentProtection } = await controls();
  const context = { id: valid.subscriptionId, tenantId: valid.tenantId, state: "Enabled" };
  assert.doesNotThrow(() => assertAzureContext(context));
  assert.throws(() => assertAzureContext({ ...context, tenantId: "other" }), /destination/i);
  assert.throws(() => assertAzureContext({ ...context, state: "Disabled" }), /destination/i);
  const environment = {
    id: 56780428,
    node_id: "MDExOkVudmlyb25tZW50NTY3ODA0Mjg=",
    name: "company-dev",
    url: "https://api.github.com/repos/keyforta/keyforta-property/environments/company-dev",
    html_url: "https://github.com/keyforta/keyforta-property/deployments/activity_log?environments_filter=company-dev",
    created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z",
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    protection_rules: [{ type: "required_reviewers", prevent_self_review: true, reviewers: [{ type: "Team", reviewer: { id: 123 } }] }],
  };
  assert.doesNotThrow(() => assertEnvironmentProtection(environment));
  for (const changes of [
    { name: "dev" }, { id: 0 }, { node_id: "" },
    { deployment_branch_policy: null },
    { deployment_branch_policy: { protected_branches: false } },
    { protection_rules: undefined },
  ]) assert.throws(() => assertEnvironmentProtection({ ...environment, ...changes }), /environment|review|bypass|branch/i);
});

test("company environments accept no independent reviewer or self-review requirement and retain exact snapshots", async () => {
  const { assertEnvironmentProtection, environmentSnapshot, assertReviewContext } = await controls();
  const current = { revision: "a".repeat(40), runId: "123", runAttempt: "1" };
  for (const name of ["company-dev", "company-dev-apply"]) {
    for (const rules of [
      [],
      [{ type: "branch_policy", id: 42 }],
      [{ type: "required_reviewers", prevent_self_review: false, reviewers: [] }],
    ]) {
      const environment = {
        id: 56780428, node_id: "actual-environment-node", name,
        deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
        protection_rules: rules,
      };
      assert.doesNotThrow(() => assertEnvironmentProtection(environment, name));
      const snapshot = environmentSnapshot(environment, name);
      assert.equal(snapshot.id, environment.id);
      assert.equal(snapshot.nodeId, environment.node_id);
      assert.deepEqual(snapshot.rules.map((rule) => rule.type), rules.map((rule) => rule.type));
      const context = {
        repository: "keyforta/keyforta-property", ...current, environment: snapshot,
        environmentSha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
      };
      assert.doesNotThrow(() => assertReviewContext(context, environment, current, name));
      for (const changes of [
        { id: 789 }, { node_id: "replacement-node" }, { updated_at: "changed" },
        { protection_rules: [...rules, { type: "wait_timer", wait_timer: 5 }] },
      ]) assert.throws(() => assertReviewContext(context, { ...environment, ...changes }, current, name), /snapshot/i);
      assert.throws(() => assertEnvironmentProtection({ ...environment, deployment_branch_policy: null }, name), /protected branches/i);
    }
  }
});

test("manual review context binds exact revision/run and API snapshot, never an approval assertion", async () => {
  const { environmentSnapshot, assertReviewContext } = await controls();
  const environment = {
    id: 56780428, node_id: "MDExOkVudmlyb25tZW50NTY3ODA0Mjg=", name: "company-dev",
    updated_at: "2026-10-25T00:00:00Z",
    deployment_branch_policy: { protected_branches: true },
    protection_rules: [{ type: "required_reviewers", prevent_self_review: true, reviewers: [{ type: "User", reviewer: { id: 123 } }] }],
  };
  const current = { revision: "a".repeat(40), runId: "123", runAttempt: "1" };
  const snapshot = environmentSnapshot(environment);
  const context = {
    repository: "keyforta/keyforta-property", ...current, environment: snapshot,
    environmentSha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
  };
  assert.doesNotThrow(() => assertReviewContext(context, environment, current));
  for (const changes of [
    { revision: "b".repeat(40) }, { runId: "456" }, { runAttempt: "2" },
    { repository: "other/repo" }, { environmentSha256: "0".repeat(64) },
  ]) assert.throws(() => assertReviewContext({ ...context, ...changes }, environment, current), /review|snapshot|revision|run|repository/i);
  assert.throws(() => assertReviewContext(context, { ...environment, id: 999 }, current), /snapshot/i);
  assert.throws(() => assertReviewContext(context, {
    ...environment, protection_rules: [{ type: "required_reviewers", prevent_self_review: false, reviewers: [{ reviewer: { id: 123 } }] }],
  }, current), /snapshot/i);
});

test("what-if validation rejects source scope, destructive changes and unexpected services", async () => {
  const { validatePreview } = await controls();
  const prefix = `/subscriptions/${valid.subscriptionId}/resourceGroups/${valid.resourceGroup}/providers/`;
  const change = { changeType: "Create", resourceId: `${prefix}Microsoft.ManagedIdentity/userAssignedIdentities/id-keyforta-cdev-api`, after: { type: "Microsoft.ManagedIdentity/userAssignedIdentities" } };
  assert.doesNotThrow(() => validatePreview({ changes: [change] }));
  for (const changes of [
    [{ ...change, changeType: "Delete" }],
    [{ ...change, changeType: "Modify" }],
    [{ ...change, changeType: "Ignore" }],
    [{ ...change, resourceId: change.resourceId.replace(valid.resourceGroup, "rg-keyforta-dev-san") }],
    [{ ...change, resourceId: change.resourceId.replace(valid.subscriptionId, "f9809805-ff42-4ece-b3da-43ebd70e0fb7") }],
    [{ ...change, after: { type: "Microsoft.App/jobs" } }],
    [{ ...change, after: { type: "Microsoft.Network/virtualNetworks" } }],
    [{ ...change, after: { type: "Microsoft.Authorization/roleAssignments" } }],
    [{ ...change, after: { type: "Microsoft.Security/defenderForStorageSettings" } }],
    [{ ...change, after: {} }],
    [],
  ]) assert.throws(() => validatePreview({ changes }), /preview|scope|type|change/i);
  assert.throws(() => validatePreview({ error: { code: "failed" }, changes: [change] }), /preview/i);
});

test("company workflow is disabled-by-default, protected, immutable, preview-only and source-independent", () => {
  const workflow = YAML.parse(read(".github/workflows/company-development-foundation.yml"));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.concurrency.group, "company-dev-foundation");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.on.workflow_dispatch.inputs.stage.required, true);
  assert.equal(workflow.on.workflow_dispatch.inputs.mode.required, true);
  assert.equal(workflow.on.workflow_dispatch.inputs.evidence_version.required, true);
  assert.equal(workflow.on.workflow_dispatch.inputs.change_freeze.required, true);
  assert.equal(workflow.env.FOUNDATION_STAGE, "${{ inputs.stage }}");
  const upload = workflow.jobs.plan.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@") && step.with?.path.includes("company-dev-plan/"));
  assert.match(upload.with.name, /inputs\.stage.*inputs\.mode.*v2/);
  assert.equal(upload.with.path.trim().split("\n").length, 7);
  assert.ok(upload.with.path.includes("inventory.json"));
  assert.equal(workflow.jobs.plan.environment, "company-dev");
  assert.equal(workflow.jobs.plan.permissions["id-token"], "write");
  assert.equal(workflow.jobs.plan.permissions.actions, "read");
  assert.equal(workflow.jobs.guard.permissions?.["id-token"], undefined);
  assert.deepEqual(workflow.jobs.guard.permissions, { contents: "read", actions: "read" });
  assert.deepEqual(workflow.jobs.plan.needs, ["guard"]);
  const text = read(".github/workflows/company-development-foundation.yml");
  assert.match(text, /COMPANY_DEV_PLAN_ENABLED/);
  assert.match(text, /github\.ref == 'refs\/heads\/main'/);
  assert.match(text, /persist-credentials: false/);
  assert.match(workflow.jobs.guard.steps.find((step) => step.id === "review-context").run, /company-development\.mjs guard/);
  assert.equal(workflow.jobs.plan.env.REVIEW_CONTEXT, "${{ needs.guard.outputs.review_context }}");
  const prepare = workflow.jobs.plan.steps.find((step) => step.run?.endsWith("company-development.mjs prepare"));
  const login = workflow.jobs.plan.steps.find((step) => step.uses?.startsWith("azure/login@"));
  assert.ok(workflow.jobs.plan.steps.indexOf(prepare) < workflow.jobs.plan.steps.indexOf(login));
  assert.equal(prepare.env.GH_TOKEN, "${{ github.token }}");
  assert.match(text, /tenant-id: 8019a048-e7d6-48e8-984a-b902f641a21b/);
  assert.match(text, /subscription-id: 891e5e6e-8ae3-4455-9184-8d7606223d91/);
  assert.doesNotMatch(text, /vars\.AZURE_|rg-keyforta-dev-san|environment: dev|customer|ciamlogin/);
  const script = read("scripts/infra/company-development.mjs");
  assert.match(script, /assertEnvironmentProtection\(environment, expectedEnvironment\)/);
  assert.match(script, /"what-if"/);
  assert.match(script, /--subscription/);
  assert.doesNotMatch(script, /"create"|"register"|"assign"|"delete"|"start"|"set"/);
  assert.doesNotMatch(text, /deployment group create|provider register|role assignment create|workflow_call|operation:/);
  const security = YAML.parse(read(".github/workflows/security.yml"));
  const preflight = security.jobs.scan.steps.find((step) => step.name === "Verify foundation parser coverage");
  const scan = security.jobs.scan.steps.find((step) => step.name === "Scan Bicep security configuration");
  assert.ok(preflight && security.jobs.scan.steps.indexOf(preflight) < security.jobs.scan.steps.indexOf(scan));
  assert.match(preflight.run, /bridgecrew\/checkov:3\.3\.17@sha256:41c4701c6a56d8952e5aba7a420f871c8b70b57da94eb4f142dcdf7295bb0be3/);
  assert.match(preflight.run, /scripts\/verify\/company-foundation-parser\.py/);
  assert.notEqual(preflight["continue-on-error"], true);
});

test("review fix actual preview step supplies GH_TOKEN for authenticated checkpoint reads without broader permissions", () => {
  const workflow = YAML.parse(read(".github/workflows/company-development-foundation.yml"));
  const job = workflow.jobs.plan;
  const preview = job.steps.find((s) => s.run?.endsWith("company-development.mjs preview"));
  assert.equal(preview.env?.GH_TOKEN ?? job.env.GH_TOKEN ?? workflow.env.GH_TOKEN, "${{ github.token }}");
  assert.deepEqual(job.permissions, { contents: "read", actions: "read", "id-token": "write" });
});

test("preview CLI produces SHA-bound evidence using only explicit-subscription reads and what-if", async () => {
  const { root: dir, revision: sha } = sourceFixture();
  const script = resolve("scripts/infra/company-development.mjs");
  const tools = `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
const tool = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.TOOL_LOG, JSON.stringify({tool,args})+"\\n");
let value;
if (tool === "gh") value = JSON.parse(process.env.FAKE_ENVIRONMENT);
else if (args[0] === "account") value = JSON.parse(process.env.FAKE_ACCOUNT);
else if (args[0] === "provider") value = {registrationState:"Registered"};
else if (args[0] === "group") value = JSON.parse(process.env.FAKE_GROUP);
else if (args[0] === "resource") value = [];
else if (args[0] === "rest" && args[2] === "get") value = {value:[{actions:["*/read","Microsoft.Resources/deployments/whatIf/action"],notActions:[],dataActions:[],notDataActions:[]}]};
else if (args.slice(0,3).join(" ") === "deployment group list") value = [];
else if (args[0] === "bicep") {
  if (process.env.RACE_PARAMETERS === "true") {
    const file = "company-dev-plan/parameters.json";
    const parameters = JSON.parse(readFileSync(file,"utf8"));
    parameters.parameters.vnetCidr.value = "10.84.0.0/23";
    writeFileSync(file,JSON.stringify(parameters));
  }
  value = {resources:[]};
}
else if (args.slice(0,3).join(" ") === "deployment group what-if") value = JSON.parse(process.env.FAKE_PREVIEW);
else { console.error("Unexpected command"); process.exit(2); }
console.log(JSON.stringify(value));
`;
  const environment = {
    id: 56780428, node_id: "MDExOkVudmlyb25tZW50NTY3ODA0Mjg=",
    name: "company-dev",
    deployment_branch_policy: { protected_branches: true },
    protection_rules: [],
  };
  const scope = `/subscriptions/${valid.subscriptionId}/resourceGroups/${valid.resourceGroup}`;
  const env = {
    ...process.env, PATH: `${dir}:${process.env.PATH}`, TOOL_LOG: join(dir, "tools.jsonl"),
    GITHUB_REPOSITORY: "keyforta/keyforta-property", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main", GITHUB_SHA: sha, GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1", GITHUB_OUTPUT: join(dir, "outputs"),
    GITHUB_ACTOR: "same-authorized-operator", GITHUB_TRIGGERING_ACTOR: "same-authorized-operator",
    GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
    COMPANY_DEV_PLAN_ENABLED: "true",
    FOUNDATION_STAGE: "bootstrap", FOUNDATION_MODE: "initial", EVIDENCE_VERSION: "2",
    CHANGE_FREEZE: valid.changeFreeze,
    PREVIEW_CLIENT_ID: "11111111-1111-4111-8111-111111111111",
    VNET_CIDR: valid.vnetCidr, ACA_SUBNET_CIDR: valid.acaSubnetCidr,
    POSTGRES_SUBNET_CIDR: valid.postgresSubnetCidr, NETWORK_APPROVAL: valid.networkApproval,
    APPROVED_VNET_CIDR: valid.vnetCidr, APPROVED_ACA_SUBNET_CIDR: valid.acaSubnetCidr,
    APPROVED_POSTGRES_SUBNET_CIDR: valid.postgresSubnetCidr, APPROVED_NETWORK_REFERENCE: valid.networkApproval,
    FAKE_ENVIRONMENT: JSON.stringify(environment),
    FAKE_ACCOUNT: JSON.stringify({ id: valid.subscriptionId, tenantId: valid.tenantId, state: "Enabled" }),
    FAKE_GROUP: JSON.stringify({ id: scope, location: valid.location }),
    FAKE_PREVIEW: JSON.stringify({ changes: [] }),
  };
  try {
    const { bootstrapInventory } = await controls();
    env.FAKE_PREVIEW = JSON.stringify({
      changes: bootstrapInventory().map(({ id, type }) => ({ resourceId: id, changeType: "Create", after: { type } })),
    });
    for (const tool of ["gh", "az"]) {
      // Extensionless executables use CommonJS; do not depend on a temp package.json.
      const executable = tools.replace('import { appendFileSync, readFileSync, writeFileSync } from "node:fs";', 'const { appendFileSync, readFileSync, writeFileSync } = require("node:fs");')
        .replace('import { basename } from "node:path";', 'const { basename } = require("node:path");');
      writeFileSync(join(dir, tool), executable);
      chmodSync(join(dir, tool), 0o700);
    }
    const run = (operation, overrides = {}) => spawnSync(process.execPath, [script, operation], { cwd: dir, env: { ...env, ...overrides }, encoding: "utf8" });
    assert.equal(run("guard", { COMPANY_DEV_PLAN_ENABLED: "" }).status, 1);
    const guard = run("guard");
    assert.equal(guard.status, 0, guard.stderr);
    env.REVIEW_CONTEXT = read(env.GITHUB_OUTPUT).trim().replace(/^review_context=/, "");
    const context = JSON.parse(env.REVIEW_CONTEXT);
    assert.equal(context.revision, sha);
    assert.match(read(env.GITHUB_STEP_SUMMARY), /explicit human.*authorization/i);
    assert.doesNotMatch(read(env.GITHUB_STEP_SUMMARY), /independent required reviewer|must.*approval comment|prevent self-review/i);
    assert.deepEqual(context.environment.rules, []);
    assert.match(read(env.GITHUB_STEP_SUMMARY), new RegExp(sha));
    const sourcePath = join(dir, "infra/bicep/company-development.bicep");
    const committedSource = readFileSync(sourcePath);
    writeFileSync(sourcePath, "// dirty source with unchanged HEAD\n");
    for (const operation of ["guard", "prepare", "preview"]) {
      const dirty = run(operation);
      assert.equal(dirty.status, 1);
      assert.match(dirty.stderr, /source differs from committed bytes/i);
    }
    writeFileSync(sourcePath, committedSource);
    assert.equal(run("prepare", { APPROVED_NETWORK_REFERENCE: "" }).status, 1);
    assert.equal(run("prepare", { REVIEW_CONTEXT: JSON.stringify({ ...context, revision: "b".repeat(40) }) }).status, 1);
    assert.equal(run("prepare", { FAKE_ENVIRONMENT: JSON.stringify({ ...environment, id: 999 }) }).status, 1);
    assert.equal(run("prepare", { CHANGE_FREEZE: valid.changeFreeze.replace("123", "456") }).status, 1);
    for (const field of ["stage", "mode", "evidenceVersion", "inventorySha256"]) {
      const changed = run("prepare", { REVIEW_CONTEXT: JSON.stringify({ ...context, [field]: "drift" }) });
      assert.equal(changed.status, 1);
      assert.match(changed.stderr, /review.*drift/i);
    }
    assert.equal(run("prepare").status, 0);
    // The approved input snapshot remains intact, but the file ARM used to
    // consume is changed. Hashing this drift is not approval.
    const parametersPath = join(dir, "company-dev-plan/parameters.json");
    const originalParameters = read(parametersPath);
    for (const field of ["vnetCidr", "acaSubnetCidr", "postgresSubnetCidr", "networkApproval", "unapproved"]) {
      const tamperedParameters = JSON.parse(originalParameters);
      tamperedParameters.parameters[field] = { value: field === "vnetCidr" ? "10.84.0.0/23" : "unapproved" };
      writeFileSync(parametersPath, JSON.stringify(tamperedParameters));
      const drift = run("preview");
      assert.equal(drift.status, 1, `must reject ARM parameter-file drift: ${field}`);
      assert.match(drift.stderr, /parameter.*drift|parameter.*approved/i);
    }
    writeFileSync(parametersPath, originalParameters);
    const badPreview = { ...JSON.parse(env.FAKE_PREVIEW), diagnostics: [{ message: "synthetic-private@example.invalid" }] };
    const rejected = run("preview", { FAKE_PREVIEW: JSON.stringify(badPreview) });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /diagnostics\/potential changes/);
    const diagnosticRoot = join(dir, "company-dev-whatif-diagnostics");
    const diagnosticFiles = readdirSync(diagnosticRoot).map((folder) => join(diagnosticRoot, folder, "response.json"));
    assert.equal(diagnosticFiles.length, 1);
    assert.doesNotMatch(read(diagnosticFiles[0]), /synthetic-private/);
    assert.equal(readdirSync(join(dir, "company-dev-plan")).includes("evidence.json"), false);
    const secretPreview = { ...JSON.parse(env.FAKE_PREVIEW), accessToken: "synthetic-secret-do-not-retain" };
    const secretResult = run("preview", { FAKE_PREVIEW: JSON.stringify(secretPreview) });
    assert.equal(secretResult.status, 1);
    assert.match(secretResult.stderr, /Resolved secret/);
    assert.doesNotMatch(secretResult.stderr, /synthetic-secret/);
    assert.equal(readdirSync(diagnosticRoot).length, 1);
    // Mutation after validation/while compiling cannot affect inline ARM inputs.
    const preview = run("preview", { RACE_PARAMETERS: "true" });
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(run("preview", { GITHUB_SHA: "b".repeat(40) }).status, 1);
    assert.equal(run("preview", { GITHUB_RUN_ATTEMPT: "2" }).status, 1);
    const evidence = JSON.parse(read(join(dir, "company-dev-plan/evidence.json")));
    assert.equal(evidence.commitSha, sha);
    assert.equal(evidence.executionApproved, false);
    assert.match(evidence.reviewPolicy, /explicit human authorization/i);
    assert.match(evidence.reviewPolicy, /no independent environment reviewer required/i);
    assert.doesNotMatch(evidence.reviewPolicy, /required-reviewer approval|native approval comment/i);
    assert.equal(evidence.planningCeilingUsdBeforeTax, "120.00");
    assert.deepEqual(evidence.reviewContext, context);
    assert.deepEqual(evidence.approvedParameters, JSON.parse(originalParameters));
    assert.equal(evidence.parametersSha256, createHash("sha256").update(read(parametersPath)).digest("hex"));
    for (const field of ["templateSha256", "parametersSha256", "whatIfSha256"]) {
      assert.match(evidence[field], /^[a-f0-9]{64}$/);
    }
    const calls = read(join(dir, "tools.jsonl")).trim().split("\n").map(JSON.parse);
    for (const { args } of calls.filter(({ tool }) => tool === "az")) {
      if (args[0] === "bicep") continue; // local compilation, not an Azure read
      assert.equal(args[args.indexOf("--subscription") + 1], valid.subscriptionId);
      assert.ok([
        ["account", "show"], ["provider", "show"], ["group", "show"],
        ["resource", "list"], ["deployment", "group", "list"], ["deployment", "group", "what-if"], ["rest", "--method", "get"],
      ].some((prefix) => prefix.every((part, index) => args[index] === part)), `Unexpected Azure command: ${args.join(" ")}`);
      if (args[0] === "rest") assert.equal(args[args.indexOf("--url") + 1], `https://management.azure.com${scope}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`);
      if (args[2] === "what-if") {
        const consumed = args[args.indexOf("--parameters") + 1];
        assert.deepEqual(JSON.parse(consumed), evidence.approvedParameters);
        assert.equal(createHash("sha256").update(consumed).digest("hex"), evidence.parametersSha256);
      }
    }
    assert.equal(run("preview", { FAKE_ACCOUNT: JSON.stringify({ id: "source", tenantId: valid.tenantId }) }).status, 1);
    assert.equal(run("preview", { FAKE_PREVIEW: JSON.stringify({ changes: [{ changeType: "Delete" }] }) }).status, 1);
    assert.equal(run("deploy").status, 1);
    const inventedField = run("guard", { FAKE_ENVIRONMENT: JSON.stringify({ ...environment, can_admins_bypass: false }) });
    assert.equal(inventedField.status, 0);
    assert.match(inventedField.stdout, /explicit human authorization remains required/i);
    assert.match(read(env.GITHUB_STEP_SUMMARY), /not.*proof.*no-admin-bypass/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
