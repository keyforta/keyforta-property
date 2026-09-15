import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { secretPatternFindings } from "./secret-scan.mjs";

function jsonFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory()
      ? jsonFiles(file)
      : file.endsWith(".json")
        ? [file]
        : [];
  });
}

export function guardGeneratedReports(directory, patterns) {
  let files;
  try {
    files = jsonFiles(directory);
  } catch {
    return { fileCount: 0, findingCount: 1, safe: false };
  }
  const findings = secretPatternFindings(files, patterns);
  if (findings.length) rmSync(directory, { force: true, recursive: true });
  return {
    fileCount: files.length,
    findingCount: findings.length,
    safe: findings.length === 0,
  };
}