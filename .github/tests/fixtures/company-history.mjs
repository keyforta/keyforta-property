// TEST ONLY. Historical source bytes are Git content-addressed, never rewritten
// or replaced by current files. HTTPS authenticates the fixed public origin;
// gh supplies credentials if Git requests them. No CI token/settings change.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Do not statically import runtime validation here: that would load it before
// the synthetic fixture loader registers its isolated test-only bindings.
const revisions = ["6216a0c95b49f522fecf1c28d8ba3405f1a93a43", "6fccaa9ca066e32fde2870858adc1334525a7423"];

export function ensureCompanyHistory(root = process.cwd(), invoke = (args) =>
  execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "pipe"] })) {
  const present = revisions.every((revision) => {
    try { invoke(["cat-file", "-e", `${revision}^{commit}`]); return true; }
    catch { return false; }
  });
  if (!present) {
    // Exact objects only, not a moving branch, arbitrary origin or silent
    // fallback. Avoid shared FETCH_HEAD/ref locks in parallel test workers.
    invoke(["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential",
      "fetch", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance",
      "https://github.com/keyforta/keyforta-property.git", ...revisions]);
  }
  for (const revision of revisions) {
    assert.equal(invoke(["rev-parse", "--verify", `${revision}^{commit}`]).toString().trim(),
      revision, "Pinned history identity mismatch");
  }
  invoke(["merge-base", "--is-ancestor", ...revisions]);
}
