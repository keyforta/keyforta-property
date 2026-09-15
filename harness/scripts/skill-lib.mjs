import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { parse } from "yaml";
import { confinedPath } from "./agent-lib.mjs";

export const requiredSkillNames = [
  "assess-impact",
  "define-requirement",
  "design-experience",
  "discover-capabilities",
  "discover-product",
  "fix-defect",
  "implement-feature",
  "investigate-incident",
  "plan-feature",
  "prepare-release",
  "refine-requirement",
  "review-change",
  "route-work",
  "verify-evidence",
];

export const requiredSkillSections = [
  "When to Use",
  "Do Not Use For",
  "Required Inputs",
  "Procedure",
  "Authorized Agents",
  "Required Agent Capabilities",
  "Required Artifacts",
  "Routing Rules",
  "EDD State Transitions",
  "Evidence Obligations",
  "Human Approval Gates",
  "Failure and Escalation",
  "Prohibited Actions",
  "Completion Criteria",
  "Resources",
];

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return { errors: ["missing YAML frontmatter"], metadata: {} };
  const errors = [];
  const allowedFields = new Set([
    "name",
    "description",
    "argument-hint",
    "user-invocable",
    "disable-model-invocation",
  ]);
  let metadata = {};
  try {
    metadata = parse(match[1], { uniqueKeys: true });
  } catch (error) {
    return {
      errors: [`invalid YAML metadata: ${error.message}`],
      metadata: {},
    };
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { errors: ["YAML frontmatter must be a mapping"], metadata: {} };
  }
  for (const field of Object.keys(metadata)) {
    if (!allowedFields.has(field))
      errors.push(`unknown metadata field: ${field}`);
  }
  for (const field of ["user-invocable", "disable-model-invocation"]) {
    if (field in metadata && typeof metadata[field] !== "boolean")
      errors.push(`${field} must be true or false`);
  }
  for (const field of ["name", "description"]) {
    if (typeof metadata[field] !== "string")
      errors.push(`${field} must be a string`);
  }
  if (
    "argument-hint" in metadata &&
    typeof metadata["argument-hint"] !== "string"
  )
    errors.push("argument-hint must be a string");
  return { errors, metadata };
}

function parseSections(source) {
  const sections = new Map();
  const errors = [];
  let heading;
  let fence;
  const renderedSource = source.replaceAll(
    /<!--[\s\S]*?(?:-->|$)/g,
    (comment) => comment.replaceAll(/[^\n]/g, ""),
  );
  for (const line of renderedSource.split("\n")) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      const character = marker[1][0];
      if (!fence && (character === "~" || !marker[2].includes("`"))) {
        fence = { character, length: marker[1].length };
      } else if (
        fence &&
        character === fence.character &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      ) {
        fence = undefined;
      }
    }
    const match = fence ? undefined : line.match(/^## (.+)$/);
    if (match) {
      heading = match[1].trim();
      if (sections.has(heading)) errors.push(`duplicate section: ${heading}`);
      else sections.set(heading, "");
    } else if (heading) {
      sections.set(heading, `${sections.get(heading)}\n${line}`.trim());
    }
  }
  if (fence) errors.push("unclosed fenced code block");
  return { errors, sections };
}

function declaredValues(section = "") {
  const values = [];
  const errors = [];
  for (const line of section.split("\n").filter((item) => item.trim())) {
    const match = line.match(/^- `([^`]+)`$/);
    if (match) values.push(match[1]);
    else errors.push(`invalid structured declaration: ${line}`);
  }
  return { errors, values };
}

function referencedResources(section = "") {
  const references = [];
  const errors = [];
  for (const line of section.split("\n").filter((item) => item.trim())) {
    const match = line.match(/^- \[[^\]]+\]\(([^)]+)\)$/);
    if (match) references.push(match[1].split("#")[0]);
    else errors.push(`invalid resource declaration: ${line}`);
  }
  return { errors, references };
}

function contradictoryInstruction(source) {
  const dangerous = [
    /\b(?:self[- ]approve|approve (?:the|this|own)|merge (?:the|this))\b/i,
    /\b(?:deploy(?:ment|s|ed|ing)?|roll[ -]?out|promot\w*|push|publish|ship|go live|execute|perform|apply|mutat\w*)\b.*\b(?:production|live environment)\b/i,
    /\bgo live\b/i,
    /\b(?:production|live environment)\b.*\b(?:deploy(?:ment|s|ed|ing)?|roll[ -]?out|promot\w*|push|publish|ship|go live|permitt?\w*|authoriz\w*)\b/i,
    /\brelease\b.*\b(?:to|into)\b.*\b(?:production|live environment)\b/i,
    /\b(?:treat|use|accept|regard)\b.*\b(?:approval record|agent decision)\b.*\b(?:authori[sz]\w*|approval|permit\w*|continu\w*)\b/i,
    /\b(?:approval record|agent decision)\b.*\b(?:authori[sz]\w*|permit\w*|continu\w*|proceed)\b/i,
    /\b(?:continue|proceed)\b.*\b(?:without|before)\b.*\b(?:human|approval)\b/i,
    /\b(?:skip|bypass)\b.*\b(?:approval|pnpm verify|canonical verification)\b/i,
    /\bcanonical verification\b.*\b(?:optional|unnecessary|not required|skip|bypass)\b/i,
  ];
  const instructions = [];
  for (const line of source.split("\n")) {
    if (/^\s*(?:\d+\.|[-*+])\s+/.test(line) || !instructions.length)
      instructions.push(line);
    else instructions[instructions.length - 1] += ` ${line}`;
  }
  return instructions
    .map((instruction) => instruction.replaceAll(/\s+/g, " "))
    .flatMap((instruction) =>
      dangerous.map((pattern) => instruction.match(pattern)?.[0]),
    )
    .find(Boolean);
}

function resourceError(skillPath, reference, exists = existsSync) {
  if (!reference) return "empty resource reference";
  if (/^(?:[a-z]+:)?\/\//i.test(reference))
    return `${reference} must be repository-relative`;
  const repositoryRoot = resolve(".");
  const target = resolve(dirname(skillPath), reference);
  const targetRelative = relative(repositoryRoot, target);
  if (targetRelative.startsWith("..") || targetRelative === "")
    return `${reference} escapes the repository or does not name a file`;
  return confinedPath(targetRelative, exists);
}

export function parseSkill(path, source) {
  const { errors, metadata } = parseFrontmatter(source);
  const parsedSections = parseSections(source);
  return {
    errors: [...errors, ...parsedSections.errors],
    metadata,
    path,
    sections: parsedSections.sections,
    source,
  };
}

export function loadSkills(
  root = ".github/skills",
  { read = readFileSync, list = readdirSync } = {},
) {
  return list(root, { withFileTypes: true })
    .map((entry) => ({
      invalidDirectory: !entry.isDirectory(),
      path: `${root}/${entry.name}/SKILL.md`,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ invalidDirectory, path }) =>
      !invalidDirectory && !confinedPath(path)
        ? parseSkill(path, read(path, "utf8"))
        : {
            errors: [
              "skill directory and SKILL.md must be regular repository paths",
            ],
            metadata: {},
            path,
            sections: new Map(),
            source: "",
          },
    );
}

export function validateSkills(
  skills,
  { activation, evidencePolicy, registry, routing },
  { exists = existsSync } = {},
) {
  const errors = [];
  const invocable = new Set(activation.invocableLifecycles);
  const agents = new Map(registry.agents.map((agent) => [agent.id, agent]));
  const capabilities = new Set(
    registry.agents.flatMap((agent) => agent.capabilities),
  );
  const transitions = new Map(
    evidencePolicy.transitions.map((transition) => [
      `${transition.from} -> ${transition.to}`,
      transition,
    ]),
  );
  const routes = new Map(routing.rules.map((route) => [route.id, route]));
  const knownArtifacts = new Set([
    ...evidencePolicy.transitions.flatMap((transition) => transition.artifacts),
    ...Object.values(evidencePolicy.classificationRequirements).flatMap(
      (requirement) => requirement.artifacts,
    ),
    ...evidencePolicy.pathRequirements.flatMap(
      (requirement) => requirement.artifacts,
    ),
  ]);
  const knownApprovalGates = new Set([
    "none",
    ...evidencePolicy.transitions.flatMap((transition) => transition.approvals),
    ...routing.rules.map((route) => route.humanGate),
  ]);
  const names = skills.map((skill) => skill.metadata.name).filter(Boolean);
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) errors.push(`duplicate skill name: ${name}`);
    seen.add(name);
  }
  for (const required of requiredSkillNames) {
    if (!seen.has(required)) errors.push(`missing required skill: ${required}`);
  }

  for (const skill of skills) {
    const label = skill.metadata.name || skill.path;
    errors.push(...skill.errors.map((error) => `${label}: ${error}`));
    const folderName = dirname(skill.path).split("/").at(-1);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.metadata.name ?? ""))
      errors.push(`${label}: invalid skill name`);
    if (skill.metadata.name !== folderName)
      errors.push(`${label}: skill name must match folder ${folderName}`);
    if (
      !skill.metadata.description ||
      skill.metadata.description.length > 1024 ||
      !/use when/i.test(skill.metadata.description)
    )
      errors.push(`${label}: description must clearly state when to use it`);
    for (const section of requiredSkillSections) {
      if (!skill.sections.get(section))
        errors.push(`${label}: missing required section: ${section}`);
    }

    const declarations = {};
    for (const section of [
      "Authorized Agents",
      "Required Agent Capabilities",
      "Required Artifacts",
      "Task Classifications",
      "Routing Rules",
      "EDD State Transitions",
      "Human Approval Gates",
      "Prohibited Actions",
    ]) {
      declarations[section] = declaredValues(skill.sections.get(section));
      errors.push(
        ...declarations[section].errors.map((error) => `${label}: ${error}`),
      );
      if (
        section !== "Task Classifications" &&
        !declarations[section].values.length
      )
        errors.push(`${label}: ${section} must declare at least one value`);
    }

    const authorizedAgents = declarations["Authorized Agents"].values;
    for (const id of authorizedAgents) {
      const agent = agents.get(id);
      if (!agent) errors.push(`${label}: unknown agent: ${id}`);
      else if (!invocable.has(agent.lifecycle))
        errors.push(`${label}: unauthorized deferred or inactive agent: ${id}`);
    }
    const taskClassifications = declarations["Task Classifications"].values;
    for (const classification of taskClassifications) {
      if (!evidencePolicy.classificationRequirements[classification])
        errors.push(`${label}: unknown task classification: ${classification}`);
    }

    const routeIds = declarations["Routing Rules"].values;
    const routeLeads = new Set();
    for (const routeId of routeIds) {
      const route = routes.get(routeId);
      if (!route) errors.push(`${label}: unknown routing rule: ${routeId}`);
      else {
        routeLeads.add(route.leadAgentId);
        if (
          !declarations["Human Approval Gates"].values.includes(route.humanGate)
        )
          errors.push(
            `${label}: missing route approval gate: ${route.humanGate}`,
          );
      }
    }
    for (const id of authorizedAgents) {
      if (!routeLeads.has(id))
        errors.push(`${label}: agent ${id} is not a lead for a declared route`);
    }
    for (const id of routeLeads) {
      if (!authorizedAgents.includes(id))
        errors.push(`${label}: route lead is not authorized: ${id}`);
    }

    const capabilitiesByRoute = new Map();
    for (const binding of declarations["Required Agent Capabilities"].values) {
      const match = binding.match(/^(ROUTE-\d{3}):([a-z0-9-]+)$/);
      if (!match) {
        errors.push(`${label}: invalid route capability binding: ${binding}`);
        continue;
      }
      const [, routeId, capability] = match;
      const route = routes.get(routeId);
      if (!routeIds.includes(routeId))
        errors.push(
          `${label}: capability binding uses undeclared route: ${routeId}`,
        );
      if (!capabilities.has(capability))
        errors.push(`${label}: unknown capability: ${capability}`);
      else if (
        route &&
        !agents.get(route.leadAgentId)?.capabilities.includes(capability)
      )
        errors.push(
          `${label}: route lead ${route.leadAgentId} lacks capability: ${capability}`,
        );
      if (!capabilitiesByRoute.has(routeId))
        capabilitiesByRoute.set(routeId, new Set());
      capabilitiesByRoute.get(routeId).add(capability);
    }
    for (const routeId of routeIds) {
      const route = routes.get(routeId);
      if (!route) continue;
      for (const capability of route.requiredCapabilities) {
        if (!capabilitiesByRoute.get(routeId)?.has(capability))
          errors.push(
            `${label}: route ${routeId} is missing required capability: ${capability}`,
          );
      }
    }

    const declaredTransitions = declarations[
      "EDD State Transitions"
    ].values.filter((value) => value !== "none");
    const approvalGates = new Set(declarations["Human Approval Gates"].values);
    const allowedApprovalGates = new Set(
      declarations["Routing Rules"].values
        .map((routeId) => routes.get(routeId)?.humanGate)
        .filter(Boolean),
    );
    for (const gate of approvalGates) {
      if (!knownApprovalGates.has(gate))
        errors.push(`${label}: unknown approval gate: ${gate}`);
    }
    for (const edge of declaredTransitions) {
      const transition = transitions.get(edge);
      if (!transition) errors.push(`${label}: invalid EDD transition: ${edge}`);
      else {
        for (const artifact of transition.artifacts) {
          if (!declarations["Required Artifacts"].values.includes(artifact))
            errors.push(`${label}: missing transition artifact: ${artifact}`);
        }
        for (const approval of transition.approvals) {
          allowedApprovalGates.add(approval);
          if (!approvalGates.has(approval))
            errors.push(`${label}: missing approval gate: ${approval}`);
        }
      }
    }
    if (!allowedApprovalGates.size) allowedApprovalGates.add("none");
    for (const gate of approvalGates) {
      if (!allowedApprovalGates.has(gate))
        errors.push(
          `${label}: approval gate is unrelated to routes and transitions: ${gate}`,
        );
    }

    const allowedArtifacts = new Set(
      declaredTransitions.flatMap(
        (edge) => transitions.get(edge)?.artifacts ?? [],
      ),
    );
    for (const classification of taskClassifications) {
      for (const artifact of evidencePolicy.classificationRequirements[
        classification
      ]?.artifacts ?? [])
        allowedArtifacts.add(artifact);
    }
    const requiredArtifacts = declarations["Required Artifacts"].values;
    if (requiredArtifacts.includes("none") && requiredArtifacts.length > 1)
      errors.push(`${label}: none must be the only required artifact`);
    for (const artifact of requiredArtifacts.filter(
      (value) => value !== "none",
    )) {
      if (!knownArtifacts.has(artifact))
        errors.push(`${label}: unknown required artifact: ${artifact}`);
      else if (!allowedArtifacts.has(artifact))
        errors.push(
          `${label}: required artifact is unrelated to transitions and classifications: ${artifact}`,
        );
    }

    const evidence = skill.sections.get("Evidence Obligations") ?? "";
    if (!/^- `canonical-verification`$/m.test(evidence))
      errors.push(`${label}: canonical verification obligation is missing`);
    const prohibited = new Set(declarations["Prohibited Actions"].values);
    for (const action of [
      "bypass-canonical-verification",
      "self-approval",
      "production-deployment",
    ]) {
      if (!prohibited.has(action))
        errors.push(`${label}: prohibited action is missing: ${action}`);
    }
    const safetyTexts = [
      skill.metadata.description ?? "",
      ...[
        "When to Use",
        "Required Inputs",
        "Procedure",
        "Evidence Obligations",
        "Failure and Escalation",
        "Completion Criteria",
      ].map((section) => skill.sections.get(section) ?? ""),
    ];
    const contradiction = safetyTexts
      .map((text) => contradictoryInstruction(text))
      .find(Boolean);
    if (contradiction)
      errors.push(
        `${label}: procedure contradicts governed prohibitions: ${contradiction}`,
      );
    const nonCodeSource = skill.source.replace(/`[^`\n]*`/g, "");
    if (/(?:\b[a-z][a-z0-9+.-]*:[^\s]|\/\/[^\s])/i.test(nonCodeSource))
      errors.push(`${label}: external or absolute URI is prohibited`);

    const resources = referencedResources(skill.sections.get("Resources"));
    errors.push(...resources.errors.map((error) => `${label}: ${error}`));
    if (!resources.references.length)
      errors.push(`${label}: no referenced resources`);
    for (const reference of resources.references) {
      const error = resourceError(skill.path, reference, exists);
      if (error) errors.push(`${label}: resource ${error}`);
    }
  }
  return errors;
}
