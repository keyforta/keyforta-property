---
name: land-pull-request
description: "Drive one open pull request to a genuinely merge-ready state: required checks green, Critical/High findings resolved, without looping on Medium/Low issues or merging without human authorization. Use for monitoring and coordinating a single PR's remediation to closure."
---

# Land Pull Request

## Inputs

- The PR number/link, its required checks, review threads, and any existing
  findings from Pull Request Reviewer or Security and Privacy Reviewer.

## Procedure

1. Pull required checks (`gh pr checks <pr>`), review state
   (`gh pr view <pr> --json reviews,comments,statusCheckRollup`), and any
   outstanding reviewer findings.
2. Triage every finding and failing check by severity: 🔴 Critical, 🟠 High,
   🟡 Medium, ⚪ Low.
3. Delegate every Critical/High finding and every failing required check to
   the specialist that owns the affected path (Backend Engineer, Frontend
   Engineer, Data and Database Engineer, Azure Platform and SRE Engineer) or
   QA and Test Engineer. Require AGENTS.md's Engineering loop (before, red,
   after, green) for each fix.
4. Compile Medium/Low findings once into a single follow-up note for
   human/product-owner triage. Do not delegate further fixes for them and do
   not revisit them within this PR's remediation cycles.
5. Track a fix-verify cycle counter starting at 1. Cap remediation at 3
   cycles total for this PR.
6. After each cycle's fixes land, re-request review from Pull Request
   Reviewer (and Security and Privacy Reviewer for security-relevant
   changes). A new cycle begins only in response to newly surfaced findings,
   never a re-run of an already-addressed one.
7. If cycle 3 completes and a required check or Critical/High finding
   remains, stop immediately, report the exact remaining blockers, and hand
   off to a human. Do not start a 4th cycle under any framing.
8. Once every required check is green, every Critical/High finding is
   resolved, and required reviewer/human approvals are recorded, report the
   PR as merge-ready.
9. Merge only if a human has explicitly authorized merging this specific PR.
   Never use `--admin`, force flags, or anything that bypasses a required or
   failing check.

## Guardrails

- Do not edit any file yourself; every fix comes from the owning specialist.
- Do not treat your own triage or another automated pass as satisfying a
  required human or reviewer-agent approval.
- Do not iterate on Medium/Low findings beyond the single pass in step 4.
- Do not exceed the 3-cycle cap; reaching it is an escalation to surface, not
  a reason to keep looping quietly.
- Do not merge, force-merge, or bypass branch protection without explicit,
  PR-specific human authorization.

## Completion

- Return the severity-ordered triage table, each delegated fix with its
  before/after evidence, the Medium/Low backlog handed to the human, the
  cycle count consumed, and the final status: merge-ready, blocked (with
  exact blockers), or cap-reached (with exact remaining items).

## Resources

- [Agent working agreement](../../../AGENTS.md)
- [Review change](../review-change/SKILL.md)
- [Release checklist](../../../docs/operations/RELEASE_CHECKLIST.md)
