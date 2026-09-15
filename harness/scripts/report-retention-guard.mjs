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
import { dirname, join } from "node:path";
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

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function openedDirectory(directory) {
  const descriptor = openSync(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  const metadata = fstatSync(descriptor);
  if (!metadata.isDirectory()) {
    closeSync(descriptor);
    throw new Error("report source is not a directory");
  }
  const descriptorPath =
    process.platform === "linux"
      ? `/proc/self/fd/${descriptor}`
      : directory;
  if (
    descriptorPath === directory &&
    !sameIdentity(metadata, lstatSync(directory))
  ) {
    closeSync(descriptor);
    throw new Error("report directory identity changed");
  }
  return { descriptor, descriptorPath, metadata };
}

function snapshotEntries(sourceDirectory) {
  const descriptors = [];
  const walk = (directory, retainedDirectory = "") => {
    const opened = openedDirectory(directory);
    descriptors.push(opened.descriptor);
    const entries = readdirSync(opened.descriptorPath, {
      withFileTypes: true,
    }).flatMap((entry) => {
      const retainedPath = join(retainedDirectory, entry.name);
      const openPath = join(opened.descriptorPath, entry.name);
      const entryMetadata = lstatSync(openPath);
      if (entryMetadata.isDirectory()) {
        return walk(openPath, retainedPath);
      }
      return [{
        file: join(sourceDirectory, retainedPath),
        metadata: entryMetadata,
        openPath,
        retainedPath,
        unsafe: !entryMetadata.isFile(),
      }];
    });
    if (
      opened.descriptorPath === directory &&
      !sameIdentity(opened.metadata, lstatSync(directory))
    ) {
      throw new Error("report directory identity changed");
    }
    return entries;
  };
  try {
    return { descriptors, entries: walk(sourceDirectory) };
  } catch (error) {
    for (const descriptor of descriptors.reverse()) closeSync(descriptor);
    throw error;
  }
}

function reportText(content) {
  if (content.includes(0)) throw new Error("report contains NUL bytes");
  return new TextDecoder("utf-8", { fatal: true }).decode(content);
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
  let sourceDescriptors;
  let entries;
  try {
    ({ descriptors: sourceDescriptors, entries } =
      snapshotEntries(sourceDirectory));
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
        entry.openPath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
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
      const entryFindingCount = secretTextFindings(
        entry.retainedPath,
        reportText(content),
        patterns,
      ).length;
      findingCount += entryFindingCount;
      if (entryFindingCount) continue;
      const destination = join(snapshotDirectory, entry.retainedPath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content, { mode: 0o444 });
      fileCount += 1;
    } catch {
      findingCount += 1;
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }
  for (const descriptor of sourceDescriptors.reverse()) closeSync(descriptor);
  if (findingCount) {
    rmSync(sourceDirectory, { force: true, recursive: true });
    rmSync(snapshotDirectory, { force: true, recursive: true });
  }
  return { fileCount, findingCount, safe: findingCount === 0 };
}