---
name: define-requirement
description: "Turn an evidenced product need into a traceable requirement and acceptance boundary. Use when proposing scope for Product Owner approval."
---

# Define Requirement

## When to Use

- Define a new requirement from verified product evidence and explicit user need.

## Do Not Use For

- Silently changing approved scope or treating an agent decision as approval.

## Required Inputs

- Requirements analysis, source evidence, scenarios, constraints, and known gaps.

## Procedure

1. Trace the need to authoritative product sources and an issue.
2. Define testable acceptance criteria, exclusions, risks, and human decisions.
3. Create or update the task contract without duplicating product authority.
4. Route independent review through a handoff where needed.
5. Request Product Owner approval through GitHub before recording approval.

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
- Preserve source and acceptance traceability. For repository changes, run `pnpm verify`; partial checks do not replace it.

## Human Approval Gates

- `product-owner-scope-approval`

## Failure and Escalation

- Keep the task analyzed and request clarification when scope or acceptance is ambiguous.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- The requirement is bounded, testable, traceable, and externally approved before advancement.

## Resources

- [Backend implementation specification](../../../docs/keyforta-backend-implementation-specification.md)
- [Requirements gaps](../../../docs/engineering/REQUIREMENTS_GAPS.md)
- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Evidence gates](../../../harness/policies/evidence-gates.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
