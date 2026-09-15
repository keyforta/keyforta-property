#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import {
  activeContractPath,
  changedPaths,
  databaseEnvironment,
  readJson,
  validateEvidence,
} from "./lib.mjs";
import {
  buildEvidenceManifest,
  effectiveEvidencePolicy,
  evidenceFiles,
  gitEvidenceContext,
  validateArtifactRecords,
  validateCurrentState,
  validateEvidenceManifest,
} from "./edd-lib.mjs";
import { runGates, skippedGateResults } from "./run-gates.mjs";
import { guardGeneratedReports } from "./report-retention-guard.mjs";

function filesWithExtension(directory, extension) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? filesWithExtension(path, extension)
      : path.endsWith(extension)
        ? [path]
        : [];
  });
}

const contractRequired = process.env.HARNESS_CONTRACT_MODE !== "skip";
const verificationStartedAt = new Date().toISOString();
const gates = [
  ...(contractRequired
    ? [
        ["repository-policy", "node harness/scripts/check-policy.mjs"],
        ["task-contract", "pnpm verify:task"],
        ["task-classification", "pnpm verify:classification"],
        ["workflow-transition", "pnpm verify:transition"],
      ]
    : []),
  ["agent-governance", "pnpm verify:agents"],
  ["agent-skills", "pnpm verify:skills"],
  ["workspace-checks", "pnpm check"],
  ["architecture-boundaries", "node harness/graders/architecture.mjs"],
  ["secret-patterns", "node harness/graders/secrets.mjs"],
  ...(process.env.CI
    ? [["dependency-audit", "pnpm audit --prod --audit-level high"]]
    : []),
  ["documentation-impact", "node harness/graders/documentation.mjs"],
  ["harness-self-test", "pnpm harness:self-test"],
  ...(contractRequired
    ? [
        [
          "required-scenarios",
          "node harness/scripts/verify-required-scenarios.mjs",
        ],
      ]
    : []),
  ["production-build", "pnpm build"],
];
const contractPath = contractRequired ? activeContractPath() : undefined;
const contract = contractPath ? readJson(contractPath) : undefined;
const supportedScenarios = new Set([
  "repository-neutral-self-test",
  "canonical-verification",
  "valid-skill-discovery",
  "incomplete-skill-rejection",
  "unknown-agent-rejection",
  "approval-bypass-rejection",
  "production-deployment-rejection",
]);
const supportedCommands = new Set(gates.map(([, command]) => command));
supportedCommands.add("pnpm verify:all");
const unsupportedDeclarations = contract
  ? [
      ...contract.requiredCommands
        .filter((command) => !supportedCommands.has(command))
        .map((command) => `unsupported required command: ${command}`),
      ...contract.requiredScenarios
        .filter((scenario) => !supportedScenarios.has(scenario))
        .map((scenario) => `unsupported required scenario: ${scenario}`),
    ]
  : [];
let results = contractRequired
  ? []
  : [
      {
        detail:
          "Contract-bound scope checks run on pull requests, not branch pushes.",
        name: "task-contract-and-policy",
        status: "skipped",
      },
    ];
if (!process.env.CI)
  results.push({
    detail:
      "Network advisory data is enforced in CI, not offline verification.",
    name: "dependency-audit",
    status: "skipped",
  });
let failed = unsupportedDeclarations.length > 0;
let blockedBy;
if (failed) {
  for (const detail of unsupportedDeclarations) console.error(detail);
  results.push({
    detail: unsupportedDeclarations.join("; "),
    name: "contract-declarations",
    status: "failed",
  });
  blockedBy = "contract-declarations";
  results.push(...skippedGateResults(gates, blockedBy));
} else {
  results.push({
    ...(contract
      ? {}
      : { detail: "No task contract is loaded for branch-push verification." }),
    name: "contract-declarations",
    status: contract ? "passed" : "skipped",
  });
  const gateRun = runGates(gates);
  results = [...results, ...gateRun.results];
  failed = gateRun.failed;
  blockedBy = gateRun.results.find(
    (result) => result.status === "failed",
  )?.name;
}
if (failed) {
  results.push(
    ...skippedGateResults([["infrastructure", "az bicep build"]], blockedBy),
  );
} else {
  const hasAzureCli =
    spawnSync("az", ["version"], { stdio: "ignore" }).status === 0;
  if (hasAzureCli) {
    const bicepFiles = existsSync("infra/bicep")
      ? filesWithExtension("infra/bicep", ".bicep").sort()
      : [];
    const command = `az bicep build (${bicepFiles.length} files)`;
    console.log(`\n[verify] infrastructure: ${command}`);
    const failedFile = bicepFiles.find(
      (file) =>
        spawnSync("az", ["bicep", "build", "--file", file, "--stdout"], {
          stdio: "ignore",
        }).status !== 0,
    );
    const status = failedFile ? "failed" : "passed";
    results.push({
      command,
      ...(failedFile ? { detail: `Compilation failed: ${failedFile}` } : {}),
      name: "infrastructure",
      status,
    });
    failed = status === "failed";
    if (failed) blockedBy = "infrastructure";
  } else {
    results.push({
      detail: "Azure CLI unavailable; CI must execute this gate.",
      name: "infrastructure",
      status: "skipped",
    });
    console.log("\n[verify] infrastructure: SKIPPED - Azure CLI unavailable");
  }
}
results.push({
  detail:
    "No browser accessibility runner is installed; component semantics remain covered by review until an approved tool is added.",
  name: "accessibility",
  status: "skipped",
});
const {
  configured: databaseConfigured,
  misconfigured: databaseMisconfigured,
  requiredButMissing: databaseRequiredButMissing,
} = databaseEnvironment({
  ...process.env,
  CI:
    process.env.HARNESS_DATABASE_REQUIRED === "true" ? process.env.CI : "",
});
if (failed) {
  results.push(
    ...skippedGateResults(
      [["database-integration-environment", "validate database environment"]],
      blockedBy,
    ),
  );
} else {
  results.push({
    detail: databaseConfigured
      ? `PostgreSQL integration tests enabled with ${process.env.DATABASE_AUTH} authentication.`
      : databaseRequiredButMissing
        ? "CI requires DATABASE_URL and DATABASE_AUTH=password for PostgreSQL integration tests."
        : databaseMisconfigured
          ? "Set both DATABASE_URL and DATABASE_AUTH to password or entra."
          : "DATABASE_URL absent; PostgreSQL tests report skipped through Vitest.",
    name: "database-integration-environment",
    status: databaseConfigured
      ? "passed"
      : databaseRequiredButMissing || databaseMisconfigured
        ? "failed"
        : "skipped",
  });
  failed = databaseRequiredButMissing || databaseMisconfigured;
  if (failed) blockedBy = "database-integration-environment";
}
const report = {
  completedAt: new Date().toISOString(),
  contract: contractPath ? relative(process.cwd(), contractPath) : null,
  results,
  startedAt: verificationStartedAt,
  status: failed ? "failed" : "passed",
};
const generatedManifestPath = contract
  ? `harness/reports/evidence-${contract.taskId}.json`
  : undefined;
mkdirSync("harness/reports", { recursive: true });
writeFileSync(
  "harness/reports/verify-latest.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
const evidenceErrors =
  !failed && contract
    ? contract.requiredEvidence
        .filter((path) => path !== generatedManifestPath)
        .map((path) => validateEvidence(path, report, changedPaths()))
        .filter(Boolean)
    : [];
report.results.push(
  failed
    ? skippedGateResults(
        [["required-evidence", "validate required evidence"]],
        blockedBy,
      )[0]
    : {
        ...(evidenceErrors.length ? { detail: evidenceErrors.join("; ") } : {}),
        name: "required-evidence",
        status: evidenceErrors.length
          ? "failed"
          : contract
            ? "passed"
            : "skipped",
      },
);
failed ||= evidenceErrors.length > 0;
if (!failed && contract) {
  const git = gitEvidenceContext();
  const manifestPath = generatedManifestPath;
  if (!git.clean) {
    const status = process.env.CI ? "failed" : "skipped";
    report.results.push({
      detail:
        "SHA-bound evidence requires a clean worktree; commit the implementation before final verification.",
      name: "evidence-manifest",
      status,
    });
    failed = status === "failed";
  } else {
    const generatedAt = new Date().toISOString();
    report.status = "passed";
    const manifest = buildEvidenceManifest(
      contract,
      report.contract,
      git,
      report,
      generatedAt,
    );
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const { schema } = evidenceFiles();
    const policy = effectiveEvidencePolicy();
    const manifestErrors = [
      ...validateEvidenceManifest(manifest, contract, git, schema, policy),
      ...validateArtifactRecords(manifest, contract),
      ...validateCurrentState(
        manifest,
        contract,
        policy,
        new Date(),
        report.results
          .filter((result) => result.status === "passed")
          .map((result) => result.name)
          .concat("verify:evidence"),
      ),
    ];
    report.results.push({
      ...(manifestErrors.length
        ? { detail: manifestErrors.join("; ") }
        : { detail: `Validated against ${git.commitSha}.` }),
      name: "evidence-manifest",
      status: manifestErrors.length ? "failed" : "passed",
    });
    failed = manifestErrors.length > 0;
  }
} else {
  report.results.push(
    failed
      ? skippedGateResults(
          [["evidence-manifest", "generate and validate evidence manifest"]],
          blockedBy || "required-evidence",
        )[0]
      : {
          detail: "No task contract is loaded for branch-push verification.",
          name: "evidence-manifest",
          status: "skipped",
        },
  );
}
report.status = failed ? "failed" : "passed";
report.nextState = failed
  ? contract?.repairCycle >= 3
    ? "blocked"
    : "changes-requested"
  : (contract?.workflowState ?? null);
writeFileSync(
  "harness/reports/verify-latest.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
if (failed && contract) {
  const failureDirectory = `harness/reports/failures/${contract.taskId}`;
  const failureName = report.completedAt.replaceAll(":", "-");
  mkdirSync(failureDirectory, { recursive: true });
  writeFileSync(
    `${failureDirectory}/${failureName}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
const retention = guardGeneratedReports(
  "harness/reports",
  readJson("harness/policies/repository-policy.json").forbiddenSecretPatterns,
);
if (!retention.safe) {
  console.error(
    `\n[verify] FAILED - ${retention.findingCount} unsafe or unreadable generated-report finding(s); report artifacts removed`,
  );
  process.exit(1);
}
console.log(
  `\n[verify] ${report.status.toUpperCase()} - evidence: harness/reports/verify-latest.json`,
);
if (failed) process.exit(1);
