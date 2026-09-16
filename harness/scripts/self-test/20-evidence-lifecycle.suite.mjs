import { execFileSync } from "node:child_process";
import { parse } from "yaml";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { databaseEnvironment, readJson, validateEvidence } from "../lib.mjs";
import {
  guardGeneratedReports,
  snapshotGeneratedReports as snapshotReports,
} from "../report-retention-guard.mjs";
import {
  buildEvidenceManifest,
  declaredToolVersions,
  dependencyArtifactRecords,
  effectiveEvidencePolicy,
  sha256,
  taskEvidenceReference,
  transitionArtifactRecords,
  validateArtifactRecords,
  validateClassification,
  validateCurrentState,
  validateEvidenceManifest,
  validateStateHistory,
  validateTransition,
} from "../edd-lib.mjs";
import {
  evidencePolicy,
  evidenceSchema,
  syntheticGit,
  syntheticManifest,
  valid,
} from "./fixtures.mjs";

function snapshotGeneratedReports(
  sourceDirectory,
  snapshotDirectory,
  patterns,
  beforeOpen,
  afterReadChunk,
) {
  return snapshotReports(
    sourceDirectory,
    snapshotDirectory,
    patterns,
    beforeOpen,
    afterReadChunk,
    process.platform === "linux" ? undefined : (_descriptor, path) => path,
  );
}

function checkoutCredentialsAreDisabled(source) {
  const workflow = parse(source);
  const jobs = Object.values(workflow?.jobs ?? {});
  const checkoutSteps = jobs.flatMap(({ steps = [] }) =>
    steps.filter(({ uses }) => /^actions\/checkout@/.test(uses ?? "")),
  );
  return (
    checkoutSteps.length > 0 &&
    checkoutSteps.every(
      (step) => step.with?.["persist-credentials"] === false,
    )
  );
}

function isolatedValidationToolingIsAccessible(source) {
  const workflow = parse(source);
  const steps = Object.values(workflow?.jobs ?? {}).flatMap(
    ({ steps = [] }) => steps,
  );
  const setup = steps.find(({ uses }) =>
    /^pnpm\/action-setup@/.test(uses ?? ""),
  );
  const seal = steps.find(({ name }) => name === "Seal pnpm installation");
  return (
    setup?.id === "pnpm" &&
    setup.with?.dest ===
      "/tmp/keyforta-pnpm-${{ github.run_id }}-${{ github.run_attempt }}" &&
    seal?.run?.includes(
      'chmod -R u+rwX,go+rX,go-w -- "${{ steps.pnpm.outputs.dest }}"',
    )
  );
}

function isolatedValidationUsesProducerHome(source) {
  const workflow = parse(source);
  const commands = Object.values(workflow?.jobs ?? {}).flatMap(
    ({ steps = [] }) =>
      steps.flatMap(({ run = "" }) =>
        run
          .split("\n")
          .map((command) => command.trim())
          .filter((command) => command.includes('-u "$VALIDATION_USER" env')),
      ),
  );
  const requiredEnvironment = [
    'CI="$CI"',
    'HARNESS_CONTRACT_MODE="$HARNESS_CONTRACT_MODE"',
    'HARNESS_BASE_REF="$HARNESS_BASE_REF"',
    'HARNESS_TASK_CONTRACT="$HARNESS_TASK_CONTRACT"',
    'GITHUB_HEAD_REF="$GITHUB_HEAD_REF"',
    'GITHUB_REF_NAME="$GITHUB_REF_NAME"',
    'HOME="$VALIDATION_HOME"',
    'XDG_CONFIG_HOME="$VALIDATION_HOME/.config"',
    'XDG_CACHE_HOME="$VALIDATION_HOME/.cache"',
    'XDG_DATA_HOME="$VALIDATION_HOME/.local/share"',
    'XDG_STATE_HOME="$VALIDATION_HOME/.local/state"',
    'PATH="$PATH"',
  ];
  const commandPrefix =
    "sudo sh -c 'echo $$ > \"$1/cgroup.procs\"; shift; exec \"$@\"' sh \"$VALIDATION_CGROUP\" sudo -u \"$VALIDATION_USER\" env -i " +
    `${requiredEnvironment.join(" ")} `;
  const expectedCommands = new Set([
    "pnpm install --frozen-lockfile",
    "node harness/scripts/verify.mjs",
    "node harness/scripts/generate-evidence.mjs",
    "pnpm verify:evidence",
    "EDD_VALIDATE_CURRENT_STATE=true EDD_SATISFIED_CHECKS=dependency-audit,verify:evidence pnpm verify:transition",
  ]);
  return (
    commands.length === expectedCommands.size &&
    commands.every(
      (command) => {
        if (!command.startsWith(commandPrefix)) return false;
        return expectedCommands.delete(command.slice(commandPrefix.length));
      },
    )
    && expectedCommands.size === 0
  );
}

function producerEnvironmentSurvivesLauncher(source) {
  const workflow = parse(source);
  const validationJob = Object.values(workflow?.jobs ?? {})[0];
  const install = validationJob?.steps
    .find(({ name }) => name === "Install dependencies");
  if (!install?.run?.endsWith("pnpm install --frozen-lockfile")) return false;

  const currentUser = execFileSync("id", ["-un"], {
    encoding: "utf8",
  }).trim();
  if (
    process.env.CI === "true" &&
    currentUser === validationJob.env.VALIDATION_USER
  ) {
    const taskContract = validationJob.env.HARNESS_TASK_CONTRACT.match(
      /'(harness\/tasks\/[^']+)'/u,
    )?.[1];
    const expectedLiveEnvironment = {
      CI: "true",
      HARNESS_CONTRACT_MODE: "required",
      HARNESS_TASK_CONTRACT: taskContract,
      HOME: validationJob.env.VALIDATION_HOME,
      XDG_CONFIG_HOME: `${validationJob.env.VALIDATION_HOME}/.config`,
      XDG_CACHE_HOME: `${validationJob.env.VALIDATION_HOME}/.cache`,
      XDG_DATA_HOME: `${validationJob.env.VALIDATION_HOME}/.local/share`,
      XDG_STATE_HOME: `${validationJob.env.VALIDATION_HOME}/.local/state`,
    };
    return (
      Object.entries(expectedLiveEnvironment).every(
        ([name, value]) => process.env[name] === value,
      ) &&
      ["HARNESS_BASE_REF", "GITHUB_HEAD_REF", "GITHUB_REF_NAME", "PATH"].every(
        (name) => Boolean(process.env[name]),
      ) &&
      !Object.hasOwn(process.env, "KEYFORTA_AMBIENT_SECRET")
    );
  }

  const fixture = mkdtempSync(join(tmpdir(), "keyforta-launcher-"));
  const cgroup = join(fixture, "cgroup");
  const observer = join(fixture, "observe.mjs");
  const path = process.env.PATH;
  const expected = {
    CI: "true",
    HARNESS_CONTRACT_MODE: "required",
    HARNESS_BASE_REF: "base sha; printf not-executed",
    HARNESS_TASK_CONTRACT: "harness/tasks/HAR-010.json",
    GITHUB_HEAD_REF: 'fix/quoted "branch" $value',
    GITHUB_REF_NAME: "13/merge",
    HOME: "/home/keyforta-ci",
    XDG_CONFIG_HOME: "/home/keyforta-ci/.config",
    XDG_CACHE_HOME: "/home/keyforta-ci/.cache",
    XDG_DATA_HOME: "/home/keyforta-ci/.local/share",
    XDG_STATE_HOME: "/home/keyforta-ci/.local/state",
    PATH: path,
  };
  try {
    mkdirSync(cgroup);
    writeFileSync(
      observer,
      "process.stdout.write(JSON.stringify(process.env));\n",
    );
    const observed = JSON.parse(
      execFileSync(
        "sh",
        [
          "-c",
          install.run.replace(
            "pnpm install --frozen-lockfile",
            `${JSON.stringify(process.execPath)} ${JSON.stringify(observer)}`,
          ),
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            ...expected,
            VALIDATION_CGROUP: cgroup,
            VALIDATION_HOME: expected.HOME,
            VALIDATION_USER: currentUser,
            KEYFORTA_AMBIENT_SECRET: "must-not-survive",
          },
        },
      ),
    );
    return (
      Object.entries(expected).every(
        ([name, value]) => observed[name] === value,
      ) && !Object.hasOwn(observed, "KEYFORTA_AMBIENT_SECRET")
    );
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
}

const candidateTarCommand =
  'sudo tar --create --file "$RUNNER_TEMP/keyforta-report-candidate.tar" --directory "$VALIDATION_WORKSPACE/harness" reports';

function executableCommands(run = "") {
  return run
    .split("\n")
    .filter((command) => command !== "" && !command.startsWith("#"));
}

function packageGuardsPrecedeTar(run = "") {
  const commands = executableCommands(run);
  const requiredCommands = [
    'sudo test -f "$VALIDATION_CONTROL/producer-stopped"',
    'sudo test -d "$VALIDATION_WORKSPACE"',
    'sudo test ! -L "$VALIDATION_WORKSPACE"',
    'sudo test -d "$VALIDATION_WORKSPACE/harness"',
    'sudo test ! -L "$VALIDATION_WORKSPACE/harness"',
    candidateTarCommand,
  ];
  return (
    commands.length === requiredCommands.length &&
    requiredCommands.every((command, index) => commands[index] === command)
  );
}

function packageCandidateIsUnique(steps, packageCandidate) {
  const packageSteps = steps.filter(
    ({ name }) => name === "Package untrusted engineering evidence",
  );
  const tarCommands = steps
    .flatMap(({ run }) => executableCommands(run))
    .filter((command) => /(^|[\s/\\])tar(\s|$)/u.test(command));
  return (
    packageSteps.length === 1 &&
    packageSteps[0] === packageCandidate &&
    tarCommands.length === 1 &&
    tarCommands[0] === candidateTarCommand &&
    packageGuardsPrecedeTar(packageCandidate.run)
  );
}

function isolatedValidationWorkspaceIsBounded(source) {
  const workflow = parse(source);
  const validationJob = Object.values(workflow?.jobs ?? {})[0];
  const steps = validationJob?.steps ?? [];
  const create = steps.find(
    ({ name }) => name === "Create unprivileged validation user",
  );
  const producerSteps = steps.filter(({ run = "" }) =>
    run.includes('-u "$VALIDATION_USER" env'),
  );
  const stop = steps.find(({ name }) => name === "Stop validation producer");
  const packageCandidate = steps.find(
    ({ name }) => name === "Package untrusted engineering evidence",
  );
  const uploadCandidate = steps.find(
    ({ name }) => name === "Upload untrusted engineering evidence",
  );
  const cleanup = steps.find(
    ({ name }) => name === "Remove validation workspace",
  );
  return (
    validationJob?.env?.VALIDATION_WORKSPACE ===
      "/tmp/keyforta-workspace-${{ github.run_id }}-${{ github.run_attempt }}" &&
    validationJob?.env?.VALIDATION_CGROUP ===
      "/sys/fs/cgroup/keyforta-ci-${{ github.run_id }}-${{ github.run_attempt }}" &&
    validationJob?.env?.VALIDATION_CONTROL ===
      "/run/keyforta-ci-${{ github.run_id }}-${{ github.run_attempt }}" &&
    validationJob?.env?.HARNESS_TASK_CONTRACT ===
      "${{ github.event.pull_request.number == 13 && 'harness/tasks/HAR-012.json' || '' }}" &&
    create?.run?.includes('sudo mkdir -- "$VALIDATION_CGROUP"') &&
    create.run.includes(
      'sudo install --directory --owner=root --group=root --mode=0700 "$VALIDATION_CONTROL"',
    ) &&
    create?.run?.includes(
      'sudo cp -a -- "$GITHUB_WORKSPACE/." "$VALIDATION_WORKSPACE/"',
    ) &&
    create.run.includes(
      'sudo chown -R "$VALIDATION_USER:$VALIDATION_USER" "$VALIDATION_WORKSPACE"',
    ) &&
    producerSteps.length === 3 &&
    producerSteps.every(
      (step) =>
        step["working-directory"] === "${{ env.VALIDATION_WORKSPACE }}" &&
        step.run
          .split("\n")
          .filter((command) => command.includes('-u "$VALIDATION_USER" env'))
          .every((command) => command.includes('"$VALIDATION_CGROUP"')),
    ) &&
    stop &&
    packageCandidate &&
    uploadCandidate &&
    steps.indexOf(packageCandidate) === steps.indexOf(stop) + 1 &&
    steps.indexOf(uploadCandidate) === steps.indexOf(packageCandidate) + 1 &&
    stop.id === "stop-producer" &&
    stop.run.includes('sudo usermod --lock --expiredate 1 "$VALIDATION_USER"') &&
    stop.run.includes('echo 1 > "$1/cgroup.kill"') &&
    stop.run.includes('"$VALIDATION_CGROUP/cgroup.events"') &&
    stop.run.includes('sudo rmdir "$VALIDATION_CGROUP"') &&
    stop.run.includes(
      'sudo install --owner=root --group=root --mode=0400 /dev/null "$VALIDATION_CONTROL/producer-stopped"',
    ) &&
    packageCandidate.id === "package-candidate" &&
    packageCandidate.if.includes("steps.stop-producer.outcome == 'success'") &&
    packageCandidate.run.includes(
      'sudo test -f "$VALIDATION_CONTROL/producer-stopped"',
    ) &&
    packageCandidateIsUnique(steps, packageCandidate) &&
    !packageCandidate.run.includes("chown") &&
    !packageCandidate.run.includes("verify-reports.mjs") &&
    uploadCandidate.if.includes("steps.stop-producer.outcome == 'success'") &&
    uploadCandidate.if.includes(
      "steps.package-candidate.outcome == 'success'",
    ) &&
    cleanup.run.includes('"$VALIDATION_CONTROL"') &&
    cleanup?.run?.includes('"$VALIDATION_WORKSPACE"')
  );
}

function finalEvidenceIncludesCiAudit(source) {
  const workflow = parse(source);
  const steps = Object.values(workflow?.jobs ?? {}).flatMap(
    ({ steps = [] }) => steps,
  );
  const evidence = steps.find(
    ({ name }) => name === "Generate final commit evidence",
  );
  return evidence?.run?.includes(
    "EDD_SATISFIED_CHECKS=dependency-audit,verify:evidence pnpm verify:transition",
  );
}

function retentionUsesTrustedWorkflow(validationSource, retentionSource) {
  const validation = parse(validationSource);
  const retention = parse(retentionSource);
  const validationJob = Object.values(validation?.jobs ?? {})[0];
  const validationSteps = Object.values(validation?.jobs ?? {}).flatMap(
    ({ steps = [] }) => steps,
  );
  const retentionJob = Object.values(retention?.jobs ?? {})[0];
  const retentionSteps = retentionJob?.steps ?? [];
  const checkout = retentionSteps.find(({ uses }) =>
    /^actions\/checkout@/.test(uses ?? ""),
  );
  const download = retentionSteps.find(
    ({ name }) => name === "Download untrusted engineering evidence",
  );
  const scan = retentionSteps.find(
    ({ name }) => name === "Scan and snapshot candidate evidence",
  );
  const upload = retentionSteps.find(({ uses }) =>
    /^actions\/upload-artifact@/.test(uses ?? ""),
  );
  const candidateUpload = validationSteps.find(
    ({ name }) => name === "Upload untrusted engineering evidence",
  );
  const candidatePackage = validationSteps.find(
    ({ name }) => name === "Package untrusted engineering evidence",
  );
  return (
    validationJob?.env?.HARNESS_TASK_CONTRACT ===
      "${{ github.event.pull_request.number == 13 && 'harness/tasks/HAR-012.json' || '' }}" &&
    retention?.on?.workflow_run?.workflows?.includes("CI") &&
    retention?.permissions?.contents === "read" &&
    retention?.permissions?.actions === "read" &&
    retentionJob?.if === "github.event.workflow_run.event == 'pull_request'" &&
    checkout?.with?.ref === "${{ github.sha }}" &&
    checkout.with?.["persist-credentials"] === false &&
    retentionSteps
      .filter(({ uses }) => uses)
      .every(({ uses }) => /@[0-9a-f]{40}$/.test(uses.split(" ")[0])) &&
    download?.env?.KEYFORTA_ARTIFACT_RUN_ID ===
      "${{ github.event.workflow_run.id }}" &&
    download.env?.KEYFORTA_ARTIFACT_NAME ===
      "untrusted-engineering-evidence-${{ github.event.workflow_run.head_sha }}" &&
    download.run === "python3 harness/scripts/download-report-candidate.py" &&
    scan?.run?.includes("extract-report-candidate.py") &&
    scan.run.includes("node harness/scripts/verify-reports.mjs") &&
    upload?.with?.path === "${{ runner.temp }}/keyforta-evidence/" &&
    upload.with?.["include-hidden-files"] === true &&
    candidatePackage?.run?.includes("tar --create") &&
    !candidatePackage.run.includes("--dereference") &&
    candidateUpload?.with?.path ===
      "${{ runner.temp }}/keyforta-report-candidate.tar" &&
    !validationSteps.some(({ run = "" }) =>
      run.includes("verify-reports.mjs"),
    ) &&
    !readFileSync("harness/scripts/verify.mjs", "utf8").includes(
      "report-retention-guard.mjs",
    )
  );
}

export function registerSuite({ check }) {
  check("unsafe generated reports are removed before retention", () => {
    const reportDirectory = "harness/reports/self-test-retention-guard";
    mkdirSync(reportDirectory, { recursive: true });
    const syntheticCredential = "API_" + "KEY=fakevalue123";
    writeFileSync(
      `${reportDirectory}/${syntheticCredential}.json`,
      `${JSON.stringify({ status: "synthetic" })}\n`,
    );
    const result = guardGeneratedReports(
      reportDirectory,
      readJson("harness/policies/repository-policy.json")
        .forbiddenSecretPatterns,
    );
    return !result.safe && !existsSync(reportDirectory);
  });
  check("secret-bearing non-JSON reports produce no snapshot", () => {
    const reportDirectory = "harness/reports/self-test-text-snapshot-source";
    const snapshotDirectory =
      "harness/retained-reports/self-test-text-snapshot";
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(
      `${reportDirectory}/unsafe.txt`,
      "API_" + "KEY=fakevalue123\n",
    );
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      readJson("harness/policies/repository-policy.json")
        .forbiddenSecretPatterns,
    );
    return (
      !result.safe &&
      !existsSync(reportDirectory) &&
      !existsSync(snapshotDirectory)
    );
  });
  check("UTF-16 and binary reports produce no snapshot", () => {
    const reportDirectory = "harness/reports/self-test-binary-source";
    const snapshotDirectory = "harness/retained-reports/self-test-binary";
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(
      `${reportDirectory}/unsafe.txt`,
      Buffer.from("API_" + "KEY=fakevalue123\n", "utf16le"),
    );
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      readJson("harness/policies/repository-policy.json")
        .forbiddenSecretPatterns,
    );
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("nested failure reports are retained in the snapshot", () => {
    const reportDirectory = "harness/reports/self-test-nested-source";
    const snapshotDirectory = "harness/retained-reports/self-test-nested";
    mkdirSync(`${reportDirectory}/failures/HAR-007`, { recursive: true });
    const content = Buffer.from('{"status":"café"}\n', "utf8");
    writeFileSync(`${reportDirectory}/failures/HAR-007/failure.json`, content);
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
    );
    const copied = readFileSync(
      `${snapshotDirectory}/failures/HAR-007/failure.json`,
    );
    rmSync(reportDirectory, { force: true, recursive: true });
    rmSync(snapshotDirectory, { force: true, recursive: true });
    return result.safe && copied.equals(content);
  });
  check("candidate archives preserve links for trusted rejection", () => {
    const fixture = "harness/reports/self-test-candidate-archive";
    const source = `${fixture}/source`;
    const extracted = `${fixture}/extracted`;
    const archive = `${fixture}/candidate.tar`;
    mkdirSync(`${source}/reports`, { recursive: true });
    writeFileSync(`${fixture}/outside.txt`, "outside evidence\n");
    symlinkSync("../../outside.txt", `${source}/reports/link.txt`);
    execFileSync("tar", ["--create", "--file", archive, "--directory", source, "reports"]);
    let blocked = false;
    try {
      execFileSync("python3", [
        "harness/scripts/extract-report-candidate.py",
        archive,
        extracted,
      ]);
    } catch {
      blocked = true;
    }
    const passed = blocked && !existsSync(extracted);
    rmSync(fixture, { force: true, recursive: true });
    return passed;
  });
  check("candidate archive extraction preserves hidden multibyte bytes", () => {
    const fixture = "harness/reports/self-test-candidate-exact";
    const source = `${fixture}/source`;
    const extracted = `${fixture}/extracted`;
    const snapshot = `${fixture}/snapshot`;
    const archive = `${fixture}/candidate.tar`;
    const content = Buffer.from("café evidence\n", "utf8");
    mkdirSync(`${source}/reports/.hidden`, { recursive: true });
    writeFileSync(`${source}/reports/.hidden/report.txt`, content);
    execFileSync("tar", ["--create", "--file", archive, "--directory", source, "reports"]);
    execFileSync("python3", ["harness/scripts/extract-report-candidate.py", archive, extracted]);
    const result = snapshotGeneratedReports(`${extracted}/reports`, snapshot, []);
    const copied = readFileSync(`${snapshot}/.hidden/report.txt`);
    rmSync(fixture, { force: true, recursive: true });
    return result.safe && copied.equals(content);
  });
  check("duplicate candidate roots fail closed", () => {
    const fixture = "harness/reports/self-test-candidate-duplicate-root";
    const source = `${fixture}/source`;
    const extracted = `${fixture}/extracted`;
    const archive = `${fixture}/candidate.tar`;
    mkdirSync(`${source}/reports`, { recursive: true });
    execFileSync("tar", ["--create", "--file", archive, "--directory", source, "reports"]);
    execFileSync("tar", ["--append", "--file", archive, "--directory", source, "reports"]);
    let blocked = false;
    try {
      execFileSync("python3", ["harness/scripts/extract-report-candidate.py", archive, extracted]);
    } catch {
      blocked = true;
    }
    const passed = blocked && !existsSync(extracted);
    rmSync(fixture, { force: true, recursive: true });
    return passed;
  });
  check("candidate ZIP preflight rejects excessive entries", () => {
    const script = [
      "import importlib.util, pathlib, tempfile, zipfile",
      "spec = importlib.util.spec_from_file_location('downloader', 'harness/scripts/download-report-candidate.py')",
      "module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
      "root = pathlib.Path(tempfile.mkdtemp()); archive = root / 'candidate.zip'",
      "with zipfile.ZipFile(archive, 'w') as output: output.writestr('one', b'x'); output.writestr('two', b'y')",
      "try: module.require_single_zip_entry(archive)",
      "except ValueError: raise SystemExit(0)",
      "raise SystemExit(1)",
    ].join("\n");
    execFileSync("python3", ["-B", "-c", script]);
    return true;
  });
  check("candidate downloader strips auth on cross-host redirects", () => {
    const script = [
      "import importlib.util, urllib.request",
      "spec = importlib.util.spec_from_file_location('downloader', 'harness/scripts/download-report-candidate.py')",
      "module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
      "handler = module.SafeRedirectHandler()",
      "request = urllib.request.Request('https://api.github.com/source', headers={'Authorization': 'Bearer secret'})",
      "redirected = handler.redirect_request(request, None, 302, 'Found', {}, 'https://signed.example/artifact')",
      "raise SystemExit(1 if redirected.has_header('Authorization') else 0)",
    ].join("\n");
    execFileSync("python3", ["-B", "-c", script]);
    return true;
  });
  check("candidate downloader strips auth on HTTPS downgrade", () => {
    const script = [
      "import importlib.util, urllib.request",
      "spec = importlib.util.spec_from_file_location('downloader', 'harness/scripts/download-report-candidate.py')",
      "module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
      "handler = module.SafeRedirectHandler()",
      "request = urllib.request.Request('https://api.github.com/source', headers={'Authorization': 'Bearer secret'})",
      "redirected = handler.redirect_request(request, None, 302, 'Found', {}, 'http://api.github.com/artifact')",
      "raise SystemExit(1 if redirected.has_header('Authorization') else 0)",
    ].join("\n");
    execFileSync("python3", ["-B", "-c", script]);
    return true;
  });
  check("symlinked report roots produce no snapshot", () => {
    const targetDirectory = "harness/reports/self-test-root-link-target";
    const reportDirectory = "harness/reports/self-test-root-link";
    const snapshotDirectory = "harness/retained-reports/self-test-root-link";
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(`${targetDirectory}/report.txt`, "safe evidence\n");
    symlinkSync("self-test-root-link-target", reportDirectory);
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
    );
    rmSync(targetDirectory, { force: true, recursive: true });
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("nested symlinks produce no snapshot", () => {
    const reportDirectory = "harness/reports/self-test-nested-link-source";
    const snapshotDirectory = "harness/retained-reports/self-test-nested-link";
    const target = "harness/reports/self-test-nested-link-target.txt";
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(target, "safe evidence\n");
    symlinkSync("../self-test-nested-link-target.txt", `${reportDirectory}/link`);
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
    );
    unlinkSync(target);
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("oversized reports produce no snapshot", () => {
    const reportDirectory = "harness/reports/self-test-oversized-source";
    const snapshotDirectory = "harness/retained-reports/self-test-oversized";
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(`${reportDirectory}/large.txt`, Buffer.alloc(10 * 1024 * 1024 + 1));
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
    );
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("report entry counts are bounded during enumeration", () => {
    const reportDirectory = "harness/reports/self-test-entry-limit-source";
    const snapshotDirectory = "harness/retained-reports/self-test-entry-limit";
    mkdirSync(reportDirectory, { recursive: true });
    for (let index = 0; index <= 1_000; index += 1) {
      writeFileSync(`${reportDirectory}/${String(index).padStart(4, "0")}.txt`, "x");
    }
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
    );
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("aggregate report bytes are bounded across failed files", () => {
    const reportDirectory = "harness/reports/self-test-total-limit-source";
    const snapshotDirectory = "harness/retained-reports/self-test-total-limit";
    mkdirSync(reportDirectory, { recursive: true });
    for (let index = 0; index < 7; index += 1) {
      const report = `${reportDirectory}/${index}.txt`;
      writeFileSync(report, Buffer.alloc(70 * 1024, 0x61));
    }
    let consumedBytes = 0;
    const extendedFiles = new Set();
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
      () => {},
      (file, _fileBytes, aggregateBytes) => {
        consumedBytes = aggregateBytes;
        if (extendedFiles.has(file)) return;
        extendedFiles.add(file);
        truncateSync(file, 10 * 1024 * 1024 + 70 * 1024);
      },
    );
    return (
      !result.safe &&
      consumedBytes === 50 * 1024 * 1024 + 1 &&
      !existsSync(snapshotDirectory)
    );
  });
  check("report directory depth is bounded", () => {
    const reportDirectory = "harness/reports/self-test-depth-limit-source";
    const snapshotDirectory = "harness/retained-reports/self-test-depth-limit";
    let nestedDirectory = reportDirectory;
    for (let depth = 0; depth < 18; depth += 1) {
      nestedDirectory = `${nestedDirectory}/nested`;
    }
    mkdirSync(nestedDirectory, { recursive: true });
    writeFileSync(`${nestedDirectory}/report.txt`, "safe evidence\n");
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
    );
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("same-inode growth before open is bounded", () => {
    const reportDirectory = "harness/reports/self-test-pre-open-growth-source";
    const snapshotDirectory = "harness/retained-reports/self-test-pre-open-growth";
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(`${reportDirectory}/report.txt`, "x");
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
      (file) => writeFileSync(file, Buffer.alloc(10 * 1024 * 1024 + 1), { flag: "a" }),
    );
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("same-inode growth during chunked reads is bounded", () => {
    const reportDirectory = "harness/reports/self-test-read-growth-source";
    const snapshotDirectory = "harness/retained-reports/self-test-read-growth";
    const report = `${reportDirectory}/report.txt`;
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(report, Buffer.alloc(70 * 1024, 0x61));
    let extended = false;
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
      () => {},
      (file) => {
        if (extended) return;
        extended = true;
        writeFileSync(file, Buffer.alloc(10 * 1024 * 1024, 0x61), { flag: "a" });
      },
    );
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("FIFO replacement races fail closed without blocking", () => {
    const reportDirectory = "harness/reports/self-test-fifo-race-source";
    const snapshotDirectory = "harness/retained-reports/self-test-fifo-race";
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(`${reportDirectory}/report.txt`, "safe evidence\n");
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      [],
      (file) => {
        unlinkSync(file);
        execFileSync("mkfifo", [file]);
      },
    );
    return !result.safe && !existsSync(snapshotDirectory);
  });
  check("each report entry is scanned independently", () => {
    const reportDirectory = "harness/reports/self-test-independent-source";
    const snapshotDirectory = "harness/retained-reports/self-test-independent";
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(
      `${reportDirectory}/a-unsafe.txt`,
      "API_" + "KEY=fakevalue123\n",
    );
    writeFileSync(`${reportDirectory}/z-safe.txt`, "safe evidence\n");
    const result = snapshotGeneratedReports(
      reportDirectory,
      snapshotDirectory,
      readJson("harness/policies/repository-policy.json")
        .forbiddenSecretPatterns,
    );
    return (
      !result.safe &&
      result.findingCount === 1 &&
      result.fileCount === 1 &&
      !existsSync(snapshotDirectory)
    );
  });
  check("retention controls execute only from the trusted workflow", () => {
    const validation = readFileSync(".github/workflows/ci.yml", "utf8");
    const retention = readFileSync(
      ".github/workflows/retain-engineering-evidence.yml",
      "utf8",
    );
    return retentionUsesTrustedWorkflow(validation, retention);
  });
  check("unreadable generated reports fail closed", () => {
    const reportDirectory = "harness/reports/self-test-unreadable-reports";
    const nestedDirectory = `${reportDirectory}/nested`;
    mkdirSync(nestedDirectory, { recursive: true });
    writeFileSync(`${nestedDirectory}/report.json`, "{}\n");
    const result = guardGeneratedReports(
      reportDirectory,
      [],
      (directory, options) => {
        if (directory === nestedDirectory) throw new Error("synthetic EACCES");
        return readdirSync(directory, options);
      },
    );
    return !result.safe && !existsSync(reportDirectory);
  });
  check("normalized artifact section bindings accept camelCase sections", () => {
    const reference = "harness/reports/self-test-normalized-sections.md";
    mkdirSync("harness/reports", { recursive: true });
    try {
      writeFileSync(
        reference,
        [
          "# Synthetic evidence",
          "## Commands",
          "The canonical command passed.",
          "## Tests",
          "The focused tests passed.",
          "## Known Failures",
          "No known failures remain.",
          "## Reason",
          "A synthetic transition occurred.",
          "## Actor",
          "Harness self-test.",
          "## Timestamp",
          "2026-09-11T00:00:00.000Z.",
          "## Evidence References",
          "The synthetic evidence file.",
        ].join("\n"),
      );
      const contract = { ...valid, requiredEvidence: [reference] };
      const capturedAt = "2026-09-11T00:02:00.000Z";
      const hash = sha256(reference);
      const manifest = {
        ...syntheticManifest(),
        artifactRecords: [
          {
            capturedAt,
            kind: "evidence-manifest",
            reference,
            sections: ["commands", "tests", "knownFailures"],
            sha256: hash,
          },
          {
            capturedAt,
            kind: "state-change-record",
            reference,
            sections: ["reason", "actor", "timestamp", "evidenceReferences"],
            sha256: hash,
          },
        ],
      };
      return validateArtifactRecords(manifest, contract).length === 0;
    } finally {
      if (existsSync(reference)) unlinkSync(reference);
    }
  });
  check("evidence records only declared tool versions", () => {
    const packageManifest = {
      packageManager: "pnpm@11.19.0",
      devDependencies: { turbo: "^2.5.6" },
    };
    const versions = declaredToolVersions(packageManifest);
    return (
      versions.packageManager === "pnpm@11.19.0" &&
      versions.turbo === "^2.5.6" &&
      !("typescript" in versions)
    );
  });
  check("workspace checks supply fail-closed test evidence", () => {
    const manifestFor = (status) =>
      buildEvidenceManifest(
        valid,
        "harness/tasks/repository-neutral-example.json",
        syntheticGit,
        {
          results: status ? [{ name: "workspace-checks", status }] : [],
          startedAt: "2026-09-11T00:01:00.000Z",
          status: "passed",
        },
        "2026-09-11T00:02:00.000Z",
      );
    const testAlias = (manifest) =>
      manifest.automatedChecks.find(
        (check) => check.name === "unit-integration-contract-tests",
      );
    const passed = manifestFor("passed");
    const failed = manifestFor("failed");
    const missing = manifestFor();
    return (
      testAlias(passed)?.status === "passed" &&
      passed.testResults.status === "passed" &&
      testAlias(failed)?.status === "failed" &&
      failed.testResults.status === "failed" &&
      testAlias(missing)?.status === "failed" &&
      missing.testResults.status === "not-applicable"
    );
  });
  check("correction transitions emit their required artifacts", () => {
    const reference = "docs/engineering/evidence/HAR-001.md";
    const contract = {
      ...valid,
      taskId: "HAR-001",
      classification: "configuration",
      workflowState: "implemented",
      stateHistory: [
        { state: "changes-requested" },
        { state: "implemented" },
      ],
      requiredEvidence: [reference],
    };
    const records = transitionArtifactRecords(
      contract,
      "2026-09-11T00:02:00.000Z",
      evidencePolicy,
    );
    return (
      records.length === 2 &&
      records.some((record) => record.kind === "failure-evidence") &&
      records.some((record) => record.kind === "correction-record") &&
      validateArtifactRecords(
        { ...syntheticManifest(), artifactRecords: records },
        contract,
      ).length === 0
    );
  });
  check("blocked transitions emit their required state change record", () => {
    const reference = "docs/engineering/evidence/HAR-010.md";
    const contract = {
      ...valid,
      taskId: "HAR-010",
      classification: "configuration",
      workflowState: "blocked",
      stateHistory: [{ state: "implemented" }, { state: "blocked" }],
      requiredEvidence: [reference],
    };
    const records = transitionArtifactRecords(
      contract,
      "2026-09-16T00:44:36.000Z",
      evidencePolicy,
    );
    const isolatedPolicy = structuredClone(evidencePolicy);
    isolatedPolicy.classificationRequirements.configuration = {
      approvals: [],
      artifacts: [],
      checks: [],
    };
    isolatedPolicy.pathRequirements = [];
    const manifest = {
      ...syntheticManifest(),
      artifactRecords: records,
      classification: "configuration",
      workflowState: "implemented",
    };
    const malformed = structuredClone(manifest);
    malformed.artifactRecords[0]?.sections.splice(
      malformed.artifactRecords[0].sections.indexOf("actor"),
      1,
    );
    return (
      records.length === 1 &&
      records[0].kind === "state-change-record" &&
      validateArtifactRecords(manifest, contract).length === 0 &&
      validateTransition(
        manifest,
        "implemented",
        "blocked",
        isolatedPolicy,
      ).length === 0 &&
      validateTransition(
        malformed,
        "implemented",
        "blocked",
        isolatedPolicy,
      ).some((error) => error.includes("artifact section: actor"))
    );
  });
  check("stale generated evidence is rejected", () => {
    const report = {
      completedAt: "2026-09-11T00:00:00.000Z",
      contract: "harness/tasks/ENG-999.json",
    };
    return Boolean(
      validateEvidence("harness/reports/verify-latest.json", report, [], () =>
        JSON.stringify({ ...report, completedAt: "stale", status: "passed" }),
      ),
    );
  });
  check("complete evidence manifest is accepted", () => {
    const manifest = syntheticManifest();
    return (
      validateEvidenceManifest(
        manifest,
        valid,
        syntheticGit,
        evidenceSchema,
        evidencePolicy,
        new Date("2026-09-11T00:03:00.000Z"),
      ).length === 0 && validateArtifactRecords(manifest, valid).length === 0
    );
  });
  check("malformed nested manifest evidence fails", () => {
    const manifest = syntheticManifest();
    manifest.rollback = "not-an-object";
    return validateEvidenceManifest(
      manifest,
      valid,
      syntheticGit,
      evidenceSchema,
      evidencePolicy,
    ).some((error) => error.includes("rollback"));
  });
  check("legacy approval and release trace fields are rejected", () => {
    const manifest = syntheticManifest();
    manifest.approvalRecords = [];
    manifest.traceability[0].reviewReferences = [];
    manifest.traceability[0].approvalReferences = [];
    manifest.traceability[0].releaseReferences = [];
    const errors = validateEvidenceManifest(
      manifest,
      valid,
      syntheticGit,
      evidenceSchema,
      evidencePolicy,
    );
    return (
      errors.filter((error) => error.includes("is not allowed")).length >= 4
    );
  });
  check("commit and branch metadata do not bind evidence to checkout", () => {
    const manifest = syntheticManifest();
    manifest.commitSha = "b".repeat(40);
    manifest.branch = "descriptive/metadata";
    const errors = validateEvidenceManifest(
      manifest,
      valid,
      syntheticGit,
      evidenceSchema,
      evidencePolicy,
    );
    return !errors.some(
      (error) => error.includes("commitSha") || error.includes("branch"),
    );
  });
  check("documentation-only classification rejects application code", () => {
    const contract = { ...valid, classification: "documentation" };
    return (
      validateClassification(contract, ["apps/api/src/app.ts"], evidencePolicy)
        .length > 0
    );
  });
  check("configuration classification rejects dependency lockfiles", () => {
    const contract = { ...valid, classification: "configuration" };
    return (
      validateClassification(contract, ["pnpm-lock.yaml"], evidencePolicy)
        .length > 0
    );
  });
  check("dependency manifests omit internal review artifacts", () => {
    const contract = {
      ...valid,
      taskId: "ENG-002",
      classification: "dependency",
      issueReference:
        "https://github.com/cmbuyamba/keyforta-property/issues/30",
      requiredEvidence: ["docs/engineering/VALIDATION_EVIDENCE.md"],
    };
    const report = {
      results: [],
      startedAt: "2026-09-11T00:01:00.000Z",
      status: "passed",
    };
    const manifest = buildEvidenceManifest(
      contract,
      "harness/tasks/repository-neutral-example.json",
      syntheticGit,
      report,
      "2026-09-11T00:02:00.000Z",
    );
    const records = manifest.artifactRecords.filter((record) =>
      ["dependency-impact", "security-review"].includes(record.kind),
    );
    const configurationManifest = buildEvidenceManifest(
      { ...contract, classification: "configuration" },
      "harness/tasks/repository-neutral-example.json",
      syntheticGit,
      report,
      "2026-09-11T00:02:00.000Z",
    );
    return (
      records.length === 1 &&
      records.some((record) => record.kind === "dependency-impact") &&
      records.every(
        (record) =>
          record.reference === "docs/engineering/VALIDATION_EVIDENCE.md" &&
          record.sections.length === 1 &&
          record.sha256 === sha256(record.reference),
      ) &&
      validateArtifactRecords(manifest, contract).length === 0 &&
      !configurationManifest.artifactRecords.some((record) =>
        ["dependency-impact", "security-review"].includes(record.kind),
      )
    );
  });
  check("verified manifests include terminal verification evidence", () => {
    const contract = {
      ...valid,
      taskId: "ENG-002",
      classification: "configuration",
      workflowState: "verified",
      requiredEvidence: ["docs/engineering/VALIDATION_EVIDENCE.md"],
    };
    const report = {
      results: [],
      startedAt: "2026-09-11T00:01:00.000Z",
      status: "passed",
    };
    const manifest = buildEvidenceManifest(
      contract,
      "harness/tasks/repository-neutral-example.json",
      syntheticGit,
      report,
      "2026-09-11T00:02:00.000Z",
    );
    return manifest.artifactRecords.some(
      (record) =>
        record.kind === "verification-report" &&
        record.reference === "docs/engineering/VALIDATION_EVIDENCE.md",
    );
  });
  check(
    "task-specific evidence replaces the shared validation document",
    () => {
      const reference = "docs/engineering/evidence/ENG-008.md";
      const contract = {
        ...valid,
        taskId: "ENG-008",
        classification: "configuration",
        workflowState: "verified",
        requiredEvidence: [reference, "harness/reports/verify-latest.json"],
      };
      const report = {
        results: [],
        startedAt: "2026-09-11T00:01:00.000Z",
        status: "passed",
      };
      const manifest = buildEvidenceManifest(
        contract,
        "harness/tasks/repository-neutral-example.json",
        syntheticGit,
        report,
        "2026-09-11T00:02:00.000Z",
      );
      const records = manifest.artifactRecords.filter((record) =>
        ["configuration-impact", "verification-report"].includes(record.kind),
      );
      return (
        taskEvidenceReference(contract) === reference &&
        records.length === 2 &&
        records.every(
          (record) =>
            record.reference === reference &&
            record.sha256 === sha256(reference),
        )
      );
    },
  );
  check("classification artifacts use the selected task evidence", () => {
    const generatedAt = "2026-09-11T00:02:00.000Z";
    const featureReference = "docs/engineering/evidence/ENG-008.md";
    const feature = {
      ...valid,
      taskId: "ENG-008",
      classification: "feature",
      requiredEvidence: [featureReference],
    };
    const bugfix = {
      ...feature,
      classification: "bugfix",
    };
    const report = {
      results: [],
      startedAt: "2026-09-11T00:01:00.000Z",
      status: "passed",
    };
    const featureRecords = buildEvidenceManifest(
      feature,
      "harness/tasks/repository-neutral-example.json",
      syntheticGit,
      report,
      generatedAt,
    ).artifactRecords;
    const bugfixRecords = buildEvidenceManifest(
      bugfix,
      "harness/tasks/repository-neutral-example.json",
      syntheticGit,
      report,
      generatedAt,
    ).artifactRecords.filter((record) =>
      ["failure-evidence", "regression-test"].includes(record.kind),
    );
    const missingSectionErrors = validateArtifactRecords(
      { ...syntheticManifest(), artifactRecords: bugfixRecords },
      bugfix,
    );
    return (
      featureRecords.some(
        (record) =>
          record.kind === "acceptance-test-map" &&
          record.reference === featureReference &&
          record.sections.includes("tests"),
      ) &&
      ["failure-evidence", "regression-test"].every((kind) =>
        bugfixRecords.some(
          (record) =>
            record.kind === kind && record.reference === featureReference,
        ),
      ) &&
      missingSectionErrors.some((error) =>
        error.includes(
          "artifact section is not present in content: failure-evidence/failure",
        ),
      )
    );
  });
  check(
    "task evidence selection rejects missing and ambiguous references",
    () => {
      const verified = {
        ...valid,
        taskId: "ENG-008",
        workflowState: "verified",
        stateHistory: [
          ...valid.stateHistory,
          {
            state: "verified",
            actor: "Harness and Evaluation Engineer",
            enteredAt: "2026-09-11T00:02:00.000Z",
            evidenceReferences: ["docs/engineering/evidence/ENG-008.md"],
          },
        ],
      };
      const missing = {
        ...verified,
        requiredEvidence: ["harness/reports/verify-latest.json"],
      };
      const ambiguous = {
        ...verified,
        taskId: "ENG-002",
        requiredEvidence: [
          "docs/engineering/evidence/ENG-002.md",
          "docs/engineering/VALIDATION_EVIDENCE.md",
          "harness/reports/verify-latest.json",
        ],
      };
      const newTaskUsingSharedEvidence = {
        ...verified,
        requiredEvidence: [
          "docs/engineering/VALIDATION_EVIDENCE.md",
          "harness/reports/verify-latest.json",
        ],
      };
      return (
        validateStateHistory(missing, evidencePolicy).some((error) =>
          error.includes("from exactly one file"),
        ) &&
        validateStateHistory(ambiguous, evidencePolicy).some((error) =>
          error.includes("from exactly one file"),
        ) &&
        validateStateHistory(newTaskUsingSharedEvidence, evidencePolicy).some(
          (error) => error.includes("from exactly one file"),
        )
      );
    },
  );
  check("artifact kinds reject unrelated or empty Markdown sections", () => {
    const reference = "harness/reports/self-test-artifact.md";
    writeFileSync(reference, "## Dependency impact\n\n## Security review\n\n");
    try {
      const contract = { ...valid, requiredEvidence: [reference] };
      const manifest = syntheticManifest();
      manifest.artifactRecords.push({
        capturedAt: "2026-09-11T00:02:00.000Z",
        kind: "security-review",
        reference,
        sections: ["dependency-impact"],
        sha256: sha256(reference),
      });
      const errors = validateArtifactRecords(manifest, contract);
      return (
        errors.some((error) => error.includes("not valid for kind")) &&
        errors.some((error) => error.includes("not substantive"))
      );
    } finally {
      unlinkSync(reference);
    }
  });
  check("artifact validation rejects unknown kinds and inert Markdown", () => {
    const reference = "harness/reports/self-test-artifact.md";
    writeFileSync(
      reference,
      [
        "## Security review",
        "<!-- Reviewer: Security and Privacy Reviewer -->",
        "```text",
        "Verdict: PASS",
        "Review reference: https://github.com/example/repo/issues/1#issuecomment-1",
        "```",
        ".",
      ].join("\n"),
    );
    try {
      const contract = { ...valid, requiredEvidence: [reference] };
      const manifest = syntheticManifest();
      manifest.artifactRecords.push({
        capturedAt: "2026-09-11T00:02:00.000Z",
        kind: "unbound-kind",
        reference,
        sections: ["security-review"],
        sha256: sha256(reference),
      });
      const errors = validateArtifactRecords(manifest, contract);
      return (
        errors.some((error) => error.includes("no section binding")) &&
        errors.some((error) => error.includes("not substantive"))
      );
    } finally {
      unlinkSync(reference);
    }
  });
  check("hidden HTML cannot provide evidence", () => {
    const reference = "harness/reports/self-test-artifact.md";
    writeFileSync(reference, "## Dependency impact\n<script>hidden</script>\n");
    try {
      const contract = { ...valid, requiredEvidence: [reference] };
      const manifest = syntheticManifest();
      manifest.artifactRecords.push({
        capturedAt: syntheticGit.committedAt,
        kind: "dependency-impact",
        reference,
        sections: ["dependency-impact"],
        sha256: sha256(reference),
      });
      return validateArtifactRecords(manifest, contract).some((error) =>
        error.includes("not substantive"),
      );
    } finally {
      unlinkSync(reference);
    }
  });
  check("verification loads the checked-out evidence policy", () => {
    return (
      effectiveEvidencePolicy().repairLoop.maximumAutomatedCycles ===
      evidencePolicy.repairLoop.maximumAutomatedCycles
    );
  });
  check("rendered-inert Markdown is not substantive evidence", () => {
    const reference = "harness/reports/self-test-artifact.md";
    const variants = ["&nbsp;&nbsp;", "[label]: https://example.invalid"];
    try {
      return variants.every((content) => {
        writeFileSync(reference, `## Dependency impact\n${content}\n`);
        const contract = { ...valid, requiredEvidence: [reference] };
        const manifest = syntheticManifest();
        manifest.artifactRecords.push({
          capturedAt: syntheticGit.committedAt,
          kind: "dependency-impact",
          reference,
          sections: ["dependency-impact"],
          sha256: sha256(reference),
        });
        return validateArtifactRecords(manifest, contract).some((error) =>
          error.includes("not substantive"),
        );
      });
    } finally {
      if (existsSync(reference)) unlinkSync(reference);
    }
  });
  check(
    "artifact records cannot reference files outside the repository",
    () => {
      const manifest = syntheticManifest();
      manifest.artifactRecords[0].reference = "../../outside-evidence.json";
      return validateArtifactRecords(manifest, valid).some((error) =>
        error.includes("outside the repository"),
      );
    },
  );
  check("artifact records cannot use symlinks", () => {
    const reference = "harness/reports/self-test-artifact-link";
    mkdirSync("harness/reports", { recursive: true });
    try {
      symlinkSync("../tasks/repository-neutral-example.json", reference);
      const manifest = syntheticManifest();
      manifest.artifactRecords[0].reference = reference;
      return validateArtifactRecords(manifest, valid).some((error) =>
        error.includes("not a regular non-symlink file"),
      );
    } finally {
      unlinkSync(reference);
    }
  });
  check("artifact records cannot traverse symlinked parent directories", () => {
    const directory = "harness/reports/self-test-artifact-directory";
    const reference = `${directory}/repository-neutral-example.json`;
    try {
      symlinkSync("../tasks", directory);
      const contract = { ...valid, requiredEvidence: [reference] };
      const manifest = syntheticManifest();
      manifest.artifactRecords[0].reference = reference;
      manifest.artifactRecords[0].sha256 = sha256(reference);
      return validateArtifactRecords(manifest, contract).some((error) =>
        error.includes("path contains a symlink"),
      );
    } finally {
      unlinkSync(directory);
    }
  });
  check("artifact kinds are bound to contract-declared references", () => {
    const manifest = syntheticManifest();
    manifest.artifactRecords[0] = {
      ...manifest.artifactRecords[0],
      kind: "security-review",
    };
    return validateArtifactRecords(manifest, valid).some((error) =>
      error.includes("not bound to a declared reference"),
    );
  });
  check("waivers cannot bypass failed automated evidence", () => {
    const manifest = syntheticManifest();
    manifest.securityFindings = {
      artifactReferences: [],
      status: "failed",
      summary: "Synthetic failed security check.",
    };
    manifest.waivers = [
      {
        gate: "securityFindings",
        reason: "Synthetic waiver",
        risk: "Synthetic risk",
        impact: "Synthetic impact",
        approver: "Synthetic approver",
        approvedAt: "2026-09-11T00:00:00.000Z",
        expiresAt: "2026-09-12T00:00:00.000Z",
        compensatingControls: ["Synthetic control"],
        followUpReference: "synthetic://follow-up",
        pullRequestReference: "synthetic://pull-request",
        commitSha: syntheticGit.commitSha,
      },
    ];
    return validateEvidenceManifest(
      manifest,
      valid,
      syntheticGit,
      evidenceSchema,
      evidencePolicy,
      new Date("2026-09-11T00:03:00.000Z"),
    ).some((error) => error.includes("securityFindings reports a failure"));
  });
  check("required sections cannot come from unrelated artifacts", () => {
    const manifest = syntheticManifest();
    manifest.workflowState = "proposed";
    manifest.artifactRecords = [
      { kind: "requirements-analysis", sections: [] },
      { kind: "configuration-impact", sections: [] },
      {
        kind: "unrelated-artifact",
        sections: ["requirements", "risks", "unknowns"],
      },
    ];
    return validateTransition(
      manifest,
      "proposed",
      "analyzed",
      evidencePolicy,
    ).some((error) =>
      error.includes("transition requires artifact section: requirements"),
    );
  });
  check("protected policy approval is delegated to GitHub", () => {
    const manifest = syntheticManifest();
    manifest.changedFiles = ["harness/policies/evidence-gates.json"];
    return !validateTransition(
      manifest,
      "implementation-ready",
      "implemented",
      evidencePolicy,
    ).some((error) => error.includes("protected-policy-review"));
  });
  check("migration approvals are external to EDD evidence", () => {
    const manifest = syntheticManifest();
    manifest.changedFiles = ["infra/postgres/migrations/9999_test.sql"];
    return !validateTransition(
      manifest,
      "implementation-ready",
      "implemented",
      evidencePolicy,
    ).some((error) => error.includes("destructive-migration-approval"));
  });
  check("changed-file inventory supplies implementation sections", () => {
    const errors = validateTransition(
      syntheticManifest(),
      "implementation-ready",
      "implemented",
      evidencePolicy,
    );
    return !errors.some((error) => error.includes("artifact section"));
  });
  check("evidence manifest supplies verification-ready sections", () => {
    const manifest = syntheticManifest();
    manifest.workflowState = "implemented";
    const errors = validateTransition(
      manifest,
      "implemented",
      "verification-ready",
      evidencePolicy,
    );
    return !errors.some((error) => error.includes("artifact section"));
  });
  check("declared current state requires transition prerequisites", () => {
    const manifest = syntheticManifest();
    manifest.workflowState = valid.workflowState;
    return validateCurrentState(
      manifest,
      valid,
      evidencePolicy,
      new Date("2026-09-11T00:03:00.000Z"),
      ["verify:task", "verify:classification"],
    ).some((error) => error.includes("implementation-plan"));
  });
  check("three repair cycles can terminate in blocked", () => {
    const states = [
      "implemented",
      "changes-requested",
      "implemented",
      "changes-requested",
      "implemented",
      "changes-requested",
      "blocked",
    ];
    const stateHistory = [
      ...valid.stateHistory,
      ...states.map((state, index) => ({
        state,
        actor: "Synthetic actor",
        enteredAt: `2026-09-11T00:${String(index + 5).padStart(2, "0")}:00.000Z`,
        evidenceReferences: [`synthetic://repair-${index}`],
      })),
    ];
    return (
      validateStateHistory(
        { ...valid, repairCycle: 3, stateHistory, workflowState: "blocked" },
        evidencePolicy,
      ).length === 0
    );
  });
  check("a fourth automated repair cycle is rejected", () => {
    const contract = structuredClone(valid);
    contract.repairCycle = 4;
    return validateStateHistory(contract, evidencePolicy).some((error) =>
      error.includes("exceeds the maximum"),
    );
  });
  check("GitHub controls own pull-request approvals", () => {
    const workflows = [readFileSync(".github/workflows/ci.yml", "utf8")];
    const forbidden = [
      /^\s*permissions:\s*write-all\s*$/m,
      /^\s*(actions|checks|contents|deployments|issues|pull-requests|statuses):\s*write\s*$/m,
      /github\.rest\.pulls\.(createReview|merge)/,
      /reRunWorkflow/i,
      /gh\s+pr\s+(review|merge)/i,
      /repos\/[^\s"']+\/pulls\/[^\s"']+\/(reviews|merge)/i,
    ];
    return (
      !existsSync(".github/workflows/trusted-edd-verifier.yml") &&
      workflows.every(
        (workflow) =>
          workflow.includes("pull-requests: read") &&
          !workflow.includes("pull_request_review:") &&
          forbidden.every((pattern) => !pattern.test(workflow)),
      )
    );
  });
  check("verified is the terminal EDD lifecycle state", () => {
    const manifest = syntheticManifest();
    manifest.workflowState = "verified";
    return (
      evidencePolicy.orderedStates.at(-1) === "verified" &&
      ["review-ready", "accepted", "released", "rolled-back"].every(
        (state) =>
          !evidencePolicy.orderedStates.includes(state) &&
          !evidencePolicy.exceptionStates.includes(state),
      ) &&
      validateTransition(
        manifest,
        "verified",
        "review-ready",
        evidencePolicy,
      ).some((error) => error.includes("transition is not allowed"))
    );
  });
  check("verified contracts declare terminal verification evidence", () => {
    const contract = {
      ...valid,
      requiredEvidence: [],
      workflowState: "verified",
      stateHistory: [
        ...valid.stateHistory,
        {
          state: "implemented",
          actor: "Synthetic implementer",
          enteredAt: "2026-09-11T00:05:00.000Z",
          evidenceReferences: ["synthetic://implementation"],
        },
        {
          state: "verification-ready",
          actor: "Synthetic verifier",
          enteredAt: "2026-09-11T00:06:00.000Z",
          evidenceReferences: ["synthetic://verification-ready"],
        },
        {
          state: "verified",
          actor: "Synthetic verifier",
          enteredAt: "2026-09-11T00:07:00.000Z",
          evidenceReferences: ["synthetic://verified"],
        },
      ],
    };
    return validateStateHistory(contract, evidencePolicy).some((error) =>
      error.includes("verified task requires terminal verification evidence"),
    );
  });
  check("workflow state must match final history entry", () => {
    const contract = {
      ...valid,
      workflowState: "verification-ready",
      stateHistory: [
        ...valid.stateHistory,
        {
          state: "blocked",
          actor: "Synthetic reviewer",
          enteredAt: "2026-09-11T00:05:00.000Z",
          evidenceReferences: ["synthetic://blocked"],
        },
      ],
    };
    return validateStateHistory(contract, evidencePolicy).some((error) =>
      error.includes("final entry"),
    );
  });
  check("changes-requested history can re-enter implementation", () => {
    const repairContract = {
      ...valid,
      repairCycle: 1,
      workflowState: "implemented",
      stateHistory: [
        ...valid.stateHistory,
        {
          state: "implemented",
          actor: "Synthetic implementer",
          enteredAt: "2026-09-11T00:05:00.000Z",
          evidenceReferences: ["synthetic://implementation-1"],
        },
        {
          state: "changes-requested",
          actor: "Synthetic reviewer",
          enteredAt: "2026-09-11T00:06:00.000Z",
          evidenceReferences: ["synthetic://review-1"],
        },
        {
          state: "implemented",
          actor: "Synthetic implementer",
          enteredAt: "2026-09-11T00:07:00.000Z",
          evidenceReferences: ["synthetic://implementation-2"],
        },
      ],
    };
    const transitionError = validateStateHistory(
      repairContract,
      evidencePolicy,
    ).find((error) => error.includes("disallowed transition"));
    if (transitionError) throw new Error(transitionError);
    return transitionError === undefined;
  });
  check("traceability rejects swapped criterion-requirement pairs", () => {
    const contract = {
      ...valid,
      requirementReferences: ["REQ-001", "REQ-002"],
      acceptanceCriteria: [
        {
          id: "AC-001",
          requirementReferences: ["REQ-001"],
          testReferences: ["harness/scripts/self-test.mjs"],
        },
        {
          id: "AC-002",
          requirementReferences: ["REQ-002"],
          testReferences: ["harness/scripts/self-test.mjs"],
        },
      ],
    };
    const manifest = syntheticManifest();
    manifest.requirementReferences = contract.requirementReferences;
    manifest.traceability = [
      { ...manifest.traceability[0], requirementReference: "REQ-002" },
      {
        ...manifest.traceability[0],
        acceptanceCriterion: "AC-002",
        requirementReference: "REQ-001",
      },
    ];
    return validateEvidenceManifest(
      manifest,
      contract,
      syntheticGit,
      evidenceSchema,
      evidencePolicy,
    ).some((error) => error.includes("exactly match"));
  });
  check("CI evidence artifact uses evaluated pull request head SHA", () =>
    readFileSync(".github/workflows/ci.yml", "utf8").includes(
      "untrusted-engineering-evidence-${{ github.event.pull_request.head.sha || github.sha }}",
    ),
  );
  check("CI scopes changed paths to the exact pull request base SHA", () =>
    readFileSync(".github/workflows/ci.yml", "utf8").includes(
      "HARNESS_BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}",
    ),
  );
  check("CI checkout does not persist credentials", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    return (
      checkoutCredentialsAreDisabled(workflow) &&
      !checkoutCredentialsAreDisabled(`
jobs:
  validate:
    persist-credentials: false
    steps:
      - uses: actions/checkout@v7
`) &&
      !checkoutCredentialsAreDisabled(`
jobs:
  validate:
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/checkout@v7
`)
    );
  });
  check("isolated CI producer can execute but not modify pnpm", () =>
    isolatedValidationToolingIsAccessible(
      readFileSync(".github/workflows/ci.yml", "utf8"),
    ),
  );
  check("isolated CI producer uses only producer-owned home state", () =>
    isolatedValidationUsesProducerHome(
      readFileSync(".github/workflows/ci.yml", "utf8"),
    ),
  );
  check("governed producer environment survives the launcher", () =>
    producerEnvironmentSurvivesLauncher(
      readFileSync(".github/workflows/ci.yml", "utf8"),
    ),
  );
  check("isolated CI producer hands off a bounded raw candidate", () =>
    isolatedValidationWorkspaceIsBounded(
      readFileSync(".github/workflows/ci.yml", "utf8"),
    ),
  );
  check("candidate package guards precede privileged tar", () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const packageStepStart = source.indexOf(
      "      - name: Package untrusted engineering evidence",
    );
    const packageStepEnd = source.indexOf(
      "      - name: Upload untrusted engineering evidence",
      packageStepStart,
    );
    const packageStep = source.slice(packageStepStart, packageStepEnd);
    const workspaceDirectory =
      '          sudo test -d "$VALIDATION_WORKSPACE"';
    const workspaceLink =
      '          sudo test ! -L "$VALIDATION_WORKSPACE"';
    const harnessDirectory =
      '          sudo test -d "$VALIDATION_WORKSPACE/harness"';
    const harnessLink =
      '          sudo test ! -L "$VALIDATION_WORKSPACE/harness"';
    const tar =
      '          sudo tar --create --file "$RUNNER_TEMP/keyforta-report-candidate.tar" --directory "$VALIDATION_WORKSPACE/harness" reports';
    const missing = source.replace(`${workspaceDirectory}\n`, "");
    const commented = source.replace(workspaceDirectory, `          #${workspaceDirectory.trim()}`);
    const reordered = source.replace(
      `${workspaceDirectory}\n${workspaceLink}`,
      `${workspaceLink}\n${workspaceDirectory}`,
    );
    const postTar = source
      .replace(`${harnessLink}\n`, "")
      .replace(tar, `${tar}\n${harnessLink}`);
    const falseBranch = source
      .replace(workspaceDirectory, `          if false; then\n${workspaceDirectory}`)
      .replace(harnessLink, `${harnessLink}\n          fi`);
    const heredoc = source
      .replace(workspaceDirectory, `          cat <<'EOF'\n${workspaceDirectory}`)
      .replace(harnessLink, `${harnessLink}\n          EOF`);
    const alternateTar = source.replace(
      workspaceDirectory,
      `          sudo tar -cf "$RUNNER_TEMP/early.tar" "$VALIDATION_WORKSPACE/harness"\n${workspaceDirectory}`,
    );
    const duplicate = source.replace(
      workspaceDirectory,
      `${workspaceDirectory}\n${workspaceDirectory}`,
    );
    const unicodeWhitespace = source.replace(
      workspaceLink,
      `${workspaceLink}\u00a0`,
    );
    const precedingTarStep = source.replace(
      "      - name: Package untrusted engineering evidence",
      `      - name: Unsafe early package\n        run: sudo /bin/tar -cf "$RUNNER_TEMP/early.tar" "$VALIDATION_WORKSPACE/harness"\n\n      - name: Package untrusted engineering evidence`,
    );
    const escapedTarStep = source.replace(
      "      - name: Package untrusted engineering evidence",
      `      - name: Unsafe escaped package\n        run: sudo \\tar -cf "$RUNNER_TEMP/early.tar" "$VALIDATION_WORKSPACE/harness"\n\n      - name: Package untrusted engineering evidence`,
    );
    const duplicatePackageStep = source.replace(
      packageStep,
      `${packageStep}${packageStep}`,
    );
    return (
      isolatedValidationWorkspaceIsBounded(source) &&
      !isolatedValidationWorkspaceIsBounded(missing) &&
      !isolatedValidationWorkspaceIsBounded(commented) &&
      !isolatedValidationWorkspaceIsBounded(reordered) &&
      !isolatedValidationWorkspaceIsBounded(postTar) &&
      !isolatedValidationWorkspaceIsBounded(falseBranch) &&
      !isolatedValidationWorkspaceIsBounded(heredoc) &&
      !isolatedValidationWorkspaceIsBounded(alternateTar) &&
      !isolatedValidationWorkspaceIsBounded(duplicate) &&
      !isolatedValidationWorkspaceIsBounded(unicodeWhitespace) &&
      !isolatedValidationWorkspaceIsBounded(precedingTarStep) &&
      !isolatedValidationWorkspaceIsBounded(escapedTarStep) &&
      !isolatedValidationWorkspaceIsBounded(duplicatePackageStep)
    );
  });
  check("final CI evidence includes the successful dependency audit", () =>
    finalEvidenceIncludesCiAudit(
      readFileSync(".github/workflows/ci.yml", "utf8"),
    ),
  );
  check("CI invokes the canonical verifier entrypoint directly", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    return (
      workflow.includes("node harness/scripts/verify.mjs") &&
      !workflow.includes("pnpm verify\n")
    );
  });
  check("workflow states cannot be skipped", () =>
    validateTransition(
      { ...syntheticManifest(), workflowState: "proposed" },
      "proposed",
      "approved",
      evidencePolicy,
    ).some((error) => error.includes("not allowed")),
  );
  check("transition requires evidence", () =>
    validateTransition(
      { ...syntheticManifest(), workflowState: "verification-ready" },
      "verification-ready",
      "verified",
      evidencePolicy,
    ).some((error) => error.includes("verification-report")),
  );
  check("CI database configuration fails without password mode", () => {
    const result = databaseEnvironment({
      CI: "true",
      DATABASE_URL: "postgresql://synthetic.invalid/test",
    });
    return result.requiredButMissing && !result.configured;
  });
}
