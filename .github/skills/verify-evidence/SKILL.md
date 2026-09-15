---
name: verify-evidence
description: "Validate task evidence and canonical gates. Use when implementation is complete and must advance through verification."
---

# Verify Evidence

## When to Use

- Validate implementation evidence and acceptance coverage through the terminal EDD state.

## Do Not Use For

- Fabricating evidence, waiving failed checks, approving changes, or deploying.

## Required Inputs

- Implemented task contract, changed files, required commands, artifacts, and known failures.

## Procedure

1. Validate task scope, route, state history, and required evidence declarations.
2. Run focused acceptance checks and record failures without suppression.
3. Run canonical verification and generate the evidence manifest.
4. Confirm requirements, artifacts, hashes, and changed-file inventory are consistent.
5. Report the verified result for GitHub CI, pull-request review, and merge controls.

## Authorized Agents

- `harness-evaluation-engineer`
- `qa-test-engineer`

## Required Agent Capabilities

- `ROUTE-008:deterministic-verification`
- `ROUTE-008:evidence-governance`
- `ROUTE-009:quality-assurance`

## Required Artifacts

- `evidence-manifest`
- `verification-report`

## Routing Rules

- `ROUTE-008`
- `ROUTE-009`

## EDD State Transitions

- `implemented -> verification-ready`
- `verification-ready -> verified`

## Evidence Obligations

- `canonical-verification`
- Preserve every check result and run `pnpm verify`; GitHub CI remains authoritative for required status checks.

## Human Approval Gates

- `protected-policy-approval`
- `merge-readiness-review`

## Failure and Escalation

- Mark the task blocked or changes-requested when any required gate fails; never rewrite failed evidence.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- Required checks pass, evidence is reproducible, and the EDD lifecycle ends at `verified`.

## Resources

- [Evidence manifest schema](../../../harness/schemas/evidence-manifest.schema.json)
- [Evidence gates](../../../harness/policies/evidence-gates.json)
- [Verification entrypoint](../../../harness/scripts/verify.mjs)
- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
