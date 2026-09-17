import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";

function readWorkflow(name) {
  return YAML.parse(readFileSync(`.github/workflows/${name}`, "utf8"));
}

test("every container base image is pinned by digest", () => {
  const dockerfiles = readdirSync("deployments/azure/docker")
    .filter((name) => name.endsWith(".Dockerfile"));

  for (const name of dockerfiles) {
    const fromLines = readFileSync(`deployments/azure/docker/${name}`, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("FROM "));
    assert.ok(fromLines.length > 0, `${name}: missing FROM instruction`);
    for (const line of fromLines) {
      assert.match(
        line,
        /^FROM \S+@sha256:[a-f0-9]{64}(?: AS \S+)?$/i,
        `${name}: mutable base image: ${line}`,
      );
    }
  }
});

test("pull requests run blocking repository security scans with least privilege", () => {
  const workflow = readWorkflow("security.yml");
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.ok(Object.hasOwn(workflow.on, "pull_request"));
  assert.equal(workflow.on.pull_request_target, undefined);

  const steps = workflow.jobs.scan.steps;
  const checkout = steps.find((step) => step.name === "Check out complete history");
  const historyScan = steps.find((step) => step.name === "Scan commit range for secrets");
  const sast = steps.find((step) => step.name === "Run Semgrep SAST");
  const repositoryScan = steps.find((step) => step.name === "Scan repository");
  const bicepScan = steps.find((step) => step.name === "Scan Bicep security configuration");
  assert.match(sast?.uses ?? "", /^semgrep\/semgrep-action@[a-f0-9]{40}$/);
  assert.notEqual(sast?.["continue-on-error"], true);
  assert.equal(checkout?.with?.["fetch-depth"], 0);
  assert.match(historyScan?.uses ?? "", /^trufflesecurity\/trufflehog@[a-f0-9]{40}$/);
  assert.notEqual(historyScan?.["continue-on-error"], true);
  assert.match(repositoryScan?.uses ?? "", /^aquasecurity\/trivy-action@[a-f0-9]{40}$/);
  assert.equal(repositoryScan?.with?.["scan-type"], "fs");
  assert.equal(repositoryScan?.with?.scanners, "vuln,secret,misconfig");
  assert.equal(repositoryScan?.with?.severity, "CRITICAL,HIGH");
  assert.equal(repositoryScan?.with?.["exit-code"], "1");
  assert.notEqual(repositoryScan?.["continue-on-error"], true);
  assert.match(
    bicepScan?.run ?? "",
    /bridgecrew\/checkov:3\.3\.17@sha256:[a-f0-9]{64}/,
  );
  assert.match(bicepScan?.run ?? "", /--directory \/repo\/infra\/bicep/);
  assert.match(bicepScan?.run ?? "", /--framework bicep/);
  assert.match(bicepScan?.run ?? "", /--file \/repo\/mcp\.arm\.json/);
  assert.match(bicepScan?.run ?? "", /--framework arm/);
  assert.match(
    bicepScan?.run ?? "",
    /--skip-path \/repo\/infra\/bicep\/mcp\.bicep/,
  );
  assert.match(
    bicepScan?.run ?? "",
    /--skip-check CKV_AZURE_35,CKV_AZURE_43,CKV_AZURE_59,CKV_AZURE_139,CKV_AZURE_163,CKV_AZURE_166,CKV_AZURE_206/,
  );
  assert.doesNotMatch(bicepScan?.run ?? "", /soft.fail/i);
  assert.notEqual(bicepScan?.["continue-on-error"], true);
  assert.doesNotMatch(JSON.stringify(workflow), /\$\{\{\s*secrets\./);
});

test("DAST scans only a synthetic loopback API and always cleans up", () => {
  const workflow = readWorkflow("dast.yml");
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.ok(Object.hasOwn(workflow.on, "pull_request"));
  assert.equal(workflow.on.pull_request_target, undefined);
  const job = workflow.jobs.api;
  assert.ok(job["timeout-minutes"] <= 15);
  assert.match(job.services?.postgres?.image ?? "", /^postgres:\S+@sha256:[a-f0-9]{64}$/);
  assert.match(job.env?.DATABASE_URL ?? "", /keyforta_dast/);
  const scripts = job.steps.map((step) => step.run ?? "").join("\n");
  assert.match(scripts, /http:\/\/127\.0\.0\.1:3000\/api\/v1/);
  assert.match(scripts, /ghcr\.io\/zaproxy\/zaproxy:2\.17\.0@sha256:[a-f0-9]{64}/);
  assert.doesNotMatch(scripts, /(^|\s)-I(\s|$)/, "ZAP warnings must block promotion");
  assert.doesNotMatch(scripts, /https:\/\/api\.keyforta\.com/);
  assert.ok(job.steps.some((step) => step.name === "Stop synthetic API" && step.if === "always()"));
  assert.match(scripts, /setsid env API_HOST=/);
  assert.match(scripts, /node apps\/api\/dist\/migrate\.js/);
  assert.match(scripts, /mkdir --mode=0777 zap-reports/);
  assert.match(scripts, /kill -- "-\$\(cat synthetic-api\.pid\)"/);
  assert.doesNotMatch(JSON.stringify(workflow), /\$\{\{\s*secrets\./);
});

test("all workflow actions use immutable commit references", () => {
  for (const name of readdirSync(".github/workflows").filter((file) => file.endsWith(".yml"))) {
    const workflow = readWorkflow(name);
    for (const job of Object.values(workflow.jobs)) {
      for (const [serviceName, service] of Object.entries(job.services ?? {})) {
        assert.match(
          service.image,
          /^\S+@sha256:[a-f0-9]{64}$/,
          `${name}: mutable ${serviceName} service image: ${service.image}`,
        );
      }
      for (const step of job.steps ?? []) {
        if (step.uses) {
          assert.match(step.uses, /^[^@\s]+@[a-f0-9]{40}$/, `${name}: ${step.uses}`);
        }
      }
    }
  }
});

test("migration checksum manifest protects the complete forward history", () => {
  const migrationNames = readdirSync("infra/postgres/migrations")
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const manifest = JSON.parse(
    readFileSync("infra/postgres/migration-checksums.json", "utf8"),
  );
  assert.deepEqual(Object.keys(manifest), migrationNames);
  for (const name of migrationNames) {
    const content = readFileSync(`infra/postgres/migrations/${name}`);
    const checksum = createHash("sha256").update(content).digest("hex");
    assert.equal(manifest[name], checksum, `${name}: immutable checksum changed`);
  }
});

test("security workflow rejects edits to existing migrations", () => {
  const workflow = readWorkflow("security.yml");
  const guard = workflow.jobs.scan.steps.find(
    (step) => step.name === "Reject historical migration rewrites",
  );
  assert.match(guard?.run ?? "", /git diff --name-status/);
  assert.match(guard?.run ?? "", /NF && \$1 !~ \/\^A\//);
  assert.match(guard?.run ?? "", /add a forward migration instead/);

  const awkProgram = "NF && $1 !~ /^A/ { found=1 } END { exit found ? 0 : 1 }";
  for (const allowed of ["", "A\tinfra/postgres/migrations/0021_example.sql"]){
    assert.notEqual(spawnSync("awk", [awkProgram], { input: `${allowed}\n` }).status, 0);
  }
  for (const rejected of ["M\t0010.sql", "D\t0010.sql", "R100\t0010.sql\t0010_renamed.sql"]){
    assert.equal(spawnSync("awk", [awkProgram], { input: `${rejected}\n` }).status, 0);
  }
});

test("application delivery deploys only reviewed digest-addressed images", () => {
  const workflow = readWorkflow("deploy.yml");
  const steps = workflow.jobs.deploy.steps;
  const step = (name) => steps.find((candidate) => candidate.name === name);
  const publish = step("Build and push immutable images");
  const attestations = step("Verify application image attestations");
  const drift = step("Verify reviewed application plan still applies");
  const deploy = step("Deploy applications");
  const scripts = steps
    .map((candidate) => `${candidate.run ?? ""}\n${candidate.with?.inlineScript ?? ""}`)
    .join("\n");

  assert.match(publish?.if ?? "", /inputs\.operation == 'plan'/);
  assert.match(publish?.run ?? "", /docker buildx build/);
  assert.match(publish?.run ?? "", /acr repository show-tags/);
  assert.match(publish?.run ?? "", /Immutable image tag/);
  assert.match(publish?.run ?? "", /--write-enabled false/);
  assert.match(publish?.run ?? "", /--query writeEnabled/);
  assert.match(publish?.run ?? "", /--sbom=true/);
  assert.match(publish?.run ?? "", /--provenance=mode=max/);
  assert.match(publish?.run ?? "", /--push/);
  assert.match(attestations?.run ?? "", /\.SBOM/);
  assert.match(attestations?.run ?? "", /\.Provenance/);
  for (const [component, repository, digest] of [
    ["API", "keyforta-api", "api_digest"],
    ["WEB", "keyforta-public-web", "web_digest"],
    ["ADMIN", "keyforta-admin-web", "admin_digest"],
  ]) {
    assert.match(scripts, new RegExp(`${digest}.*sha256`));
    assert.match(scripts, new RegExp(`${component}_IMAGE=\\$REGISTRY_SERVER/${repository}@\\$${digest}`));
  }
  assert.match(scripts, /application-what-if\.json/);
  assert.match(scripts, /hostname-bootstrap-what-if\.json/);
  assert.match(drift?.run ?? "", /diff -u/);
  assert.ok(steps.indexOf(drift) < steps.indexOf(deploy));
  for (const mutation of [
    "Configure PostgreSQL Entra administrator",
    "Deploy migration job",
    "Bootstrap public-web hostnames",
  ]) {
    assert.ok(steps.indexOf(drift) < steps.indexOf(step(mutation)));
  }
  assert.doesNotMatch(deploy?.with?.inlineScript ?? "", /:\$DEPLOYMENT_SHA/);
});

test("migration polling outlives the Azure replica timeout", () => {
  const workflow = readWorkflow("deploy.yml");
  const migration = workflow.jobs.deploy.steps.find(
    (step) => step.name === "Apply database migrations",
  );
  assert.match(migration?.run ?? "", /for attempt in \{1\.\.96\}/);
  assert.match(migration?.run ?? "", /900-second replica timeout/);
});

test("each planned application image has a blocking vulnerability gate", () => {
  const workflow = readWorkflow("deploy.yml");
  const steps = workflow.jobs.deploy.steps;
  for (const name of ["API", "public web", "admin web"]) {
    const scan = steps.find((step) => step.name === `Scan immutable ${name} image`);
    assert.match(scan?.uses ?? "", /^aquasecurity\/trivy-action@[a-f0-9]{40}$/);
    assert.equal(scan?.with?.severity, "CRITICAL,HIGH");
    assert.equal(scan?.with?.["exit-code"], "1");
    assert.notEqual(scan?.["continue-on-error"], true);
  }
});