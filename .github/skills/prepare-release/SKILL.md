---
name: prepare-release
description: "Prepare monitoring and rollback information for GitHub-owned release controls. Use when a verified change is ready for human release decisions."
---

# Prepare Release

## When to Use

- Assemble release-readiness information after EDD verification.

## Do Not Use For

- Deploying, merging, granting approval, or bypassing protected environments.

## Required Inputs

- Verified task, GitHub pull request, release plan, monitoring plan, and rollback plan.

## Procedure

1. Confirm EDD verification and required GitHub CI checks are complete.
2. Prepare monitoring and rollback information for the GitHub release decision.
3. Route pull-request reviews, CODEOWNERS or ruleset checks, merge controls, protected environments, and deployment approvals through GitHub.
4. Stop before merge or deployment and report the next human action.
5. Do not represent GitHub review, merge, deployment, or rollback outcomes as EDD lifecycle states.

## Authorized Agents

- `azure-platform-sre-engineer`
- `technical-writer-documentation-steward`

## Required Agent Capabilities

- `ROUTE-011:documentation`
- `ROUTE-012:operational-readiness`
- `ROUTE-012:incident-support`

## Required Artifacts

- `none`

## Routing Rules

- `ROUTE-011`
- `ROUTE-012`

## EDD State Transitions

- `none`

## Evidence Obligations

- `canonical-verification`
- Use the verified EDD result as input; GitHub remains authoritative for CI, review, merge, environment, and deployment status.

## Human Approval Gates

- `product-owner-acceptance`
- `explicit-human-dispatch`

## Failure and Escalation

- Stop when GitHub controls, monitoring, or rollback information are incomplete.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- Humans have a complete release decision package; the skill performs no merge or deployment.

## Resources

- [Acceptance test traceability](../../../docs/keyforta-acceptance-test-traceability.md)
- [Evidence manifest schema](../../../harness/schemas/evidence-manifest.schema.json)
- [Evidence gates](../../../harness/policies/evidence-gates.json)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
