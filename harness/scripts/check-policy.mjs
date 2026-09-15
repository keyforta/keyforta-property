#!/usr/bin/env node
import { resolve } from "node:path";
import {
  activeContractPath,
  changedPaths,
  evaluatePaths,
  readJson,
} from "./lib.mjs";

const paths = process.argv.length > 2 ? process.argv.slice(2) : changedPaths();
const contract = readJson(activeContractPath(paths));
const policy = readJson(resolve("harness/policies/repository-policy.json"));
const result = evaluatePaths(paths, contract, policy);
if (result.unauthorized.length)
  console.error(`Unauthorized paths:\n- ${result.unauthorized.join("\n- ")}`);
if (result.protectedWithoutApproval.length)
  console.error(
    `Protected paths without approval:\n- ${result.protectedWithoutApproval.join("\n- ")}`,
  );
if (result.unauthorized.length || result.protectedWithoutApproval.length)
  process.exit(1);
console.log(
  `Repository policy passed for ${paths.length} changed path(s). Protected-path declarations do not replace CODEOWNERS approval.`,
);
