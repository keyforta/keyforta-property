import { writeFile } from 'node:fs/promises';

import commonCaseFolding from '@unicode/unicode-16.0.0/Case_Folding/C/code-points.mjs';
import fullCaseFolding from '@unicode/unicode-16.0.0/Case_Folding/F/code-points.mjs';
import assignedCodePointPattern from '@unicode/unicode-16.0.0/Binary_Property/Assigned/regex.mjs';
import whitespaceCodePoints from '@unicode/unicode-16.0.0/Binary_Property/White_Space/code-points.mjs';

const unicodeVersion = '16.0.0';
const entries = [...commonCaseFolding, ...fullCaseFolding]
  .sort(([left], [right]) => left - right);
const output = `// Generated from @unicode/unicode-${unicodeVersion}; do not edit manually.\n`
  + `export const unitLabelUnicodeVersion = '${unicodeVersion}';\n`
  + `export const unitLabelCaseFolding = new Map(${JSON.stringify(entries)});\n`
  + `export const unitLabelAssignedPattern = new RegExp(${JSON.stringify(assignedCodePointPattern.source)}, '${assignedCodePointPattern.flags}');\n`
  + `export const unitLabelWhitespace = new Set(${JSON.stringify(whitespaceCodePoints)});\n`;

await writeFile(new URL('../src/unit-label-case-folding.js', import.meta.url), output);
