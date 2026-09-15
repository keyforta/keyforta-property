import { readFileSync } from "node:fs";

export function secretPatternFindings(files, patterns) {
  const findings = [];
  for (const file of files) {
    for (const pattern of patterns) {
      if (new RegExp(pattern).test(file)) {
        findings.push({ file, message: "file path matches forbidden secret pattern" });
      }
    }
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      findings.push({ file, message: "generated report could not be read" });
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