import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";
import { sourceFixture } from "./fixtures/company-source.mjs";

const controls = () => import("../../scripts/infra/company-development-apply.mjs");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha = "a".repeat(40);
const subscriptionId = "212bf9c5-2326-4852-846e-7227bac81fd5";
const resourceGroup = "rg-keyforta-companydev-san";
const input = {
  subscriptionId, resourceGroup, tenantId: "8019a048-e7d6-48e8-984a-b902f641a21b", location: "southafricanorth",
  vnetCidr: "10.84.0.0/24", acaSubnetCidr: "10.84.0.0/26", postgresSubnetCidr: "10.84.0.64/28",
  networkApproval: "https://github.com/keyforta/keyforta-property/issues/123",
};
function fixture(sha = "a".repeat(40)) {
  const parameters = {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: Object.fromEntries(["vnetCidr", "acaSubnetCidr", "postgresSubnetCidr", "networkApproval"].map((key) => [key, { value: input[key] }])),
  };
  const template = { resources: [{ type: "Microsoft.Resources/deployments", subscriptionId, resourceGroup, properties: { mode: "Incremental" } }] };
  const whatIf = { changes: [{ resourceId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/test`, changeType: "Create", after: { type: "Microsoft.Network/virtualNetworks" } }] };
  const context = { repository: "keyforta/keyforta-property", revision: sha, runId: "123", runAttempt: "1", environment: { name: "company-dev" } };
  const files = {
    "inputs.json": encode(input), "parameters.json": encode(parameters),
    "template.json": encode(template), "what-if.json": encode(whatIf), "review-context.json": encode(context),
  };
  const evidence = {
    ...input, operation: "foundation-preview-only", commitSha: sha, runId: "123", runAttempt: "1",
    reviewContext: context, approvedParameters: parameters, executionApproved: false,
    planningCeilingUsdBeforeTax: "120.00", estimatedMonthlyUsdBeforeTax: "108.35",
    previewClientId: "11111111-1111-4111-8111-111111111111",
    sourceSha256: "b".repeat(64),
    templateSha256: hash(files["template.json"]), parametersSha256: hash(files["parameters.json"]), whatIfSha256: hash(files["what-if.json"]),
  };
  files["evidence.json"] = encode(evidence);
  return {
    files, whatIf,
    expected: {
      sha, runId: "123", runAttempt: "1", artifactId: "456", sourceSha256: evidence.sourceSha256,
      templateSha256: evidence.templateSha256, parametersSha256: evidence.parametersSha256, whatIfSha256: evidence.whatIfSha256,
    },
    run: { id: 123, run_attempt: 1, head_sha: sha, head_branch: "main", status: "completed", conclusion: "success", event: "workflow_dispatch", path: ".github/workflows/company-development-foundation.yml", repository: { full_name: "keyforta/keyforta-property" }, head_repository: { full_name: "keyforta/keyforta-property" } },
    artifact: { id: 456, expired: false, name: `company-dev-foundation-plan-${sha}-123-1`, workflow_run: { id: 123, head_sha: sha } },
  };
}

test("apply accepts only exact successful preview run/artifact/SHA and every reviewed content hash", async () => {
  const { assertPlan } = await controls();
  const f = fixture();
  assert.equal(assertPlan(f.files, f.run, f.artifact, f.expected, "b".repeat(64)).evidence.commitSha, sha);
  for (const file of ["template.json", "parameters.json", "what-if.json"]) {
    assert.throws(() => assertPlan({ ...f.files, [file]: `${f.files[file]} ` }, f.run, f.artifact, f.expected, "b".repeat(64)), /hash/i);
  }
  assert.throws(() => assertPlan(f.files, f.run, f.artifact, f.expected, "c".repeat(64)), /source/i);
  for (const changes of [
    { head_sha: "c".repeat(40) }, { conclusion: "failure" }, { event: "pull_request" },
    { path: ".github/workflows/deploy.yml" }, { run_attempt: 2 }, { head_branch: "other" },
  ]) assert.throws(() => assertPlan(f.files, { ...f.run, ...changes }, f.artifact, f.expected, "b".repeat(64)));
  assert.throws(() => assertPlan(f.files, f.run, { ...f.artifact, expired: true }, f.expected, "b".repeat(64)));
  assert.throws(() => assertPlan(f.files, f.run, { ...f.artifact, id: 999 }, f.expected, "b".repeat(64)));
});

test("apply rejects semantic approval drift and any extra artifact file even when actor updates raw hashes", async () => {
  const { assertPlan } = await controls();
  const f = fixture();
  const parameters = JSON.parse(f.files["parameters.json"]);
  parameters.parameters.vnetCidr.value = "10.84.0.0/23";
  const changed = encode(parameters);
  const evidence = JSON.parse(f.files["evidence.json"]);
  evidence.parametersSha256 = hash(changed);
  assert.throws(() => assertPlan({ ...f.files, "parameters.json": changed, "evidence.json": encode(evidence) }, f.run, f.artifact, { ...f.expected, parametersSha256: hash(changed) }, "b".repeat(64)), /parameter/i);
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
  const plan = assertPlan(f.files, f.run, f.artifact, f.expected, "b".repeat(64));
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
  assert.equal(workflow.jobs.apply.environment, "company-dev-apply");
  assert.equal(workflow.jobs.guard.permissions["id-token"], undefined);
  assert.equal(workflow.jobs.apply.permissions["id-token"], "write");
  assert.deepEqual(workflow.jobs.apply.needs, ["guard"]);
  const steps = workflow.jobs.apply.steps;
  const login = steps.find((step) => step.uses?.startsWith("azure/login@"));
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
  const { foundationSource } = await import("../../scripts/infra/company-development.mjs");
  const { root: dir, revision } = sourceFixture();
  const f = fixture(revision);
  f.expected.sourceSha256 = foundationSource({ root: dir, revision }).sha256;
  const evidence = JSON.parse(f.files["evidence.json"]);
  evidence.sourceSha256 = f.expected.sourceSha256;
  f.files["evidence.json"] = encode(evidence);
  const script = resolve("scripts/infra/company-development-apply.mjs");
  const environment = {
    id: 789, node_id: "apply-environment-node", name: "company-dev-apply",
    deployment_branch_policy: { protected_branches: true },
    protection_rules: [{ type: "required_reviewers", prevent_self_review: true, reviewers: [{ type: "User", reviewer: { id: 999 } }] }],
  };
  const tool = `#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path");
const name=path.basename(process.argv[1]),a=process.argv.slice(2),e=process.env;
fs.appendFileSync(e.TOOL_LOG,JSON.stringify({name,args:a})+"\\n");
const json=(key)=>JSON.parse(e[key]);
let value;
if(name==="gh"){
 if(a[0]==="run"){
  const folder=a[a.indexOf("--dir")+1]; for(const [file,text]of Object.entries(json("FAKE_FILES")))fs.writeFileSync(path.join(folder,file),text);
  process.exit(0)
 }
 const api=a[1];
 if(api.includes("/environments/"))value=json("FAKE_ENVIRONMENT");
 else if(api.includes("/actions/workflows/")){
  const workflow=/workflows\\/([^/]+)\\//.exec(api)[1];
  value={workflow_runs:[{id:999,head_sha:e.GITHUB_SHA,head_branch:"main",event:"push",status:"completed",conclusion:e.FAIL_QUALITY==="true"?"failure":"success",path:".github/workflows/"+workflow}]};
 }else if(api.includes("/artifacts?"))value={total_count:1,artifacts:[json("FAKE_ARTIFACT")]};
 else if(api.includes("/actions/artifacts/"))value=json("FAKE_ARTIFACT");
 else value=json("FAKE_RUN");
}else if(name==="az"){
 if(a[0]==="account")value={id:"${subscriptionId}",tenantId:"${input.tenantId}",state:"Enabled",user:{type:"servicePrincipal",name:e.APPLY_CLIENT_ID}};
 else if(a[0]==="provider")value={registrationState:"Registered"};
 else if(a[0]==="group")value={id:"/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}",location:"southafricanorth"};
 else if(a[0]==="resource")value=e.NONEMPTY==="true"?[{id:"unexpected"}]:[];
 else if(a[0]==="rest"){process.exit(0)}
 else if(a[2]==="what-if"){value=json("FAKE_WHAT_IF");if(e.DRIFT==="true")value.changes[0].after.name="drift"}
 else if(a[2]==="show")value={id:"companydev-test-deployment",properties:{provisioningState:"Succeeded",outputs:{}}};
 else {console.error("Unexpected Azure command");process.exit(2)}
}
console.log(JSON.stringify(value));
`;
  const env = {
    ...process.env, PATH: `${dir}:${process.env.PATH}`, TOOL_LOG: join(dir, "tools.jsonl"),
    GITHUB_REPOSITORY: "keyforta/keyforta-property", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: revision, GITHUB_RUN_ID: "777", GITHUB_RUN_ATTEMPT: "1",
    GITHUB_OUTPUT: join(dir, "outputs"), GITHUB_STEP_SUMMARY: join(dir, "summary"),
    COMPANY_DEV_APPLY_ENABLED: "true", PLAN_RUN_ID: "123", PLAN_RUN_ATTEMPT: "1", PLAN_ARTIFACT_ID: "456",
    REVIEWED_SOURCE_SHA256: f.expected.sourceSha256, REVIEWED_TEMPLATE_SHA256: f.expected.templateSha256,
    REVIEWED_PARAMETERS_SHA256: f.expected.parametersSha256, REVIEWED_WHAT_IF_SHA256: f.expected.whatIfSha256,
    APPROVED_VNET_CIDR: input.vnetCidr, APPROVED_ACA_SUBNET_CIDR: input.acaSubnetCidr,
    APPROVED_POSTGRES_SUBNET_CIDR: input.postgresSubnetCidr, APPROVED_NETWORK_REFERENCE: input.networkApproval,
    APPLY_CLIENT_ID: "22222222-2222-4222-8222-222222222222",
    FAKE_FILES: JSON.stringify(f.files), FAKE_RUN: JSON.stringify(f.run), FAKE_ARTIFACT: JSON.stringify(f.artifact),
    FAKE_ENVIRONMENT: JSON.stringify(environment), FAKE_WHAT_IF: JSON.stringify(f.whatIf),
  };
  try {
    for (const name of ["gh", "az"]) { writeFileSync(join(dir, name), tool); chmodSync(join(dir, name), 0o700); }
    const run = (operation, changes = {}) => spawnSync(process.execPath, [script, operation], { cwd: dir, env: { ...env, ...changes }, encoding: "utf8" });
    const guard = run("guard");
    assert.equal(guard.status, 0, guard.stderr);
    for (const line of readFileSync(env.GITHUB_OUTPUT, "utf8").trim().split("\n")) {
      const split = line.indexOf("=");
      env[line.slice(0, split).toUpperCase()] = line.slice(split + 1);
    }
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
    for (const changes of [{ FAIL_QUALITY: "true" }, { DRIFT: "true" }, { NONEMPTY: "true" }, { APPLY_CLIENT_ID: evidence.previewClientId }]) {
      assert.equal(run("apply", changes).status, 1, JSON.stringify(changes));
    }
    const calls = () => readFileSync(env.TOOL_LOG, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(calls().filter((call) => call.name === "az" && call.args[0] === "rest").length, 0);
    const result = run("apply");
    assert.equal(result.status, 0, result.stderr);
    const writes = calls().filter((call) => call.name === "az" && call.args[0] === "rest");
    assert.equal(writes.length, 1);
    const args = writes[0].args;
    assert.equal(args[args.indexOf("--method") + 1], "put");
    assert.match(args[args.indexOf("--url") + 1], new RegExp(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/`));
    const body = JSON.parse(args[args.indexOf("--body") + 1]);
    assert.deepEqual(body.properties.template, JSON.parse(f.files["template.json"]));
    assert.deepEqual(body.properties.parameters, JSON.parse(f.files["parameters.json"]).parameters);
    for (const call of calls().filter((call) => call.name === "az")) assert.equal(call.args[call.args.indexOf("--subscription") + 1], subscriptionId);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
