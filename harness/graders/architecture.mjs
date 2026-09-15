#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { moduleSpecifiers } from "../scripts/lib.mjs";

const forbidden = ["apps/", "@keyforta/api", "@azure/", "fastify", "react", "vite"];
const roots = [
  "packages/contracts/src",
  "packages/auth/src",
  "packages/authorization/src",
];
const files = [];
function walk(path) {
  for (const entry of readdirSync(path)) {
    const target = join(path, entry);
    if (statSync(target).isDirectory()) walk(target);
    else if (/\.[cm]?[jt]sx?$/.test(target)) files.push(target);
  }
}
for (const root of roots) if (existsSync(root)) walk(root);
const violations = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    const normalizedSpecifier = specifier.startsWith(".")
      ? relative(process.cwd(), resolve(dirname(file), specifier))
      : specifier;
    const dependency = forbidden.find((prefix) =>
      normalizedSpecifier.startsWith(prefix),
    );
    if (dependency)
      violations.push(`${file}: forbidden dependency ${specifier}`);
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log(
  `Architecture boundary passed for ${files.length} shared source file(s).`,
);
