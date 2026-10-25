import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const sourcePaths = [
  "infra/bicep/company-development.bicep",
  "infra/bicep/modules/company-development-resources.bicep",
  "infra/bicep/modules/foundation-resources.bicep",
  "scripts/infra/company-development.mjs",
  "scripts/infra/company-development-apply.mjs",
  "scripts/infra/company-development-state.mjs",
  ".github/workflows/company-development-foundation.yml",
  ".github/workflows/company-development-foundation-apply.yml",
  "scripts/verify/company-foundation-parser.py",
];

// Synthetic commits ONLY in a new temporary repository. Never stage/commit the
// development worktree or pretend its currently uncommitted files are reviewed.
export function sourceFixture({ untracked = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "company-source-fixture-"));
  const git = (...args) => execFileSync("git", [
    "-C", root, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
    "-c", "user.name=Synthetic fixture", "-c", "user.email=fixture@example.invalid", ...args,
  ], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).trim();
  git("init", "--quiet");
  for (const path of sourcePaths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), `// synthetic committed fixture: ${path}\n`);
  }
  writeFileSync(join(root, "package.json"), '{"private":true}\n');
  git("add", "--", "package.json", ...sourcePaths.filter((path) => !untracked.includes(path)));
  git("commit", "--quiet", "--no-verify", "-m", "Synthetic source fixture");
  return { root, revision: git("rev-parse", "HEAD"), git };
}
