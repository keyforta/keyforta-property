#!/usr/bin/env node
import {
  governanceSummary,
  loadAgentGovernance,
  validateAgentGovernance,
} from "./agent-lib.mjs";

const governance = loadAgentGovernance();
const errors = validateAgentGovernance(governance);
if (errors.length) {
  console.error("Agent governance invalid:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Agent governance valid: ${governanceSummary(governance)}`);
