---
name: implement-feature
description: "Implement an approved feature with focused tests and documentation. Use when scope, acceptance criteria, ownership, and affected paths are clear."
---

# Implement Feature

## Inputs

- Approved scope, implementation plan, acceptance criteria, and affected paths.

## Procedure

1. Read applicable requirements, instructions, domain contracts, and nearby tests.
2. Add or update acceptance tests for the smallest useful behavior slice.
3. Implement within existing ownership boundaries and public contracts.
4. Add authorization and cross-organization tests for data paths.
5. Update authoritative documentation and run focused checks, then `pnpm verify`.

## Guardrails

- Do not change requirements, weaken controls, or deploy production.
- Stop for approval on consequential architecture, auth, data, payment, or cost changes.

## Completion

- The approved behavior, tests, documentation, and verification all agree.

## Resources

- [Backend specification](../../../docs/contracts/keyforta-backend-implementation-specification.md)
- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)