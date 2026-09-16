---
name: review-change
description: "Perform an independent risk-focused review of a change. Use when a diff needs findings on correctness, scope, security, tests, and maintainability."
---

# Review Change

## Inputs

- Diff, authoritative requirements, test results, and reviewer independence context.

## Procedure

1. Confirm the intended scope and inspect the complete diff.
2. Review behavior, invariants, failure paths, tests, security, and architecture.
3. Reproduce suspicious behavior or run the narrowest relevant checks.
4. Report findings first, ordered by severity with exact file references.
5. State open questions, test gaps, and residual risk.

## Guardrails

- Do not approve your own implementation or expand scope during review.
- Do not suppress a finding because unrelated checks pass.

## Completion

- Return actionable findings or explicitly state that none were found.

## Resources

- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)
- [Agent working agreement](../../../AGENTS.md)