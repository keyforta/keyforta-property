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
  foundationSource, guard, normalizedPreview, validateInputs, validatePreview, workflowContext,
} from "./company-development.mjs";

const repository = "keyforta/keyforta-property";
const applyEnvironment = "company-dev-apply";
const fileNames = ["evidence.json", "inputs.json", "parameters.json", "review-context.json", "template.json", "what-if.json"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function command(executable, args) {
  return execFileSync(executable, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
}
const github = (path) => JSON.parse(command("gh", ["api", `repos/${repository}/${path}`]));
const azure = (args) => JSON.parse(command("az", [...args, "--subscription", destination.subscriptionId, "--output", "json", "--only-show-errors"]));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });

export function assertPlan(files, run, artifact, expected, currentSourceSha256) {
  assert.deepEqual(Object.keys(files).sort(), [...fileNames].sort(), "Unexpected artifact file inventory");
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
  assert.equal(artifact.name, `company-dev-foundation-plan-${expected.sha}-${expected.runId}-${expected.runAttempt}`, "Wrong artifact name");
  assert.equal(String(artifact.workflow_run?.id), expected.runId, "Artifact belongs to another run");
  assert.equal(artifact.workflow_run?.head_sha, expected.sha, "Artifact SHA mismatch");
  const evidence = JSON.parse(files["evidence.json"]);
  assert.equal(evidence.operation, "foundation-preview-only", "Not a foundation preview");
  assert.equal(evidence.commitSha, expected.sha, "Evidence SHA mismatch");
  assert.equal(evidence.runId, expected.runId, "Evidence run mismatch");
  assert.equal(evidence.runAttempt, expected.runAttempt, "Evidence attempt mismatch");
  assert.equal(evidence.executionApproved, false, "Unexpected preview evidence");
  assert.equal(evidence.planningCeilingUsdBeforeTax, "120.00", "Unreviewed cost ceiling");
  assert.equal(evidence.sourceSha256, expected.sourceSha256, "Reviewed source hash mismatch");
  assert.equal(currentSourceSha256, expected.sourceSha256, "Current foundation source differs from reviewed source");
  for (const [file, field] of [["template.json", "templateSha256"], ["parameters.json", "parametersSha256"], ["what-if.json", "whatIfSha256"]]) {
    assert.equal(hash(files[file]), expected[field], `Reviewed ${file} hash mismatch`);
    assert.equal(evidence[field], expected[field], `Evidence ${file} hash mismatch`);
  }
  const inputs = JSON.parse(files["inputs.json"]);
  validateInputs(inputs, inputs); // structural only; external CIDR approval checked in protected job
  for (const key of Object.keys(inputs)) assert.deepEqual(evidence[key], inputs[key], `Evidence input mismatch: ${key}`);
  const parameters = JSON.parse(files["parameters.json"]);
  assert.deepEqual(parameters, armParameters(inputs), "Consumed parameters differ from approved input snapshot");
  assert.deepEqual(evidence.approvedParameters, parameters, "Approved parameters differ from consumed parameters");
  const reviewContext = JSON.parse(files["review-context.json"]);
  assert.deepEqual(evidence.reviewContext, reviewContext, "Preview review context mismatch");
  assert.equal(reviewContext.repository, repository, "Preview review repository mismatch");
  assert.equal(reviewContext.environment?.name, "company-dev", "Wrong preview environment");
  assert.equal(reviewContext.revision, expected.sha, "Preview review SHA mismatch");
  assert.equal(reviewContext.runId, expected.runId, "Preview review run mismatch");
  assert.equal(reviewContext.runAttempt, expected.runAttempt, "Preview review attempt mismatch");
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
  validatePreview(whatIf);
  return { evidence, inputs, parameters, template, whatIf };
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
  assert.equal(normalizedPreview(fresh), normalizedPreview(reviewed), "Fresh provider what-if drift; replan and independently review");
}
export function applyRequest(plan, sha) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  return {
    url: `https://management.azure.com/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}/providers/Microsoft.Resources/deployments/companydev-foundation-${sha.slice(0, 12)}?api-version=2025-04-01`,
    body: { properties: { mode: "Incremental", template: plan.template, parameters: plan.parameters.parameters } },
  };
}

function expectedPlan() {
  const expected = {
    sha: currentRun().revision, runId: process.env.PLAN_RUN_ID, runAttempt: process.env.PLAN_RUN_ATTEMPT, artifactId: process.env.PLAN_ARTIFACT_ID,
    sourceSha256: process.env.REVIEWED_SOURCE_SHA256, templateSha256: process.env.REVIEWED_TEMPLATE_SHA256,
    parametersSha256: process.env.REVIEWED_PARAMETERS_SHA256, whatIfSha256: process.env.REVIEWED_WHAT_IF_SHA256,
  };
  for (const key of ["runId", "runAttempt", "artifactId"]) assert.match(expected[key] ?? "", /^[1-9]\d*$/, `Missing plan ${key}`);
  for (const key of ["sourceSha256", "templateSha256", "parametersSha256", "whatIfSha256"]) assert.match(expected[key] ?? "", /^[a-f0-9]{64}$/, `Missing reviewed ${key}`);
  return expected;
}
function loadPlan(expected) {
  const run = github(`actions/runs/${expected.runId}`);
  const artifact = github(`actions/artifacts/${expected.artifactId}`);
  // gh run download selects by name: require that exact immutable ID to be the
  // sole matching artifact, then revalidate every downloaded byte/hash.
  const listing = github(`actions/runs/${expected.runId}/artifacts?per_page=100`);
  assert.ok(listing.total_count <= 100, "Ambiguous artifact inventory; stop for review");
  const matches = listing.artifacts.filter((item) => item.name === artifact.name);
  assert.equal(matches.length, 1, "Ambiguous named preview artifact");
  assert.equal(String(matches[0].id), expected.artifactId, "Named artifact ID drift");
  const directory = mkdtempSync(join(tmpdir(), "companydev-reviewed-plan-"));
  try {
    command("gh", ["run", "download", expected.runId, "--repo", repository, "--name", artifact.name, "--dir", directory]);
    const files = {};
    for (const file of readdirSync(directory)) {
      const info = lstatSync(join(directory, file));
      assert.ok(fileNames.includes(file) && info.isFile() && !info.isSymbolicLink() && info.size <= 2 * 1024 * 1024, "Invalid artifact file");
      files[file] = readFileSync(join(directory, file), "utf8");
    }
    return assertPlan(files, run, artifact, expected, foundationSource().sha256);
  } finally {
    rmSync(directory, { recursive: true, force: true }); // local downloaded copies only, NEVER Azure resources
  }
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
function guardApply() {
  enabled();
  const expected = expectedPlan();
  loadPlan(expected);
  const checks = quality();
  guard({ expectedEnvironment: applyEnvironment, enabled: process.env.COMPANY_DEV_APPLY_ENABLED });
  appendFileSync(process.env.GITHUB_OUTPUT, `plan_binding=${JSON.stringify(expected)}\n`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    "\n## Exact reviewed foundation APPLY inputs — not bootstrap",
    "The independent reviewer must record these plan IDs/hashes with the exact SHA and manual no-bypass verification in the native company-dev-apply approval comment.",
    "Confirm legal payer/cost owner, externally approved CIDRs/NSG, scoped apply permissions (including four reviewed resource roles), $120/month BEFORE TAX ceiling, managed ACA RG charges and rollback/change-freeze owner.",
    "Separate preview and apply principals are mandatory. No apps/jobs/data/customer identity/public DNS/source cleanup. This does not authorize provider/RG/federation bootstrap.",
    "```json", JSON.stringify({ ...expected, qualityRuns: checks }, null, 2), "```", "",
  ].join("\n"));
}
function verify() {
  enabled();
  const expected = expectedPlan();
  assert.deepEqual(JSON.parse(process.env.PLAN_BINDING ?? "null"), expected, "Guarded plan binding drift");
  const context = JSON.parse(process.env.REVIEW_CONTEXT ?? "null");
  assertReviewContext(context, github(`environments/${applyEnvironment}`), currentRun(), applyEnvironment);
  const plan = loadPlan(expected);
  validateInputs(plan.inputs, {
    vnetCidr: process.env.APPROVED_VNET_CIDR, acaSubnetCidr: process.env.APPROVED_ACA_SUBNET_CIDR,
    postgresSubnetCidr: process.env.APPROVED_POSTGRES_SUBNET_CIDR, networkApproval: process.env.APPROVED_NETWORK_REFERENCE,
  });
  assert.match(process.env.APPLY_CLIENT_ID ?? "", uuid, "Missing apply principal UUID");
  assert.notEqual(process.env.APPLY_CLIENT_ID.toLowerCase(), plan.evidence.previewClientId.toLowerCase(), "Apply and preview principals must be separate");
  return { plan, expected, context, qualityRuns: quality() };
}
function emptyDestination() {
  const account = azure(["account", "show"]);
  assertAzureContext(account);
  assert.equal(account.user?.type, "servicePrincipal", "Apply must use scoped federation");
  assert.equal(account.user?.name?.toLowerCase(), process.env.APPLY_CLIENT_ID.toLowerCase(), "Wrong signed-in apply principal");
  for (const namespace of ["Microsoft.App", "Microsoft.ContainerRegistry", "Microsoft.DBforPostgreSQL", "Microsoft.ManagedIdentity", "Microsoft.Network", "Microsoft.OperationalInsights", "Microsoft.Security", "Microsoft.Storage"]) {
    assert.equal(azure(["provider", "show", "--namespace", namespace]).registrationState, "Registered", `Unapproved/missing provider bootstrap: ${namespace}`);
  }
  const group = azure(["group", "show", "--name", destination.resourceGroup]);
  assert.equal(group.id.toLowerCase(), `/subscriptions/${destination.subscriptionId}/resourceGroups/${destination.resourceGroup}`.toLowerCase(), "Wrong apply RG");
  assert.equal(group.location, destination.location, "Wrong apply RG location");
  assert.deepEqual(azure(["resource", "list", "--resource-group", destination.resourceGroup]), [], "Apply requires empty destination; no replay/reconciliation or source actions");
}
async function apply() {
  const verified = verify(); // supported API checks + actual protected job, no self-attestation
  emptyDestination();
  mkdirSync("company-dev-apply", { recursive: true, mode: 0o700 });
  writeJson("company-dev-apply/reviewed-inputs.json", { ...verified.expected, reviewContext: verified.context, qualityRuns: verified.qualityRuns });
  writeJson("company-dev-apply/template.json", verified.plan.template);
  const fresh = azure([
    "deployment", "group", "what-if", "--resource-group", destination.resourceGroup,
    "--name", `companydev-plan-${verified.expected.runId}`,
    "--template-file", "company-dev-apply/template.json",
    "--parameters", JSON.stringify(verified.plan.parameters),
    "--validation-level", "ProviderNoRbac", "--result-format", "FullResourcePayloads", "--no-pretty-print",
  ]);
  writeJson("company-dev-apply/fresh-what-if.json", fresh);
  assertFreshPreview(verified.plan.whatIf, fresh);
  quality(); // a newly failing/pending run cannot be hidden by an older success
  emptyDestination();
  const request = applyRequest(verified.plan, currentRun().revision);
  writeJson("company-dev-apply/submission.json", { url: request.url, bodySha256: hash(JSON.stringify(request.body)), executionRun: currentRun(), reviewed: verified.expected });
  // The only external write: exact reviewed template + parameters INLINE, no
  // mutable file read, no create/assign/register/bootstrap helper or source URL.
  command("az", ["rest", "--method", "put", "--url", request.url, "--body", JSON.stringify(request.body), "--subscription", destination.subscriptionId, "--output", "none", "--only-show-errors"]);
  const name = `companydev-foundation-${currentRun().revision.slice(0, 12)}`;
  for (let attempt = 0; attempt < 180; attempt++) {
    const deployment = azure(["deployment", "group", "show", "--resource-group", destination.resourceGroup, "--name", name]);
    const state = deployment.properties?.provisioningState;
    writeJson("company-dev-apply/result.json", { state, deploymentId: deployment.id, outputs: deployment.properties?.outputs, executionRun: currentRun(), reviewed: verified.expected });
    if (state === "Succeeded") {
      console.log("Foundation ARM deployment succeeded. No apps/jobs/data activated; independent settings/cost/recovery acceptance still required.");
      return;
    }
    assert.ok(!["Failed", "Canceled"].includes(state), `Foundation ${state}; retain evidence, stop; no automatic rollback/deletion`);
    await delay(10000);
  }
  throw new Error("Foundation polling timed out; retain evidence and inspect exact destination; no automatic retry/deletion");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    switch (process.argv[2]) {
      case "guard": guardApply(); break;
      case "verify": verify(); console.log("Reviewed apply inputs and protected-environment snapshot verified; no Azure write."); break;
      case "apply": await apply(); break;
      default: throw new Error("Supported apply-route operations: guard, verify, apply; no bootstrap or cleanup");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
