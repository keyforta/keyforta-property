import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const suiteSuffix = ".suite.mjs";

export async function discoverSuites(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const invalidEntries = entries
    .filter((entry) => entry.name.endsWith(suiteSuffix) && !entry.isFile())
    .map((entry) => entry.name)
    .sort();
  if (invalidEntries.length > 0) {
    throw new Error(
      `Suite paths must be regular files: ${invalidEntries.join(", ")}`,
    );
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suiteSuffix))
    .map((entry) => entry.name)
    .sort();
}

export async function runSuites(directory, api) {
  const suiteNames = await discoverSuites(directory);
  if (suiteNames.length === 0) {
    throw new Error(`No self-test suites found in ${directory}`);
  }
  for (const suiteName of suiteNames) {
    const suitePath = resolve(directory, suiteName);
    const suite = await import(pathToFileURL(suitePath));
    const exportNames = Object.keys(suite).sort();
    if (
      exportNames.length !== 1 ||
      exportNames[0] !== "registerSuite" ||
      typeof suite.registerSuite !== "function"
    ) {
      throw new Error(
        `Invalid suite ${suiteName}: expected only a registerSuite function export`,
      );
    }
    await suite.registerSuite(api);
  }
  return suiteNames;
}
