---
name: discover-capabilities
description: "Inventory registered agent capabilities and lifecycle availability. Use when deciding which governed role can perform requested repository work."
---

# Discover Capabilities

## When to Use

- Identify registered roles and currently invocable capabilities before routing work.

## Do Not Use For

- Activating deferred roles or assigning implementation without an approved task contract.

## Required Inputs

- The requested outcome, affected paths, and current task contract when one exists.

## Procedure

1. Read the registry and activation policy from Resources.
2. Match the request to registered capabilities and lifecycle state.
3. Use the routing matrix rather than inventing ownership.
4. Record ambiguity as a requirements gap and create a handoff when ownership changes.
5. Keep any repository change inside the task contract and EDD workflow.

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
- Cite registry and routing entries used. For repository changes, run `pnpm verify`; partial checks do not replace it.

## Human Approval Gates

- `product-owner-scope-approval`

## Failure and Escalation

- Stop and record a requirements gap when no active agent owns the needed capability.
- Request governed activation instead of invoking a deferred agent.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- The capability owner, lifecycle, route, constraints, and next human decision are identified with references.

## Resources

- [Agent registry](../../../harness/policies/agent-registry.json)
- [Activation policy](../../../harness/policies/agent-activation.json)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [Task contract schema](../../../harness/schemas/task-contract.schema.json)
- [Handoff schema](../../../harness/schemas/handoff.schema.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
