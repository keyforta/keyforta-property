#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const trackedDistFiles = trackedFiles.filter((file) =>
  /(^|\/)(?:dist|\.next)\//.test(file),
);

assert.deepEqual(
  trackedDistFiles,
  [],
  `Generated dist files must not be tracked:\n${trackedDistFiles.join("\n")}`,
);

for (const generatedFile of [
  "dist/index.html",
  "apps/api/dist/server.js",
  "apps/admin-web/dist/index.html",
  "apps/portal-web/dist/index.html",
  "apps/public-web/.next/standalone/apps/public-web/server.js",
]) {
  execFileSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", generatedFile],
    { stdio: "ignore" },
  );
}

console.log("Generated dist and Next.js directories are ignored and absent from Git tracking.");