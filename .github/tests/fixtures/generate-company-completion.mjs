// Offline, deterministic synthetic fixtures. No retained evidence is an input.
// Run: node .github/tests/fixtures/generate-company-completion.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  destination, rg, bootstrapInventory, historicalSourcePaths, original as runtimeOriginal, sha256,
} from "../../../scripts/infra/company-development-completion-validation.mjs";
import { zipFixture } from "./company-zip.mjs";

export function generateCompletionFixtures() {
  const json = (value) => `${JSON.stringify(value)}\n`;
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  // Git source revision and destination IDs are public contract, not run data.
  const original = {
    sha: runtimeOriginal.sha, runId: "8001", runAttempt: "1", artifactId: "8002",
    deploymentName: "companydev-bootstrap-6216a0c95b49",
    writerClientId: uuid(1), writerPrincipalId: uuid(2), previewClientId: uuid(3),
    correlationId: uuid(4),
    parametersSha256: sha256(json({ synthetic: true })),
    bodySha256: sha256(json({ syntheticSubmission: true })),
  };
  const timestamp = "2020-01-01T00:01:00.000Z";
  const resources = bootstrapInventory().map((r, i) => ({
    ...r, location: destination.location,
    ...(r.type.endsWith("/registries") ? { sku: { name: "Basic" } }
      : r.type.endsWith("/storageAccounts") ? { sku: { name: "Standard_LRS" }, kind: "StorageV2" } : {}),
    properties: r.type.endsWith("/userAssignedIdentities")
      ? { tenantId: destination.tenantId, clientId: uuid(100 + i), principalId: uuid(200 + i) }
      : r.type.endsWith("/registries")
        ? { provisioningState: "Succeeded", adminUserEnabled: false, publicNetworkAccess: "Enabled" }
        : r.type.endsWith("/storageAccounts")
          ? { provisioningState: "Succeeded", allowBlobPublicAccess: false, allowSharedKeyAccess: false,
            defaultToOAuthAuthentication: true, minimumTlsVersion: "TLS1_2", supportsHttpsTrafficOnly: true, publicNetworkAccess: "Enabled" }
          : r.type.endsWith("/blobServices") ? { deleteRetentionPolicy: { days: 7, enabled: true } }
            : { publicAccess: "None" },
  }));
  const sourceFiles = historicalSourcePaths.map((path) => ({
    path, sha256: sha256(execFileSync("git", ["show", `${original.sha}:${path}`])),
  }));
  const sourceSha256 = sha256(JSON.stringify(sourceFiles));
  const template = json({ $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
    contentVersion: "1.0.0.0", metadata: { synthetic: true }, resources: [] });
  original.templateSha256 = sha256(template);
  const checkpoint = { version: 2, stage: "bootstrap", mode: "initial", destination, completed: false,
    commitSha: original.sha, runId: original.runId, runAttempt: original.runAttempt,
    applyClientId: original.writerClientId, deploymentName: original.deploymentName,
    deploymentCommitSha: original.sha, sourceSha256, sourceFiles,
    templateSha256: original.templateSha256, parametersSha256: original.parametersSha256, resources,
    predecessor: null, securityHandoff: null, internalTopology: false, automaticDataAdmission: false };
  const fresh = json({ changes: [] });
  const reviewed = { stage: "bootstrap", mode: "initial", evidenceVersion: 2, sha: original.sha,
    runId: "8003", runAttempt: "1", artifactId: "8004", sourceSha256,
    templateSha256: original.templateSha256, parametersSha256: original.parametersSha256, whatIfSha256: sha256(fresh) };
  const executionRun = { revision: original.sha, runId: original.runId, runAttempt: original.runAttempt };
  const deploymentId = (name) => `${rg}/providers/Microsoft.Resources/deployments/${name}`;
  const files = { "checkpoint.json": json(checkpoint), "fresh-what-if.json": fresh,
    "result.json": json({ executionRun, reviewed, deploymentId: deploymentId(original.deploymentName), state: "Succeeded" }),
    "reviewed-inputs.json": json(reviewed),
    "submission.json": json({ executionRun, reviewed, bodySha256: original.bodySha256,
      url: `https://management.azure.com${deploymentId(original.deploymentName)}?api-version=2025-04-01` }),
    "template.json": template };
  original.checkpointSha256 = sha256(files["checkpoint.json"]);
  const archive = zipFixture(files);
  original.archiveSha256 = sha256(archive);
  const names = [original.deploymentName, "foundation-keyforta-cdev", "stamp-keyforta-cdev"];
  const deployments = names.map((name) => ({ name, id: deploymentId(name),
    properties: { provisioningState: "Succeeded", correlationId: original.correlationId, timestamp } }));
  const operation = (name, n, op, target) => ({ operationId: `synthetic-${n}`,
    id: `${deploymentId(name)}/operations/synthetic-${n}`,
    properties: { provisioningOperation: op, provisioningState: "Succeeded", timestamp,
      targetResource: target ? { id: target.id, resourceType: target.type } : null } });
  const operations = names.map((deploymentName, i) => {
    const targets = i < 2
      ? [["Read", { id: deploymentId(names[i + 1]), type: "Microsoft.Resources/deployments" }],
        ["Create", { id: deploymentId(names[i + 1]), type: "Microsoft.Resources/deployments" }]]
      : [...resources.filter((r) => r.type.endsWith("/registries") || /-(api|migration)$/.test(r.id)).map((r) => ["Read", r]),
        ...resources.map((r) => ["Create", r])];
    targets.push(["EvaluateDeploymentOutput", null]);
    return { deploymentName, operations: targets.map(([op, target], n) => operation(deploymentName, n, op, target)) };
  });
  const run = { id: Number(original.runId), run_attempt: 1, head_sha: original.sha, head_branch: "main",
    event: "workflow_dispatch", status: "completed", conclusion: "failure",
    name: "Company development foundation apply", path: ".github/workflows/company-development-foundation-apply.yml",
    repository: { full_name: "keyforta/keyforta-property" }, head_repository: { full_name: "keyforta/keyforta-property" },
    created_at: "2020-01-01T00:00:00.000Z", updated_at: "2020-01-01T00:02:00.000Z",
    run_started_at: "2020-01-01T00:00:00.000Z", actor: { login: "synthetic-owner" }, triggering_actor: { login: "synthetic-owner" } };
  const artifact = { id: Number(original.artifactId), expired: false, expires_at: "2099-01-01T00:00:00.000Z",
    created_at: timestamp, size_in_bytes: archive.length, digest: `sha256:${original.archiveSha256}`,
    name: `company-dev-foundation-bootstrap-initial-v2-apply-${original.sha}-${original.runId}-1`,
    workflow_run: { id: run.id, head_sha: original.sha } };
  const unresolvedWhatIfRaw = json({ changes: resources.slice(0, 3).map((r, i) => ({
    resourceId: r.id, changeType: "Modify", delta: Array.from({ length: i === 2 ? 1 : 2 }, (_, n) => ({
      path: `properties.synthetic${n}`, propertyChangeType: "Delete", before: "synthetic",
    })),
  })) });
  const retained = { original, resources, inventory: resources.filter((r) => !r.type.includes("/blobServices")),
    history: deployments, deployments, operations, run, artifact, unresolvedWhatIfRaw };
  return { archive, arm: gzipSync(json(retained), { level: 9 }), original, unresolvedWhatIfRaw };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const generated = generateCompletionFixtures();
  for (const [name, bytes] of [["company-bootstrap-original.zip", generated.archive], ["company-bootstrap-arm.json.gz", generated.arm]]) {
    writeFileSync(new URL(name, import.meta.url), bytes);
    console.log(`${sha256(bytes)}  ${name}`);
  }
}
