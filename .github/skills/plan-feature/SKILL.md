---
name: plan-feature
description: "Produce a traceable implementation plan and acceptance-test map. Use when an approved design must become bounded implementation-ready work."
---

# Plan Feature

## When to Use

- Decompose an approved design into ordered, testable implementation work.

## Do Not Use For

- Implementing code, changing scope, or assigning agents outside the routing matrix.

## Required Inputs

- Approved task contract, technical decision, acceptance criteria, and affected boundaries.

## Procedure

1. Verify the task route, allowed paths, dependencies, and reviewers.
2. Map each requirement to implementation steps and acceptance tests.
3. Define rollback, risk checks, evidence, and documentation updates.
4. Create handoffs for work crossing governed ownership boundaries.
5. Record implementation-plan and acceptance-test-map evidence.

## Authorized Agents

- `solution-architect`
- `qa-test-engineer`

## Required Agent Capabilities

- `ROUTE-002:architecture`
- `ROUTE-009:quality-assurance`
- `ROUTE-009:acceptance-testing`

## Required Artifacts

- `implementation-plan`
- `acceptance-test-map`

## Routing Rules

- `ROUTE-002`
- `ROUTE-009`

## EDD State Transitions

- `designed -> implementation-ready`

## Evidence Obligations

- `canonical-verification`
- Maintain requirement-to-step-to-test traceability. For repository changes, run `pnpm verify`; partial checks do not replace it.

## Human Approval Gates

- `architecture-decision-when-consequential`
- `merge-readiness-review`

## Failure and Escalation

- Return to design or requirements when steps cannot be traced or ownership is ambiguous.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- The plan is bounded, routed, reversible, test-mapped, and ready for specialist implementation.

## Resources

- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [Handoff schema](../../../harness/schemas/handoff.schema.json)
- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
