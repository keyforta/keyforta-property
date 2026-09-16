# ADR-0006: Use a Lean Single-Environment Pilot

- **Status:** Accepted
- **Date:** 2026-09-09
- **Supersedes:** The multi-environment infrastructure portions of ADR-0003 and ADR-0005

## Context

KEYFORTA is an early-stage startup validating a private pilot. The first Azure
foundation attempted to provision three-environment concerns and managed
services that no implemented workflow consumed. That increased cost, deployment
time, and failure modes before customer demand had validated the need.

Financial precision, immutable postings, authorization, organization isolation,
auditability, and database backups remain product invariants. They are not
optional cost reductions.

## Decision

Operate one manually deployed `dev` environment in South Africa North during the
private pilot. Provision only:

- Azure Container Apps for the public web and API;
- Azure Database for PostgreSQL Flexible Server on a burstable SKU with seven
  days of backups;
- Azure Container Registry Basic;
- Log Analytics with 30-day retention; and
- narrowly scoped deployment, web, API, and migration identities.

Defer test and production stamps, Service Bus, Blob Storage, Key Vault,
Application Insights, general-purpose workers, private endpoints for unused data
services, high availability, and geo-redundant backups until a measured product,
security, or reliability requirement justifies them.

Deployment remains manual from `main`, uses GitHub OIDC and immutable commit
SHAs, runs database migrations before application rollout, and performs public
web and API smoke tests. Customer authentication remains fail-closed until an External
ID tenant is configured; public schedule preview remains usable without AI or
customer identity.

PostgreSQL public networking accepts Azure-service traffic only. Database
password authentication is disabled; connections require Entra identity, the
runtime database role, application authorization, and RLS. A private network is
deferred until real tenant data or a reviewed threat model requires it.

## Consequences

- The pilot has fewer billable resources and fewer deployment failure modes.
- There is no separate Azure test or production environment during validation.
- CI with PostgreSQL remains the pre-merge integration environment.
- Documents stay outside KEYFORTA until private storage is deliberately
  added. ADR-0007 now permits private Blob Storage for tenant application
  evidence only.
- Asynchronous work remains in the transactional outbox until Service Bus and a
  worker have a demonstrated need.
- Production launch requires a new reviewed ADR covering environment isolation,
  availability, recovery objectives, identity readiness, and cost.

## Validation

1. All Bicep entry points compile without warnings.
2. The workflow exposes only the dev deployment path.
3. No deferred resource type appears in the foundation template except the
   application-evidence storage approved by ADR-0007.
4. Money, authorization, idempotency, immutable-posting, and RLS tests remain
   green.
5. Azure cost and resource inventories are reviewed after each deployment.
