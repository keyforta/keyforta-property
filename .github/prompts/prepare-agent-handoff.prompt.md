---
name: "Prepare Agent Handoff"
description: "Create or review a structured handoff between two registered agents."
argument-hint: "Provide task ID, sender, recipient, current evidence, and desired outcome"
agent: "MVP Engineering Orchestrator"
---

Validate both agents against the registry and confirm the recipient is invocable.
Produce one handoff record matching `harness/schemas/handoff.schema.json`. Include
bounded inputs, expected outputs, objective acceptance criteria, evidence
references, and the applicable human gate. Reject self-handoffs, self-review, and
attempts to transfer human approval authority.
