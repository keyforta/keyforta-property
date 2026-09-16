import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const forbiddenPatterns = [
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /(?:AZURE_CLIENT_SECRET|ENTRA_CLIENT_SECRET|DATABASE_PASSWORD|DB_PASSWORD|API_KEY|SAS_TOKEN|REFRESH_TOKEN|SIGNING_KEY)\s*[:=]\s*["']?(?!<|\$\{|process\.env|example|synthetic)[^\s"']{8,}/,
  /AccountKey=[A-Za-z0-9+/=]{16,}/,
  /(?:^|[?&])sig=[A-Za-z0-9%+/=]{16,}/,
];

export function secretFindings(file, source) {
  return forbiddenPatterns
    .filter((pattern) => pattern.test(file) || pattern.test(source))
    .map(() => `${file}: matches a forbidden secret pattern`);
}

function repositoryFiles() {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
}

export function scanSecrets(files) {
  const findings = [];
  for (const file of files) {
    try {
      findings.push(...secretFindings(file, readFileSync(file, "utf8")));
    } catch {
      findings.push(`${file}: could not be read during secret scanning`);
    }
  }
  return findings;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  const scannedFiles = files.length ? files : repositoryFiles();
  const findings = scanSecrets(scannedFiles);
  if (findings.length) {
    console.error(findings.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Secret scan passed for ${scannedFiles.length} file(s).`);
  }
}