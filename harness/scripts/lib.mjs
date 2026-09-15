import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateEvidence(
  path,
  report,
  changed,
  readFile = readFileSync,
  exists = existsSync,
) {
  if (path === "harness/reports/verify-latest.json") {
    const evidence = JSON.parse(readFile(path, "utf8"));
    return evidence.contract === report.contract &&
      evidence.completedAt === report.completedAt &&
      evidence.status === "passed"
      ? undefined
      : `${path} is not passing evidence from this contract run`;
  }
  if (!path.startsWith("docs/engineering/") || !path.endsWith(".md"))
    return `${path} is not a supported evidence type`;
  if (!changed.includes(path)) return `${path} was not updated by this task`;
  if (!exists(path) || readFile(path, "utf8").trim().length === 0)
    return `${path} is missing or empty`;
  return undefined;
}

export function validateJsonSchema(value, schema, root = schema, path = "$") {
  const errors = [];
  if (schema.$ref) {
    const target = schema.$ref
      .replace(/^#\//, "")
      .split("/")
      .reduce((current, part) => current?.[part], root);
    return target
      ? validateJsonSchema(value, target, root, path)
      : [`${path} references unknown schema ${schema.$ref}`];
  }
  for (const condition of schema.allOf ?? [])
    errors.push(...validateJsonSchema(value, condition, root, path));
  if (schema.if) {
    const matches =
      validateJsonSchema(value, schema.if, root, path).length === 0;
    const branch = matches ? schema.then : schema.else;
    if (branch) errors.push(...validateJsonSchema(value, branch, root, path));
  }
  if (schema.const !== undefined && value !== schema.const)
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value))
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}`);
  const actualType = Array.isArray(value)
    ? "array"
    : value === null
      ? "null"
      : typeof value;
  if (
    schema.type &&
    actualType !== schema.type &&
    !(schema.type === "integer" && actualType === "number")
  ) {
    errors.push(`${path} must be ${schema.type}`);
    return errors;
  }
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength)
      errors.push(`${path} is too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      errors.push(`${path} has an invalid format`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value)))
      errors.push(`${path} must be a date-time`);
  }
  if (typeof value === "number") {
    if (schema.type === "integer" && !Number.isInteger(value))
      errors.push(`${path} must be an integer`);
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path} must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems)
      errors.push(`${path} must contain at least ${schema.minItems} item(s)`);
    if (schema.items) {
      value.forEach((item, index) =>
        errors.push(
          ...validateJsonSchema(item, schema.items, root, `${path}[${index}]`),
        ),
      );
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const field of schema.required ?? []) {
      if (!(field in value)) errors.push(`${path}.${field} is required`);
    }
    for (const [field, child] of Object.entries(value)) {
      if (schema.properties?.[field])
        errors.push(
          ...validateJsonSchema(
            child,
            schema.properties[field],
            root,
            `${path}.${field}`,
          ),
        );
      else if (schema.additionalProperties === false)
        errors.push(`${path}.${field} is not allowed`);
      else if (typeof schema.additionalProperties === "object")
        errors.push(
          ...validateJsonSchema(
            child,
            schema.additionalProperties,
            root,
            `${path}.${field}`,
          ),
        );
    }
    if (
      schema.minProperties &&
      Object.keys(value).length < schema.minProperties
    )
      errors.push(
        `${path} must contain at least ${schema.minProperties} properties`,
      );
  }
  return errors;
}

export function validateTaskContract(contract, schema) {
  return validateJsonSchema(contract, schema);
}

export function pathMatches(path, rule) {
  return rule.endsWith("/") ? path.startsWith(rule) : path === rule;
}

export function activeContractPath(
  paths,
  override = process.env.HARNESS_TASK_CONTRACT,
) {
  if (override) return resolve(override);
  const contracts = (paths ?? changedPaths()).filter(
    (path) =>
      path.startsWith("harness/tasks/") &&
      path.endsWith(".json") &&
      path !== "harness/tasks/repository-neutral-example.json",
  );
  if (contracts.length !== 1) {
    throw new Error(
      `Expected exactly one changed task contract, found ${contracts.length}. Set HARNESS_TASK_CONTRACT explicitly.`,
    );
  }
  return resolve(contracts[0]);
}

export function databaseEnvironment(environment = process.env) {
  const hasDatabaseUrl = Boolean(environment.DATABASE_URL);
  const hasSupportedDatabaseAuth = ["password", "entra"].includes(
    environment.DATABASE_AUTH,
  );
  const configured = hasDatabaseUrl && hasSupportedDatabaseAuth;
  const misconfigured = hasDatabaseUrl !== hasSupportedDatabaseAuth;
  const requiredButMissing =
    Boolean(environment.CI) &&
    (!configured || environment.DATABASE_AUTH !== "password");
  return { configured, misconfigured, requiredButMissing };
}

export function moduleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return [...new Set(specifiers)];
}

export function evaluatePaths(paths, contract, policy) {
  const unauthorized = paths.filter(
    (path) => !contract.allowedPaths.some((rule) => pathMatches(path, rule)),
  );
  const protectedRules = [
    ...new Set([...policy.protectedPaths, ...contract.protectedPaths]),
  ];
  const protectedWithoutApproval = paths.filter(
    (path) =>
      protectedRules.some((rule) => pathMatches(path, rule)) &&
      !contract.declaredProtectedPaths.some((rule) => pathMatches(path, rule)),
  );
  return { protectedWithoutApproval, unauthorized };
}

export function changedPaths(
  base = process.env.HARNESS_BASE_REF || "origin/main",
) {
  const committed = execFileSync(
    "git",
    ["diff", "--name-only", `${base}...HEAD`],
    { encoding: "utf8" },
  );
  const working = execFileSync("git", ["diff", "--name-only", "HEAD"], {
    encoding: "utf8",
  });
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );
  return [
    ...new Set(
      `${committed}\n${working}\n${untracked}`.split("\n").filter(Boolean),
    ),
  ].sort();
}
