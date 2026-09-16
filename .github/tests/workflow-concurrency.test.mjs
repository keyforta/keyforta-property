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
    file: "deployments/azure/workflows/deploy.yml",
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

function runScenario(workflow, failures = "") {
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
while [ ! -f "$TEST_STATE/$other.started" ]; do
  sleep 0.01
done
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
