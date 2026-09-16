---
name: fix-defect
description: "Reproduce and fix a verified defect with a regression test. Use when observed behavior violates an approved requirement or existing contract."
---

# Fix Defect

## Inputs

- Failure report, expected behavior source, reproduction, and affected area.

## Procedure

1. Reproduce the failure and trace expected behavior to an authoritative source.
2. Locate the nearest code path that directly controls the behavior.
3. Add a regression test that fails for the observed defect.
4. Apply the smallest root-cause correction while preserving invariants.
5. Run the focused regression check followed by `pnpm verify`.

## Guardrails

- Do not reclassify a feature request as a defect or change expected behavior silently.
- Do not weaken assertions, authorization, isolation, or data integrity.

## Completion

- The defect is reproducible, corrected at its source, and protected by a test.

## Resources

- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)
- [Requirements gaps](../../../docs/engineering/REQUIREMENTS_GAPS.md)