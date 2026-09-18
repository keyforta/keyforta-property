---
name: fix-defect
description: "Reproduce and fix a verified defect with a regression test. Use when observed behavior violates an approved requirement or existing contract."
---

# Fix Defect

## Inputs

- Failure report, expected behavior source, reproduction, and affected area.

## Procedure

1. Reproduce the failure and trace expected behavior to an authoritative source.
2. Capture **before** evidence of the reproduced failure (command output, log,
   request/response, or screenshot).
3. Locate the nearest code path that directly controls the behavior.
4. Add a regression test that **fails for the observed defect** and record
   that failing (red) run as evidence.
5. Apply the smallest root-cause correction while preserving invariants.
6. Rerun the regression test and confirm it now passes (green); re-reproduce
   the original failure scenario and capture **after** evidence showing it is
   fixed.
7. Run the focused regression check followed by `pnpm verify`.
8. Include all four artifacts — before evidence, failing (red) test output,
   after evidence, passing (green) test output — in the pull request
   description, in that order.

## Guardrails

- Do not reclassify a feature request as a defect or change expected behavior silently.
- Do not weaken assertions, authorization, isolation, or data integrity.

## Completion

- The defect is reproducible, corrected at its source, and protected by a test.

## Resources

- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)
- [Requirements gaps](../../../docs/engineering/REQUIREMENTS_GAPS.md)