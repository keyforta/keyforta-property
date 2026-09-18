---
name: review-change
description: "Perform an independent risk-focused review of a change. Use when a diff needs findings on correctness, scope, security, tests, and maintainability."
---

# Review Change

## Inputs

- Diff, authoritative requirements, test results, and reviewer independence context.

## Procedure

1. Confirm the intended scope and inspect the complete diff.
2. Verify the PR description shows, in order: before evidence, a failing (red)
   test, after evidence, and the same test passing (green) per AGENTS.md's
   Engineering loop — treat a missing or out-of-order artifact as a blocker.
   For documentation/process/configuration-only PRs with no executable
   behavior, accept the documented exception (deterministic before/after
   check in place of a red/green test) only if it is stated explicitly and
   the check is reproducible.
3. Review behavior, invariants, failure paths, tests, security, and architecture.
4. Reproduce suspicious behavior or run the narrowest relevant checks.
5. Report findings first, ordered by severity with exact file references.
6. State open questions, test gaps, and residual risk.

## Guardrails

- Do not approve your own implementation or expand scope during review.
- Do not suppress a finding because unrelated checks pass.

## Completion

- Return actionable findings or explicitly state that none were found.

## Resources

- [Test strategy](../../../docs/engineering/TEST_STRATEGY.md)
- [Agent working agreement](../../../AGENTS.md)