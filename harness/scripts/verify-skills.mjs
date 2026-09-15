#!/usr/bin/env node
import { readJson } from "./lib.mjs";
import { loadSkills, validateSkills } from "./skill-lib.mjs";

const skills = loadSkills();
const errors = validateSkills(skills, {
  activation: readJson("harness/policies/agent-activation.json"),
  evidencePolicy: readJson("harness/policies/evidence-gates.json"),
  registry: readJson("harness/policies/agent-registry.json"),
  routing: readJson("harness/policies/agent-routing.json"),
});

if (errors.length) {
  console.error("Agent Skills validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Agent Skills valid: ${skills.length} project skills`);
