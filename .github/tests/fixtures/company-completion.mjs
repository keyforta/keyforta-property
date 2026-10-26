// Local-only generated SYNTHETIC source/archive/API fixture. No live evidence.
import { syntheticHistorical, syntheticInheritedHumans } from "./company-completion-loader.mjs";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { ensureCompanyHistory } from "./company-history.mjs";
const {
  original, baselineRevision, repository, destination, rg, bootstrapInventory, historicalSourcePaths,
  sha256, stateHash, permittedReadActions, auditWorkflow,
} = await import("../../../scripts/infra/company-development-completion-validation.mjs");
const { completionSource, endpoints, roleDefinitionEndpoints, readArchive, reviewedCompletionPaths } = await import("../../../scripts/infra/company-development-completion.mjs");
export { zipFixture } from "./company-zip.mjs";

// Covers direct historical workflow reads and legacy-driver extraction too:
// every history-dependent worker imports this shared fixture before tests run.
ensureCompanyHistory();

export function completionFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "company-completion-fixture-")));
  const repo = resolve(".");
  const git = (...args) => execFileSync("git", ["-C", root, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
    "-c", "user.name=Synthetic fixture", "-c", "user.email=fixture@example.invalid", ...args],
  { env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdio: ["ignore", "pipe", "pipe"] });
  execFileSync("git", ["clone", "--shared", "--no-checkout", "--quiet", repo, root], { stdio: "pipe" });
  // A clone from a shallow source omits fetched objects without refs, even
  // with --shared. Transfer the same authenticated pins from the local source.
  git("fetch", "--quiet", "--no-tags", "--no-write-fetch-head", repo, original.sha, baselineRevision);
  git("checkout", "--quiet", "--detach", baselineRevision);
  for (const p of reviewedCompletionPaths) {
    mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), readFileSync(join(repo, p)));
  }
  git("add", "--", ...reviewedCompletionPaths); git("commit", "--quiet", "--no-verify", "-m", "Synthetic immutable audit source");
  const revision = git("rev-parse", "HEAD").toString().trim();
  const archive = readFileSync(new URL("./company-bootstrap-original.zip", import.meta.url));
  const files = readArchive(archive, ["checkpoint.json", "fresh-what-if.json", "result.json", "reviewed-inputs.json", "submission.json", "template.json"]);
  const checkpoint = JSON.parse(files["checkpoint.json"]);
  const now = Date.parse("2026-10-26T06:00:00.000Z"), timestamp = "2026-10-26T03:20:00.000Z";
  const execution = { revision, runId: "9001", runAttempt: "1" };
  const source = completionSource(revision, root);
  const originalFiles = historicalSourcePaths.map((path) => ({ path, sha256: sha256(git("show", `${original.sha}:${path}`)) }));
  const originalSource = { revision: original.sha, files: originalFiles, sha256: sha256(JSON.stringify(originalFiles)) };
  const retained = JSON.parse(gunzipSync(readFileSync(new URL("./company-bootstrap-arm.json.gz", import.meta.url))));
  const { deployments, operations } = retained;
  const roleScopes = [rg, ...bootstrapInventory().filter((r) => /\/(registries|storageAccounts|containers)$/.test(r.type)).map((r) => r.id)];
  const subscription = `/subscriptions/${destination.subscriptionId}`;
  const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const observerBinding = { clientId: uid(801), principalId: uid(802), reviewReference: "https://github.com/keyforta/keyforta-property/issues/159",
    federation: { issuer: "https://token.actions.githubusercontent.com", subject: "repo:keyforta@329171003/keyforta-property@1370148176:environment:company-dev",
      audiences: ["api://AzureADTokenExchange"] },
    grants: [subscription, rg].map((scope, i) => {
      const roleDefinition = { id: `${subscription}/providers/Microsoft.Authorization/roleDefinitions/${uid(810 + i)}`,
        properties: { type: "CustomRole", roleName: `Synthetic audit ${i}`, assignableScopes: [scope],
          permissions: [{ actions: i ? permittedReadActions.filter((a) => !["Microsoft.Resources/subscriptions/read", "Microsoft.Authorization/roleDefinitions/read"].includes(a))
            : ["Microsoft.Resources/subscriptions/read", "Microsoft.Authorization/roleDefinitions/read"], notActions: [], dataActions: [], notDataActions: [] }] } };
      return { roleDefinition, assignment: { id: `${scope}/providers/Microsoft.Authorization/roleAssignments/${uid(820 + i)}`,
        properties: { scope, principalId: uid(802), principalType: "ServicePrincipal", roleDefinitionId: roleDefinition.id } } };
    }) };
  const grants = [...structuredClone(syntheticHistorical), ...structuredClone(observerBinding.grants)];
  const snapshot = { subscription: { subscriptionId: destination.subscriptionId, tenantId: destination.tenantId, state: "Enabled" },
    group: { id: rg, location: destination.location }, inventory: retained.inventory,
    resources: retained.resources, history: retained.history, deployments, operations,
    permissions: [rg, ...bootstrapInventory().map((r) => r.id)].map((scope) => ({ scope, permissions: [{
      actions: [...permittedReadActions], notActions: [], dataActions: [], notDataActions: [],
    }] })), roles: roleScopes.map((scope) => ({ scope, assignments: [
      ...grants.filter((g) => scope.startsWith(g.assignment.properties.scope)).map((g) => g.assignment),
      ...structuredClone(syntheticInheritedHumans),
    ] })),
    roleDefinitions: grants.map((g) => g.roleDefinition), defender: { properties: { isEnabled: false } } };
  const environment = { id: 123, node_id: "synthetic-environment", name: "company-dev", updated_at: timestamp,
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false }, protection_rules: [], can_admins_bypass: false };
  const reference = "https://github.com/keyforta/keyforta-property/issues/159#issuecomment-123";
  const intent = { version: 1, kind: "bootstrap-completion-audit-intent", scope: "audit-only-no-continuation", owner: "cmbuyamba",
    execution: { revision }, original, originalSource, source, environment, observerBinding, authorizedAt: new Date(now - 60000).toISOString(),
    ownerAuthorizationReference: reference, freezeReference: reference, inspectionReference: reference,
    manualUi: { owner: "cmbuyamba", adminBypass: false, reconciledWithApi: true, observedAt: new Date(now - 60000).toISOString(), observationReference: reference },
    frozenSnapshotSha256: stateHash(snapshot),
    baselineChangesSha256: sha256(git("diff", "--raw", "--no-abbrev", "--no-renames", original.sha, baselineRevision)),
    implementationChangesSha256: sha256(git("diff", "--raw", "--no-abbrev", "--no-renames", baselineRevision, revision)) };
  const run = retained.run, artifact = retained.artifact;
  const auditRun = { ...run, id: 9001, head_sha: revision, path: auditWorkflow, name: "Company development bootstrap completion audit", conclusion: null, status: "in_progress",
    actor: { login: "cmbuyamba" }, triggering_actor: { login: "cmbuyamba" }, created_at: "2026-10-26T05:59:30.000Z", run_started_at: "2026-10-26T05:59:30.000Z" };
  const metadata = {
    "branches/main": { protected: true, commit: { sha: revision } }, "environments/company-dev": environment,
    [`actions/runs/${execution.runId}/attempts/1`]: auditRun,
    [`actions/runs/${original.runId}/attempts/1`]: run,
    [`actions/artifacts/${original.artifactId}`]: artifact,
    [`actions/runs/${original.runId}/artifacts?per_page=100`]: { total_count: 1, artifacts: [artifact] },
  };
  for (const [index, workflow] of ["ci.yml", "security.yml", "dast.yml"].entries()) {
    const quality = {
      id: 9100 + index, run_attempt: 1, path: `.github/workflows/${workflow}`, head_sha: revision,
      head_branch: "main", event: "push", status: "completed", conclusion: "success",
    };
    metadata[`actions/workflows/${workflow}/runs?head_sha=${revision}&event=push&per_page=100`] = { workflow_runs: [quality] };
    metadata[`actions/runs/${quality.id}/attempts/1`] = quality;
  }
  const responses = {};
  const bindResponses = () => {
    for (const key of Object.keys(responses)) delete responses[key];
    Object.assign(responses, {
      [endpoints.subscription]: snapshot.subscription, [endpoints.group]: snapshot.group,
      [endpoints.resources]: { value: snapshot.inventory }, [endpoints.deployments]: { value: snapshot.history },
      [endpoints.defender]: snapshot.defender,
    });
    for (const r of snapshot.resources) {
      const item = bootstrapInventory().find((b) => b.id.toLowerCase() === r.id.toLowerCase());
      if (item) responses[endpoints[item.id]] = r;
    }
    for (const d of snapshot.deployments) responses[endpoints[d.name]] = d;
    for (const g of snapshot.operations) responses[endpoints[`${g.deploymentName}/operations`]] = { value: g.operations };
    for (const p of snapshot.permissions) responses[endpoints[`${p.scope}/permissions`]] = { value: p.permissions };
    for (const p of snapshot.roles) responses[endpoints[`${p.scope}/roles`]] = { value: p.assignments };
    for (const url of roleDefinitionEndpoints(observerBinding)) responses[url] = snapshot.roleDefinitions.find((d) => url.startsWith(`https://management.azure.com${d.id}?`));
  };
  bindResponses();
  const calls = [];
  const github = (path) => { calls.push({ github: path }); assertFound(metadata[path], path); return structuredClone(metadata[path]); };
  const azure = (args) => {
    calls.push({ azure: args }); assertFound(JSON.stringify(args.slice(0, 4)) === JSON.stringify(["rest", "--method", "get", "--url"]), args);
    const value = responses[args[4]]; assertFound(value, args[4]); return structuredClone(value);
  };
  const account = { id: destination.subscriptionId, tenantId: destination.tenantId, user: { type: "servicePrincipal", name: observerBinding.clientId } };
  const options = () => ({ intent, execution, originalSource, source, github, azure, account, observerBinding, now,
    download: (id) => { assertFound(id === original.artifactId, id); return Buffer.from(archive); }, clock: () => new Date(now).toISOString() });
  return { root, git, revision, archive, files, checkpoint, now, snapshot, source, originalSource, intent, execution,
    metadata, responses, calls, github, azure, account, observerBinding, options, bindResponses, environment, run, artifact,
    unresolvedWhatIfRaw: retained.unresolvedWhatIfRaw };
}
function assertFound(value, key) { if (!value) throw new Error(`Unexpected synthetic transport request: ${JSON.stringify(key)}`); }

export function installCliMocks(f, env) {
  const bin = join(f.root, "bin"); mkdirSync(bin);
  // Fixed test executables refuse every unknown command; fixtures are file
  // inputs, never generated command strings or eval.
  for (const name of ["gh", "az"]) {
    const path = join(bin, name);
    writeFileSync(path, `#!/usr/bin/env node
const fs=require("node:fs"), a=process.argv.slice(2), f=JSON.parse(fs.readFileSync(process.env.MOCK_FIXTURE,"utf8"));
fs.appendFileSync(process.env.MOCK_LOG,JSON.stringify({name:${JSON.stringify(name)},args:a})+"\\n");
let value;
if (${JSON.stringify(name)}==="gh") {
 if(a[0]!=="api"||!a[1].startsWith("repos/keyforta/keyforta-property/")) process.exit(31);
 const key=a[1].slice("repos/keyforta/keyforta-property/".length);
 if(key==="actions/artifacts/${original.artifactId}/zip") {process.stdout.write(Buffer.from(f.archive,"base64"));process.exit(0);}
 if(key==="actions/artifacts/9002/zip"&&f.receiptArchive) {process.stdout.write(Buffer.from(f.receiptArchive,"base64"));process.exit(0);}
 value=f.metadata[key];
} else {
 if(a.join(" ")==="account show --output json --only-show-errors") value=f.account;
 else if(a[0]==="rest"&&a[1]==="--method"&&a[2]==="get"&&a[3]==="--url"
   &&a.slice(5).join(" ")==="--subscription 891e5e6e-8ae3-4455-9184-8d7606223d91 --output json --only-show-errors") value=f.responses[a[4]];
 else process.exit(32);
}

if(value===undefined)process.exit(33);
process.stdout.write(JSON.stringify(value));
`, { mode: 0o700 });
    chmodSync(path, 0o700);
  }
  const fixturePath = join(f.root, "mock-fixture.json");
  const save = () => writeFileSync(fixturePath, JSON.stringify({ metadata: f.metadata, responses: f.responses, account: f.account,
    archive: f.archive.toString("base64"), receiptArchive: f.receiptArchive?.toString("base64") }));
  save();
  return { save, env: { ...env, NODE_OPTIONS: `--import=${new URL("./company-completion-loader.mjs", import.meta.url).href}`,
    PATH: `${bin}:${process.env.PATH}`, MOCK_FIXTURE: fixturePath, MOCK_LOG: join(f.root, "calls.log") } };
}
