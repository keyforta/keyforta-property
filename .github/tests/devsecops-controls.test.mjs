import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
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
  assert.match(scripts, /NODE_ENV=production/);
  assert.match(scripts, /CORS_ALLOWED_ORIGIN=/);
  assert.match(scripts, /ENTRA_AUDIENCE=/);
  assert.match(scripts, /ENTRA_ISSUER=/);
  assert.match(scripts, /ENTRA_JWKS_URI=/);
  assert.match(scripts, /grep -F '"status":"ready"'/);
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

test("security workflow rejects edits to existing migrations but allows the one-time pre-launch squash", () => {
  const workflow = readWorkflow("security.yml");
  const guard = workflow.jobs.scan.steps.find(
    (step) => step.name === "Reject historical migration rewrites",
  );
  const script = guard?.run ?? "";
  assert.match(script, /git diff --name-status/);
  assert.match(script, /add a forward migration instead/);
  assert.match(script, /_baseline\\\.sql\$/);

  
  
  
  const dir = mkdtempSync(path.join(tmpdir(), "migration-guard-"));
  const git = (...args) =>
    spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  const runGuard = (baseSha, headSha) => {
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      cwd: dir,
      env: { ...process.env, BASE_SHA: baseSha, HEAD_SHA: headSha },
      encoding: "utf8",
    });
    return result.status;
  };

  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    const migrationsDir = path.join(dir, "infra", "postgres", "migrations");
    mkdirSync(migrationsDir, { recursive: true });
    for (const name of ["0001_initial.sql", "0002_second.sql", "0003_third.sql"]) {
      writeFileSync(path.join(migrationsDir, name), "begin;\nselect 1;\ncommit;\n");
    }
    git("add", "-A");
    git("commit", "-q", "-m", "baseline history");
    const baseSha = git("rev-parse", "HEAD").stdout.trim();

    // Ordinary forward-only addition: allowed.
    writeFileSync(path.join(migrationsDir, "0004_fourth.sql"), "begin;\nselect 1;\ncommit;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "add 0004");
    let headSha = git("rev-parse", "HEAD").stdout.trim();
    assert.equal(runGuard(baseSha, headSha), 0, "ordinary new migration must be allowed");

    // Editing an existing file in place: rejected.
    git("reset", "-q", "--hard", baseSha);
    git("clean", "-q", "-fd", "infra/postgres/migrations");
    writeFileSync(path.join(migrationsDir, "0002_second.sql"), "begin;\nselect 2;\ncommit;\n");
    git("commit", "-q", "-a", "-m", "edit 0002");
    headSha = git("rev-parse", "HEAD").stdout.trim();
    assert.notEqual(runGuard(baseSha, headSha), 0, "editing an existing migration must be rejected");

    // Renaming a single existing file: rejected.
    git("reset", "-q", "--hard", baseSha);
    git("clean", "-q", "-fd", "infra/postgres/migrations");
    git("mv", "infra/postgres/migrations/0002_second.sql", "infra/postgres/migrations/0002_renamed.sql");
    git("commit", "-q", "-m", "rename 0002");
    headSha = git("rev-parse", "HEAD").stdout.trim();
    assert.notEqual(runGuard(baseSha, headSha), 0, "renaming an existing migration must be rejected");

    // Deleting a single file with no replacement: rejected.
    git("reset", "-q", "--hard", baseSha);
    git("clean", "-q", "-fd", "infra/postgres/migrations");
    git("rm", "-q", "infra/postgres/migrations/0003_third.sql");
    git("commit", "-q", "-m", "delete 0003");
    headSha = git("rev-parse", "HEAD").stdout.trim();
    assert.notEqual(runGuard(baseSha, headSha), 0, "deleting a single migration must be rejected");

    // Deleting one file and adding one non-baseline file (disguised
    // rename): rejected -- must not satisfy the squash exception.
    git("reset", "-q", "--hard", baseSha);
    git("clean", "-q", "-fd", "infra/postgres/migrations");
    git("rm", "-q", "infra/postgres/migrations/0003_third.sql");
    writeFileSync(path.join(migrationsDir, "0003_replacement.sql"), "begin;\nselect 1;\ncommit;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "swap 0003");
    headSha = git("rev-parse", "HEAD").stdout.trim();
    assert.notEqual(
      runGuard(baseSha, headSha),
      0,
      "a single delete plus a single non-baseline add must be rejected",
    );

    // The one-time full-lineage squash: every existing file deleted,
    // exactly one new "*_baseline.sql" file added, no modifications.
    // Allowed.
    git("reset", "-q", "--hard", baseSha);
    git("clean", "-q", "-fd", "infra/postgres/migrations");
    for (const name of ["0001_initial.sql", "0002_second.sql", "0003_third.sql"]) {
      git("rm", "-q", `infra/postgres/migrations/${name}`);
    }
    // git rm removes the now-empty parent directory along with the last
    // tracked file in it, so it must be recreated before writing the
    // replacement baseline file.
    mkdirSync(migrationsDir, { recursive: true });
    writeFileSync(
      path.join(migrationsDir, "0001_baseline.sql"),
      "begin;\nselect 'baseline schema consolidated from full lineage';\ncommit;\n",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "squash into baseline");
    headSha = git("rev-parse", "HEAD").stdout.trim();
    assert.equal(
      runGuard(baseSha, headSha),
      0,
      "a full-lineage squash into a single baseline file must be allowed",
    );

    // Same squash shape, but also editing an unrelated migration in the
    // same commit: rejected -- the exception must not launder edits.
    git("reset", "-q", "--hard", baseSha);
    git("clean", "-q", "-fd", "infra/postgres/migrations");
    for (const name of ["0001_initial.sql", "0002_second.sql"]) {
      git("rm", "-q", `infra/postgres/migrations/${name}`);
    }
    writeFileSync(path.join(migrationsDir, "0003_third.sql"), "begin;\nselect 99;\ncommit;\n");
    writeFileSync(path.join(migrationsDir, "0001_baseline.sql"), "begin;\nselect 1;\ncommit;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "squash plus a sneaky edit");
    headSha = git("rev-parse", "HEAD").stdout.trim();
    assert.notEqual(
      runGuard(baseSha, headSha),
      0,
      "a squash accompanied by any modification to a surviving file must be rejected",
    );

    // Partial squash: deletes two files and adds one "*_baseline.sql"
    // file, satisfying the delete-count and add-shape checks in
    // isolation, but leaves a third historical file behind. Rejected --
    // the exception must require a full-lineage consolidation, not just
    // "at least two deletions".
    git("reset", "-q", "--hard", baseSha);
    git("clean", "-q", "-fd", "infra/postgres/migrations");
    for (const name of ["0001_initial.sql", "0002_second.sql"]) {
      git("rm", "-q", `infra/postgres/migrations/${name}`);
    }
    mkdirSync(migrationsDir, { recursive: true });
    writeFileSync(
      path.join(migrationsDir, "0001_baseline.sql"),
      "begin;\nselect 'partial baseline leaving 0003 behind';\ncommit;\n",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "partial squash leaving a file behind");
    headSha = git("rev-parse", "HEAD").stdout.trim();
    assert.notEqual(
      runGuard(baseSha, headSha),
      0,
      "a partial squash that leaves historical migration files behind must be rejected",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
  assert.match(publish?.run ?? "", /--query changeableAttributes\.writeEnabled/);
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