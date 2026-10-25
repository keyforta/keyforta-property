import assert from "node:assert/strict";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";
import { sourceFixture } from "./fixtures/company-source.mjs";

const read = (file) => readFileSync(file, "utf8");
const controls = async () => import("../../scripts/infra/company-development.mjs");
const valid = {
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
  assert.match(template, /resource azureServicesFirewall[^\n]+ = if \(empty\(privateNetwork\)\)/);
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
    { name: "dev" }, { protection_rules: [] },
    { deployment_branch_policy: null },
    { protection_rules: [{ type: "required_reviewers", reviewers: [] }] },
    { protection_rules: [{ type: "required_reviewers", prevent_self_review: false, reviewers: [{ reviewer: { id: 123 } }] }] },
  ]) assert.throws(() => assertEnvironmentProtection({ ...environment, ...changes }), /environment|review|bypass|branch/i);
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
  }, current), /self review/i);
});

test("what-if validation rejects source scope, destructive changes and unexpected services", async () => {
  const { validatePreview } = await controls();
  const prefix = `/subscriptions/${valid.subscriptionId}/resourceGroups/${valid.resourceGroup}/providers/`;
  const change = { changeType: "Create", resourceId: `${prefix}Microsoft.Network/virtualNetworks/vnet-keyforta-cdev-test`, after: { type: "Microsoft.Network/virtualNetworks" } };
  assert.doesNotThrow(() => validatePreview({ changes: [change] }));
  for (const changes of [
    [{ ...change, changeType: "Delete" }],
    [{ ...change, changeType: "Modify" }],
    [{ ...change, changeType: "Ignore" }],
    [{ ...change, resourceId: change.resourceId.replace(valid.resourceGroup, "rg-keyforta-dev-san") }],
    [{ ...change, resourceId: change.resourceId.replace(valid.subscriptionId, "f9809805-ff42-4ece-b3da-43ebd70e0fb7") }],
    [{ ...change, after: { type: "Microsoft.App/jobs" } }],
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

test("preview CLI produces SHA-bound evidence using only explicit-subscription reads and what-if", () => {
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
    protection_rules: [{ type: "required_reviewers", prevent_self_review: true, reviewers: [{ reviewer: { id: 123 } }] }],
  };
  const scope = `/subscriptions/${valid.subscriptionId}/resourceGroups/${valid.resourceGroup}`;
  const env = {
    ...process.env, PATH: `${dir}:${process.env.PATH}`, TOOL_LOG: join(dir, "tools.jsonl"),
    GITHUB_REPOSITORY: "keyforta/keyforta-property", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main", GITHUB_SHA: sha, GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1", GITHUB_OUTPUT: join(dir, "outputs"),
    GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
    COMPANY_DEV_PLAN_ENABLED: "true",
    PREVIEW_CLIENT_ID: "11111111-1111-4111-8111-111111111111",
    VNET_CIDR: valid.vnetCidr, ACA_SUBNET_CIDR: valid.acaSubnetCidr,
    POSTGRES_SUBNET_CIDR: valid.postgresSubnetCidr, NETWORK_APPROVAL: valid.networkApproval,
    APPROVED_VNET_CIDR: valid.vnetCidr, APPROVED_ACA_SUBNET_CIDR: valid.acaSubnetCidr,
    APPROVED_POSTGRES_SUBNET_CIDR: valid.postgresSubnetCidr, APPROVED_NETWORK_REFERENCE: valid.networkApproval,
    FAKE_ENVIRONMENT: JSON.stringify(environment),
    FAKE_ACCOUNT: JSON.stringify({ id: valid.subscriptionId, tenantId: valid.tenantId, state: "Enabled" }),
    FAKE_GROUP: JSON.stringify({ id: scope, location: valid.location }),
    FAKE_PREVIEW: JSON.stringify({ changes: [{ changeType: "Create", resourceId: `${scope}/providers/Microsoft.Network/virtualNetworks/test`, after: { type: "Microsoft.Network/virtualNetworks" } }] }),
  };
  try {
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
    assert.match(read(env.GITHUB_STEP_SUMMARY), /independent.*reviewer/i);
    assert.match(read(env.GITHUB_STEP_SUMMARY), /approval comment/i);
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
    // Mutation after validation/while compiling cannot affect inline ARM inputs.
    const preview = run("preview", { RACE_PARAMETERS: "true" });
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(run("preview", { GITHUB_SHA: "b".repeat(40) }).status, 1);
    assert.equal(run("preview", { GITHUB_RUN_ATTEMPT: "2" }).status, 1);
    const evidence = JSON.parse(read(join(dir, "company-dev-plan/evidence.json")));
    assert.equal(evidence.commitSha, sha);
    assert.equal(evidence.executionApproved, false);
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
        ["resource", "list"], ["deployment", "group", "what-if"],
      ].some((prefix) => prefix.every((part, index) => args[index] === part)), `Unexpected Azure command: ${args.join(" ")}`);
      if (args[0] === "deployment") {
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
    assert.match(inventedField.stdout, /GitHub environment approval required/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
