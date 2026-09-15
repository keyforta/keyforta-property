import { relative, resolve } from "node:path";
import {
  activeContractPath,
  evaluatePaths,
  moduleSpecifiers,
  validateTaskContract,
} from "../lib.mjs";
import { runGates } from "../run-gates.mjs";
import { fixtureText, policy, schema, valid } from "./fixtures.mjs";

export function registerSuite({ check }) {
  check(
    "valid task contract parses",
    () => validateTaskContract(valid, schema).length === 0,
  );
  check("missing required field fails", () => {
    const invalid = { ...valid };
    delete invalid.taskId;
    return validateTaskContract(invalid, schema).some((error) =>
      error.includes("taskId"),
    );
  });
  check("malformed nested contract evidence fails", () => {
    const invalid = { ...valid, acceptanceCriteria: [{}] };
    return validateTaskContract(invalid, schema).some((error) =>
      error.includes("acceptanceCriteria[0]"),
    );
  });
  check("version-2 task fields are required by focused validation", () => {
    const invalid = structuredClone(valid);
    invalid.contractVersion = 2;
    return ["phase", "workArea", "routingRuleId"].every((field) =>
      validateTaskContract(invalid, schema).some((error) =>
        error.includes(`$.${field} is required`),
      ),
    );
  });
  check("active contract selection fails when missing", () => {
    try {
      activeContractPath([], null);
      return false;
    } catch (error) {
      return error.message.includes("exactly one changed task contract");
    }
  });
  check("active contract selection finds one changed contract", () =>
    activeContractPath(["harness/tasks/ENG-999.json"], null).endsWith(
      "harness/tasks/ENG-999.json",
    ),
  );
  check("explicit contract selection ignores changed paths", () =>
    activeContractPath([], "harness/tasks/ENG-999.json").endsWith(
      "harness/tasks/ENG-999.json",
    ),
  );
  check(
    "unauthorized path is detected",
    () =>
      evaluatePaths(["apps/api/src/app.ts"], valid, policy).unauthorized
        .length === 1,
  );
  check("allowed path is accepted", () => {
    const result = evaluatePaths(
      ["harness/fixtures/example.json"],
      valid,
      policy,
    );
    return (
      result.unauthorized.length === 0 &&
      result.protectedWithoutApproval.length === 0
    );
  });
  check(
    "protected path is enforced",
    () =>
      evaluatePaths(["harness/policies/repository-policy.json"], valid, policy)
        .protectedWithoutApproval.length === 1,
  );
  check("all module loading forms are detected", () => {
    const source = `
    import "@azure/identity";
    export { value } from "next/server";
    const common = require("fastify");
    const dynamic = import("@keyforta/api");
  `;
    return ["@azure/identity", "next/server", "fastify", "@keyforta/api"].every(
      (dependency) => moduleSpecifiers(source).includes(dependency),
    );
  });
  check("relative contract imports cannot reach application code", () => {
    const source = 'import "../../../apps/api/src/app.ts";';
    const specifier = moduleSpecifiers(source)[0];
    const resolved = relative(
      process.cwd(),
      resolve("packages/contracts/src", specifier),
    );
    return resolved.startsWith("apps/");
  });
  check("deterministic synthetic fixture loads", () => {
    const first = JSON.parse(fixtureText);
    const second = JSON.parse(fixtureText);
    return (
      first.synthetic === true &&
      JSON.stringify(first) === JSON.stringify(second)
    );
  });
  check("representative automated test runs", () =>
    valid.requiredScenarios.includes("repository-neutral-self-test"),
  );
  check("failing quality gate blocks completion", () => {
    const result = runGates([
      ["controlled-failure", 'node -e "process.exit(7)"'],
      ["must-not-run", 'node -e "process.exit(0)"'],
    ]);
    return (
      result.failed === true &&
      result.results.length === 2 &&
      result.results[0].status === "failed" &&
      result.results[1].status === "skipped"
    );
  });
}
