import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const dom = new JSDOM("");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { default: mermaid } = await import("mermaid");
mermaid.initialize({ startOnLoad: false });

function markdownFiles(path) {
  if (!statSync(path).isDirectory()) return path.endsWith(".md") ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    markdownFiles(resolve(path, entry.name)),
  );
}

export function extractMermaidDiagrams(source) {
  const diagrams = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^```mermaid\s*$/.test(lines[index])) continue;
    const startLine = index + 1;
    const body = [];
    index += 1;
    while (index < lines.length && !/^```\s*$/.test(lines[index])) {
      body.push(lines[index]);
      index += 1;
    }
    diagrams.push({ source: body.join("\n"), startLine, closed: index < lines.length });
  }
  return diagrams;
}

export async function validateMermaidDocuments(paths) {
  const documents = paths.flatMap((candidate) => markdownFiles(resolve(candidate)));
  const failures = [];
  let diagramCount = 0;

  for (const path of documents) {
    const diagrams = extractMermaidDiagrams(readFileSync(path, "utf8"));
    for (const [index, diagram] of diagrams.entries()) {
      diagramCount += 1;
      if (!diagram.closed) {
        failures.push(`${path} diagram ${index + 1} at line ${diagram.startLine}: unclosed Mermaid fence`);
        continue;
      }
      try {
        await mermaid.parse(diagram.source);
      } catch (error) {
        failures.push(`${path} diagram ${index + 1}: ${error.message}`);
      }
    }
  }

  return { diagramCount, failures };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await validateMermaidDocuments(process.argv.slice(2));
  if (result.failures.length > 0) {
    console.error(result.failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Mermaid syntax passed for ${result.diagramCount} diagram(s).`);
  }
}