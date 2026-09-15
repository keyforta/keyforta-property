import { readFileSync } from "node:fs";

export function secretTextFindings(file, source, patterns) {
  const findings = [];
  for (const pattern of patterns) {
    if (new RegExp(pattern).test(file)) {
      findings.push({ file, message: "file path matches forbidden secret pattern" });
    }
    if (new RegExp(pattern).test(source)) {
      findings.push({ file, message: "file content matches forbidden secret pattern" });
    }
  }
  return findings;
}

export function secretPatternFindings(files, patterns) {
  const findings = [];
  for (const file of files) {
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      findings.push({ file, message: "generated report could not be read" });
      continue;
    }
    findings.push(...secretTextFindings(file, source, patterns));
  }
  return findings;
}