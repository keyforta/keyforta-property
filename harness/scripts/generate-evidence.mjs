#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";

import { activeContractPath, readJson } from "./lib.mjs";
import { buildEvidenceManifest, gitEvidenceContext } from "./edd-lib.mjs";

const contractPath = activeContractPath();
const contract = readJson(contractPath);
const git = gitEvidenceContext();
const report = readJson("harness/reports/verify-latest.json");
const manifest = buildEvidenceManifest(
  contract,
  contractPath.replace(`${process.cwd()}/`, ""),
  git,
  report,
  new Date().toISOString(),
);
const manifestPath = `harness/reports/evidence-${contract.taskId}.json`;
mkdirSync("harness/reports", { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Evidence manifest generated: ${manifestPath}`);
