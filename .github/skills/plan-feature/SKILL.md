---
name: plan-feature
description: "Produce a traceable implementation plan and acceptance-test map. Use when approved scope must become bounded implementation work."
---

# Plan Feature

## Inputs

- Approved requirement, technical decisions, acceptance criteria, and affected areas.

## Procedure

1. Map each requirement to implementation steps and acceptance tests.
2. Identify owning modules, dependencies, migrations, and documentation changes.
3. Define authorization, isolation, failure-path, and rollback checks.
4. Order work into small independently verifiable changes.
5. Name required specialist and human reviews.

## Guardrails

- Do not implement code or broaden approved scope while planning.
- Stop for clarification when a step cannot be traced to approved behavior.

## Completion

- Return an ordered plan with requirement-to-test traceability and rollback notes.

## Resources

- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)
- [Context and ownership](../../../docs/contracts/keyforta-context-map-and-ownership.md)