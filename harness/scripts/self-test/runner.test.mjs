import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createReporter, reportResults } from "./reporter.mjs";
import { discoverSuites, runSuites } from "./runner.mjs";

async function withSuiteDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "keyforta-self-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("discovers and runs suite files in deterministic filename order", async () => {
  await withSuiteDirectory(async (directory) => {
    await writeFile(
      join(directory, "20-second.suite.mjs"),
      'export function registerSuite(api) { api.push("second"); }\n',
    );
    await writeFile(
      join(directory, "10-first.suite.mjs"),
      'export function registerSuite(api) { api.push("first"); }\n',
    );
    await writeFile(
      join(directory, "ignored.mjs"),
      'throw new Error("must not load");\n',
    );

    assert.deepEqual(await discoverSuites(directory), [
      "10-first.suite.mjs",
      "20-second.suite.mjs",
    ]);
    const registrations = [];
    assert.deepEqual(await runSuites(directory, registrations), [
      "10-first.suite.mjs",
      "20-second.suite.mjs",
    ]);
    assert.deepEqual(registrations, ["first", "second"]);
  });
});

test("rejects malformed suite exports", async () => {
  await withSuiteDirectory(async (directory) => {
    await writeFile(
      join(directory, "10-invalid.suite.mjs"),
      "export const registerSuite = false;\n",
    );
    await assert.rejects(
      runSuites(directory, {}),
      /Invalid suite 10-invalid\.suite\.mjs: expected only a registerSuite function export/,
    );
  });
});

test("rejects an empty suite directory", async () => {
  await withSuiteDirectory(async (directory) => {
    await assert.rejects(
      runSuites(directory, {}),
      new RegExp(`No self-test suites found in ${directory}`),
    );
  });
});

test("records assertion failures and preserves report and console shape", async () => {
  await withSuiteDirectory(async (directory) => {
    const { api, checks } = createReporter();
    api.check("passing assertion", () => true);
    api.check("failing assertion", () => false);
    api.skip("offline assertion", "Offline by design.");
    const reportPath = join(directory, "report.json");
    const lines = [];
    const report = reportResults(checks, reportPath, (line) =>
      lines.push(line),
    );

    assert.deepEqual(report, {
      checks: [
        { name: "passing assertion", status: "passed" },
        {
          name: "failing assertion",
          status: "failed",
          detail: "assertion returned false",
        },
        {
          name: "offline assertion",
          status: "skipped",
          detail: "Offline by design.",
        },
      ],
      status: "failed",
    });
    assert.deepEqual(lines, [
      "PASSED: passing assertion",
      "FAILED: failing assertion - assertion returned false",
      "SKIPPED: offline assertion - Offline by design.",
    ]);
    assert.deepEqual(JSON.parse(await readFile(reportPath, "utf8")), report);
  });
});
