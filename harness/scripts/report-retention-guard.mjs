import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  secretPatternFindings,
  secretTextFindings,
} from "./secret-scan.mjs";

function retainedEntries(directory, readDirectory, readMetadata) {
  return readDirectory(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    const metadata = readMetadata(file);
    if (
      metadata.isSymbolicLink() ||
      (!metadata.isDirectory() && !metadata.isFile())
    ) {
      return [{ file, metadata, unsafe: true }];
    }
    return metadata.isDirectory()
      ? retainedEntries(file, readDirectory, readMetadata)
      : [{ file, metadata, unsafe: false }];
  });
}

export function guardGeneratedReports(
  directory,
  patterns,
  readDirectory = readdirSync,
  readMetadata = lstatSync,
) {
  let entries;
  try {
    entries = retainedEntries(directory, readDirectory, readMetadata);
  } catch {
    try {
      rmSync(directory, { force: true, recursive: true });
    } catch {
      // The unsafe result still prevents retention when cleanup cannot complete.
    }
    return { fileCount: 0, findingCount: 1, safe: false };
  }
  const files = entries.filter(({ unsafe }) => !unsafe).map(({ file }) => file);
  const findings = secretPatternFindings(files, patterns);
  const findingCount =
    findings.length + entries.filter(({ unsafe }) => unsafe).length;
  if (findingCount) rmSync(directory, { force: true, recursive: true });
  return {
    fileCount: files.length,
    findingCount,
    safe: findingCount === 0,
  };
}

export function snapshotGeneratedReports(
  sourceDirectory,
  snapshotDirectory,
  patterns,
  beforeOpen = () => {},
) {
  rmSync(snapshotDirectory, { force: true, recursive: true });
  let entries;
  try {
    entries = retainedEntries(sourceDirectory, readdirSync, lstatSync);
  } catch {
    rmSync(sourceDirectory, { force: true, recursive: true });
    return { fileCount: 0, findingCount: 1, safe: false };
  }
  let findingCount = entries.filter(({ unsafe }) => unsafe).length;
  let fileCount = 0;
  for (const entry of entries.filter(({ unsafe }) => !unsafe)) {
    let descriptor;
    try {
      beforeOpen(entry.file);
      descriptor = openSync(
        entry.file,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const openedMetadata = fstatSync(descriptor);
      if (
        !openedMetadata.isFile() ||
        openedMetadata.dev !== entry.metadata.dev ||
        openedMetadata.ino !== entry.metadata.ino
      ) {
        throw new Error("file identity changed");
      }
      const content = readFileSync(descriptor);
      const readMetadata = fstatSync(descriptor);
      if (
        readMetadata.size !== openedMetadata.size ||
        readMetadata.mtimeMs !== openedMetadata.mtimeMs ||
        readMetadata.ctimeMs !== openedMetadata.ctimeMs
      ) {
        throw new Error("file changed while being read");
      }
      const retainedPath = relative(sourceDirectory, entry.file);
      findingCount += secretTextFindings(
        retainedPath,
        content.toString("utf8"),
        patterns,
      ).length;
      if (findingCount) continue;
      const destination = join(
        snapshotDirectory,
        retainedPath,
      );
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content, { mode: 0o600 });
      fileCount += 1;
    } catch {
      findingCount += 1;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }
  if (findingCount) {
    rmSync(sourceDirectory, { force: true, recursive: true });
    rmSync(snapshotDirectory, { force: true, recursive: true });
  }
  return { fileCount, findingCount, safe: findingCount === 0 };
}