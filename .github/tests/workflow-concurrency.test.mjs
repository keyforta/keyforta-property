import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";

const workflows = {
  deploy: {
    file: ".github/workflows/deploy.yml",
    job: "deploy",
    step: "Build and push immutable images",
  },
};

test("CI preserves repository verification and recursive Bicep compilation", () => {
  const document = YAML.parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  assert.deepEqual(document.permissions, { contents: "read" });
  assert.equal(document.jobs.validate["timeout-minutes"], 20);
  const steps = document.jobs.validate.steps;
  assert.ok(steps.some((step) => step.run === "pnpm verify"));
  const bicepStep = steps.find((step) => step.name === "Compile Bicep");
  assert.match(bicepStep?.run ?? "", /find infra\/bicep/);
  for (const step of steps.filter((step) => step.uses)) {
    assert.match(step.uses, /@[a-f0-9]{40}$/);
  }
});

test("migration job preserves single-replica manual execution", () => {
  const template = readFileSync("infra/bicep/migration-job.bicep", "utf8");
  assert.match(
    template,
    /manualTriggerConfig:\s*\{\s*parallelism:\s*1\s*replicaCompletionCount:\s*1\s*\}/,
  );
});

test("deployment workflows pin every action to an immutable commit", () => {
  for (const file of [
    ".github/workflows/deploy.yml",
    ".github/workflows/seed-development.yml",
  ]) {
    const document = YAML.parse(readFileSync(file, "utf8"));
    for (const job of Object.values(document.jobs)) {
      for (const step of job.steps.filter((candidate) => candidate.uses)) {
        assert.match(step.uses, /@[a-f0-9]{40}$/, `${file}: ${step.uses}`);
      }
    }
  }
});

test("deploy normalizes curl CRLF before matching the exact CORS origin", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const step = document.jobs.deploy.steps.find(
    (candidate) => candidate.name === "Smoke test public applications",
  );
  assert.match(
    step?.run ?? "",
    /tr -d '\\r' < api-headers\.txt/,
  );
  assert.match(
    step?.run ?? "",
    /grep -iFx "access-control-allow-origin: \$\{web_url\}"/,
  );

  const result = spawnSync(
    "bash",
    [
      "-o",
      "pipefail",
      "-c",
      "printf 'access-control-allow-origin: https://web.example.test\\r\\n' | tr -d '\\r' | grep -iFx 'access-control-allow-origin: https://web.example.test'",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
});

function workflowScript(name) {
  const workflow = workflows[name];
  const document = YAML.parse(readFileSync(workflow.file, "utf8"));
  const step = document.jobs[workflow.job].steps.find(
    (candidate) => candidate.name === workflow.step,
  );
  assert.ok(step?.run, `Missing run block for ${workflow.step}`);
  return step.run.replaceAll("${{ github.sha }}", "test-sha");
}

function executable(directory, name, source) {
  const file = join(directory, name);
  writeFileSync(file, source);
  chmodSync(file, 0o755);
}

function runScenario(workflow, failures = "", scope = "full") {
  const directory = mkdtempSync(join(tmpdir(), "keyforta-workflow-test-"));
  try {
    const events = join(directory, "events");
    executable(
      directory,
      "az",
      '#!/usr/bin/env bash\nset -eu\necho az >> "$EVENTS_FILE"\n',
    );
    executable(
      directory,
      "docker",
      `#!/usr/bin/env bash
set -eu
command_name="$1"
shift
if [ "$command_name" = push ]; then
  echo "push:$1" >> "$EVENTS_FILE"
  exit 0
fi
component=unknown
for argument in "$@"; do
  case "$argument" in
    deployments/azure/docker/api.Dockerfile) component=api ;;
    deployments/azure/docker/public-web.Dockerfile) component=web ;;
  esac
done
touch "$TEST_STATE/$component.started"
other=api
if [ "$component" = api ]; then other=web; fi
if [ "$DEPLOYMENT_SCOPE" = full ]; then
  while [ ! -f "$TEST_STATE/$other.started" ]; do
    sleep 0.01
  done
fi
echo "build:$component" >> "$EVENTS_FILE"
if [ "$component" = web ]; then sleep 0.25; fi
case ",$FAILURES," in
  *,$component,*) result=17 ;;
  *) result=0 ;;
esac
echo "complete:$component:$result" >> "$EVENTS_FILE"
exit "$result"
`,
    );
    const result = spawnSync(
      "bash",
      ["-e", "-o", "pipefail", "-c", workflowScript(workflow)],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          DEPLOYMENT_SHA: "test-sha",
          DEPLOYMENT_SCOPE: scope,
          EVENTS_FILE: events,
          FAILURES: failures,
          PATH: `${directory}:${process.env.PATH}`,
          REGISTRY_NAME: "test-registry",
          REGISTRY_SERVER: "registry.example.test",
          TEST_STATE: directory,
        },
      },
    );
    return {
      events: readFileSync(events, "utf8").trim().split("\n"),
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

for (const workflow of Object.keys(workflows)) {
  test(`${workflow} container builds overlap and succeed together`, () => {
    const result = runScenario(workflow);
    assert.equal(result.status, 0);
    assert.ok(result.events.includes("build:api"));
    assert.ok(result.events.includes("build:web"));
  });

  for (const failures of ["api", "web", "api,web"]) {
    test(`${workflow} blocks after ${failures} build failure`, () => {
      const result = runScenario(workflow, failures);
      assert.notEqual(result.status, 0);
      assert.ok(
        result.events.some((event) => event.startsWith("complete:api:")),
      );
      assert.ok(
        result.events.some((event) => event.startsWith("complete:web:")),
      );
      for (const component of failures.split(",")) {
        const title = component === "api" ? "API" : "Web";
        assert.match(
          `${result.stdout}\n${result.stderr}`,
          new RegExp(`${title} container build failed`),
        );
      }
      if (workflow === "deploy") {
        assert.ok(!result.events.some((event) => event.startsWith("push:")));
      }
    });
  }
}

test("deploy publishes both images only after successful builds", () => {
  const result = runScenario("deploy");
  const firstPush = result.events.findIndex((event) =>
    event.startsWith("push:"),
  );
  assert.equal(result.status, 0);
  assert.ok(firstPush > result.events.indexOf("build:api"));
  assert.ok(firstPush > result.events.indexOf("build:web"));
  assert.equal(
    result.events.filter((event) => event.startsWith("push:")).length,
    2,
  );
});

for (const [scope, expectedComponent] of [
  ["api", "api"],
  ["postgres", "api"],
  ["public-web", "web"],
]) {
  test(`deploy ${scope} scope publishes only its required image`, () => {
    const result = runScenario("deploy", "", scope);
    assert.equal(result.status, 0);
    assert.deepEqual(
      result.events.filter((event) => event.startsWith("build:")),
      [`build:${expectedComponent}`],
    );
    assert.equal(
      result.events.filter((event) => event.startsWith("push:")).length,
      1,
    );
    assert.match(
      result.events.find((event) => event.startsWith("push:")) ?? "",
      new RegExp(`keyforta-${expectedComponent === "web" ? "public-web" : "api"}:`),
    );
  });
}

test("deploy exposes exact component scopes and binds deploys to plan scope", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  assert.deepEqual(document.on.workflow_dispatch.inputs.deployment_scope.options, [
    "full",
    "postgres",
    "api",
    "public-web",
    "portal-web",
    "admin-web",
    "mcp",
  ]);
  const steps = document.jobs.deploy.steps;
  const step = (name) => steps.find((candidate) => candidate.name === name);

  assert.equal(step("Verify deployment scope capability")?.if, undefined);
  assert.match(step("Verify deployment intent")?.run ?? "", /expected_scope="\$DEPLOYMENT_SCOPE"/);
  assert.match(step("Verify deployment intent")?.run ?? "", /grep -Fx "scope=\$expected_scope"/);
  for (const name of [
    "Preview database access changes",
    "Preview database job changes",
    "Preview development seed job changes",
  ]) {
    assert.match(step(name)?.if ?? "", /inputs\.operation != 'deploy-foundation'/);
  }
  assert.match(step("Deploy migration job")?.if ?? "", /DEPLOYMENT_SCOPE == 'postgres'/);
  assert.doesNotMatch(step("Deploy migration job")?.if ?? "", /DEPLOYMENT_SCOPE == 'api'/);
  assert.match(step("Deploy applications")?.if ?? "", /DEPLOYMENT_SCOPE != 'postgres'/);
});
