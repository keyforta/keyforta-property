#!/usr/bin/env node
import { activeContractPath, changedPaths, readJson } from "./lib.mjs";
import { effectiveEvidencePolicy, validateClassification } from "./edd-lib.mjs";

const contract = readJson(activeContractPath());
const policy = effectiveEvidencePolicy();
const paths = changedPaths();
const errors = validateClassification(contract, paths, policy);
if (errors.length) {
  console.error(`Task classification invalid: ${contract.classification}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(
  `Task classification valid: ${contract.classification} (${paths.length} changed paths)`,
);
