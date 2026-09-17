---
name: investigate-incident
description: "Investigate an operational incident using bounded facts and runbooks. Use when diagnosing service impact, containment options, or rollback readiness."
---

# Investigate Incident

## Inputs

- Incident report, environment, timestamps, correlation IDs, runbooks, and known changes.

## Procedure

1. Confirm incident scope, impact, access limits, and the human incident owner.
2. Gather least-privilege logs while preserving timestamps and correlation IDs.
3. Form falsifiable hypotheses and test them against read-only operational data.
4. Document timeline, confirmed facts, unknowns, and containment or rollback options.
5. Present operational actions for authorized human decision and execution.

## Guardrails

- Do not expose sensitive data, execute production changes, or overstate root cause.
- Preserve unknowns and escalate when access, safety, or privacy is insufficient.

## Completion

- Return impact, timeline, findings, hypotheses, options, and required human decisions.

## Resources

- [Operations documentation](../../../docs/operations/)
- [Azure architecture](../../../infra/README.md#appendix-a-supporting-logical-and-repository-defined-azure-architecture)