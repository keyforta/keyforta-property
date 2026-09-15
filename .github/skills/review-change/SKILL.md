---
name: review-change
description: "Perform independent risk-focused review of a verified change. Use when a change needs findings on correctness, scope, security, and maintainability."
---

# Review Change

## When to Use

- Independently review a verified change against its task contract and evidence.

## Do Not Use For

- Approving your own implementation, fixing unrelated issues, or replacing GitHub review controls.

## Required Inputs

- Task contract, diff, verification evidence, requirements, and reviewer independence context.

## Procedure

1. Confirm reviewer independence and task scope.
2. Inspect behavior, invariants, tests, security, architecture, and evidence.
3. Report findings by severity with exact file references.
4. Route corrections through a changes-requested handoff when needed.
5. Record the review report; leave approval to GitHub controls.

## Authorized Agents

- `pull-request-reviewer`

## Required Agent Capabilities

- `ROUTE-010:independent-review`

## Required Artifacts

- `none`

## Routing Rules

- `ROUTE-010`

## EDD State Transitions

- `none`

## Evidence Obligations

- `canonical-verification`
- Record findings, independence, and resolution; inspect GitHub checks for commit-specific CI status.

## Human Approval Gates

- `security-authority-when-required`

## Failure and Escalation

- Request changes for unresolved defects and escalate security or authority conflicts to the named human owner.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- Findings are resolved or explicitly outstanding, independence is documented, and GitHub owns approval.

## Resources

- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Evidence manifest schema](../../../harness/schemas/evidence-manifest.schema.json)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [Handoff schema](../../../harness/schemas/handoff.schema.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
