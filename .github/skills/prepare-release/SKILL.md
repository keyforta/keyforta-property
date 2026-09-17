---
name: prepare-release
description: "Prepare monitoring and rollback information for GitHub-owned release controls. Use when a verified change is ready for human release decisions."
---

# Prepare Release

## Inputs

- Verified change, CI status, migration notes, monitoring, and rollback procedure.

## Procedure

1. Confirm `pnpm verify` and required GitHub checks have passed.
2. Summarize user impact, dependencies, configuration, and migration ordering.
3. Define rollout checks, telemetry, alert thresholds, and rollback triggers.
4. Verify rollback ownership and data compatibility.
5. Present readiness and blockers without merging or deploying.

## Guardrails

- GitHub remains authoritative for review, merge, environment, and deployment status.
- Never deploy production, approve your own change, or expose credentials.

## Completion

- Return readiness, blockers, monitoring, rollback, owners, and required approvals.

## Resources

- [Operations documentation](../../../docs/operations/)
- [Image and deployment ownership](../../../infra/README.md)