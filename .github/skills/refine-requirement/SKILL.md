---
name: refine-requirement
description: "Clarify and version a proposed requirement without erasing prior decisions. Use when feedback exposes ambiguity, missing acceptance criteria, or scope risk."
---

# Refine Requirement

## When to Use

- Resolve requirement ambiguity before approval or supersede a governed version.

## Do Not Use For

- Rewriting approved history, changing scope without Product Owner review, or implementing code.

## Required Inputs

- Existing requirement, review feedback, source evidence, and affected acceptance criteria.

## Procedure

1. Compare feedback with authoritative product sources and prior evidence.
2. Preserve historical versions; create a new version when behavior changes.
3. Update acceptance criteria, exclusions, risks, and task references.
4. Record unresolved questions and hand off specialized analysis when needed.
5. Obtain Product Owner approval before the approved state is recorded.

## Authorized Agents

- `product-requirements-analyst`

## Required Agent Capabilities

- `ROUTE-001:requirements-governance`
- `ROUTE-001:traceability`

## Required Artifacts

- `task-contract`

## Routing Rules

- `ROUTE-001`

## EDD State Transitions

- `analyzed -> approved`

## Evidence Obligations

- `canonical-verification`
- Link prior and replacement requirement evidence. For repository changes, run `pnpm verify`; partial checks do not replace it.

## Human Approval Gates

- `product-owner-scope-approval`

## Failure and Escalation

- Leave the requirement unapproved and record a gap when evidence cannot resolve ambiguity.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- The refined requirement preserves history, traceability, acceptance boundaries, and external approval.

## Resources

- [Requirement lifecycle](../../../harness/requirements/agent-foundation.json)
- [Requirements gaps](../../../docs/engineering/REQUIREMENTS_GAPS.md)
- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Evidence gates](../../../harness/policies/evidence-gates.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
