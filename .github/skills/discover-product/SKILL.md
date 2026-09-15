---
name: discover-product
description: "Trace existing product behavior, users, and authoritative requirements. Use when exploring what KEYFORTA already promises before defining work."
---

# Discover Product

## When to Use

- Establish current product intent, observable behavior, constraints, and gaps.

## Do Not Use For

- Inventing requirements, approving scope, or changing runtime behavior.

## Required Inputs

- Product question, affected personas or workflow, and known source references.

## Procedure

1. Read authoritative product documents and trace relevant implementation evidence.
2. Separate verified behavior, intended behavior, and unresolved ambiguity.
3. Record ambiguity in the requirements-gap register.
4. Route any proposed change through a task contract and structured handoff.
5. Record the EDD analysis evidence without advancing approval.

## Authorized Agents

- `product-requirements-analyst`

## Required Agent Capabilities

- `ROUTE-001:requirements-governance`
- `ROUTE-001:gap-analysis`

## Required Artifacts

- `requirements-analysis`

## Routing Rules

- `ROUTE-001`

## EDD State Transitions

- `proposed -> analyzed`

## Evidence Obligations

- `canonical-verification`
- Cite authoritative sources and unknowns. For repository changes, run `pnpm verify`; partial checks do not replace it.

## Human Approval Gates

- `product-owner-scope-approval`

## Failure and Escalation

- Stop and add a requirements gap when sources conflict or product intent is absent.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- Findings distinguish facts, assumptions, gaps, risks, and the next Product Owner decision.

## Resources

- [Backend implementation specification](../../../docs/keyforta-backend-implementation-specification.md)
- [Requirements gaps](../../../docs/engineering/REQUIREMENTS_GAPS.md)
- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
