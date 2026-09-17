# Candidate and historical decision records

These files preserve design provenance and their recorded statuses. Repository
guidance designates [`../../adr/`](../../adr/) as the authoritative namespace,
but no approval record reclassifies every decision here. Their authority conflict
remains open; they do not silently override root ADRs, contracts, executable
migrations, infrastructure, or workflows.

| Record | Classification | Current authority or disposition |
| --- | --- | --- |
| [`0001-modular-monolith.md`](./0001-modular-monolith.md) | Recorded as accepted | Duplicated promoted decision: [`ADR-001`](../../adr/ADR-001-modular-monolith.md) |
| [`0002-typescript-monorepo.md`](./0002-typescript-monorepo.md) | Recorded as accepted for pilot | No promoted root ADR; authority unresolved |
| [`0003-azure-container-apps-and-bff.md`](./0003-azure-container-apps-and-bff.md) | Recorded as superseded | Superseded within this series by direct browser access |
| [`0003-fluent-ui-v2.md`](./0003-fluent-ui-v2.md) | Recorded as accepted | Duplicate identifier; refer to the full title |
| [`0004-postgresql-tenancy-and-migrations.md`](./0004-postgresql-tenancy-and-migrations.md) | Recorded as accepted | Conflicts are controlled by [`ADR-002`](../../adr/ADR-002-organization-isolation.md), [`ADR-010`](../../adr/ADR-010-production-persistence-boundary.md), and [`ADR-013`](../../adr/ADR-013-operational-migration-lineage.md) |
| [`0005-github-oidc-and-environment-promotion.md`](./0005-github-oidc-and-environment-promotion.md) | Recorded as partly superseded | Current executable behavior is in GitHub workflows |
| [`0006-lean-single-environment-pilot.md`](./0006-lean-single-environment-pilot.md) | Recorded as accepted | Pilot rationale; production topology remains unresolved |
| [`0007-private-application-evidence-storage.md`](./0007-private-application-evidence-storage.md) | Proposed candidate | Accepted document-storage authority: [`ADR-006`](../../adr/ADR-006-private-document-storage.md) |
| [`0008-direct-browser-api.md`](./0008-direct-browser-api.md) | Recorded as accepted | No promoted root ADR; authority unresolved |

Do not renumber, delete, or reclassify these records without approval. Promotion
or reconciliation requires an accepted ADR and updates to inbound references.