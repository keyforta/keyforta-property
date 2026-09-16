import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sharedPackages = ["contracts", "auth", "authorization"];
const forbiddenDependencies = [
  "apps/",
  "@keyforta/api",
  "@keyforta/ui",
  "@azure/",
  "fastify",
  "react",
  "vite",
];

function moduleSpecifiers(source) {
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return [
    ...new Set(patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]))),
  ];
}

function isForbidden(file, specifier) {
  const dependency = specifier.startsWith(".")
    ? relative(process.cwd(), resolve(dirname(file), specifier))
    : specifier;
  return forbiddenDependencies.some(
    (prefix) => dependency === prefix.replace(/\/$/, "") || dependency.startsWith(prefix),
  );
}

export function sourceBoundaryFindings(file, source) {
  return moduleSpecifiers(source)
    .filter((specifier) => isForbidden(file, specifier))
    .map((specifier) => `${file}: forbidden dependency ${specifier}`);
}

function walk(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const target = join(root, entry);
    return statSync(target).isDirectory() ? walk(target) : [target];
  });
}

function packageBoundaryFindings(file) {
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  };
  return Object.keys(dependencies)
    .filter((dependency) => isForbidden(file, dependency))
    .map((dependency) => `${file}: forbidden dependency ${dependency}`);
}

export function checkArchitecture(files) {
  return files.flatMap((file) => {
    try {
      return file.endsWith("package.json")
        ? packageBoundaryFindings(file)
        : sourceBoundaryFindings(file, readFileSync(file, "utf8"));
    } catch (error) {
      return [`${file}: architecture check failed: ${error.message}`];
    }
  });
}

function repositoryFiles() {
  return sharedPackages.flatMap((packageName) => [
    `packages/${packageName}/package.json`,
    ...walk(`packages/${packageName}/src`).filter((file) => /\.[cm]?[jt]sx?$/.test(file)),
  ]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  const checkedFiles = files.length ? files : repositoryFiles();
  const findings = checkArchitecture(checkedFiles);
  if (findings.length) {
    console.error(findings.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Architecture boundaries passed for ${checkedFiles.length} file(s).`);
  }
}