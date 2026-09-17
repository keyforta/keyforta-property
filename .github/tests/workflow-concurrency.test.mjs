import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
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
    ".github/workflows/deploy-mcp.yml",
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

test("application deployment verifies the configured External ID tenant before planning", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const steps = document.jobs.deploy.steps;
  const identity = steps.find(
    (step) => step.name === "Verify application identity configuration",
  );
  const planning = steps.find(
    (step) => step.name === "Determine deployment plan scope",
  );

  assert.ok(identity);
  assert.ok(steps.indexOf(identity) < steps.indexOf(planning));
  assert.equal(identity.env.ENTRA_ISSUER, "${{ vars.ENTRA_ISSUER }}");
  assert.equal(identity.env.ENTRA_JWKS_URI, "${{ vars.ENTRA_JWKS_URI }}");
  assert.match(identity.run, /metadata_url="\$\{ENTRA_AUTHORITY%\/\}\/v2\.0/);
  assert.match(identity.run, /\.well-known\/openid-configuration/);
  assert.match(identity.run, /\.issuer == \$issuer and \.jwks_uri == \$jwks_uri/);
  assert.match(identity.run, /\.keys \| length > 0/);
  assert.match(identity.run, /--proto '=https'/);
});

test("MCP deploy consumes a reviewed immutable image plan", () => {
  const document = YAML.parse(
    readFileSync(".github/workflows/deploy-mcp.yml", "utf8"),
  );
  const steps = document.jobs.deploy.steps;
  const configuration = steps.find(
    (step) => step.name === "Verify revision and configuration",
  );
  const publish = steps.find(
    (step) => step.name === "Build and publish exact-SHA MCP image",
  );
  const attestations = steps.find(
    (step) => step.name === "Verify MCP image attestations",
  );
  const preconditions = steps.find(
    (step) => step.name === "Verify MCP deployment preconditions",
  );
  const intent = steps.find((step) => step.name === "Verify deployment intent");
  const preview = steps.find((step) => step.name === "Preview MCP changes");
  const drift = steps.find(
    (step) => step.name === "Verify reviewed MCP plan still applies",
  );
  const deploy = steps.find((step) => step.name === "Deploy MCP revision");
  const scan = steps.find((step) => step.name === "Scan immutable MCP image");
  const revision = steps.find(
    (step) => step.name === "Verify deployed MCP revision and RBAC",
  );
  const smoke = steps.find(
    (step) => step.name === "Smoke test deployed MCP boundary",
  );
  const evidence = steps.find(
    (step) => step.name === "Preserve SHA-bound MCP plan evidence",
  );

  assert.equal(document.jobs.deploy.environment, "dev");
  assert.equal(document.jobs.deploy.concurrency["cancel-in-progress"], false);
  assert.match(configuration?.run ?? "", /test -z "\$MCP_ALLOWED_NON_BROWSER_CLIENT_IDS"/);
  assert.match(publish?.if ?? "", /inputs\.operation == 'plan'/);
  assert.match(publish?.run ?? "", /--provenance=mode=max/);
  assert.match(publish?.run ?? "", /--sbom=true/);
  assert.match(publish?.run ?? "", /--push/);
  assert.match(publish?.run ?? "", /repository show/);
  assert.doesNotMatch(publish?.run ?? "", /show-manifests/);
  assert.match(attestations?.run ?? "", /\.SBOM/);
  assert.match(attestations?.run ?? "", /\.Provenance/);
  assert.match(preconditions?.run ?? "", /keyforta-mcp-dev/);
  assert.match(preconditions?.run ?? "", /ResourceGroupName/);
  assert.match(preconditions?.run ?? "", /rg-keyforta-dev-san/);
  assert.equal(scan?.with?.["exit-code"], "1");
  assert.equal(scan?.with?.severity, "CRITICAL,HIGH");
  assert.match(intent?.run ?? "", /image_digest=/);
  assert.match(intent?.run ?? "", /bicep_sha256=/);
  assert.match(intent?.run ?? "", /parameters_sha256=/);
  assert.match(intent?.run ?? "", /what_if_sha256=/);
  assert.doesNotMatch(deploy?.with?.inlineScript ?? "", /docker build/);
  assert.match(deploy?.with?.inlineScript ?? "", /mcpImage="\$MCP_IMAGE"/);
  assert.match(preview?.with?.inlineScript ?? "", /what-if/);
  assert.match(preview?.with?.inlineScript ?? "", /mcp-what-if\.json/);
  assert.match(drift?.if ?? "", /inputs\.operation == 'deploy'/);
  assert.match(drift?.run ?? "", /plan-evidence\/mcp-what-if\.json/);
  assert.match(drift?.run ?? "", /diff -u/);
  assert.ok(steps.indexOf(preview) < steps.indexOf(drift));
  assert.ok(steps.indexOf(drift) < steps.indexOf(deploy));
  assert.match(revision?.run ?? "", /trafficWeight/);
  assert.match(revision?.run ?? "", /role assignment list/);
  assert.match(revision?.run ?? "", /ingress traffic set/);
  assert.ok(steps.indexOf(deploy) < steps.indexOf(revision));
  assert.match(smoke?.run ?? "", /MCP_BIND_CERTIFICATE/);
  assert.match(smoke?.run ?? "", /unknown_resource/);
  assert.match(evidence?.run ?? "", /image_digest=\$MCP_IMAGE_DIGEST/);
  assert.match(evidence?.run ?? "", /bicep_sha256=\$BICEP_SHA256/);
  assert.match(evidence?.run ?? "", /parameters_sha256=\$PARAMETERS_SHA256/);
  assert.match(evidence?.run ?? "", /what_if_sha256=/);
  assert.match(evidence?.run ?? "", /sbom_sha256=/);
  assert.match(evidence?.run ?? "", /provenance_sha256=/);

  const template = readFileSync("infra/bicep/mcp.bicep", "utf8");
  assert.doesNotMatch(template, /latestRevision:\s*true/);
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

test("deploy binds and verifies the canonical public web domains", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const steps = document.jobs.deploy.steps;
  const intent = steps.find((step) => step.name === "Verify deployment intent");
  const hostnameState = steps.find((step) => step.name === "Inspect public-web hostname state");
  const previewBootstrap = steps.find(
    (step) => step.name === "Preview public-web hostname bootstrap",
  );
  const preview = steps.find((step) => step.name === "Preview application changes");
  const preconditions = steps.find((step) => step.name === "Verify public-web domain preconditions");
  const bootstrap = steps.find((step) => step.name === "Bootstrap public-web hostnames");
  const deploy = steps.find((step) => step.name === "Deploy applications");
  const firstMutation = steps.find(
    (step) => step.name === "Configure PostgreSQL Entra administrator",
  );
  const smoke = steps.find((step) => step.name === "Smoke test public applications");

  assert.equal(document.jobs.deploy.env.WEB_CANONICAL_HOST, "keyforta.com");
  assert.equal(document.jobs.deploy.env.WEB_WWW_HOST, "www.keyforta.com");
  for (const step of [preview, deploy]) {
    assert.match(step?.with?.inlineScript ?? "", /webCanonicalHostName="\$WEB_CANONICAL_HOST"/);
    assert.match(step?.with?.inlineScript ?? "", /webWwwHostName="\$WEB_WWW_HOST"/);
  }
  assert.match(intent?.run ?? "", /hostname_bootstrap=/);
  assert.match(intent?.run ?? "", /EXPECTED_HOSTNAME_BOOTSTRAP/);
  assert.match(hostnameState?.if ?? "", /env\.DEPLOYMENT_SCOPE == 'full'/);
  assert.match(hostnameState?.run ?? "", /az containerapp hostname list/);
  assert.match(hostnameState?.run ?? "", /bootstrap_required=true/);
  assert.match(hostnameState?.run ?? "", /Planned hostname bootstrap state/);
  assert.match(hostnameState?.run ?? "", /Expected either zero or both public-web hostnames/);
  for (const step of [previewBootstrap, bootstrap]) {
    assert.match(step?.if ?? "", /env\.DEPLOYMENT_SCOPE == 'full'/);
    assert.match(step?.if ?? "", /steps\.hostname-state\.outputs\.bootstrap-required == 'true'/);
    assert.match(step?.with?.inlineScript ?? "", /bindWebCertificates=false/);
  }
  assert.ok(steps.indexOf(previewBootstrap) < steps.indexOf(preview));
  assert.ok(steps.indexOf(bootstrap) < steps.indexOf(deploy));
  assert.ok(steps.indexOf(hostnameState) < steps.indexOf(firstMutation));
  assert.ok(steps.indexOf(preconditions) < steps.indexOf(firstMutation));
  assert.match(preconditions?.if ?? "", /env\.DEPLOYMENT_SCOPE == 'public-web'/);
  assert.match(preconditions?.if ?? "", /env\.DEPLOYMENT_SCOPE == 'full'/);
  assert.match(preconditions?.run ?? "", /access-control-allow-origin: \$\{web_url\}/);
  assert.match(preconditions?.run ?? "", /properties\.staticIp/);
  assert.match(preconditions?.run ?? "", /customDomainVerificationId/);
  assert.match(preconditions?.run ?? "", /properties\.defaultDomain/);
  assert.match(preconditions?.run ?? "", /dig \+short A "\$WEB_CANONICAL_HOST"/);
  assert.match(preconditions?.run ?? "", /dig \+short CNAME "\$WEB_WWW_HOST"/);
  assert.match(smoke?.run ?? "", /web_url="https:\/\/\$\{WEB_CANONICAL_HOST\}"/);
  assert.match(smoke?.run ?? "", /www_path="\/properties\?city=Kinshasa"/);
  assert.match(smoke?.run ?? "", /301\|308/);
  assert.match(smoke?.run ?? "", /location: \$\{web_url\}\$\{www_path\}/);

  const evidence = steps.find(
    (step) => step.name === "Preserve SHA-bound deployment plan evidence",
  );
  assert.match(evidence?.run ?? "", /hostname_bootstrap=/);
});

test("public-web hostname inspection handles zero, both, partial, and drift states", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const script = document.jobs.deploy.steps.find(
    (step) => step.name === "Inspect public-web hostname state",
  )?.run;
  assert.ok(script);

  function inspect(hostnames, operation = "plan", expected = "") {
    const directory = mkdtempSync(join(tmpdir(), "keyforta-hostname-state-"));
    try {
      executable(directory, "az", '#!/usr/bin/env bash\nprintf "%s\\n" "$HOSTNAMES"\n');
      const output = join(directory, "output");
      const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENVIRONMENT: "test-environment",
          EXPECTED_HOSTNAME_BOOTSTRAP: expected,
          GITHUB_OUTPUT: output,
          HOSTNAMES: hostnames,
          OPERATION: operation,
          PATH: `${directory}:${process.env.PATH}`,
          RESOURCE_GROUP: "test-resource-group",
          WEB_CANONICAL_HOST: "keyforta.com",
          WEB_WWW_HOST: "www.keyforta.com",
        },
      });
      return {
        ...result,
        output: result.status === 0 ? readFileSync(output, "utf8") : "",
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  assert.match(inspect("").output, /bootstrap-required=true/);
  assert.match(
    inspect("keyforta.com\nwww.keyforta.com").output,
    /bootstrap-required=false/,
  );
  assert.notEqual(inspect("keyforta.com").status, 0);
  assert.equal(inspect("", "deploy", "true").status, 0);
  assert.notEqual(inspect("", "deploy", "false").status, 0);
});

test("initial full deployment validates DNS without existing API or web apps", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const script = document.jobs.deploy.steps.find(
    (step) => step.name === "Verify public-web domain preconditions",
  )?.run;
  assert.ok(script);

  const directory = mkdtempSync(join(tmpdir(), "keyforta-domain-preconditions-"));
  try {
    executable(
      directory,
      "az",
      `#!/usr/bin/env bash
case "$*" in
  *"containerapp list"*) exit 0 ;;
  *properties.staticIp*) echo 192.0.2.10 ;;
  *customDomainVerificationId*) echo verification-id ;;
  *properties.defaultDomain*) echo environment.example.test ;;
  *containerapp\\ show*) exit 1 ;;
  *) exit 1 ;;
esac
`,
    );
    executable(
      directory,
      "dig",
      `#!/usr/bin/env bash
case "$*" in
  *" A keyforta.com") echo 192.0.2.10 ;;
  *" CNAME www.keyforta.com") echo ca-keyforta-dev-web.environment.example.test. ;;
  *" TXT asuid.keyforta.com"|*" TXT asuid.www.keyforta.com") echo '"verification-id"' ;;
  *) exit 1 ;;
esac
`,
    );
    executable(directory, "curl", "#!/usr/bin/env bash\nexit 1\n");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENVIRONMENT: "test-environment",
        DEPLOYMENT_SCOPE: "full",
        ENVIRONMENT: "dev",
        PATH: `${directory}:${process.env.PATH}`,
        RESOURCE_GROUP: "test-resource-group",
        WEB_CANONICAL_HOST: "keyforta.com",
        WEB_WWW_HOST: "www.keyforta.com",
      },
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("public-web preconditions fail closed when API discovery fails", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const script = document.jobs.deploy.steps.find(
    (step) => step.name === "Verify public-web domain preconditions",
  )?.run;
  assert.ok(script);

  const directory = mkdtempSync(join(tmpdir(), "keyforta-api-precondition-"));
  try {
    executable(
      directory,
      "az",
      `#!/usr/bin/env bash
case "$*" in
  *"containerapp list"*) exit 1 ;;
  *properties.staticIp*) echo 192.0.2.10 ;;
  *customDomainVerificationId*) echo verification-id ;;
  *"containerapp show"*"-web"*) echo ca-keyforta-dev-web.environment.example.test ;;
  *) exit 1 ;;
esac
`,
    );
    executable(directory, "curl", "#!/usr/bin/env bash\necho called > \"$CALLED\"\nexit 1\n");
    executable(
      directory,
      "dig",
      `#!/usr/bin/env bash
echo called > "$CALLED"
case "$*" in
  *" A keyforta.com") echo 192.0.2.10 ;;
  *" CNAME www.keyforta.com") echo ca-keyforta-dev-web.environment.example.test. ;;
  *" TXT asuid.keyforta.com"|*" TXT asuid.www.keyforta.com") echo '"verification-id"' ;;
esac
`,
    );
    const called = join(directory, "called");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENVIRONMENT: "test-environment",
        CALLED: called,
        DEPLOYMENT_SCOPE: "full",
        ENVIRONMENT: "dev",
        PATH: `${directory}:${process.env.PATH}`,
        RESOURCE_GROUP: "test-resource-group",
        WEB_CANONICAL_HOST: "keyforta.com",
        WEB_WWW_HOST: "www.keyforta.com",
      },
    });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(called), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("public-web preconditions reject a present API without an ingress FQDN", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const script = document.jobs.deploy.steps.find(
    (step) => step.name === "Verify public-web domain preconditions",
  )?.run;
  assert.ok(script);

  const directory = mkdtempSync(join(tmpdir(), "keyforta-api-fqdn-precondition-"));
  try {
    executable(
      directory,
      "az",
      `#!/usr/bin/env bash
case "$*" in
  *"containerapp list"*"-api"*) echo ca-keyforta-dev-api ;;
  *"containerapp show"*"-api"*) exit 0 ;;
  *properties.staticIp*) echo 192.0.2.10 ;;
  *customDomainVerificationId*) echo verification-id ;;
  *"containerapp list"*"-web"*) echo ca-keyforta-dev-web ;;
  *"containerapp show"*"-web"*) echo ca-keyforta-dev-web.environment.example.test ;;
  *) exit 1 ;;
esac
`,
    );
    executable(directory, "curl", "#!/usr/bin/env bash\necho called > \"$CALLED\"\n");
    executable(directory, "dig", "#!/usr/bin/env bash\necho called > \"$CALLED\"\n");
    const called = join(directory, "called");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENVIRONMENT: "test-environment",
        CALLED: called,
        DEPLOYMENT_SCOPE: "full",
        ENVIRONMENT: "dev",
        PATH: `${directory}:${process.env.PATH}`,
        RESOURCE_GROUP: "test-resource-group",
        WEB_CANONICAL_HOST: "keyforta.com",
        WEB_WWW_HOST: "www.keyforta.com",
      },
    });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(called), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("public-web preconditions fail closed on web discovery errors", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const script = document.jobs.deploy.steps.find(
    (step) => step.name === "Verify public-web domain preconditions",
  )?.run;
  assert.ok(script);

  for (const failure of ["list", "show"]) {
    const directory = mkdtempSync(join(tmpdir(), "keyforta-web-precondition-"));
    try {
      executable(
        directory,
        "az",
        `#!/usr/bin/env bash
case "$*" in
  *"containerapp list"*"-api"*) exit 0 ;;
  *properties.staticIp*) echo 192.0.2.10 ;;
  *customDomainVerificationId*) echo verification-id ;;
  *"containerapp list"*"-web"*)
    if [ "$FAILURE" = list ]; then exit 1; fi
    echo ca-keyforta-dev-web
    ;;
  *"containerapp show"*"-web"*) exit 1 ;;
  *properties.defaultDomain*) echo environment.example.test ;;
  *) exit 1 ;;
esac
`,
      );
      executable(directory, "curl", "#!/usr/bin/env bash\necho called > \"$CALLED\"\n");
      executable(
        directory,
        "dig",
        `#!/usr/bin/env bash
echo called > "$CALLED"
case "$*" in
  *" A keyforta.com") echo 192.0.2.10 ;;
  *" CNAME www.keyforta.com") echo ca-keyforta-dev-web.environment.example.test. ;;
  *" TXT asuid.keyforta.com"|*" TXT asuid.www.keyforta.com") echo '"verification-id"' ;;
esac
`,
      );
      const called = join(directory, "called");
      const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
        encoding: "utf8",
        env: {
          ...process.env,
          APP_ENVIRONMENT: "test-environment",
          CALLED: called,
          DEPLOYMENT_SCOPE: "full",
          ENVIRONMENT: "dev",
          FAILURE: failure,
          PATH: `${directory}:${process.env.PATH}`,
          RESOURCE_GROUP: "test-resource-group",
          WEB_CANONICAL_HOST: "keyforta.com",
          WEB_WWW_HOST: "www.keyforta.com",
        },
      });
      assert.notEqual(result.status, 0, failure);
      assert.equal(existsSync(called), false, failure);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("public-web preconditions reject a present web app without an ingress FQDN", () => {
  const document = YAML.parse(readFileSync(".github/workflows/deploy.yml", "utf8"));
  const script = document.jobs.deploy.steps.find(
    (step) => step.name === "Verify public-web domain preconditions",
  )?.run;
  assert.ok(script);

  const directory = mkdtempSync(join(tmpdir(), "keyforta-web-fqdn-precondition-"));
  try {
    executable(
      directory,
      "az",
      `#!/usr/bin/env bash
case "$*" in
  *"containerapp list"*"-api"*) exit 0 ;;
  *properties.staticIp*) echo 192.0.2.10 ;;
  *customDomainVerificationId*) echo verification-id ;;
  *"containerapp list"*"-web"*) echo ca-keyforta-dev-web ;;
  *"containerapp show"*"-web"*) exit 0 ;;
  *properties.defaultDomain*) echo environment.example.test ;;
  *) exit 1 ;;
esac
`,
    );
    executable(directory, "curl", "#!/usr/bin/env bash\necho called > \"$CALLED\"\n");
    executable(
      directory,
      "dig",
      `#!/usr/bin/env bash
echo called > "$CALLED"
case "$*" in
  *" A keyforta.com") echo 192.0.2.10 ;;
  *" CNAME www.keyforta.com") echo ca-keyforta-dev-web.environment.example.test. ;;
  *" TXT asuid.keyforta.com"|*" TXT asuid.www.keyforta.com") echo '"verification-id"' ;;
esac
`,
    );
    const called = join(directory, "called");
    const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENVIRONMENT: "test-environment",
        CALLED: called,
        DEPLOYMENT_SCOPE: "full",
        ENVIRONMENT: "dev",
        PATH: `${directory}:${process.env.PATH}`,
        RESOURCE_GROUP: "test-resource-group",
        WEB_CANONICAL_HOST: "keyforta.com",
        WEB_WWW_HOST: "www.keyforta.com",
      },
    });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(called), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("application Bicep uses managed certificates for both public web domains", () => {
  const template = readFileSync("infra/bicep/apps.bicep", "utf8");
  assert.match(template, /param bindWebCertificates bool/);
  assert.match(template, /if \(deployWeb && bindWebCertificates\)/);
  assert.match(template, /bindingType: 'Disabled'/);
  assert.match(template, /name: 'keyforta-\$\{environment\}-web-apex-http'/);
  assert.match(template, /domainControlValidation: 'HTTP'[\s\S]*subjectName: webCanonicalHostName/);
  assert.match(template, /domainControlValidation: 'CNAME'[\s\S]*subjectName: webWwwHostName/);
  assert.match(template, /customDomains:[\s\S]*certificateId: webCanonicalCertificate\.id[\s\S]*certificateId: webWwwCertificate\.id/);
  assert.match(template, /var webPublicBaseUrl = 'https:\/\/\$\{webCanonicalHostName\}'/);
});

test("admin deployment remains secretless and independently authorized", () => {
  const template = readFileSync("infra/bicep/apps.bicep", "utf8");
  const dockerfile = readFileSync(
    "deployments/azure/docker/admin-web.Dockerfile",
    "utf8",
  );
  assert.match(template, /resource admin 'Microsoft\.App\/containerApps/);
  assert.match(template, /name: 'PLATFORM_ADMIN_OBJECT_IDS', value: platformAdminObjectIds/);
  assert.match(template, /\$\{webPublicBaseUrl\},\$\{adminPublicBaseUrl\}/);
  assert.match(template, /output adminFqdn string/);
  assert.match(dockerfile, /USER nginx/);
  assert.match(dockerfile, /ARG VITE_ENTRA_CLIENT_ID/);
  assert.doesNotMatch(dockerfile, /CLIENT_SECRET|PASSWORD|TOKEN=/i);
});

function workflowScript(name) {
  const workflow = workflows[name];
  const document = YAML.parse(readFileSync(workflow.file, "utf8"));
  const step = document.jobs[workflow.job].steps.find(
    (candidate) => candidate.name === workflow.step,
  );
  assert.ok(step?.run, `Missing run block for ${workflow.step}`);
  return step.run
    .replaceAll("${{ github.sha }}", "test-sha")
    .replaceAll(/\$\{\{ vars\.[A-Z0-9_]+ \}\}/g, "synthetic-value");
}

function executable(directory, name, source) {
  const file = join(directory, name);
  writeFileSync(file, source);
  chmodSync(file, 0o755);
}

function runScenario(workflow, failures = "", scope = "full", existingTags = "") {
  const directory = mkdtempSync(join(tmpdir(), "keyforta-workflow-test-"));
  try {
    const events = join(directory, "events");
    executable(
      directory,
      "az",
      `#!/usr/bin/env bash
set -eu
echo az >> "$EVENTS_FILE"
if [[ "$*" == *"acr repository show "* && "$*" == *"--query writeEnabled"* ]]; then
  printf 'false\n'
  exit 0
fi
if [[ "$*" == *"acr repository show-tags"* ]]; then
  for repository in \${EXISTING_TAGS//,/ }; do
    if [[ "$*" == *"--repository $repository"* ]]; then printf '%s\n' "$DEPLOYMENT_SHA"; fi
  done
fi
if [[ "$*" == *"acr repository show "* && "$*" == *"--image"* ]]; then
  printf 'sha256:%064d\n' 1
fi
`,
    );
    executable(
      directory,
      "docker",
      `#!/usr/bin/env bash
set -eu
command_name="$1"
shift
component=unknown
for argument in "$@"; do
  case "$argument" in
    *deployments/azure/docker/api.Dockerfile*) component=api ;;
    *deployments/azure/docker/public-web.Dockerfile*) component=web ;;
    *deployments/azure/docker/admin-web.Dockerfile*) component=admin ;;
  esac
done
if [ "$component" = unknown ]; then exit 19; fi
touch "$TEST_STATE/$component.started"
if [ "$DEPLOYMENT_SCOPE" = full ]; then
  while [ "$(find "$TEST_STATE" -name '*.started' | wc -l | tr -d ' ')" -lt 3 ]; do
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
if [ "$result" -eq 0 ]; then echo "publish:$component" >> "$EVENTS_FILE"; fi
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
          API_PUBLIC_BASE_URL: "https://api.example.test/api/v1",
          DEPLOYMENT_SHA: "test-sha",
          DEPLOYMENT_SCOPE: scope,
          EVENTS_FILE: events,
          EXISTING_TAGS: existingTags,
          FAILURES: failures,
          GITHUB_ENV: join(directory, "github-env"),
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
    assert.ok(result.events.includes("build:admin"));
  });

  for (const failures of ["api", "web", "admin", "api,web,admin"]) {
    test(`${workflow} blocks after ${failures} build failure`, () => {
      const result = runScenario(workflow, failures);
      assert.notEqual(result.status, 0);
      assert.ok(
        result.events.some((event) => event.startsWith("complete:api:")),
      );
      assert.ok(
        result.events.some((event) => event.startsWith("complete:web:")),
      );
      assert.ok(
        result.events.some((event) => event.startsWith("complete:admin:")),
      );
      for (const component of failures.split(",")) {
        const title = component === "api" ? "API" : component === "web" ? "Web" : "Admin";
        assert.match(
          `${result.stdout}\n${result.stderr}`,
          new RegExp(`${title} container build failed`),
        );
      }
    });
  }
}

test("deploy plan publishes every successfully built image", () => {
  const result = runScenario("deploy");
  assert.equal(result.status, 0);
  assert.equal(
    result.events.filter((event) => event.startsWith("publish:")).length,
    3,
  );
});

test("deploy rejects an existing immutable image tag before building", () => {
  const result = runScenario("deploy", "", "api", "keyforta-api");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Immutable image tag keyforta-api:test-sha already exists/);
  assert.equal(result.events.some((event) => event.startsWith("build:")), false);
  assert.equal(result.events.some((event) => event.startsWith("publish:")), false);
});

for (const [scope, expectedComponent] of [
  ["api", "api"],
  ["postgres", "api"],
  ["public-web", "web"],
  ["admin-web", "admin"],
]) {
  test(`deploy ${scope} scope publishes only its required image`, () => {
    const result = runScenario("deploy", "", scope);
    assert.equal(result.status, 0);
    assert.deepEqual(
      result.events.filter((event) => event.startsWith("build:")),
      [`build:${expectedComponent}`],
    );
    assert.equal(
      result.events.filter((event) => event.startsWith("publish:")).length,
      1,
    );
    assert.equal(
      result.events.find((event) => event.startsWith("publish:")),
      `publish:${expectedComponent}`,
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
  assert.match(step("Verify admin API dependency")?.if ?? "", /admin-web/);
  assert.match(
    step("Verify admin API dependency")?.run ?? "",
    /access-control-allow-origin: \$\{ADMIN_PUBLIC_BASE_URL\}/,
  );
  assert.match(
    step("Verify admin API dependency")?.run ?? "",
    /Deploy the API or use full scope before admin-web/,
  );
  assert.ok(
    steps.indexOf(step("Verify admin API dependency")) <
      steps.indexOf(step("Deploy applications")),
  );
  assert.ok(
    steps.indexOf(step("Verify reviewed hostname bootstrap plan still applies")) <
      steps.indexOf(step("Bootstrap public-web hostnames")),
  );
  assert.match(step("Verify deployment intent")?.run ?? "", /expected_scope="\$DEPLOYMENT_SCOPE"/);
  assert.match(step("Verify deployment intent")?.run ?? "", /grep -Fx "scope=\$expected_scope"/);
  assert.match(step("Preview database and job changes")?.if ?? "", /inputs\.operation != 'deploy-foundation'/);
  assert.match(step("Preview database and job changes")?.run ?? "", /apiImage="\$API_IMAGE"/);
  assert.match(step("Verify reviewed database and job plans still apply")?.run ?? "", /compare_plan database-access/);
  assert.ok(
    steps.indexOf(step("Verify reviewed database and job plans still apply")) <
      steps.indexOf(step("Configure PostgreSQL Entra administrator")),
  );
  assert.match(step("Deploy migration job")?.if ?? "", /DEPLOYMENT_SCOPE == 'postgres'/);
  assert.doesNotMatch(step("Deploy migration job")?.if ?? "", /DEPLOYMENT_SCOPE == 'api'/);
  assert.match(step("Deploy applications")?.if ?? "", /DEPLOYMENT_SCOPE != 'postgres'/);
  for (const name of [
    "Preview public-web hostname bootstrap",
    "Preview application changes",
    "Bootstrap public-web hostnames",
    "Deploy applications",
  ]) {
    const script = step(name)?.with?.inlineScript ?? "";
    assert.match(script, /platformAdminObjectIds="\$PLATFORM_ADMIN_OBJECT_IDS"/);
    assert.match(script, /adminImage="\$ADMIN_IMAGE"/);
  }
  const publish = step("Build and push immutable images")?.run ?? "";
  assert.match(publish, /NEXT_PUBLIC_ENTRA_CLIENT_ID/);
  assert.match(publish, /VITE_ENTRA_CLIENT_ID/);
  assert.match(publish, /keyforta-admin-web:\$DEPLOYMENT_SHA/);
});
