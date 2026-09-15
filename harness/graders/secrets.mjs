#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readJson } from "../scripts/lib.mjs";

const policy = readJson("harness/policies/repository-policy.json");
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);
const findings = [];
for (const file of files) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of policy.forbiddenSecretPatterns) {
    if (new RegExp(pattern).test(source))
      findings.push(`${file}: matches forbidden secret pattern`);
  }
}
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log(`Secret pattern scan passed for ${files.length} tracked file(s).`);
