---
name: route-work
description: "Select the governed route, lead agent, and reviewers for approved work. Use when assigning a task by lifecycle phase and work area."
---

# Route Work

## When to Use

- Route an approved issue or task to an active owner and independent reviewers.

## Do Not Use For

- Inventing scope, activating deferred agents, or overriding route ownership.

## Required Inputs

- Approved issue, affected paths, phase, work area, and risk classification.

## Procedure

1. Read the task contract, registry, activation policy, and routing matrix.
2. Select the matching route and confirm every assigned role is invocable.
3. Update the task contract with route, lead, reviewers, and allowed paths.
4. Create a schema-valid handoff when responsibility changes.
5. Preserve the current EDD state and its next human gate.

## Authorized Agents

- `product-requirements-analyst`

## Required Agent Capabilities

- `ROUTE-001:requirements-governance`

## Required Artifacts

- `none`

## Routing Rules

- `ROUTE-001`

## EDD State Transitions

- `none`

## Evidence Obligations

- `canonical-verification`
- Cite the selected route and handoff. For repository changes, run `pnpm verify`; partial checks do not replace it.

## Human Approval Gates

- `product-owner-scope-approval`

## Failure and Escalation

- Stop for Product Owner clarification when no route matches or scope spans incompatible work areas.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- The task names a valid route, invocable lead, independent reviewers, bounded paths, and next gate.

## Resources

- [Routing matrix](../../../harness/policies/agent-routing.json)
- [Agent registry](../../../harness/policies/agent-registry.json)
- [Activation policy](../../../harness/policies/agent-activation.json)
- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Handoff schema](../../../harness/schemas/handoff.schema.json)
