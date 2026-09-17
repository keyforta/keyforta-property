# Operations documentation

| Document | Purpose | Authority boundary |
| --- | --- | --- |
| [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) | Human approval, evidence, observation, and rollback decisions | Workflow YAML controls executable deployment behavior |
| [`RUNBOOKS.md`](./RUNBOOKS.md) | Index of available and missing incident procedures | Each linked runbook owns its procedure |
| [`SLOS.md`](./SLOS.md) | Proposed service indicators and objectives | No external commitment until approved and measured |
| [`AZURE_ACCESS_AND_BOOTSTRAP.md`](./AZURE_ACCESS_AND_BOOTSTRAP.md) | Access prerequisites and bootstrap guidance | Bicep and workflows control current commands and configuration |
| [`MCP_DEV_RUNBOOK.md`](./MCP_DEV_RUNBOOK.md) | Synthetic MCP activation, containment, and rollback | Applies only to the separately gated MCP path |

Repository configuration is not proof of live deployment. Live claims require
SHA-bound release evidence or authorized Azure inspection.