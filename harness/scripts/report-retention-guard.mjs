import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { secretPatternFindings } from "./secret-scan.mjs";

function jsonFiles(directory, readDirectory) {
  return readDirectory(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory()
      ? jsonFiles(file, readDirectory)
      : file.endsWith(".json")
        ? [file]
        : [];
  });
}

export function guardGeneratedReports(
  directory,
  patterns,
  readDirectory = readdirSync,
) {
  let files;
  try {
    files = jsonFiles(directory, readDirectory);
  } catch {
    try {
      rmSync(directory, { force: true, recursive: true });
    } catch {
      // The unsafe result still prevents retention when cleanup cannot complete.
    }
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