import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { readJson, validateJsonSchema } from "./lib.mjs";

export const agentGovernanceFiles = {
  activation: "harness/policies/agent-activation.json",
  activationSchema: "harness/schemas/agent-activation.schema.json",
  handoffSchema: "harness/schemas/handoff.schema.json",
  handoffs: "harness/handoffs",
  registry: "harness/policies/agent-registry.json",
  registrySchema: "harness/schemas/agent-registry.schema.json",
  requirements: "harness/requirements/agent-foundation.json",
  requirementsSchema: "harness/schemas/requirement-lifecycle.schema.json",
  routing: "harness/policies/agent-routing.json",
  routingSchema: "harness/schemas/routing-matrix.schema.json",
};

function duplicates(values) {
  const seen = new Set();
  return [
    ...new Set(values.filter((value) => seen.has(value) || !seen.add(value))),
  ];
}

function customAgentName(path, read = readFileSync) {
  const source = read(path, "utf8");
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
  return frontmatter?.[1].match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1];
}

function referencePath(reference) {
  if (/^(https|synthetic):\/\//i.test(reference)) return undefined;
  return reference.split("#")[0];
}

export function confinedPath(path, exists = existsSync) {
  if (isAbsolute(path) || path.split("/").includes(".."))
    return `${path} is outside the repository`;
  const resolved = resolve(path);
  if (relative(process.cwd(), resolved).startsWith(".."))
    return `${path} is outside the repository`;
  if (!exists(path)) return `${path} is missing`;
  const relativeParts = relative(process.cwd(), resolved).split("/");
  let current = process.cwd();
  for (const part of relativeParts) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink())
      return `${path} must not traverse a symlink`;
  }
  const repositoryRoot = realpathSync(process.cwd());
  const realPath = realpathSync(resolved);
  const realRelative = relative(repositoryRoot, realPath);
  if (realRelative.startsWith("..") || isAbsolute(realRelative))
    return `${path} is outside the repository`;
  if (!lstatSync(realPath).isFile())
    return `${path} must be a regular non-symlink file`;
  return undefined;
}

function referenceError(reference, exists = existsSync, read = readFileSync) {
  if (/^[a-z]+:\/\//i.test(reference)) {
    return /^(https|synthetic):\/\/[^\s]+$/i.test(reference)
      ? undefined
      : `${reference} uses an unsupported evidence reference scheme`;
  }
  const path = referencePath(reference);
  const pathError = confinedPath(path, exists);
  if (pathError) return pathError;
  const anchor = reference.split("#")[1];
  if (!anchor || !path.endsWith(".md")) return undefined;
  const anchors = [...read(path, "utf8").matchAll(/^#{1,6}\s+(.+)$/gm)].map(
    (match) =>
      match[1]
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, "")
        .replace(/\s+/g, "-"),
  );
  return anchors.includes(anchor)
    ? undefined
    : `${reference} has no matching heading`;
}

function readBaseJson(
  path,
  base = process.env.HARNESS_BASE_REF || "origin/main",
) {
  let source;
  try {
    source = execFileSync("git", ["show", `${base}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    try {
      execFileSync("git", ["cat-file", "-e", `${base}:${path}`], {
        stdio: "ignore",
      });
    } catch {
      return undefined;
    }
    throw new Error(
      `cannot read required base governance file: ${base}:${path}`,
    );
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`invalid JSON in base governance file: ${base}:${path}`);
  }
}

function readBaseTasks(
  base = process.env.HARNESS_BASE_REF || "origin/main",
) {
  let paths;
  try {
    paths = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", base, "harness/tasks"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .trim()
      .split("\n")
      .filter((path) => path.endsWith(".json"));
  } catch {
    return [];
  }
  return paths.map((path) => readBaseJson(path, base)).filter(Boolean);
}

function baseRevisionError(
  base = process.env.HARNESS_BASE_REF || "origin/main",
) {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${base}^{commit}`], {
      stdio: "ignore",
    });
    return undefined;
  } catch {
    return `cannot resolve required governance base revision: ${base}`;
  }
}

function changedFields(previous, current, fields) {
  return fields.filter(
    (field) =>
      JSON.stringify(previous?.[field]) !== JSON.stringify(current?.[field]),
  );
}

function activationEvidenceError(kind, reference) {
  const path = referencePath(reference);
  if (kind === "approved-task-contract")
    return path?.match(/^harness\/tasks\/[^/]+\.json$/)
      ? undefined
      : `${kind} must reference a task contract`;
  if (kind === "agent-definition")
    return path?.match(/^\.github\/agents\/[a-z0-9-]+\.agent\.md$/)
      ? undefined
      : `${kind} must reference an agent definition`;
  if (["verification-evidence", "evaluation-results"].includes(kind))
    return path?.match(/^harness\/reports\/[^/]+\.json$/) ||
      path === "docs/engineering/VALIDATION_EVIDENCE.md"
      ? undefined
      : `${kind} must reference verification evidence`;
  if (kind === "risk-review")
    return /^https:\/\/github\.com\/[^/]+\/[^/]+\/(pull|issues)\/[1-9][0-9]*/.test(
      reference,
    ) ||
      path?.match(
        /^docs\/(architecture\/SECURITY|engineering\/(PRIVACY_BASELINE|THREAT_MODEL))\.md$/,
      )
      ? undefined
      : `${kind} must reference a durable risk review`;
  return path?.match(/^(docs|harness\/(handoffs|tasks))\//) ||
    /^https:\/\/github\.com\//.test(reference)
    ? undefined
    : `${kind} must reference governed documentation or GitHub evidence`;
}

function handoffEvidenceError(outputId, reference) {
  const path = referencePath(reference);
  if (outputId.includes("review"))
    return /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[1-9][0-9]*/.test(
      reference,
    ) || /^docs\/[^#]+\.md#[a-z0-9-]+$/.test(reference)
      ? undefined
      : `${outputId} must reference a pull request or anchored review record`;
  if (outputId.includes("verification"))
    return path?.match(/^harness\/reports\/[^/]+\.json$/) ||
      /^docs\/engineering\/VALIDATION_EVIDENCE\.md#[a-z0-9-]+$/.test(reference)
      ? undefined
      : `${outputId} must reference verification evidence`;
  return /^https:\/\//.test(reference) ||
    path?.endsWith(".json") ||
    /^docs\/[^#]+\.md#[a-z0-9-]+$/.test(reference)
    ? undefined
    : `${outputId} must reference structured or anchored evidence`;
}

const canonicalRouteSelectors = new Map([
  ["ROUTE-001", ["discovery-and-requirements", "requirements"]],
  ["ROUTE-002", ["design", "architecture"]],
  ["ROUTE-003", ["design", "experience"]],
  ["ROUTE-004", ["implementation", "web"]],
  ["ROUTE-005", ["implementation", "api-and-domain"]],
  ["ROUTE-006", ["implementation", "database"]],
  ["ROUTE-007", ["implementation", "infrastructure-and-operations"]],
  ["ROUTE-008", ["implementation", "governance-and-harness"]],
  ["ROUTE-009", ["verification", "quality"]],
  ["ROUTE-010", ["independent-review", "security-and-privacy"]],
  ["ROUTE-011", ["documentation-and-readiness", "documentation"]],
  ["ROUTE-012", ["release-and-operation", "release-readiness-and-incidents"]],
]);

const governedWorkAreaPrefixes = new Map([
  ["apps/public-web/", "web"],
  ["apps/portal-web/", "web"],
  ["apps/admin-web/", "web"],
  ["apps/api/", "api-and-domain"],
  ["packages/contracts/", "api-and-domain"],
  ["packages/auth/", "api-and-domain"],
  ["packages/authorization/", "api-and-domain"],
  ["infra/postgres/", "database"],
  ["infra/bicep/", "infrastructure-and-operations"],
  ["harness/", "governance-and-harness"],
  [".github/agents/", "governance-and-harness"],
  [".github/prompts/", "governance-and-harness"],
  [".github/skills/", "governance-and-harness"],
  [".github/instructions/", "governance-and-harness"],
  [".github/copilot-instructions.md", "governance-and-harness"],
]);

function frontmatterValue(source, key) {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return frontmatter.match(
    new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"),
  )?.[1];
}

export function validateAgentGovernance(
  governance,
  {
    exists = existsSync,
    listAgentFiles = () =>
      readdirSync(".github/agents")
        .filter((name) => name.endsWith(".agent.md"))
        .map((name) => `.github/agents/${name}`),
    listPromptFiles = () =>
      readdirSync(".github/prompts")
        .filter((name) => name.endsWith(".prompt.md"))
        .map((name) => `.github/prompts/${name}`),
    read = readFileSync,
    now = new Date(),
  } = {},
) {
  const {
    activation,
    handoffs,
    registry,
    requirements,
    routing,
    schemas,
    tasks,
    baseActivation,
    baseError,
    baseRegistry,
    baseRequirements,
    baseRouting,
    baseTasks = [],
    syntheticTaskIds = [],
  } = governance;
  const errors = [
    ...validateJsonSchema(registry, schemas.registry).map(
      (error) => `agent registry: ${error}`,
    ),
    ...validateJsonSchema(routing, schemas.routing).map(
      (error) => `routing matrix: ${error}`,
    ),
    ...validateJsonSchema(requirements, schemas.requirements).map(
      (error) => `requirement lifecycle: ${error}`,
    ),
    ...validateJsonSchema(activation, schemas.activation).map(
      (error) => `activation policy: ${error}`,
    ),
    ...handoffs.flatMap(({ path, value }) =>
      validateJsonSchema(value, schemas.handoff).map(
        (error) => `${path}: ${error}`,
      ),
    ),
  ];
  if (baseError) errors.push(baseError);
  if (errors.length) return errors;

  const lifecycleValues = new Set([
    "core",
    "on-demand",
    "deferred",
    "experimental",
    "retired",
  ]);
  const invocable = new Set(activation.invocableLifecycles);
  const agentsById = new Map(registry.agents.map((agent) => [agent.id, agent]));
  const agentsByName = new Map(
    registry.agents.map((agent) => [agent.name, agent]),
  );
  for (const id of duplicates(registry.agents.map((agent) => agent.id)))
    errors.push(`duplicate agent id: ${id}`);
  for (const name of duplicates(registry.agents.map((agent) => agent.name)))
    errors.push(`duplicate agent name: ${name}`);

  const transitionKeys = activation.transitions.map(
    (transition) => `${transition.from}->${transition.to}`,
  );
  for (const key of duplicates(transitionKeys))
    errors.push(`duplicate activation transition: ${key}`);
  const activationTransitions = new Map(
    activation.transitions.map((transition) => [
      `${transition.from}->${transition.to}`,
      transition,
    ]),
  );
  for (const key of duplicates(
    activation.activationRecords.map(
      (record) => `${record.agentId}:${record.from}->${record.to}`,
    ),
  ))
    errors.push(`duplicate activation record: ${key}`);
  for (const record of activation.activationRecords) {
    if (!agentsById.has(record.agentId))
      errors.push(
        `activation record references unknown agent: ${record.agentId}`,
      );
    const transition = activationTransitions.get(
      `${record.from}->${record.to}`,
    );
    if (!transition) {
      errors.push(
        `${record.agentId} activation record uses undefined transition: ${record.from} -> ${record.to}`,
      );
      continue;
    }
    for (const kind of duplicates(record.evidence.map((item) => item.kind)))
      errors.push(
        `${record.agentId} activation evidence kind is duplicated: ${kind}`,
      );
    for (const evidence of transition.requiredEvidence) {
      if (!record.evidence.some((item) => item.kind === evidence))
        errors.push(
          `${record.agentId} activation record lacks evidence: ${evidence}`,
        );
    }
    for (const evidence of record.evidence) {
      const error =
        referenceError(evidence.reference, exists, read) ||
        activationEvidenceError(evidence.kind, evidence.reference);
      if (error) errors.push(`${record.agentId} activation evidence ${error}`);
    }
  }

  const registeredDefinitions = new Set();
  for (const agent of registry.agents) {
    if (!lifecycleValues.has(agent.lifecycle))
      errors.push(`${agent.id} has unknown lifecycle ${agent.lifecycle}`);
    if (invocable.has(agent.lifecycle)) {
      if (!agent.definitionPath)
        errors.push(`${agent.id} is invocable without a definitionPath`);
      else if (
        !agent.definitionPath.match(/^\.github\/agents\/[a-z0-9-]+\.agent\.md$/)
      )
        errors.push(
          `${agent.id} definition path is invalid: ${agent.definitionPath}`,
        );
      else if (confinedPath(agent.definitionPath, exists))
        errors.push(
          `${agent.id} definition ${confinedPath(agent.definitionPath, exists)}`,
        );
      else {
        registeredDefinitions.add(agent.definitionPath);
        const declaredName = customAgentName(agent.definitionPath, read);
        if (declaredName !== agent.name)
          errors.push(
            `${agent.id} definition name ${JSON.stringify(declaredName)} does not match ${JSON.stringify(agent.name)}`,
          );
      }
    } else if (agent.definitionPath) {
      errors.push(
        `${agent.id} is ${agent.lifecycle} but has an invocable definitionPath`,
      );
    }
    if (agent.lifecycle === "deferred" && !agent.activationGate)
      errors.push(`${agent.id} is deferred without an activation gate`);
  }
  for (const path of listAgentFiles()) {
    if (!registeredDefinitions.has(path))
      errors.push(`unregistered custom agent definition: ${path}`);
  }
  for (const path of listPromptFiles()) {
    const target = frontmatterValue(read(path, "utf8"), "agent");
    const agent = agentsByName.get(target);
    if (!agent || !invocable.has(agent.lifecycle))
      errors.push(
        `${path} targets an unregistered or inactive agent: ${target}`,
      );
  }
  const orchestrator = agentsById.get("mvp-engineering-orchestrator");
  if (orchestrator?.definitionPath) {
    const source = read(orchestrator.definitionPath, "utf8");
    const allowlist = new Set(
      source
        .match(/^agents:\s*\n([\s\S]*?)\n---/m)?.[1]
        .match(/"([^"]+)"/g)
        ?.map((name) => name.slice(1, -1)) ?? [],
    );
    for (const name of allowlist) {
      const agent = agentsByName.get(name);
      if (
        !agent ||
        !invocable.has(agent.lifecycle) ||
        agent.id === orchestrator.id
      )
        errors.push(
          `orchestrator allowlist contains an unregistered or inactive agent: ${name}`,
        );
    }
    for (const agent of registry.agents.filter(
      (item) => invocable.has(item.lifecycle) && item.id !== orchestrator.id,
    )) {
      if (!allowlist.has(agent.name))
        errors.push(`orchestrator allowlist is missing ${agent.name}`);
    }
  }

  if (baseRegistry) {
    const baseAgents = new Map(
      baseRegistry.agents.map((agent) => [agent.id, agent]),
    );
    for (const agent of registry.agents) {
      const previous = baseAgents.get(agent.id);
      const from = previous?.lifecycle ?? "unregistered";
      const sensitiveChanges = previous
        ? changedFields(previous, agent, [
            "name",
            "definitionPath",
            "capabilities",
            "prohibitions",
            "activationGate",
          ])
        : [];
      if (sensitiveChanges.length) {
        const changeRecord = activation.governanceChangeRecords.find(
          (item) => item.subjectType === "agent" && item.subjectId === agent.id,
        );
        if (
          !changeRecord ||
          sensitiveChanges.some(
            (field) => !changeRecord.changedFields.includes(field),
          )
        )
          errors.push(
            `${agent.id} security-sensitive changes lack a governance change record: ${sensitiveChanges.join(", ")}`,
          );
      }
      if (from === agent.lifecycle) continue;
      const transition = activation.transitions.find(
        (item) => item.from === from && item.to === agent.lifecycle,
      );
      const record = activation.activationRecords.find(
        (item) =>
          item.agentId === agent.id &&
          item.from === from &&
          item.to === agent.lifecycle,
      );
      if (!transition)
        errors.push(
          `${agent.id} has disallowed lifecycle transition: ${from} -> ${agent.lifecycle}`,
        );
      else if (!record)
        errors.push(
          `${agent.id} lifecycle transition lacks an activation record`,
        );
    }
    for (const id of baseAgents.keys()) {
      if (!agentsById.has(id))
        errors.push(`registered agent was deleted instead of retired: ${id}`);
    }
  }

  if (baseRouting) {
    const baseRules = new Map(baseRouting.rules.map((rule) => [rule.id, rule]));
    const routeFields = [
      "phase",
      "workArea",
      "leadAgentId",
      "reviewerAgentIds",
      "requiredCapabilities",
      "requiredReviewerCapabilities",
      "humanGate",
    ];
    for (const rule of routing.rules) {
      const previous = baseRules.get(rule.id);
      const fields = previous
        ? changedFields(previous, rule, routeFields)
        : routeFields;
      if (!fields.length) continue;
      const record = activation.governanceChangeRecords.find(
        (item) => item.subjectType === "route" && item.subjectId === rule.id,
      );
      if (
        !record ||
        fields.some((field) => !record.changedFields.includes(field))
      )
        errors.push(
          `${rule.id} changes lack a governance change record: ${fields.join(", ")}`,
        );
    }
    for (const id of baseRules.keys()) {
      if (!routing.rules.some((rule) => rule.id === id))
        errors.push(`routing rule was deleted without replacement: ${id}`);
    }
    if (baseRouting.fallbackAgentId !== routing.fallbackAgentId)
      errors.push(
        `routing fallback cannot change without a new policy version`,
      );
  }

  if (baseActivation) {
    const fields = changedFields(baseActivation, activation, [
      "invocableLifecycles",
      "transitions",
      "externalEnforcement",
      "repositoryRecordPurpose",
    ]);
    if (fields.length) {
      const record = activation.governanceChangeRecords.find(
        (item) =>
          item.subjectType === "activation-policy" &&
          item.subjectId === "agent-activation",
      );
      if (
        !record ||
        fields.some((field) => !record.changedFields.includes(field))
      )
        errors.push(
          `activation policy changes lack a governance change record: ${fields.join(", ")}`,
        );
    }
  }
  for (const record of activation.governanceChangeRecords) {
    for (const reference of record.evidenceReferences) {
      const error = referenceError(reference, exists, read);
      if (error)
        errors.push(
          `${record.subjectType} ${record.subjectId} change evidence ${error}`,
        );
    }
  }

  const activeCapabilityOwners = new Map();
  for (const agent of registry.agents.filter((item) =>
    invocable.has(item.lifecycle),
  )) {
    for (const capability of agent.capabilities) {
      const owners = activeCapabilityOwners.get(capability) ?? [];
      owners.push(agent.id);
      activeCapabilityOwners.set(capability, owners);
    }
  }
  for (const capability of registry.requiredCapabilities) {
    if (!activeCapabilityOwners.has(capability))
      errors.push(`required capability has no invocable owner: ${capability}`);
  }

  const fallback = agentsById.get(routing.fallbackAgentId);
  if (!fallback || !invocable.has(fallback.lifecycle))
    errors.push(
      `routing fallback is not invocable: ${routing.fallbackAgentId}`,
    );
  for (const id of duplicates(routing.rules.map((rule) => rule.id)))
    errors.push(`duplicate routing rule id: ${id}`);
  for (const selector of duplicates(
    routing.rules.map((rule) => `${rule.phase}/${rule.workArea}`),
  ))
    errors.push(`ambiguous routing selector: ${selector}`);
  const requiredPhases = [
    "discovery-and-requirements",
    "design",
    "implementation",
    "verification",
    "independent-review",
    "documentation-and-readiness",
    "release-and-operation",
  ];
  for (const phase of requiredPhases) {
    if (!routing.rules.some((rule) => rule.phase === phase))
      errors.push(`routing phase is uncovered: ${phase}`);
  }
  for (const rule of routing.rules) {
    const canonicalSelector = canonicalRouteSelectors.get(rule.id);
    if (
      canonicalSelector &&
      (rule.phase !== canonicalSelector[0] ||
        rule.workArea !== canonicalSelector[1])
    )
      errors.push(`${rule.id} cannot change its canonical phase or workArea`);
    const lead = agentsById.get(rule.leadAgentId);
    if (!lead || !invocable.has(lead.lifecycle))
      errors.push(`${rule.id} lead is not invocable: ${rule.leadAgentId}`);
    for (const capability of rule.requiredCapabilities) {
      if (!lead?.capabilities.includes(capability))
        errors.push(`${rule.id} lead lacks capability: ${capability}`);
    }
    for (const reviewerId of rule.reviewerAgentIds) {
      const reviewer = agentsById.get(reviewerId);
      if (!reviewer || !invocable.has(reviewer.lifecycle))
        errors.push(`${rule.id} reviewer is not invocable: ${reviewerId}`);
      if (reviewerId === rule.leadAgentId)
        errors.push(`${rule.id} assigns the lead as reviewer`);
    }
    const reviewerCapabilities = new Set(
      rule.reviewerAgentIds.flatMap(
        (reviewerId) => agentsById.get(reviewerId)?.capabilities ?? [],
      ),
    );
    for (const capability of rule.requiredReviewerCapabilities) {
      if (!reviewerCapabilities.has(capability))
        errors.push(`${rule.id} reviewers lack capability: ${capability}`);
    }
  }

  const states = new Set(requirements.states);
  for (const state of duplicates(requirements.states))
    errors.push(`duplicate requirement state: ${state}`);
  for (const transition of requirements.transitions) {
    if (!states.has(transition.from) || !states.has(transition.to))
      errors.push(
        `requirement transition references unknown state: ${transition.from} -> ${transition.to}`,
      );
    if (transition.from === transition.to)
      errors.push(
        `requirement transition cannot be a no-op: ${transition.from}`,
      );
    if (!transition.evidenceRequired)
      errors.push(
        `requirement transition must require evidence: ${transition.from} -> ${transition.to}`,
      );
    const mandatoryGate =
      transition.to === "released"
        ? "production-authority"
        : new Set([
              "approved",
              "accepted",
              "deferred",
              "superseded",
              "rejected",
            ]).has(transition.to)
          ? "product-owner"
          : undefined;
    if (mandatoryGate && transition.approvalGate !== mandatoryGate)
      errors.push(
        `requirement transition must retain ${mandatoryGate}: ${transition.from} -> ${transition.to}`,
      );
  }
  for (const key of duplicates(
    requirements.requirements.map(
      (requirement) => `${requirement.id}@${requirement.version}`,
    ),
  ))
    errors.push(`duplicate requirement version: ${key}`);
  for (const requirement of requirements.requirements) {
    if (!states.has(requirement.status))
      errors.push(`${requirement.id} has unknown status ${requirement.status}`);
    const sourcePath = referencePath(requirement.source);
    if (sourcePath && referenceError(requirement.source, exists, read))
      errors.push(
        `${requirement.id} source ${referenceError(requirement.source, exists, read)}`,
      );
    for (const evidence of requirement.evidenceReferences) {
      const error = referenceError(evidence, exists, read);
      if (error) errors.push(`${requirement.id} evidence ${error}`);
    }
    if (requirement.history.at(-1)?.status !== requirement.status)
      errors.push(
        `${requirement.id} history does not end at ${requirement.status}`,
      );
    if (!new Set(["draft", "proposed"]).has(requirement.history[0]?.status))
      errors.push(`${requirement.id} history must begin at draft or proposed`);
    for (let index = 0; index < requirement.history.length; index += 1) {
      const entry = requirement.history[index];
      if (!states.has(entry.status))
        errors.push(
          `${requirement.id} history has unknown status ${entry.status}`,
        );
      if (index > 0) {
        const previous = requirement.history[index - 1];
        const transition = requirements.transitions.find(
          (item) => item.from === previous.status && item.to === entry.status,
        );
        if (!transition)
          errors.push(
            `${requirement.id} history has disallowed transition: ${previous.status} -> ${entry.status}`,
          );
        else {
          if (
            transition.evidenceRequired &&
            entry.evidenceReferences.length === 0
          )
            errors.push(
              `${requirement.id} ${previous.status} -> ${entry.status} requires evidence`,
            );
          const requiredActor = {
            "product-owner": "Product owner",
            "production-authority": "Production authority",
          }[transition.approvalGate];
          if (requiredActor && entry.actor !== requiredActor)
            errors.push(
              `${requirement.id} ${previous.status} -> ${entry.status} requires ${requiredActor}`,
            );
        }
        if (Date.parse(entry.enteredAt) < Date.parse(previous.enteredAt))
          errors.push(`${requirement.id} history timestamps are not monotonic`);
      }
      if (Date.parse(entry.enteredAt) > now.getTime())
        errors.push(`${requirement.id} history contains future-dated evidence`);
      if (entry.status === "approved" && entry.actor !== "Product owner")
        errors.push(
          `${requirement.id} approved history must identify Product owner as actor`,
        );
      for (const evidence of entry.evidenceReferences) {
        const error = referenceError(evidence, exists, read);
        if (error) errors.push(`${requirement.id} history evidence ${error}`);
      }
    }
  }
  const requirementsById = Map.groupBy(
    requirements.requirements,
    (requirement) => requirement.id,
  );
  for (const [id, versions] of requirementsById) {
    versions.sort((left, right) => left.version - right.version);
    if (versions[0].version !== 1)
      errors.push(`${id} version history must begin at 1`);
    for (let index = 1; index < versions.length; index += 1) {
      const previous = versions[index - 1];
      const current = versions[index];
      if (
        current.version !== previous.version + 1 ||
        current.supersedes !== `${previous.id}@${previous.version}`
      )
        errors.push(
          `${id}@${current.version} must supersede ${previous.id}@${previous.version}`,
        );
    }
  }
  if (baseRequirements) {
    const policyFields = changedFields(baseRequirements, requirements, [
      "states",
      "transitions",
    ]);
    if (policyFields.length) {
      const record = activation.governanceChangeRecords.find(
        (item) =>
          item.subjectType === "requirement-policy" &&
          item.subjectId === "agent-foundation",
      );
      if (requirements.version <= baseRequirements.version)
        errors.push(
          `requirement lifecycle policy changes require a new version`,
        );
      if (
        !record ||
        policyFields.some((field) => !record.changedFields.includes(field))
      )
        errors.push(
          `requirement lifecycle policy changes lack a governance change record: ${policyFields.join(", ")}`,
        );
    }
    const baseVersions = new Map(
      baseRequirements.requirements.map((requirement) => [
        `${requirement.id}@${requirement.version}`,
        requirement,
      ]),
    );
    for (const [key, previous] of baseVersions) {
      const current = requirements.requirements.find(
        (item) => `${item.id}@${item.version}` === key,
      );
      if (!current)
        errors.push(`governed requirement version was deleted: ${key}`);
      else if (JSON.stringify(current) !== JSON.stringify(previous))
        errors.push(`governed requirement version is immutable: ${key}`);
    }
    for (const requirement of requirements.requirements.filter(
      (item) => !baseVersions.has(`${item.id}@${item.version}`),
    )) {
      const prior = baseRequirements.requirements.filter(
        (item) => item.id === requirement.id,
      );
      if (prior.length) {
        const latest = prior.sort(
          (left, right) => right.version - left.version,
        )[0];
        if (
          requirement.version !== latest.version + 1 ||
          requirement.supersedes !== `${latest.id}@${latest.version}`
        )
          errors.push(
            `${requirement.id}@${requirement.version} must supersede ${latest.id}@${latest.version}`,
          );
      }
    }
  }

  const requirementVersions = new Set(
    requirements.requirements.map(
      (requirement) => `${requirement.id}@${requirement.version}`,
    ),
  );
  const syntheticTasks = new Set(syntheticTaskIds);
  for (const id of duplicates(tasks.map((task) => task.taskId)))
    errors.push(`duplicate task id: ${id}`);
  const baseTasksById = new Map(baseTasks.map((task) => [task.taskId, task]));
  for (const task of tasks) {
    const references = [
      ...task.requirementReferences,
      ...task.acceptanceCriteria.flatMap(
        (criterion) => criterion.requirementReferences,
      ),
    ];
    for (const reference of references.filter((item) =>
      /^[A-Z][A-Z0-9]+-[0-9]{3}@[0-9]+$/.test(item),
    )) {
      if (!requirementVersions.has(reference))
        errors.push(
          `${task.taskId} references unknown governed requirement: ${reference}`,
        );
    }
    const baseTask = baseTasksById.get(task.taskId);
    const requiresVersionTwo =
      task.contractVersion >= 2 ||
      baseTask?.contractVersion >= 2 ||
      (!baseTask && !syntheticTasks.has(task.taskId));
    if (requiresVersionTwo && task.contractVersion !== 2)
      errors.push(`${task.taskId} cannot omit or downgrade contractVersion 2`);
    if (baseTask?.contractVersion >= 2) {
      for (const field of [
        "contractVersion",
        "routingRuleId",
        "phase",
        "workArea",
      ]) {
        if (task[field] !== baseTask[field])
          errors.push(`${task.taskId} cannot change version-2 ${field}`);
      }
    }
    if (task.contractVersion >= 2) {
      if (
        !/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/[1-9][0-9]*$/.test(
          task.issueReference,
        )
      )
        errors.push(`${task.taskId} requires a durable GitHub issue URL`);
      const rule = routing.rules.find((item) => item.id === task.routingRuleId);
      if (!rule)
        errors.push(
          `${task.taskId} references unknown routing rule: ${task.routingRuleId}`,
        );
      else {
        if (task.phase !== rule.phase || task.workArea !== rule.workArea)
          errors.push(
            `${task.taskId} phase and workArea do not match ${rule.id}`,
          );
        const lead = agentsById.get(rule.leadAgentId);
        if (lead?.name !== task.assignedAgent)
          errors.push(
            `${task.taskId} assignedAgent does not match ${rule.id} lead`,
          );
        const requiredReviewers = rule.reviewerAgentIds
          .map((id) => agentsById.get(id)?.name)
          .filter(Boolean);
        for (const reviewer of requiredReviewers) {
          if (!task.supportingReviewers.includes(reviewer))
            errors.push(
              `${task.taskId} supportingReviewers omit ${rule.id} reviewer: ${reviewer}`,
            );
        }
        for (const path of task.allowedPaths) {
          if (path.startsWith("harness/tasks/")) continue;
          const requiredWorkArea = [...governedWorkAreaPrefixes].find(
            ([prefix]) =>
              prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix,
          )?.[1];
          if (requiredWorkArea && task.workArea !== requiredWorkArea)
            errors.push(
              `${task.taskId} ${path} requires workArea ${requiredWorkArea}`,
            );
        }
      }
    }
  }

  const taskIds = new Set(tasks.map((task) => task.taskId));
  const handoffTransitions = new Set([
    "proposed->ready",
    "proposed->rejected",
    "ready->accepted",
    "ready->rejected",
    "accepted->completed",
  ]);
  for (const { path, value: handoff } of handoffs) {
    const sender = agentsById.get(handoff.fromAgentId);
    const recipient = agentsById.get(handoff.toAgentId);
    if (!sender || !invocable.has(sender.lifecycle))
      errors.push(`${path} sender is not invocable: ${handoff.fromAgentId}`);
    if (!recipient || !invocable.has(recipient.lifecycle))
      errors.push(`${path} recipient is not invocable: ${handoff.toAgentId}`);
    if (handoff.fromAgentId === handoff.toAgentId)
      errors.push(`${path} cannot hand work to the same agent`);
    if (!taskIds.has(handoff.taskId))
      errors.push(`${path} references unknown task: ${handoff.taskId}`);
    if (handoff.history.at(-1)?.status !== handoff.status)
      errors.push(`${path} history does not end at ${handoff.status}`);
    if (handoff.history[0]?.status !== "proposed")
      errors.push(`${path} history must begin at proposed`);
    for (const entry of handoff.history) {
      if (!agentsById.has(entry.actor))
        errors.push(`${path} history actor is not registered: ${entry.actor}`);
      const expectedActor = ["proposed", "ready"].includes(entry.status)
        ? handoff.fromAgentId
        : handoff.toAgentId;
      if (entry.actor !== expectedActor)
        errors.push(`${path} ${entry.status} actor must be ${expectedActor}`);
      if (Date.parse(entry.enteredAt) > now.getTime())
        errors.push(`${path} history contains future-dated evidence`);
      for (const reference of entry.evidenceReferences) {
        const error = referenceError(reference, exists, read);
        if (error) errors.push(`${path} history reference ${error}`);
      }
    }
    for (let index = 1; index < handoff.history.length; index += 1) {
      const previous = handoff.history[index - 1];
      const entry = handoff.history[index];
      if (!handoffTransitions.has(`${previous.status}->${entry.status}`))
        errors.push(
          `${path} has disallowed transition: ${previous.status} -> ${entry.status}`,
        );
      if (Date.parse(entry.enteredAt) < Date.parse(previous.enteredAt))
        errors.push(`${path} history timestamps are not monotonic`);
    }
    const expectedOutputIds = new Set(
      handoff.expectedOutputs.map((output) => output.id),
    );
    for (const outputId of duplicates(
      handoff.expectedOutputs.map((output) => output.id),
    ))
      errors.push(`${path} has duplicate expected output: ${outputId}`);
    for (const evidence of handoff.evidence) {
      if (!expectedOutputIds.has(evidence.outputId))
        errors.push(
          `${path} evidence references unknown output: ${evidence.outputId}`,
        );
      else {
        const error = handoffEvidenceError(
          evidence.outputId,
          evidence.reference,
        );
        if (error) errors.push(`${path} evidence ${error}`);
      }
    }
    for (const reference of [
      ...handoff.inputs,
      ...handoff.evidence.map((evidence) => evidence.reference),
    ]) {
      const error = referenceError(reference, exists, read);
      if (error) errors.push(`${path} reference ${error}`);
    }
    if (
      ["accepted", "completed"].includes(handoff.status) &&
      [...expectedOutputIds].some(
        (outputId) =>
          !handoff.evidence.some(
            (evidence) =>
              evidence.outputId === outputId &&
              (evidence.reference.startsWith("https://") ||
                !/^[a-z]+:\/\//i.test(evidence.reference)),
          ),
      )
    )
      errors.push(
        `${path} ${handoff.status} handoff requires durable evidence for every expected output`,
      );
  }

  for (const task of tasks.filter((item) => !syntheticTasks.has(item.taskId))) {
    const assigned = agentsByName.get(task.assignedAgent);
    if (!assigned || !invocable.has(assigned.lifecycle))
      errors.push(
        `${task.taskId} assignedAgent is not registered and invocable: ${task.assignedAgent}`,
      );
    for (const reviewer of task.supportingReviewers) {
      const registeredReviewer = agentsByName.get(reviewer);
      if (!registeredReviewer || !invocable.has(registeredReviewer.lifecycle))
        errors.push(
          `${task.taskId} reviewer is not registered and invocable: ${reviewer}`,
        );
      if (reviewer === task.assignedAgent)
        errors.push(`${task.taskId} assigns the implementer as reviewer`);
    }
  }

  const deferredCatalog = read("docs/engineering/DEFERRED_AGENTS.md", "utf8");
  for (const agent of registry.agents.filter(
    (item) => item.lifecycle === "deferred",
  )) {
    if (!deferredCatalog.includes(`| ${agent.name}`))
      errors.push(`deferred catalog is missing ${agent.name}`);
  }
  for (const transition of activation.transitions) {
    if (
      ![...lifecycleValues, "unregistered"].includes(transition.from) ||
      !lifecycleValues.has(transition.to)
    )
      errors.push(
        `activation transition references unknown lifecycle: ${transition.from} -> ${transition.to}`,
      );
    if (transition.approvalGate !== "product-owner-and-github-protected-review")
      errors.push(
        `activation transition must retain external GitHub approval: ${transition.from} -> ${transition.to}`,
      );
  }
  return errors;
}

export function loadAgentGovernance({ loadBase = true } = {}) {
  const files = agentGovernanceFiles;
  const handoffs = readdirSync(files.handoffs)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      path: `${files.handoffs}/${name}`,
      value: readJson(`${files.handoffs}/${name}`),
    }));
  const tasks = readdirSync("harness/tasks")
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readJson(`harness/tasks/${name}`));
  const syntheticTask = readJson(
    "harness/tasks/repository-neutral-example.json",
  );
  return {
    activation: readJson(files.activation),
    baseActivation: loadBase ? readBaseJson(files.activation) : undefined,
    baseError: loadBase ? baseRevisionError() : undefined,
    baseRegistry: loadBase ? readBaseJson(files.registry) : undefined,
    baseRequirements: loadBase ? readBaseJson(files.requirements) : undefined,
    baseRouting: loadBase ? readBaseJson(files.routing) : undefined,
    baseTasks: loadBase ? readBaseTasks() : structuredClone(tasks),
    handoffs,
    registry: readJson(files.registry),
    requirements: readJson(files.requirements),
    routing: readJson(files.routing),
    schemas: {
      activation: readJson(files.activationSchema),
      handoff: readJson(files.handoffSchema),
      registry: readJson(files.registrySchema),
      requirements: readJson(files.requirementsSchema),
      routing: readJson(files.routingSchema),
    },
    syntheticTaskIds: [syntheticTask.taskId],
    tasks,
  };
}

export function governanceSummary(governance) {
  const counts = Object.fromEntries(
    ["core", "on-demand", "deferred", "experimental", "retired"].map(
      (lifecycle) => [
        lifecycle,
        governance.registry.agents.filter(
          (agent) => agent.lifecycle === lifecycle,
        ).length,
      ],
    ),
  );
  return `${governance.registry.agents.length} agents (${Object.entries(counts)
    .map(([key, value]) => `${value} ${key}`)
    .join(
      ", ",
    )}), ${governance.routing.rules.length} routes, ${governance.requirements.requirements.length} governed requirements, ${governance.handoffs.length} handoff records`;
}
