#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const trackedDistFiles = trackedFiles.filter((file) =>
  /(^|\/)dist\//.test(file),
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
]) {
  execFileSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", generatedFile],
    { stdio: "ignore" },
  );
}

console.log("Generated dist directories are ignored and absent from Git tracking.");