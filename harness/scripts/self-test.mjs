#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReporter, reportResults } from "./self-test/reporter.mjs";
import { runSuites } from "./self-test/runner.mjs";

const reportPath = "harness/reports/self-test-latest.json";
const suiteDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "self-test",
);
mkdirSync(dirname(reportPath), { recursive: true });
const { api, checks } = createReporter();
await runSuites(suiteDirectory, api);
const report = reportResults(checks, reportPath);
if (report.status === "failed") process.exit(1);
console.log(
  "Harness self-test passed; evidence written to harness/reports/self-test-latest.json",
);
