#!/usr/bin/env node
import { activeContractPath, readJson } from "./lib.mjs";
import {
  evidenceFiles,
  effectiveEvidencePolicy,
  gitEvidenceContext,
  validateArtifactRecords,
  validateEvidenceManifest,
} from "./edd-lib.mjs";

const contract = readJson(activeContractPath());
const manifestPath =
  process.env.EDD_MANIFEST ||
  `harness/reports/evidence-${contract.taskId}.json`;
const manifest = readJson(manifestPath);
const git = gitEvidenceContext();
const { schema } = evidenceFiles();
const policy = effectiveEvidencePolicy();
const errors = [
  ...validateEvidenceManifest(manifest, contract, git, schema, policy),
  ...validateArtifactRecords(manifest, contract),
];
if (errors.length) {
  console.error(`Evidence manifest invalid: ${manifestPath}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Evidence manifest valid: ${manifestPath}`);
