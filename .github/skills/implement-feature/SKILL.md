---
name: implement-feature
description: "Implement an approved feature within its routed task contract. Use when design, acceptance tests, ownership, and allowed paths are implementation-ready."
---

# Implement Feature

## When to Use

- Build approved behavior with tests and documentation inside the assigned work area.

## Do Not Use For

- Unapproved scope, unresolved requirements, production deployment, or self-review.

## Required Inputs

- Implementation-ready task contract, plan, acceptance-test map, and routed handoff.

## Procedure

1. Confirm route ownership, allowed paths, dependencies, and product invariants.
2. Implement the smallest requirement-traceable change with acceptance tests.
3. Keep cross-boundary work behind contracts and create handoffs when ownership changes.
4. Update authoritative documentation and changed-file evidence.
5. Run focused checks, then canonical verification before advancing.

## Authorized Agents

- `frontend-engineer`
- `backend-engineer`
- `data-database-engineer`

## Required Agent Capabilities

- `ROUTE-004:implementation`
- `ROUTE-004:web`
- `ROUTE-005:implementation`
- `ROUTE-005:authorization`
- `ROUTE-006:implementation`
- `ROUTE-006:data-integrity`

## Required Artifacts

- `changed-file-inventory`

## Routing Rules

- `ROUTE-004`
- `ROUTE-005`
- `ROUTE-006`

## EDD State Transitions

- `implementation-ready -> implemented`

## Evidence Obligations

- `canonical-verification`
- Record files, tests, traceability, and known failures; run `pnpm verify` before completion.

## Human Approval Gates

- `approved-task-contract`
- `data-lifecycle-and-migration-approval-when-consequential`

## Failure and Escalation

- Stop on scope, architecture, security, data, or requirement ambiguity and hand back to the owning role.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- Accepted scope is implemented with tests, documentation, bounded changes, and reproducible evidence.

## Resources

- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [Handoff schema](../../../harness/schemas/handoff.schema.json)
- [Repository agreement](../../../AGENTS.md)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
