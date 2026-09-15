#!/usr/bin/env node
import { readJson } from "./lib.mjs";
import { guardGeneratedReports } from "./report-retention-guard.mjs";

const policy = readJson("harness/policies/repository-policy.json");
const result = guardGeneratedReports(
  "harness/reports",
  policy.forbiddenSecretPatterns,
);
if (!result.safe) {
  console.error(
    `Generated report retention blocked: ${result.findingCount} unsafe or unreadable file finding(s); report artifacts removed.`,
  );
  process.exit(1);
}
console.log(`Generated report retention check passed for ${result.fileCount} file(s).`);