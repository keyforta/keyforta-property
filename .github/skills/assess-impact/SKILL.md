---
name: assess-impact
description: "Assess architecture, security, data, operational, and rollback impact. Use when approved scope needs a bounded technical decision before planning."
---

# Assess Impact

## Inputs

- Approved scope, affected paths, architecture sources, constraints, and risks.

## Procedure

1. Trace affected modules, contracts, data, integrations, and user workflows.
2. Assess authorization, privacy, reliability, operations, cost, and rollback.
3. Identify compatibility risks, migrations, reviewers, and required approvals.
4. Compare the smallest viable options and explain their tradeoffs.
5. Record consequential architecture decisions in an ADR.

## Guardrails

- Do not expand product scope or select paid services without approval.
- Preserve the modular-monolith boundary unless an accepted ADR says otherwise.

## Completion

- Return impacts, options, recommendation, rollback path, and unresolved decisions.

## Resources

- [Context and ownership](../../../docs/contracts/keyforta-context-map-and-ownership.md)
- [Architecture decisions](../../../docs/adr/)
- [Security architecture](../../../docs/engineering/THREAT_MODEL.md)