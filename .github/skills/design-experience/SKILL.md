---
name: design-experience
description: "Design accessible responsive product flows from approved requirements. Use when a web workflow needs interaction states and acceptance-ready UX decisions."
---

# Design Experience

## When to Use

- Translate approved user scenarios into responsive, accessible interface behavior.

## Do Not Use For

- Inventing product journeys, changing requirements, or implementing unapproved UI.

## Required Inputs

- Approved task contract, personas, scenarios, design system, and accessibility constraints.

## Procedure

1. Confirm approved scope and ROUTE-003 ownership.
2. Define flows, states, errors, responsive behavior, and accessibility semantics.
3. Trace every decision to acceptance criteria and existing design conventions.
4. Hand implementation-ready specifications to the routed engineer.
5. Record design evidence in the EDD history.

## Authorized Agents

- `ux-ui-product-designer`

## Required Agent Capabilities

- `ROUTE-003:product-design`
- `ROUTE-003:accessibility`

## Required Artifacts

- `technical-decision`

## Routing Rules

- `ROUTE-003`

## EDD State Transitions

- `approved -> designed`

## Evidence Obligations

- `canonical-verification`
- Link flows to acceptance criteria and accessibility decisions. For repository changes, run `pnpm verify`; partial checks do not replace it.

## Human Approval Gates

- `product-owner-flow-approval`

## Failure and Escalation

- Stop for Product Owner clarification when a flow requires new behavior or unresolved policy.

## Prohibited Actions

- `bypass-canonical-verification`
- `self-approval`
- `production-deployment`

## Completion Criteria

- All required states, responsive behavior, accessibility, and handoff evidence are explicit and approved where required.

## Resources

- [Domain-driven design](../../../docs/keyforta-domain-driven-design.md)
- [Web instructions](../../instructions/web.instructions.md)
- [Routing matrix](../../../harness/policies/agent-routing.json)
- [Handoff schema](../../../harness/schemas/handoff.schema.json)
- [EDD protocol](../../../docs/engineering/EVIDENCE_DRIVEN_DEVELOPMENT.md)
