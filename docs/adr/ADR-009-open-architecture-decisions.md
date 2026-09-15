# ADR-009: Open Decisions Before Production Launch

**Status:** Proposed decisions register
**Date:** 2026-09-14
**Owners:** Technology, Finance, Product, Privacy

The following choices are intentionally not invented in the domain model and must be resolved before the affected production capability is enabled:

| Decision | Options to evaluate | Required before |
| --- | --- | --- |
| Identity provider tenant and onboarding mode | Azure External ID configuration and invite/self-register policy | Protected production access |
| PostgreSQL hosting and region | Azure Database for PostgreSQL option and approved region | Production personal data |
| Payment provider | Cash/bank/mobile-money recording plus approved automation provider | Automated payments |
| Object storage and malware scanning | Azure Blob/private container and scanning workflow | Document uploads |
| Messaging provider | Email/SMS/WhatsApp-capable provider and consent behavior | Outbound communications |
| DRC retention/lease/notice policy | Counsel-approved policy versions | Commercial leasing |
| Backup and recovery targets | RPO/RTO, retention, restore test cadence | Production launch |
| Observability and on-call ownership | Azure Monitor/Application Insights and owner rota | Production launch |

Each decision requires context, options, selected choice, consequences, security/privacy impact, cost impact, owner, and approval evidence.
