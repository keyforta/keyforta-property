<!--
Per AGENTS.md "Engineering loop": every PR must show, in this order,
(1) before evidence, (2) a failing (red) test, (3) after evidence,
(4) the same test passing (green). Reviewers must reject PRs missing any of these.
-->

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
