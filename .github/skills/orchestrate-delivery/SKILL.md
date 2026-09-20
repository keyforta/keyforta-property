---
name: orchestrate-delivery
description: "Coordinate a request end-to-end by delegating to specialist agents and skills, from clarifying questions through deployed-and-working evidence. Use for cross-cutting tasks needing sequential and parallel delegation without direct file edits."
---

# Orchestrate Delivery

## Inputs

- The human's task request, any prior decisions or ADRs, and access to the
  specialist agents and skills defined in this repository.

## Procedure

1. Restate the request and list explicit assumptions. Ask the human any
   question whose answer would change scope, architecture, technology,
   security, data lifecycle, or production behavior; wait for a reply before
   continuing (per AGENTS.md's approval gates).
2. Delegate to **Product and Requirements Analyst** to trace authoritative
   requirements and record any gap in `docs/engineering/REQUIREMENTS_GAPS.md`
   (`discover-product`, `define-requirement`, `refine-requirement`).
3. For consequential technical or UX decisions, delegate to **Solution
   Architect** (`assess-impact`) and **UX UI Product Designer**
   (`design-experience`); require an ADR for any consequential architecture
   change.
4. Build a traceable plan with `plan-feature`: map requirements to steps,
   name the owning specialist per step, mark dependencies, and mark which
   steps are independent enough to run in parallel.
5. Delegate implementation strictly along ownership boundaries — **Backend
   Engineer** (`apps/api`), **Frontend Engineer** (`apps/*-web`), **Data and
   Database Engineer** (`docs/database`, migrations), **Azure Platform and
   SRE Engineer** (infra/deploy) — using `implement-feature` or `fix-defect`.
   Run independent steps in parallel; run dependent steps sequentially and
   pass forward each prior step's evidence.
6. Require each implementation step to follow AGENTS.md's Engineering loop:
   before evidence, a failing (red) test, the change, after evidence, and the
   same test passing (green). Reject any step missing this evidence.
7. Delegate independent review to **Security and Privacy Reviewer** and
   **Pull Request Reviewer** (`review-change`). Do not re-perform their
   review or accept a step as done until they return evidence — only verify
   that evidence is present and unambiguous.
7b. Once a PR is open, delegate driving it to merge-ready to **Pull Request
    Merge Coordinator** (`land-pull-request`): it fixes Critical/High
    findings and failing checks via the owning specialists, bounds itself to
    3 fix-verify cycles, and never merges without explicit, PR-specific
    human authorization. Do not loop on fixes yourself.
8. Delegate `prepare-release` to **Azure Platform and SRE Engineer** to
   summarize readiness, monitoring, and rollback. GitHub remains
   authoritative for merge, environment, and deploy decisions — never merge
   or deploy yourself.
9. After a human authorizes and performs the deployment, collect
   deployed-and-working evidence: the CI run result, the deployment workflow
   result, and a live health or smoke-check response. If any is missing or
   failing, delegate `investigate-incident` to **Azure Platform and SRE
   Engineer** and escalate rather than closing the task.
10. Delegate any required documentation updates to **Technical Writer and
    Documentation Steward** in the same change.

## Guardrails

- Never edit files yourself; every change is made by the specialist that
  owns that area.
- Never resolve an open scope, architecture, security, or data-lifecycle
  question on your own — ask the human and wait.
- Never approve your own work, waive a gate, or bypass a required GitHub
  review, merge, or deployment control.
- Do not mark a stage complete without the evidence its skill requires.

## Completion

- Return the assumptions confirmed, the delegation plan actually followed,
  the evidence collected at each stage, any unresolved risk, and the final
  deployed-and-working confirmation (or the specific blocker preventing it).

## Resources

- [Agent working agreement](../../../AGENTS.md)
- [Release checklist](../../../docs/operations/RELEASE_CHECKLIST.md)
- [Specialist agents](../../agents/)
- [Repository skills](../)
