---
name: fix-defect
description: "Reproduce and fix an evidenced defect with a regression test. Use when observed behavior violates an approved requirement or existing contract."
---

# Fix Defect

## When to Use

- Correct a reproducible defect or address bounded review feedback.

## Do Not Use For

- Reclassifying a feature request as a bug or changing expected behavior without approval.

## Required Inputs

- Failure evidence, expected behavior, task contract, reproduction, and affected route.

## Procedure

1. Reproduce the failure and trace expected behavior to an approved source.
2. Confirm route ownership and create a handoff if another specialist owns the fix.
3. Add a regression test, implement the root-cause correction, and preserve invariants.
4. Record bounded correction, changed files, and repair-cycle evidence.
5. Run focused validation followed by canonical verification.

## Authorized Agents

- `frontend-engineer`
- `backend-engineer`
- `data-database-engineer`
- `harness-evaluation-engineer`
- `qa-test-engineer`

## Required Agent Capabilities

- `ROUTE-004:implementation`
- `ROUTE-004:web`
- `ROUTE-005:implementation`
- `ROUTE-005:authorization`
- `ROUTE-006:implementation`
- `ROUTE-006:data-integrity`
- `ROUTE-008:deterministic-verification`
- `ROUTE-009:quality-assurance`
- `ROUTE-009:regression-testing`

## Required Artifacts

- `failure-evidence`
- `regression-test`
- `correction-record`
- `changed-file-inventory`

## Task Classifications

- `bugfix`

## Routing Rules

- `ROUTE-004`
- `ROUTE-005`
- `ROUTE-006`
- `ROUTE-008`
- `ROUTE-009`

## EDD State Transitions

- `implementation-ready -> implemented`
- `changes-requested -> implemented`

## Evidence Obligations

- `canonical-verification`
- Preserve the failing case and passing regression output; run `pnpm verify` before completion.

## Human Approval Gates

- `approved-task-contract`
- `data-lifecycle-and-migration-approval-when-consequential`
- `protected-policy-approval`
- `merge-readiness-review`

## Failure and Escalation

- Stop after three automated repair cycles or when evidence shows a requirement change is needed.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- The defect is reproduced, fixed at its controlling path, regression-tested, and independently reviewable.

## Resources

- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Evidence gates](../../../harness/policies/evidence-gates.json)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
