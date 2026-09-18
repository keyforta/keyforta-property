---
name: implement-feature
description: "Implement an approved feature with focused tests and documentation. Use when scope, acceptance criteria, ownership, and affected paths are clear."
---

# Implement Feature

## Inputs

- Approved scope, implementation plan, acceptance criteria, and affected paths.

## Procedure

1. Read applicable requirements, instructions, domain contracts, and nearby tests.
2. Capture **before** evidence: run the relevant command, request, or UI flow
   against the unmodified code and record the output showing the capability
   is missing or the defect reproduces.
3. Add or update acceptance tests for the smallest useful behavior slice, and
   run them against the unmodified code to confirm they **fail for the
   expected reason** (red). Record that failing output.
4. Implement within existing ownership boundaries and public contracts.
5. Add authorization and cross-organization tests for data paths.
6. Rerun the same tests from step 3 and confirm they now pass (green); rerun
   the same reproduction from step 2 and record the **after** evidence showing
   the capability now works.
7. Update authoritative documentation and run focused checks, then `pnpm verify`.
8. Include all four artifacts — before evidence, failing (red) test output,
   after evidence, passing (green) test output — in the pull request
   description, in that order.
9. **Documentation/process/configuration-only changes** (no executable
   behavior): replace the red/green test with a deterministic reproducible
   check (e.g. `grep`/diff output) showing the old text/rule absent before and
   the new text/rule present after, and state the exception explicitly in the
   PR description.

## Guardrails

- Do not change requirements, weaken controls, or deploy production.
- Stop for approval on consequential architecture, auth, data, payment, or cost changes.

## Completion

- The approved behavior, tests, documentation, and verification all agree.

## Resources

- [Backend specification](../../../docs/contracts/keyforta-backend-implementation-specification.md)
- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)