import { pathToFileURL } from "node:url";

const EXCEPTION_MARKER = /-\s*\[x\]\s*This is a documentation\/process\/configuration-only change/i;

const SECTIONS = [
  { key: "before", heading: /^##\s+Before evidence/im },
  { key: "red", heading: /^##\s+Failing test \(red\)/im },
  { key: "after", heading: /^##\s+After evidence/im },
  { key: "green", heading: /^##\s+Passing test \(green\)/im },
];

function sectionBody(body, heading) {
  const match = heading.exec(body);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const nextHeading = /^##\s+/m.exec(rest);
  const end = nextHeading ? nextHeading.index : rest.length;
  return rest.slice(0, end).trim();
}

function isPlaceholder(text) {
  if (!text) return true;
  const stripped = text.replace(/<!--[\s\S]*?-->/g, "").trim();
  return stripped.length === 0;
}

/**
 * Validate a PR description against AGENTS.md's Engineering loop evidence
 * requirement: before evidence, red test, after evidence, green test — in
 * order — unless the documentation/process/configuration-only exception box
 * is checked, in which case "before"/"after" must instead contain a
 * deterministic reproducible check (and the red/green test sections are not
 * required).
 *
 * Returns an array of human-readable violation strings (empty = compliant).
 */
export function checkPrEvidence(body) {
  if (typeof body !== "string" || body.trim().length === 0) {
    return ["PR description is empty; the required evidence sections are missing."];
  }

  const isDocException = EXCEPTION_MARKER.test(body);
  const violations = [];

  const positions = SECTIONS.map(({ key, heading }) => {
    const match = heading.exec(body);
    return { key, index: match ? match.index : -1 };
  });

  for (const { key, index } of positions) {
    const required = isDocException ? key === "before" || key === "after" : true;
    if (!required) continue;
    if (index === -1) {
      const label = key === "red" ? "Failing test (red)" : key === "green" ? "Passing test (green)" : `${key[0].toUpperCase()}${key.slice(1)} evidence`;
      violations.push(`Missing required "## ${label}" section.`);
    }
  }
  if (violations.length > 0) return violations;

  const present = positions.filter((p) => p.index !== -1);
  for (let i = 1; i < present.length; i += 1) {
    if (present[i].index < present[i - 1].index) {
      violations.push(
        `Evidence sections are out of order: "${present[i].key}" must appear after "${present[i - 1].key}".`,
      );
    }
  }

  for (const { key, heading } of SECTIONS) {
    const required = isDocException ? key === "before" || key === "after" : true;
    if (!required) continue;
    const text = sectionBody(body, heading);
    if (isPlaceholder(text)) {
      violations.push(`Section "${key}" has no content beyond the template placeholder.`);
    }
  }

  return violations;
}

async function main() {
  const body = process.env.PR_BODY ?? "";
  const violations = checkPrEvidence(body);
  if (violations.length > 0) {
    console.error("PR evidence check failed:");
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log("PR evidence check passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
