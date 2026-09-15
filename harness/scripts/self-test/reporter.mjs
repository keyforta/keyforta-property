import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function createReporter() {
  const checks = [];
  const api = Object.freeze({
    check(name, assertion) {
      try {
        if (!assertion()) throw new Error("assertion returned false");
        checks.push({ name, status: "passed" });
      } catch (error) {
        checks.push({
          name,
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    },
    skip(name, detail) {
      checks.push({ name, status: "skipped", detail });
    },
  });
  return { api, checks };
}

export function reportResults(checks, reportPath, log = console.log) {
  const failed = checks.filter((item) => item.status === "failed");
  const report = { checks, status: failed.length ? "failed" : "passed" };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const item of checks) {
    log(
      `${item.status.toUpperCase()}: ${item.name}${item.detail ? ` - ${item.detail}` : ""}`,
    );
  }
  return report;
}
