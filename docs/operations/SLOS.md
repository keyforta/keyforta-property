# Initial Service Objectives

Pilot targets are learning targets, not customer commitments.

| Quality              | Pilot target                                                               |
| -------------------- | -------------------------------------------------------------------------- |
| Financial posting    | No duplicate posting; every correction is auditable                        |
| Data isolation       | Zero cross-organization access in the automated suite                      |
| Recovery point       | Proposed 15 minutes; unverified until a recorded restore exercise           |
| Recovery time        | Proposed four hours; unverified until a recorded restore exercise           |
| AI financial answers | Source-linked and exactly equal to deterministic results                   |
| Core continuity      | Lease, payment, receipt, and maintenance work remains available without AI |

Operational measurements and error budgets will be formalized before external
landlords receive a service commitment.

## Proposed measurable pilot indicators

The following are proposals requiring product-owner and SRE approval; they are
not customer commitments.

| Indicator                      | Proposed target                             | Window / source                         |
| ------------------------------ | ------------------------------------------- | --------------------------------------- |
| Public web availability        | 99.5% successful non-maintenance requests   | Rolling 30 days, ingress telemetry      |
| Authenticated API availability | 99.5% non-5xx responses                     | Rolling 30 days, route-template metrics |
| API latency                    | 95% below 750 ms excluding uploads          | Rolling 7 days, server duration         |
| Document scan outcome          | 99% reach terminal status within 15 minutes | Rolling 7 days, scan-state age          |
| Financial integrity            | Zero duplicate or unbalanced postings       | Continuous database invariant/audit     |
| Organization isolation         | Zero confirmed cross-organization access    | Continuous incidents plus CI regression |
| Synthetic MCP boundary         | Zero business-data or unapproved-tool exposure | Continuous audit plus registry tests  |
| MCP dev availability           | 95% successful authenticated synthetic calls during approved test windows | Per activation window, MCP audit and ingress telemetry |
| MCP containment                | Disable approved within 15 minutes          | Per exercise or incident, runbook evidence |

For availability objectives, the proposed monthly error budget is the allowed
failure fraction implied by the approved SLO. Exhaustion freezes risky releases
and prioritizes reliability work; security, isolation, financial integrity, and
data-loss incidents bypass budget calculations and stop promotion immediately.

Proposed alerts page only on actionable user impact: sustained availability or latency
burn, readiness failure across active revisions, migration failure, confirmed
isolation/financial invariant breach, or document scanning backlog. Severity 1
means active data exposure, integrity loss, or broad outage; Severity 2 means
material degraded operation; Severity 3 is bounded degradation handled in
business hours. Incident command, evidence, escalation, rollback, backup restore,
capacity, and cost review follow `RUNBOOKS.md` and `RELEASE_CHECKLIST.md`.

No alert resources are currently deployed. Backup retention remains the deployed
seven-day pilot setting. The proposed RPO
and RTO above require a successful synthetic restore exercise before real pilot
data; until then they are unverified targets. Capacity and cost are reviewed per
release and before any SKU, HA, retention, telemetry, or scaling increase.
