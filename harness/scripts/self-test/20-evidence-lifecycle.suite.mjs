import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { databaseEnvironment, readJson, validateEvidence } from "../lib.mjs";
import { secretPatternFindings } from "../secret-scan.mjs";
import {
  buildEvidenceManifest,
  declaredToolVersions,
  dependencyArtifactRecords,
  effectiveEvidencePolicy,
  sha256,
  taskEvidenceReference,
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

export function registerSuite({ check }) {
  check("generated reports containing secrets are rejected", () => {
    const reportPath = "harness/reports/self-test-generated-secret.json";
    const syntheticCredential = "API_" + "KEY=fakevalue123";
    writeFileSync(reportPath, `${JSON.stringify({ syntheticCredential })}\n`);
    try {
      return (
        secretPatternFindings(
          [reportPath],
          readJson("harness/policies/repository-policy.json")
            .forbiddenSecretPatterns,
        ).length === 1
      );
    } finally {
      unlinkSync(reportPath);
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
      "engineering-evidence-${{ github.event.pull_request.head.sha || github.sha }}",
    ),
  );
  check("CI scopes changed paths to the exact pull request base SHA", () =>
    readFileSync(".github/workflows/ci.yml", "utf8").includes(
      "HARNESS_BASE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}",
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
