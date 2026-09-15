import { readFileSync } from "node:fs";
import { buildEvidenceManifest, sha256 } from "../edd-lib.mjs";
import { loadAgentGovernance } from "../agent-lib.mjs";
import { readJson } from "../lib.mjs";
import { loadSkills } from "../skill-lib.mjs";

export const schema = readJson("harness/schemas/task-contract.schema.json");
export const policy = readJson("harness/policies/repository-policy.json");
export const valid = readJson("harness/tasks/repository-neutral-example.json");
export const evidencePolicy = readJson("harness/policies/evidence-gates.json");
export const evidenceSchema = readJson(
  "harness/schemas/evidence-manifest.schema.json",
);
export const agentGovernance = loadAgentGovernance({ loadBase: false });
export const skills = loadSkills();
export const skillGovernance = {
  activation: agentGovernance.activation,
  evidencePolicy,
  registry: agentGovernance.registry,
  routing: agentGovernance.routing,
};
export const fixtureText = readFileSync(
  "harness/fixtures/synthetic-task.json",
  "utf8",
);
export const syntheticGit = {
  branch: "test/edd",
  changedFiles: ["harness/fixtures/example.json"],
  clean: true,
  commitSha: "a".repeat(40),
  committedAt: "2026-09-11T00:00:00.000Z",
};

export function syntheticManifest() {
  const checkResult = {
    artifactReferences: [],
    status: "not-applicable",
    summary: "Not applicable to the repository-neutral self-test.",
  };
  return {
    accessibilityResults: checkResult,
    automatedChecks: [
      {
        evidenceReference: "harness/reports/self-test-latest.json",
        name: "verify:task",
        status: "passed",
      },
    ],
    architectureResults: checkResult,
    artifactRecords: [
      {
        capturedAt: "2026-09-11T00:02:00.000Z",
        kind: "task-contract",
        reference: "harness/tasks/repository-neutral-example.json",
        sections: ["scope"],
        sha256: sha256("harness/tasks/repository-neutral-example.json"),
      },
    ],
    branch: syntheticGit.branch,
    changedFiles: syntheticGit.changedFiles,
    classification: valid.classification,
    commands: [
      {
        command: "pnpm harness:self-test",
        completedAt: "2026-09-11T00:02:00.000Z",
        exitCode: 0,
        startedAt: "2026-09-11T00:01:00.000Z",
      },
    ],
    commitSha: syntheticGit.commitSha,
    coverageResults: checkResult,
    infrastructureResults: checkResult,
    issueReference: valid.issueReference,
    knownFailures: [],
    repairCycle: 0,
    requirementReferences: valid.requirementReferences,
    responsibleAgent: valid.assignedAgent,
    rollback: {
      evidenceReferences: [],
      procedure: valid.rollbackConsiderations,
      validated: false,
    },
    runtimeVersions: { node: process.version },
    securityFindings: checkResult,
    taskId: valid.taskId,
    testResults: checkResult,
    timestamps: {
      generatedAt: "2026-09-11T00:02:00.000Z",
      verificationCompletedAt: "2026-09-11T00:02:00.000Z",
      verificationStartedAt: "2026-09-11T00:01:00.000Z",
    },
    toolVersions: { harness: "1" },
    traceability: [
      {
        acceptanceCriterion: "AC-001",
        changedFiles: syntheticGit.changedFiles,
        issueReference: valid.issueReference,
        requirementReference: "AGENTS.md#engineering-loop",
        taskContractReference: "harness/tasks/repository-neutral-example.json",
        technicalDecisionReferences: valid.technicalDecisionReferences,
        testReferences: ["harness/scripts/self-test.mjs"],
        verificationReferences: ["harness/reports/self-test-latest.json"],
      },
    ],
    visualEvidence: [],
    waivers: [],
    workflowState: valid.workflowState,
  };
}
