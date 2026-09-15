#!/usr/bin/env node
import { changedPaths } from "../scripts/lib.mjs";

const paths = changedPaths();
const implementationChanged = paths.some((path) =>
  /^(apps|packages|infra)\//.test(path),
);
const documentationChanged = paths.some((path) =>
  /^(docs\/|README\.md$|CONTRIBUTING\.md$)/.test(path),
);
if (implementationChanged && !documentationChanged) {
  console.error(
    "Implementation or infrastructure changed without documentation impact evidence.",
  );
  process.exit(1);
}
console.log(
  implementationChanged
    ? "Documentation impact is represented."
    : "Documentation impact not required for this change set.",
);
