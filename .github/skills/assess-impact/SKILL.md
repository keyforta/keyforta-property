---
name: assess-impact
description: "Assess architecture, security, data, operational, and rollback impact. Use when approved scope needs a bounded technical decision before planning."
---

# Assess Impact

## When to Use

- Evaluate cross-boundary consequences and identify specialist review requirements.

## Do Not Use For

- Expanding approved product scope, selecting paid services, or approving your own design.

## Required Inputs

- Approved task contract, affected paths, architecture sources, risks, and constraints.

## Procedure

1. Confirm scope and route against the task contract.
2. Analyze module, contract, security, privacy, data, operations, and rollback impact.
3. Create bounded handoffs for required specialist reviews.
4. Record tradeoffs and consequential decisions in authoritative documentation.
5. Advance to designed only with the required evidence and human decision.

## Authorized Agents

- `solution-architect`

## Required Agent Capabilities

- `ROUTE-002:architecture`
- `ROUTE-002:contract-impact`

## Required Artifacts

- `technical-decision`

## Routing Rules

- `ROUTE-002`

## EDD State Transitions

- `approved -> designed`

## Evidence Obligations

- `canonical-verification`
- Cite impacted contracts and review outputs. For repository changes, run `pnpm verify`; partial checks do not replace it.

## Human Approval Gates

- `architecture-decision-when-consequential`

## Failure and Escalation

- Stop for the named authority when the change affects architecture, auth, data lifecycle, payments, or production controls.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- Impacts, tradeoffs, reviewers, rollback, evidence, and unresolved decisions are explicit.

## Resources

- [Architecture context](../../../docs/keyforta-context-map-and-ownership.md)
- [Security and privacy decisions](../../../docs/keyforta-legal-privacy-decision-register.md)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [Handoff schema](../../../harness/schemas/handoff.schema.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
