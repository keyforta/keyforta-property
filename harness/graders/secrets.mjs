#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readJson } from "../scripts/lib.mjs";
import { secretPatternFindings } from "../scripts/secret-scan.mjs";

const policy = readJson("harness/policies/repository-policy.json");
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);
const findings = secretPatternFindings(files, policy.forbiddenSecretPatterns);
if (findings.length) {
  console.error(findings.map((finding) => finding.message).join("\n"));
  process.exit(1);
}
console.log(`Secret pattern scan passed for ${files.length} tracked file(s).`);
