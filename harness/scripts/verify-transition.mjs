#!/usr/bin/env node
import { activeContractPath, readJson } from "./lib.mjs";
import {
  evidenceFiles,
  effectiveEvidencePolicy,
  gitEvidenceContext,
  validateArtifactRecords,
  validateCurrentState,
  validateEvidenceManifest,
  validateStateHistory,
  validateTransition,
} from "./edd-lib.mjs";

const contract = readJson(activeContractPath());
const from = process.env.EDD_TRANSITION_FROM || contract.workflowState;
const to = process.env.EDD_TRANSITION_TO;
const policy = evidenceFiles().policy;
const effectivePolicy = effectiveEvidencePolicy(process.env, policy);
if (!to) {
  const historyErrors = validateStateHistory(contract, effectivePolicy);
  if (historyErrors.length) {
    console.error(`Workflow history invalid: ${from}`);
    for (const error of historyErrors) console.error(`- ${error}`);
    process.exit(1);
  }
  if (
    ![
      ...effectivePolicy.orderedStates,
      ...effectivePolicy.exceptionStates,
    ].includes(from)
  ) {
    console.error(`Unknown workflow state: ${from}`);
    process.exit(1);
  }
  if (process.env.EDD_VALIDATE_CURRENT_STATE === "true") {
    const manifestPath =
      process.env.EDD_MANIFEST ||
      `harness/reports/evidence-${contract.taskId}.json`;
    const manifest = readJson(manifestPath);
    const externallySatisfiedChecks = (process.env.EDD_SATISFIED_CHECKS ?? "")
      .split(",")
      .map((check) => check.trim())
      .filter(Boolean);
    const currentStateErrors = [
      ...validateArtifactRecords(manifest, contract),
      ...validateCurrentState(
        manifest,
        contract,
        effectivePolicy,
        new Date(),
        manifest.automatedChecks
          .filter((check) => check.status === "passed")
          .map((check) => check.name)
          .concat(externallySatisfiedChecks),
      ),
    ];
    if (currentStateErrors.length) {
      console.error(`Current workflow state denied: ${from}`);
      for (const error of currentStateErrors) console.error(`- ${error}`);
      process.exit(1);
    }
  }
  console.log(
    `Workflow state valid: ${from}; ${process.env.EDD_VALIDATE_CURRENT_STATE === "true" ? "current transition evidence validated" : "current transition evidence is validated during final CI"}; approvals are enforced by GitHub repository controls.`,
  );
  process.exit(0);
}
const manifestPath =
  process.env.EDD_MANIFEST ||
  `harness/reports/evidence-${contract.taskId}.json`;
const manifest = readJson(manifestPath);
const { schema } = evidenceFiles();
const errors = [
  ...validateEvidenceManifest(
    manifest,
    contract,
    gitEvidenceContext(),
    schema,
    effectivePolicy,
  ),
  ...validateArtifactRecords(manifest, contract),
  ...validateTransition(manifest, from, to, effectivePolicy, new Date(), [
    "verify:evidence",
    "verify:transition",
  ]),
];
if (errors.length) {
  console.error(`Transition denied: ${from} -> ${to}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Transition permitted: ${from} -> ${to}`);
