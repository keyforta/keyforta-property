---
name: "Prepare Incident Evidence"
description: "Structure incident evidence and the next reversible human action without autonomously changing production."
argument-hint: "Provide the incident reference, observed symptoms, release SHA, and redacted evidence"
agent: "Azure Platform and SRE Engineer"
---

Follow the applicable runbook. Separate observations from hypotheses, preserve
correlation and release references, identify containment and rollback options,
and state the owner and approval needed for the next action. Never expose secrets
or tenant data, execute a production change, or silently edit financial history.
