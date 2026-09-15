---
name: "Assess Release Readiness"
description: "Assess an accepted change for release readiness without deploying it."
argument-hint: "Provide task, immutable commit, environment, and evidence references"
agent: "Azure Platform and SRE Engineer"
---

Assess exact-commit verification, migration and rollback safety, runbooks,
monitoring applicability, known failures, and required external approvals. Report
passed, failed, and skipped checks separately. Do not invent an SLO, alter an
environment, dispatch deployment, or treat repository approval metadata as proof
of GitHub approval.
