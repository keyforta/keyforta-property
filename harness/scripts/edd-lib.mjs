import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, sep } from "node:path";

import { changedPaths, readJson, validateJsonSchema } from "./lib.mjs";

const EMPTY_OR_TEMPLATE =
  /(?:^|\b)(?:tbd|todo|template|replace me|n\/a pending)(?:\b|$)/i;
const LEGACY_EVIDENCE_REFERENCE = "docs/engineering/VALIDATION_EVIDENCE.md";
const LEGACY_EVIDENCE_TASK_IDS = new Set([
  "ENG-002",
  "ENG-003",
  "ENG-004",
  "ENG-005",
  "ENG-006",
  "ENG-007",
]);

const ARTIFACT_SECTION_BINDINGS = {
  "acceptance-test-map": ["tests"],
  "behavior-equivalence-evidence": ["results"],
  "changed-file-inventory": ["commit", "files", "traceability"],
  "configuration-impact": ["scope", "results"],
  "correction-record": ["boundedcorrection", "repaircycle"],
  "dependency-impact": ["dependency-impact"],
  "documentation-impact": ["documentation-impact"],
  "evidence-manifest": ["commands", "tests", "knownfailures"],
  "failure-evidence": ["failure"],
  "follow-up-work": ["follow-up-work"],
  "implementation-plan": ["steps", "requirements", "tests"],
  "incident-record": ["incident"],
  "infrastructure-plan": ["infrastructure"],
  "monitoring-plan": ["monitoring"],
  "regression-test": ["tests"],
  "requirements-analysis": ["requirements", "risks", "unknowns"],
  "rollback-record": ["rollback", "reason", "execution", "monitoring"],
  runbook: ["runbook"],
  "state-change-record": ["reason", "actor", "timestamp", "evidencereferences"],
  "technical-decision": ["design", "tradeoffs", "rollback"],
  "task-contract": ["scope", "acceptancecriteria", "humanapprovalrequirements"],
  "threat-model": ["threat-model"],
  "verification-report": [
    "results",
    "coverage",
    "security",
    "accessibility",
    "architecture",
    "infrastructure",
  ],
};

const VOID_HTML_TAGS = new Set(
  "area base basefont br col embed frame hr img input link meta param source track wbr".split(
    " ",
  ),
);

const STANDARD_HTML_TAGS = new Set(
  "a abbr address article aside audio b blockquote body button canvas code details div em fieldset figure footer form h1 h2 h3 h4 h5 h6 head header html i iframe label li main nav object ol p picture pre script section slot small span strong style summary svg table tbody td template textarea tfoot th thead tr u ul video".split(
    " ",
  ),
);

function normalizeSection(value) {
  return value.trim().toLowerCase().replaceAll(/[ _]+/g, "-");
}

function markdownSections(content) {
  const sections = new Map();
  let currentSection;
  let fenced;
  const htmlStack = [];
  const withoutComments = content.replaceAll(/<!--[\s\S]*?(?:-->|$)/g, "");
  const normalizedHtml = withoutComments.replaceAll(
    /<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s[\s\S]*?)?\s*\/?>/g,
    (source) => source.replaceAll("\n", " "),
  );
  const closedHtmlElements = new Set(
    [...normalizedHtml.matchAll(/<\/([A-Za-z][A-Za-z0-9:-]*)\s*>/g)].map(
      (match) => match[1].toLowerCase(),
    ),
  );
  for (const line of normalizedHtml.split("\n")) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      const character = marker[1][0];
      if (!fenced && (character === "~" || !marker[2].includes("`")))
        fenced = { character, length: marker[1].length };
      else if (
        fenced &&
        character === fenced.character &&
        marker[1].length >= fenced.length &&
        !marker[2].trim()
      )
        fenced = undefined;
      continue;
    }
    if (fenced) continue;
    const htmlTags = [
      ...line.matchAll(/<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s[^>]*)?\s*\/?>/g),
    ];
    const insideHtml = htmlStack.length > 0 || htmlTags.length > 0;
    for (const tag of htmlTags) {
      const source = tag[0];
      const name = tag[1].toLowerCase();
      if (source.startsWith("</")) {
        if (htmlStack.at(-1) === name) htmlStack.pop();
      } else if (
        !source.endsWith("/>") &&
        !VOID_HTML_TAGS.has(name) &&
        (closedHtmlElements.has(name) ||
          STANDARD_HTML_TAGS.has(name) ||
          name.includes("-") ||
          name.includes(":") ||
          /\s/.test(source.slice(1, -1)))
      )
        htmlStack.push(name);
    }
    if (insideHtml) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      currentSection = normalizeSection(heading[1]);
      sections.set(currentSection, "");
    } else if (currentSection) {
      sections.set(
        currentSection,
        `${sections.get(currentSection)}\n${line}`.trim(),
      );
    }
  }
  return sections;
}

export function taskEvidenceReference(contract) {
  const expectedReference = `docs/engineering/evidence/${contract.taskId}.md`;
  const declaredReferences = contract.requiredEvidence ?? [];
  const hasLegacyReference = declaredReferences.includes(
    LEGACY_EVIDENCE_REFERENCE,
  );
  if (hasLegacyReference && !LEGACY_EVIDENCE_TASK_IDS.has(contract.taskId))
    return undefined;
  const references = declaredReferences.filter(
    (reference) =>
      reference === expectedReference ||
      reference === LEGACY_EVIDENCE_REFERENCE,
  );
  return references.length === 1 ? references[0] : undefined;
}

export function dependencyArtifactRecords(contract, generatedAt) {
  return classificationArtifactRecords(contract, generatedAt).filter(
    (record) => record.kind === "dependency-impact",
  );
}

export function classificationArtifactRecords(
  contract,
  generatedAt,
  policy = effectiveEvidencePolicy(),
) {
  const reference = taskEvidenceReference(contract);
  if (!reference) return [];
  return (
    policy.classificationRequirements[contract.classification]?.artifacts ?? []
  ).map((kind) => ({
    capturedAt: generatedAt,
    kind,
    reference,
    sections: ARTIFACT_SECTION_BINDINGS[kind] ?? [],
    sha256: sha256(reference),
  }));
}

export function gitEvidenceContext(environment = process.env) {
  const run = (...args) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  return {
    branch:
      environment.GITHUB_HEAD_REF ||
      environment.GITHUB_REF_NAME ||
      run("branch", "--show-current"),
    changedFiles: changedPaths(),
    clean: run("status", "--porcelain").length === 0,
    commitSha: run("rev-parse", "HEAD"),
    committedAt: new Date(
      run("show", "-s", "--format=%cI", "HEAD"),
    ).toISOString(),
  };
}

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function effectiveEvidencePolicy() {
  return evidenceFiles().policy;
}

function resultFor(report, name) {
  return report.results.find((result) => result.name === name);
}

function checkResult(report, name, notApplicableSummary) {
  const result = resultFor(report, name);
  if (!result || result.status === "skipped") {
    return {
      artifactReferences: [],
      status: "not-applicable",
      summary: result?.detail || notApplicableSummary,
    };
  }
  return {
    artifactReferences: ["harness/reports/verify-latest.json"],
    status: result.status,
    summary:
      result.status === "passed"
        ? `${name} completed successfully for the evaluated commit.`
        : result.detail || `${name} failed for the evaluated commit.`,
  };
}

export function buildEvidenceManifest(
  contract,
  contractPath,
  git,
  report,
  generatedAt,
) {
  const evidenceReference = taskEvidenceReference(contract);
  const commandResults = report.results
    .filter((result) => result.command && Number.isInteger(result.exitCode))
    .map((result) => ({
      command: result.command,
      completedAt: result.completedAt,
      exitCode: result.exitCode,
      startedAt: result.startedAt,
    }));
  commandResults.push({
    command: "pnpm verify:all",
    completedAt: generatedAt,
    exitCode: report.status === "passed" ? 0 : 1,
    startedAt: report.startedAt,
  });
  const traceability = contract.acceptanceCriteria.flatMap((criterion) =>
    criterion.requirementReferences.map((requirementReference) => ({
      acceptanceCriterion: criterion.id,
      changedFiles: git.changedFiles,
      issueReference: contract.issueReference,
      requirementReference,
      taskContractReference: contractPath,
      technicalDecisionReferences: contract.technicalDecisionReferences,
      testReferences: criterion.testReferences,
      verificationReferences: ["harness/reports/verify-latest.json"],
    })),
  );
  return {
    accessibilityResults: checkResult(
      report,
      "accessibility",
      "No accessibility result applies to this non-UI task.",
    ),
    automatedChecks: [
      ...report.results.map((result) => ({
        evidenceReference: "harness/reports/verify-latest.json",
        name: result.name,
        status: result.status,
      })),
      {
        evidenceReference: "harness/reports/verify-latest.json",
        name: "verify:task",
        status: resultFor(report, "task-contract")?.status ?? "failed",
      },
      {
        evidenceReference: "harness/reports/verify-latest.json",
        name: "verify:classification",
        status: resultFor(report, "task-classification")?.status ?? "failed",
      },
      {
        evidenceReference: "harness/reports/verify-latest.json",
        name: "verify:transition",
        status: resultFor(report, "workflow-transition")?.status ?? "failed",
      },
      {
        evidenceReference: "harness/reports/verify-latest.json",
        name: "verify:all",
        status: report.status,
      },
    ],
    architectureResults: checkResult(
      report,
      "architecture-boundaries",
      "No architecture result was produced.",
    ),
    artifactRecords: [
      {
        capturedAt: generatedAt,
        kind: "task-contract",
        reference: contractPath,
        sections: ["scope", "acceptanceCriteria", "humanApprovalRequirements"],
        sha256: sha256(contractPath),
      },
      ...classificationArtifactRecords(contract, generatedAt),
      ...(contract.workflowState === "verified" && evidenceReference
        ? [
            {
              capturedAt: generatedAt,
              kind: "verification-report",
              reference: evidenceReference,
              sections: [
                "results",
                "coverage",
                "security",
                "accessibility",
                "architecture",
                "infrastructure",
              ],
              sha256: sha256(evidenceReference),
            },
          ]
        : []),
    ],
    branch: git.branch,
    changedFiles: git.changedFiles,
    classification: contract.classification,
    commands: commandResults,
    commitSha: git.commitSha,
    coverageResults: {
      artifactReferences: [],
      status: "not-applicable",
      summary: "No repository coverage threshold is configured for this task.",
    },
    infrastructureResults: checkResult(
      report,
      "infrastructure",
      "No infrastructure validation applies to this task.",
    ),
    issueReference: contract.issueReference,
    knownFailures: report.results
      .filter((result) => result.status === "failed")
      .map((result) => ({
        id: result.name,
        severity: "high",
        status: "open",
        summary: result.detail || `${result.name} failed.`,
      })),
    repairCycle: contract.repairCycle,
    requirementReferences: contract.requirementReferences,
    responsibleAgent: contract.assignedAgent,
    rollback: {
      evidenceReferences: contract.technicalDecisionReferences,
      procedure: contract.rollbackConsiderations,
      validated: false,
    },
    runtimeVersions: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    },
    securityFindings: checkResult(
      report,
      "secret-patterns",
      "No security result was produced.",
    ),
    taskId: contract.taskId,
    testResults: checkResult(
      report,
      "unit-integration-contract-tests",
      "No test result was produced.",
    ),
    timestamps: {
      generatedAt,
      verificationCompletedAt: generatedAt,
      verificationStartedAt: report.startedAt,
    },
    toolVersions: declaredToolVersions(readJson("package.json")),
    traceability,
    visualEvidence: [],
    waivers: [],
    workflowState: contract.workflowState,
  };
}

export function validateClassification(contract, paths, policy) {
  const errors = [];
  const rule = policy.classificationPathRules[contract.classification] ?? {};
  if (rule.allowedPrefixes) {
    const invalid = paths.filter(
      (path) =>
        !rule.allowedPrefixes.some(
          (prefix) => path === prefix || path.startsWith(prefix),
        ),
    );
    if (invalid.length)
      errors.push(
        `${contract.classification} classification does not allow: ${invalid.join(", ")}`,
      );
  }
  const forbidden = paths.filter((path) =>
    (rule.forbiddenPrefixes ?? []).some(
      (prefix) => path === prefix || path.startsWith(prefix),
    ),
  );
  if (forbidden.length)
    errors.push(
      `${contract.classification} classification contradicts changed paths: ${forbidden.join(", ")}`,
    );
  if (
    rule.requiredPrefixes &&
    !paths.some((path) =>
      rule.requiredPrefixes.some(
        (prefix) => path === prefix || path.startsWith(prefix),
      ),
    )
  )
    errors.push(
      `${contract.classification} classification requires a change under one of: ${rule.requiredPrefixes.join(", ")}`,
    );
  if (
    rule.requiredFiles &&
    !paths.some((path) => rule.requiredFiles.includes(path))
  )
    errors.push(
      `${contract.classification} classification requires one of: ${rule.requiredFiles.join(", ")}`,
    );
  return errors;
}

export function declaredToolVersions(packageManifest) {
  return Object.fromEntries(
    Object.entries({
      packageManager: packageManifest.packageManager,
      turbo: packageManifest.devDependencies?.turbo,
      typescript: packageManifest.devDependencies?.typescript,
    }).filter(([, version]) => typeof version === "string" && version.length > 0),
  );
}

export function validateStateHistory(contract, policy, now = new Date()) {
  const errors = [];
  if (contract.stateHistory[0]?.state !== "proposed")
    errors.push("stateHistory must begin at proposed");
  if (contract.stateHistory.at(-1)?.state !== contract.workflowState)
    errors.push("stateHistory final entry must equal workflowState");
  const reachedVerified = contract.stateHistory.some(
    (entry) => entry.state === "verified",
  );
  if (reachedVerified && !taskEvidenceReference(contract))
    errors.push(
      `verified task requires terminal verification evidence from exactly one file: docs/engineering/evidence/${contract.taskId}.md (legacy shared evidence remains supported)`,
    );
  for (let index = 1; index < contract.stateHistory.length; index += 1) {
    const from = contract.stateHistory[index - 1].state;
    const to = contract.stateHistory[index].state;
    const transition = policy.transitions.find(
      (transition) => transition.from === from && transition.to === to,
    );
    const exceptionTransition =
      policy.orderedStates.includes(from) &&
      policy.exceptionTransitions.fromAnyActiveState.includes(to);
    if (!transition && !exceptionTransition)
      errors.push(
        `stateHistory contains disallowed transition: ${from} -> ${to}`,
      );
  }
  for (let index = 1; index < contract.stateHistory.length; index += 1) {
    if (
      Date.parse(contract.stateHistory[index].enteredAt) <
      Date.parse(contract.stateHistory[index - 1].enteredAt)
    )
      errors.push("stateHistory timestamps must be monotonic");
  }
  for (const entry of contract.stateHistory) {
    if (Date.parse(entry.enteredAt) > now.getTime())
      errors.push(`stateHistory entry is future-dated: ${entry.state}`);
  }
  const repairEntries = contract.stateHistory.filter(
    (entry) => entry.state === "changes-requested",
  ).length;
  if (repairEntries !== contract.repairCycle)
    errors.push("repairCycle must equal changes-requested history entries");
  if (contract.repairCycle > policy.repairLoop.maximumAutomatedCycles)
    errors.push("repairCycle exceeds the maximum automated repair cycles");
  return errors;
}

function validTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isSubstantive(value) {
  if (
    typeof value === "string" &&
    /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s[^>]*)?\s*\/?>/.test(value)
  )
    return false;
  const prose =
    typeof value === "string"
      ? value
          .replaceAll(/<!--[\s\S]*?-->/g, "")
          .replaceAll(/^\s*\[[^\]]+\]:.*$/gm, "")
          .replaceAll(/<[^>]+>/g, "")
          .replaceAll(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/gi, " ")
          .replaceAll(/[^A-Za-z0-9]+/g, " ")
          .trim()
      : "";
  return prose.length > 1 && !EMPTY_OR_TEMPLATE.test(prose);
}

export function validateEvidenceManifest(
  manifest,
  contract,
  git,
  schema,
  policy,
  now = new Date(),
) {
  const errors = validateJsonSchema(manifest, schema);
  if (manifest.taskId !== contract.taskId)
    errors.push("manifest taskId does not match contract");
  if (manifest.issueReference !== contract.issueReference)
    errors.push("manifest issueReference does not match contract");
  if (manifest.classification !== contract.classification)
    errors.push("manifest classification does not match contract");
  if (manifest.workflowState !== contract.workflowState)
    errors.push("manifest workflowState does not match contract");
  const actualFiles = [...git.changedFiles].sort();
  const manifestFiles = [...(manifest.changedFiles ?? [])].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifestFiles))
    errors.push("manifest changed-file inventory does not match the Git diff");
  if (manifest.responsibleAgent !== contract.assignedAgent)
    errors.push("manifest responsibleAgent does not match contract");

  const generatedAt = manifest.timestamps?.generatedAt;
  const startedAt = manifest.timestamps?.verificationStartedAt;
  const completedAt = manifest.timestamps?.verificationCompletedAt;
  if (![generatedAt, startedAt, completedAt].every(validTimestamp))
    errors.push("manifest evidence timestamps are incomplete or invalid");
  else {
    if (Date.parse(startedAt) > Date.parse(completedAt))
      errors.push("verification completion predates its start");
    if (Date.parse(generatedAt) > now.getTime() + 300000)
      errors.push("manifest timestamp is implausibly in the future");
  }

  for (const command of contract.requiredCommands) {
    const result = manifest.commands?.find(
      (entry) => entry.command === command,
    );
    if (!result) errors.push(`required command lacks evidence: ${command}`);
    else if (result.exitCode !== 0)
      errors.push(`required command failed: ${command}`);
  }
  for (const result of manifest.commands ?? []) {
    if (!isSubstantive(result.command) || !Number.isInteger(result.exitCode))
      errors.push("command evidence is structurally incomplete");
  }
  for (const check of manifest.automatedChecks ?? []) {
    if (!isSubstantive(check.name) || !isSubstantive(check.evidenceReference))
      errors.push("automated check evidence is structurally incomplete");
  }

  const checkFields = [
    "testResults",
    "coverageResults",
    "securityFindings",
    "accessibilityResults",
    "architectureResults",
    "infrastructureResults",
  ];
  for (const field of checkFields) {
    const result = manifest[field];
    if (!result || !isSubstantive(result.summary))
      errors.push(`${field} is structurally incomplete`);
    else if (result.status === "failed")
      errors.push(`${field} reports a failure`);
    else if (result.status === "skipped") errors.push(`${field} was skipped`);
  }

  for (const waiver of manifest.waivers ?? []) {
    if (policy.nonWaivableGates.includes(waiver.gate))
      errors.push(`gate cannot be waived: ${waiver.gate}`);
    if (
      !isSubstantive(waiver.approver) ||
      waiver.approver === manifest.responsibleAgent
    )
      errors.push(
        `waiver lacks an independent named human approver: ${waiver.gate}`,
      );
    if (
      !validTimestamp(waiver.expiresAt) ||
      Date.parse(waiver.expiresAt) <= now.getTime()
    )
      errors.push(`waiver is expired or invalid: ${waiver.gate}`);
    if (waiver.commitSha !== manifest.commitSha)
      errors.push(`waiver is stale for commit: ${waiver.gate}`);
  }
  if ((manifest.repairCycle ?? 0) !== contract.repairCycle)
    errors.push("manifest repairCycle does not match contract");
  if ((manifest.repairCycle ?? 0) > policy.repairLoop.maximumAutomatedCycles)
    errors.push("automated repair cycle limit exceeded");

  const expectedPairs = contract.acceptanceCriteria.flatMap((criterion) =>
    criterion.requirementReferences.map(
      (requirement) => `${criterion.id}\u0000${requirement}`,
    ),
  );
  const actualPairs = (manifest.traceability ?? []).map(
    (trace) =>
      `${trace.acceptanceCriterion}\u0000${trace.requirementReference}`,
  );
  if (
    JSON.stringify([...actualPairs].sort()) !==
    JSON.stringify([...expectedPairs].sort())
  )
    errors.push(
      "traceability must exactly match criterion and requirement pairs",
    );
  for (const criterion of contract.acceptanceCriteria) {
    const traces = (manifest.traceability ?? []).filter(
      (entry) => entry.acceptanceCriterion === criterion.id,
    );
    if (!traces.length)
      errors.push(`acceptance criterion lacks test evidence: ${criterion.id}`);
    for (const trace of traces) {
      if (trace.issueReference !== contract.issueReference)
        errors.push(`acceptance criterion has wrong issue: ${criterion.id}`);
      if (
        JSON.stringify([...trace.testReferences].sort()) !==
        JSON.stringify([...(criterion.testReferences ?? [])].sort())
      )
        errors.push(
          `acceptance criterion test mapping differs: ${criterion.id}`,
        );
      if (
        JSON.stringify([...trace.technicalDecisionReferences].sort()) !==
        JSON.stringify([...contract.technicalDecisionReferences].sort())
      )
        errors.push(
          `acceptance criterion decision mapping differs: ${criterion.id}`,
        );
      if (!trace.changedFiles.length || !trace.verificationReferences.length)
        errors.push(
          `acceptance criterion lacks file or verification links: ${criterion.id}`,
        );
    }
  }
  return errors;
}

function artifactRecord(manifest, kind) {
  if (kind === "evidence-manifest")
    return {
      kind,
      sections: ["commands", "tests", "knownFailures"],
    };
  if (kind === "changed-file-inventory" && manifest.changedFiles?.length)
    return {
      kind,
      sections: ["commit", "files", "traceability"],
    };
  return manifest.artifactRecords?.find((artifact) => artifact.kind === kind);
}

export function validateTransition(
  manifest,
  from,
  to,
  policy,
  now = new Date(),
  satisfiedChecks = [],
) {
  const errors = [];
  if (manifest.workflowState !== from)
    errors.push(
      `manifest state ${manifest.workflowState} does not match transition source ${from}`,
    );
  let transition = policy.transitions.find(
    (candidate) => candidate.from === from && candidate.to === to,
  );
  if (!transition) {
    const active = policy.orderedStates.includes(from);
    if (active && policy.exceptionTransitions.fromAnyActiveState.includes(to)) {
      transition = {
        artifacts: [policy.exceptionTransitions.requiredArtifact],
        sections: policy.exceptionTransitions.requiredSections,
        checks: [],
        reviewers: [],
        approvals: [],
      };
    } else {
      return [`transition is not allowed: ${from} -> ${to}`];
    }
  }
  const classification =
    policy.classificationRequirements[manifest.classification];
  const pathRequirements = (policy.pathRequirements ?? []).filter(
    (requirement) =>
      manifest.changedFiles.some((path) =>
        requirement.prefixes.some(
          (prefix) => path === prefix || path.startsWith(prefix),
        ),
      ),
  );
  const requiredArtifacts = new Set([
    ...transition.artifacts,
    ...(classification?.artifacts ?? []),
    ...pathRequirements.flatMap((requirement) => requirement.artifacts ?? []),
  ]);
  for (const kind of requiredArtifacts) {
    const artifact = artifactRecord(manifest, kind);
    if (!artifact) errors.push(`transition requires artifact: ${kind}`);
  }
  for (const section of transition.sections) {
    if (
      ![...requiredArtifacts].some((kind) =>
        artifactRecord(manifest, kind)?.sections?.includes(section),
      )
    )
      errors.push(`transition requires artifact section: ${section}`);
  }
  const requiredChecks = new Set([
    ...transition.checks,
    ...(classification?.checks ?? []),
    ...pathRequirements.flatMap((requirement) => requirement.checks ?? []),
  ]);
  for (const name of requiredChecks) {
    const check = manifest.automatedChecks?.find(
      (candidate) => candidate.name === name,
    );
    if (check?.status !== "passed" && !satisfiedChecks.includes(name))
      errors.push(`transition requires passing automated check: ${name}`);
  }
  return errors;
}

export function validateCurrentState(
  manifest,
  contract,
  policy,
  now = new Date(),
  satisfiedChecks = [],
) {
  const currentEntry = contract.stateHistory.at(-1);
  const previousEntry = contract.stateHistory.at(-2);
  if (!previousEntry || currentEntry?.state !== contract.workflowState)
    return ["current state lacks a preceding recorded transition"];
  return validateTransition(
    { ...manifest, workflowState: previousEntry.state },
    previousEntry.state,
    currentEntry.state,
    policy,
    now,
    satisfiedChecks,
  );
}

export function evidenceFiles() {
  return {
    policy: readJson("harness/policies/evidence-gates.json"),
    schema: readJson("harness/schemas/evidence-manifest.schema.json"),
  };
}

export function validateArtifactRecords(manifest, contract) {
  const errors = [];
  const repositoryRoot = realpathSync(resolve("."));
  const taskContractReferences = new Set(
    (manifest.traceability ?? []).map((trace) => trace.taskContractReference),
  );
  const declaredEvidence = new Set([
    ...(contract.requiredEvidence ?? []),
    ...(contract.acceptanceCriteriaReferences ?? []),
  ]);
  for (const artifact of manifest.artifactRecords ?? []) {
    if (!isSubstantive(artifact.kind) || !isSubstantive(artifact.reference)) {
      errors.push("artifact record is empty or template-only");
      continue;
    }
    const artifactPath = resolve(artifact.reference);
    const referenceAllowed =
      (artifact.kind === "task-contract" &&
        taskContractReferences.has(artifact.reference)) ||
      (artifact.kind === "technical-decision" &&
        contract.technicalDecisionReferences.includes(artifact.reference)) ||
      declaredEvidence.has(artifact.reference);
    if (!referenceAllowed)
      errors.push(
        `artifact kind is not bound to a declared reference: ${artifact.kind}`,
      );
    if (!ARTIFACT_SECTION_BINDINGS[artifact.kind])
      errors.push(`artifact kind has no section binding: ${artifact.kind}`);
    if (!artifactPath.startsWith(`${repositoryRoot}${sep}`))
      errors.push(`artifact is outside the repository: ${artifact.reference}`);
    else if (!existsSync(artifactPath))
      errors.push(`artifact does not exist: ${artifact.reference}`);
    else if (!lstatSync(artifactPath).isFile())
      errors.push(
        `artifact is not a regular non-symlink file: ${artifact.reference}`,
      );
    else {
      const canonicalPath = realpathSync(artifactPath);
      if (!canonicalPath.startsWith(`${repositoryRoot}${sep}`))
        errors.push(
          `artifact resolves outside the repository: ${artifact.reference}`,
        );
      else if (canonicalPath !== artifactPath)
        errors.push(`artifact path contains a symlink: ${artifact.reference}`);
      else if (artifact.sha256 !== sha256(canonicalPath))
        errors.push(`artifact hash mismatch: ${artifact.reference}`);
      else {
        const content = readFileSync(canonicalPath, "utf8");
        let presentSections;
        if (artifact.kind === "task-contract") {
          const taskContract = JSON.parse(content);
          presentSections = new Set([
            ...(taskContract.allowedPaths ? ["scope"] : []),
            ...(taskContract.acceptanceCriteria ? ["acceptancecriteria"] : []),
            ...(taskContract.humanApprovalRequirements
              ? ["humanapprovalrequirements"]
              : []),
          ]);
        } else {
          presentSections = markdownSections(content);
        }
        const allowedSections = ARTIFACT_SECTION_BINDINGS[artifact.kind];
        for (const section of artifact.sections ?? []) {
          const normalized = normalizeSection(section);
          if (!allowedSections?.includes(normalized))
            errors.push(
              `artifact section is not valid for kind: ${artifact.kind}/${section}`,
            );
          if (!presentSections.has(normalized))
            errors.push(
              `artifact section is not present in content: ${artifact.kind}/${section}`,
            );
          else if (
            artifact.kind !== "task-contract" &&
            !isSubstantive(presentSections.get(normalized))
          )
            errors.push(
              `artifact section is not substantive: ${artifact.kind}/${section}`,
            );
        }
      }
    }
  }
  return errors;
}
