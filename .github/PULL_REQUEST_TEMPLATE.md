<!--
Per AGENTS.md "Engineering loop": every PR must show, in this order,
(1) before evidence, (2) a failing (red) test, (3) after evidence,
(4) the same test passing (green). This is enforced by CI
(`pnpm check:pr-evidence`, scripts/verify/pr-evidence.mjs), which fails the
build if a required section is missing, empty, or out of order. Reviewers
must also reject PRs missing any of these.

Documentation/process/configuration-only change with no executable behavior?
Check the box below, delete "Failing test (red)" / "Passing test (green)",
and instead show a deterministic before/after check (e.g. grep/diff output)
in the "Before evidence" / "After evidence" sections.
-->

- [ ] This is a documentation/process/configuration-only change with no executable behavior (red/green test replaced by a deterministic before/after check below).

## Requirement / issue
<!-- Link the approved requirement or issue this PR implements. -->

## Before evidence (broken / missing)
<!-- Command output, request/response, log, or screenshot proving the gap or
     defect existed before this change. -->

## Failing test (red)
<!-- The new/updated test's output when run against the code BEFORE this
     change, showing it fails for the expected reason. -->

## Change summary
<!-- What was implemented and why, in the smallest reviewable scope. -->

## After evidence (working)
<!-- The same reproduction as "Before evidence", now showing correct behavior. -->

## Passing test (green)
<!-- The same test's output when run against the code AFTER this change,
     now passing. -->

## Verification
- [ ] Focused test/check for the changed area
- [ ] `pnpm verify`
- [ ] Authorization / cross-organization isolation tests included for data paths (or N/A, state why)
- [ ] Documentation updated in this PR (or N/A, state why)

## Rollback
<!-- How to revert this change safely. -->
