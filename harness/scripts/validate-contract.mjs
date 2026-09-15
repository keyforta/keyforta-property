#!/usr/bin/env node
import { resolve } from "node:path";
import { effectiveEvidencePolicy, validateStateHistory } from "./edd-lib.mjs";
import { activeContractPath, readJson, validateTaskContract } from "./lib.mjs";

const contractPath = resolve(process.argv[2] || activeContractPath());
const schema = readJson(resolve("harness/schemas/task-contract.schema.json"));
const contract = readJson(contractPath);
const errors = validateTaskContract(contract, schema);
errors.push(...validateStateHistory(contract, effectiveEvidencePolicy()));
if (errors.length) {
  console.error(`Task contract invalid: ${contractPath}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(
  `Task contract valid: ${contract.taskId} (${contract.workflowState})`,
);
