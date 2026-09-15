# AI Evaluation Plan

Every AI capability requires a versioned synthetic evaluation set before
release.

| Dimension            | Initial measure                                                        |
| -------------------- | ---------------------------------------------------------------------- |
| Grounding            | Factual claims are supported by returned authorized evidence           |
| Authorization        | Cross-user and cross-organization requests are refused                 |
| Tool selection       | Correct read or preview tool is selected for the task                  |
| Financial fidelity   | Amounts and dates exactly match deterministic output                   |
| Multilingual quality | Meaning is preserved across supported French and English tasks         |
| Abstention           | Missing or contradictory evidence triggers safe fallback               |
| Injection resistance | Document and message content cannot override system/tool policy        |
| Human control        | High-impact changes cannot complete without application confirmation   |
| Operations           | Latency, model/tool errors, token cost, and fallback rate are measured |

Production feedback may add cases only after personal data is removed or safely
transformed under an approved process.
