---
name: investigate-incident
description: "Investigate an operational incident using bounded evidence and runbooks. Use when diagnosing service impact, containment options, or rollback readiness."
---

# Investigate Incident

## When to Use

- Gather evidence, assess impact, and prepare human-owned containment or rollback decisions.

## Do Not Use For

- Executing production changes, exposing sensitive data, or declaring unsupported root causes.

## Required Inputs

- Incident report, affected environment, timestamps, correlation IDs, runbooks, and known changes.

## Procedure

1. Confirm explicit human dispatch and incident scope.
2. Gather least-privilege logs and preserve timestamps and correlation IDs.
3. Form and test hypotheses against read-only evidence.
4. Prepare containment or rollback evidence and route specialist handoffs.
5. Record state only after authorized human evidence exists; operational action remains human-owned.

## Authorized Agents

- `azure-platform-sre-engineer`

## Required Agent Capabilities

- `ROUTE-012:operational-readiness`
- `ROUTE-012:incident-support`

## Required Artifacts

- `none`

## Routing Rules

- `ROUTE-012`

## EDD State Transitions

- `none`

## Evidence Obligations

- `canonical-verification`
- Preserve sanitized observations and commands; run `pnpm verify` for any repository correction.

## Human Approval Gates

- `explicit-human-dispatch`

## Failure and Escalation

- Escalate immediately when access, safety, privacy, or evidence is insufficient; preserve unknowns.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- Timeline, impact, evidence, hypotheses, options, and the required human decision are documented.

## Resources

- [Database backup runbook](../../../docs/database/backup-retention-runbook.md)
- [Acceptance test traceability](../../../docs/keyforta-acceptance-test-traceability.md)
- [Security and privacy decisions](../../../docs/keyforta-legal-privacy-decision-register.md)
- [Evidence gates](../../../harness/policies/evidence-gates.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
