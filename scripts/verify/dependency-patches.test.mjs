import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

// Targeted lockfile regressions, not a replacement for pnpm audit. Keep the
// independent high-severity audit gate enabled. The separately tested,
// parent-scoped Azure Identity / MSAL override is documented under
// docs/engineering/dependency-security-overrides.md.
const lock = parse(readFileSync(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8"));
const patchedVersions = [
  ["next", "16.4.1"],
  ["source-map-js", "1.2.2"],
  ["sharp", "0.35.5"],
  ["vite", "7.3.7"],
  ["storybook", "10.6.2"],
  ["dompurify", "3.4.17"],
  ["zod", "4.6.6"],
];

for (const [name, patched] of patchedVersions) {
  test(`security patch regression: every locked ${name} is at least ${patched}`, () => {
    const versions = Object.keys(lock.packages)
      .filter((key) => key.startsWith(`${name}@`))
      .map((key) => key.slice(name.length + 1));
    assert.ok(versions.length > 0, `${name} must remain covered by this regression`);
    for (const version of versions) {
      // These targets deliberately stay on their existing major. A future
      // major migration must revisit this assertion rather than silently pass.
      assert.match(version, /^\d+\.\d+\.\d+$/);
      const actual = version.split(".").map(Number);
      const minimum = patched.split(".").map(Number);
      assert.equal(actual[0], minimum[0], `${name}: unexpected major migration`);
      assert.ok(
        actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2]),
        `${name}@${version} predates security patch ${patched}`,
      );
    }
  });
}
