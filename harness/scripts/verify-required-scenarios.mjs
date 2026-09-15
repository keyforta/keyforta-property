#!/usr/bin/env node
import { activeContractPath, readJson } from "./lib.mjs";

const skillScenarioAssertions = new Set([
  "valid-skill-discovery",
  "incomplete-skill-rejection",
  "unknown-agent-rejection",
  "approval-bypass-rejection",
  "production-deployment-rejection",
]);

const contract = readJson(activeContractPath());
const report = readJson("harness/reports/self-test-latest.json");
const passedAssertions = new Set(
  report.status === "passed" && Array.isArray(report.checks)
    ? report.checks
        .filter((check) => check.status === "passed")
        .map((check) => check.name)
    : [],
);
const missing = contract.requiredScenarios.filter(
  (scenario) =>
    skillScenarioAssertions.has(scenario) && !passedAssertions.has(scenario),
);

if (missing.length) {
  console.error(`Missing passing assertions: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("Required task scenarios have passing harness assertions");
