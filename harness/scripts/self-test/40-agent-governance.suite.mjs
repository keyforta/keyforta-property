import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, unlinkSync } from "node:fs";
import { validateStateHistory } from "../edd-lib.mjs";
import { loadAgentGovernance, validateAgentGovernance } from "../agent-lib.mjs";
import { agentGovernance, evidencePolicy, valid } from "./fixtures.mjs";

export function registerSuite({ check, skip }) {
  check(
    "agent governance registry and cross-references are valid",
    () => validateAgentGovernance(agentGovernance).length === 0,
  );
  check("deferred agents cannot own active routes", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.routing.rules[0].leadAgentId = "ai-feature-model-governance-agent";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("lead is not invocable"),
    );
  });
  check("inactive lifecycles cannot become invocable", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.activation.invocableLifecycles.push("deferred");
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("activation policy"),
    );
  });
  check("activation transition keys cannot be duplicated", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.activation.transitions.push(
      structuredClone(invalid.activation.transitions[0]),
    );
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("duplicate activation transition"),
    );
  });
  check("orchestrator allowlist rejects inactive agents", () => {
    const deferred = agentGovernance.registry.agents.find(
      (agent) => agent.lifecycle === "deferred",
    );
    const orchestrator = agentGovernance.registry.agents.find(
      (agent) => agent.id === "mvp-engineering-orchestrator",
    );
    return validateAgentGovernance(agentGovernance, {
      read: (path, encoding) => {
        const source = readFileSync(path, encoding);
        return path === orchestrator.definitionPath
          ? source.replace("  ]\n---", `    \"${deferred.name}\",\n  ]\n---`)
          : source;
      },
    }).some((error) =>
      error.includes("allowlist contains an unregistered or inactive agent"),
    );
  });
  check("routing enforces implementer-reviewer separation", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.routing.rules[0].reviewerAgentIds = [
      invalid.routing.rules[0].leadAgentId,
    ];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("assigns the lead as reviewer"),
    );
  });
  check("requirement lifecycle rejects unknown states", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.requirements.requirements[0].status = "invented";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("unknown status"),
    );
  });
  check("requirement history cannot begin at released", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.requirements.requirements[0].status = "released";
    invalid.requirements.requirements[0].history = [
      {
        status: "released",
        actor: "Product owner",
        enteredAt: "2026-09-11T00:00:00.000Z",
        evidenceReferences: ["synthetic://release"],
      },
    ];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("history must begin"),
    );
  });
  check("handoffs require distinct agents", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.handoffs[0].value.toAgentId = invalid.handoffs[0].value.fromAgentId;
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("same agent"),
    );
  });
  check("deferred activation retains external approval", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.activation.transitions[0].approvalGate = "repository-record-only";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("external GitHub approval"),
    );
  });
  check("agent lifecycle changes require an activation record", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRegistry = structuredClone(agentGovernance.registry);
    invalid.registry.agents.find(
      (agent) => agent.id === "backend-engineer",
    ).lifecycle = "core";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("lifecycle transition lacks an activation record"),
    );
  });
  check("activation records require a registered agent", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.activation.activationRecords.push({
      agentId: "not-a-registered-agent",
      from: "on-demand",
      to: "core",
      evidence: [
        {
          kind: "verification-evidence",
          reference: "synthetic://verification",
        },
      ],
    });
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("activation record references unknown agent"),
    );
  });
  check("activation records require a defined transition", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.activation.activationRecords.push({
      agentId: "backend-engineer",
      from: "core",
      to: "experimental",
      evidence: [
        {
          kind: "verification-evidence",
          reference: "synthetic://verification",
        },
      ],
    });
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("activation record uses undefined transition"),
    );
  });
  check("activation records cannot be duplicated", () => {
    const invalid = structuredClone(agentGovernance);
    const record = {
      agentId: "backend-engineer",
      from: "on-demand",
      to: "core",
      evidence: [
        {
          kind: "verification-evidence",
          reference: "synthetic://verification",
        },
      ],
    };
    invalid.activation.activationRecords.push(record, structuredClone(record));
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("duplicate activation record"),
    );
  });
  check("activation evidence labels cannot masquerade as references", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRegistry = structuredClone(agentGovernance.registry);
    invalid.registry.agents.find(
      (agent) => agent.id === "backend-engineer",
    ).lifecycle = "core";
    invalid.activation.activationRecords.push({
      agentId: "backend-engineer",
      from: "on-demand",
      to: "core",
      evidence: [
        { kind: "repeated-capability-need", reference: "fabricated-evidence" },
        { kind: "risk-review", reference: "fabricated-evidence" },
        { kind: "verification-evidence", reference: "fabricated-evidence" },
      ],
    });
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("fabricated-evidence is missing"),
    );
  });
  check("activation evidence kinds reject unrelated existing files", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRegistry = structuredClone(agentGovernance.registry);
    invalid.registry.agents.find(
      (agent) => agent.id === "backend-engineer",
    ).lifecycle = "core";
    invalid.activation.activationRecords.push({
      agentId: "backend-engineer",
      from: "on-demand",
      to: "core",
      evidence: [
        { kind: "repeated-capability-need", reference: "AGENTS.md" },
        { kind: "risk-review", reference: "AGENTS.md" },
        { kind: "verification-evidence", reference: "AGENTS.md" },
      ],
    });
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("must reference a durable risk review"),
    );
  });
  check("activation evidence kinds cannot be duplicated", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRegistry = structuredClone(agentGovernance.registry);
    invalid.registry.agents.find(
      (agent) => agent.id === "backend-engineer",
    ).lifecycle = "core";
    invalid.activation.activationRecords.push({
      agentId: "backend-engineer",
      from: "on-demand",
      to: "core",
      evidence: [
        {
          kind: "repeated-capability-need",
          reference: "harness/tasks/full-lifecycle-agent-system.json",
        },
        {
          kind: "repeated-capability-need",
          reference: "harness/tasks/full-lifecycle-agent-system.json",
        },
        {
          kind: "risk-review",
          reference: "https://github.com/cmbuyamba/keyforta-property/issues/25",
        },
        {
          kind: "verification-evidence",
          reference: "docs/engineering/VALIDATION_EVIDENCE.md",
        },
      ],
    });
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("activation evidence kind is duplicated"),
    );
  });
  check("capability grants require a governance change record", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRegistry = structuredClone(agentGovernance.registry);
    invalid.registry.agents
      .find((agent) => agent.id === "frontend-engineer")
      .capabilities.push("security-review");
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("security-sensitive changes lack"),
    );
  });
  check("agent definition changes require a governance change record", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRegistry = structuredClone(agentGovernance.registry);
    invalid.registry.agents.find(
      (agent) => agent.id === "frontend-engineer",
    ).definitionPath = ".github/agents/backend-engineer.agent.md";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("security-sensitive changes lack"),
    );
  });
  check("routing changes require a governance change record", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRouting = structuredClone(agentGovernance.routing);
    invalid.routing.rules[0].leadAgentId = "mvp-engineering-orchestrator";
    invalid.routing.rules[0].requiredCapabilities = ["orchestration"];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("changes lack a governance change record"),
    );
  });
  check("new routes require a governance change record", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRouting = structuredClone(agentGovernance.routing);
    const route = structuredClone(invalid.routing.rules[0]);
    route.id = "ROUTE-999";
    invalid.routing.rules.push(route);
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("ROUTE-999 changes lack a governance change record"),
    );
  });
  check("historical requirement versions are immutable", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.baseRequirements = structuredClone(agentGovernance.requirements);
    invalid.requirements.requirements[0].source = "AGENTS.md";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("governed requirement version is immutable"),
    );
  });
  check("requirement approval and evidence gates cannot be weakened", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.requirements.transitions.find(
      (transition) =>
        transition.from === "proposed" && transition.to === "approved",
    ).approvalGate = "";
    invalid.requirements.transitions[0].evidenceRequired = false;
    return (
      validateAgentGovernance(invalid).some((error) =>
        error.includes("must retain product-owner"),
      ) &&
      validateAgentGovernance(invalid).some((error) =>
        error.includes("must require evidence"),
      )
    );
  });
  check("all requirement decision-state gates are mandatory", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.requirements.transitions.find(
      (transition) =>
        transition.from === "proposed" && transition.to === "deferred",
    ).approvalGate = "";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("must retain product-owner: proposed -> deferred"),
    );
  });
  check("requirement references cannot traverse outside the repository", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.requirements.requirements[0].source = "../outside.md";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("outside the repository"),
    );
  });
  check("requirement references reject missing Markdown anchors", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.requirements.requirements[0].source = "AGENTS.md#missing-heading";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("no matching heading"),
    );
  });
  check("free-form evidence references are rejected", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.requirements.requirements[0].evidenceReferences = [
      "fabricated-evidence",
    ];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("fabricated-evidence is missing"),
    );
  });
  check("unsupported evidence URI schemes are rejected", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.requirements.requirements[0].evidenceReferences = [
      "fabricated://approval",
    ];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("unsupported evidence reference scheme"),
    );
  });
  check("task contracts reject unknown governed requirement versions", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.tasks[0].requirementReferences.push("GOVAGENT-999@1");
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("unknown governed requirement"),
    );
  });
  check("task IDs cannot be duplicated", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.tasks.push(structuredClone(invalid.tasks[0]));
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("duplicate task id"),
    );
  });
  check("routing requires qualified reviewers", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.routing.rules[1].reviewerAgentIds = [
      "product-requirements-analyst",
    ];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("reviewers lack capability"),
    );
  });
  check("handoffs reference a known task", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.handoffs[0].value.taskId = "ENG-999999";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("references unknown task"),
    );
  });
  check("handoff transition actors are bound to sender and recipient", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.handoffs[0].value.history[1].actor = "pull-request-reviewer";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("ready actor must be harness-evaluation-engineer"),
    );
  });
  check("handoff references reject symlinked parent directories", () => {
    const link = "harness/reports/agent-link-parent";
    mkdirSync("harness/reports", { recursive: true });
    try {
      symlinkSync("../tasks", link);
      const invalid = structuredClone(agentGovernance);
      invalid.handoffs[0].value.inputs = [
        `${link}/repository-neutral-example.json`,
      ];
      return validateAgentGovernance(invalid).some((error) =>
        error.includes("must not traverse a symlink"),
      );
    } finally {
      unlinkSync(link);
    }
  });
  check("version-2 tasks require durable issue URLs", () => {
    const invalid = structuredClone(agentGovernance);
    const task = invalid.tasks.find((item) => item.taskId === "ENG-003");
    task.issueReference = "temporary-note";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("requires a durable GitHub issue URL"),
    );
  });
  check("synthetic issue URLs do not exempt real tasks from version 2", () => {
    const invalid = structuredClone(agentGovernance);
    const task = structuredClone(
      invalid.tasks.find((item) => item.taskId === "ENG-003"),
    );
    task.taskId = "ENG-999";
    task.issueReference = "synthetic://ENG-999";
    delete task.contractVersion;
    delete task.routingRuleId;
    delete task.phase;
    delete task.workArea;
    invalid.tasks.push(task);
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("ENG-999 cannot omit or downgrade contractVersion 2"),
    );
  });
  check("new version-2 task controls cannot be downgraded", () => {
    const invalid = structuredClone(agentGovernance);
    const task = invalid.tasks.find((item) => item.taskId === "ENG-003");
    delete task.contractVersion;
    delete task.routingRuleId;
    delete task.phase;
    delete task.workArea;
    task.issueReference = "temporary-note";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("cannot omit or downgrade contractVersion 2"),
    );
  });
  check("version-2 task assignment must match its route", () => {
    const invalid = structuredClone(agentGovernance);
    const task = invalid.tasks.find((item) => item.taskId === "ENG-003");
    task.assignedAgent = "Frontend Engineer";
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("assignedAgent does not match ROUTE-008 lead"),
    );
  });
  check("coordinated route changes must match task work area", () => {
    const invalid = structuredClone(agentGovernance);
    const task = invalid.tasks.find((item) => item.taskId === "ENG-003");
    task.routingRuleId = "ROUTE-005";
    task.assignedAgent = "Backend Engineer";
    task.supportingReviewers = [
      "Security and Privacy Reviewer",
      "QA and Test Engineer",
      "Pull Request Reviewer",
    ];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("phase and workArea do not match ROUTE-005"),
    );
  });
  check("exact governance files require the governance work area", () => {
    const invalid = structuredClone(agentGovernance);
    const task = invalid.tasks.find((item) => item.taskId === "ENG-003");
    task.routingRuleId = "ROUTE-005";
    task.phase = "implementation";
    task.workArea = "api-and-domain";
    task.assignedAgent = "Backend Engineer";
    task.supportingReviewers = [
      "Security and Privacy Reviewer",
      "QA and Test Engineer",
      "Pull Request Reviewer",
    ];
    task.allowedPaths = [".github/copilot-instructions.md"];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("requires workArea governance-and-harness"),
    );
  });
  check("task contract paths are excluded from source work-area checks", () => {
    const invalid = structuredClone(agentGovernance);
    const task = invalid.tasks.find((item) => item.taskId === "ENG-003");
    task.routingRuleId = "ROUTE-005";
    task.phase = "implementation";
    task.workArea = "api-and-domain";
    task.assignedAgent = "Backend Engineer";
    task.supportingReviewers = [
      "Security and Privacy Reviewer",
      "QA and Test Engineer",
      "Pull Request Reviewer",
    ];
    task.allowedPaths = ["harness/tasks/synthetic-contract.json"];
    return !validateAgentGovernance(invalid).some((error) =>
      error.includes("synthetic-contract.json requires workArea"),
    );
  });
  check("route selectors cannot relabel governed source areas", () => {
    const invalid = structuredClone(agentGovernance);
    const apiRoute = invalid.routing.rules.find(
      (rule) => rule.id === "ROUTE-005",
    );
    const harnessRoute = invalid.routing.rules.find(
      (rule) => rule.id === "ROUTE-008",
    );
    [apiRoute.workArea, harnessRoute.workArea] = [
      harnessRoute.workArea,
      apiRoute.workArea,
    ];
    const task = invalid.tasks.find((item) => item.taskId === "ENG-003");
    task.routingRuleId = "ROUTE-005";
    task.assignedAgent = "Backend Engineer";
    task.supportingReviewers = [
      "Security and Privacy Reviewer",
      "QA and Test Engineer",
      "Pull Request Reviewer",
    ];
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("cannot change its canonical phase or workArea"),
    );
  });
  check("governance verification fails closed on an invalid base", () => {
    try {
      execFileSync(process.execPath, ["harness/scripts/verify-agents.mjs"], {
        env: {
          ...process.env,
          HARNESS_BASE_REF: "refs/heads/does-not-exist",
        },
        stdio: "ignore",
      });
      return false;
    } catch {
      return true;
    }
  });
  check("completed handoffs require existing evidence", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.handoffs[0].value.status = "completed";
    invalid.handoffs[0].value.evidence = [
      {
        outputId: "independent-review",
        reference: "missing-evidence.json",
      },
    ];
    invalid.handoffs[0].value.history.push(
      {
        status: "accepted",
        actor: "pull-request-reviewer",
        enteredAt: "2026-09-11T00:06:00.000Z",
        evidenceReferences: ["synthetic://accepted"],
      },
      {
        status: "completed",
        actor: "pull-request-reviewer",
        enteredAt: "2026-09-11T00:07:00.000Z",
        evidenceReferences: ["missing-evidence.json"],
      },
    );
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("missing-evidence.json is missing"),
    );
  });
  check("accepted handoffs require durable evidence", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.handoffs[0].value.status = "accepted";
    invalid.handoffs[0].value.evidence = [
      {
        outputId: "independent-review",
        reference: "synthetic://accepted",
      },
    ];
    invalid.handoffs[0].value.history.push({
      status: "accepted",
      actor: "pull-request-reviewer",
      enteredAt: "2026-09-11T00:06:00.000Z",
      evidenceReferences: ["synthetic://accepted"],
    });
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("accepted handoff requires durable evidence"),
    );
  });
  check("handoff outputs reject unrelated existing evidence", () => {
    const invalid = structuredClone(agentGovernance);
    invalid.handoffs[0].value.status = "accepted";
    invalid.handoffs[0].value.evidence = [
      { outputId: "independent-review", reference: "AGENTS.md" },
    ];
    invalid.handoffs[0].value.history.push({
      status: "accepted",
      actor: "pull-request-reviewer",
      enteredAt: "2026-09-11T00:06:00.000Z",
      evidenceReferences: ["AGENTS.md"],
    });
    return validateAgentGovernance(invalid).some((error) =>
      error.includes("must reference a pull request or anchored review record"),
    );
  });
  check("task state history rejects future evidence", () => {
    const invalid = structuredClone(valid);
    invalid.stateHistory.at(-1).enteredAt = "2999-01-01T00:00:00.000Z";
    return validateStateHistory(
      invalid,
      evidencePolicy,
      new Date("2026-09-12T00:00:00.000Z"),
    ).some((error) => error.includes("future-dated"));
  });
  skip(
    "external-system evaluation",
    "Self-test is intentionally repository-neutral and offline.",
  );
}
