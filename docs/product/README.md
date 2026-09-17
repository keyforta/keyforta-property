# Product documentation

Product documents answer different questions and must not be treated as
interchangeable copies.

| Document | Purpose | Authority/status |
| --- | --- | --- |
| [`PRD.md`](./PRD.md) | Approved scope, exclusions, and acceptance outcomes | Product authority; delivery-status claims require source and test evidence |
| [`PILOT_ROLE_USE_CASES.md`](./PILOT_ROLE_USE_CASES.md) | Detailed role boundaries and requirement IDs | Draft pending product-owner validation |
| [`USER_FLOW_DIAGRAMS.md`](./USER_FLOW_DIAGRAMS.md) | Visual companion with explicit UI/API/mock/plan labels | Supporting only |
| [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) | Evidence-linked current capability summary | Single documentation status ledger; source and tests remain controlling |
| [`PILOT_RULEBOOK.md`](./PILOT_RULEBOOK.md) | Approved pilot classifications and financial rules | Policy authority for pilot examples, subject to legal gates |
| [`PILOT_SCENARIOS.md`](./PILOT_SCENARIOS.md) | Synthetic examples and edge cases | Test/example companion to the rulebook |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Sequencing, dependencies, and evidence | Planning record, not runtime truth |
| [`VISION.md`](./VISION.md) | Stable product mission | Directional context |
| [`PRODUCT_BLUEPRINT.md`](./PRODUCT_BLUEPRINT.md) | Earlier broad solution and roadmap | Historical/proposed context; does not override the PRD, contracts, or ADRs |

Implementation status is established by current source, executable tests, and
delivery evidence and summarized only in `IMPLEMENTATION_STATUS.md`.
Contradictions that cannot be resolved from those sources remain in
[`../engineering/REQUIREMENTS_GAPS.md`](../engineering/REQUIREMENTS_GAPS.md).