import { readFileSync } from "node:fs";

export function secretPatternFindings(files, patterns) {
  const findings = [];
  for (const file of files) {
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      if (new RegExp(pattern).test(source)) {
        findings.push({
          file,
          message: `${file}: matches forbidden secret pattern`,
        });
      }
    }
  }
  return findings;
}