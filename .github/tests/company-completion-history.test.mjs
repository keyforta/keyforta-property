import assert from "node:assert/strict";
import test from "node:test";

const revisions = ["6216a0c95b49f522fecf1c28d8ba3405f1a93a43", "6fccaa9ca066e32fde2870858adc1334525a7423"];
const load = () => import("./fixtures/company-history.mjs");

test("missing pinned history is explicitly fetched from the authenticated fixed repository", async () => {
  const { ensureCompanyHistory } = await load();
  const calls = [];
  let fetched = false;
  const git = (args) => {
    calls.push(args);
    if (args.includes("fetch")) { fetched = true; return Buffer.alloc(0); }
    if (!fetched) throw new Error("Missing pinned object");
    return Buffer.from(args[0] === "rev-parse" ? `${args.at(-1).replace("^{commit}", "")}\n` : "");
  };
  ensureCompanyHistory("/synthetic", git);
  assert.deepEqual(calls.filter((args) => args.includes("fetch")), [[
    "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential",
    "fetch", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance",
    "https://github.com/keyforta/keyforta-property.git", ...revisions,
  ]]);
  for (const revision of revisions) {
    assert.ok(calls.some((args) => args[0] === "rev-parse" && args.at(-1) === `${revision}^{commit}`));
  }
});

test("history retrieval fails closed on fetch failure or wrong returned commit; no fallback or skip", async () => {
  const { ensureCompanyHistory } = await load();
  assert.throws(() => ensureCompanyHistory("/synthetic", () => { throw new Error("Unavailable authenticated history"); }),
    /Unavailable authenticated history/);
  assert.throws(() => ensureCompanyHistory("/synthetic", (args) =>
    Buffer.from(args[0] === "rev-parse" ? `${"a".repeat(40)}\n` : "")), /Pinned history identity/);
});

test("present exact pinned history is validated without network access", async () => {
  const { ensureCompanyHistory } = await load();
  const calls = [];
  ensureCompanyHistory("/synthetic", (args) => {
    calls.push(args);
    return Buffer.from(args[0] === "rev-parse" ? `${args.at(-1).replace("^{commit}", "")}\n` : "");
  });
  assert.ok(!calls.some((args) => args.includes("fetch")));
  assert.ok(calls.some((args) => args[0] === "merge-base"));
});

test("test setup pins are exactly the unmodified runtime historical source revisions", async () => {
  const { original, baselineRevision } = await import("../../scripts/infra/company-development-completion-validation.mjs");
  assert.deepEqual(revisions, [original.sha, baselineRevision]);
});
