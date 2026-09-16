# ADR-008: Azure-First Application Hosting

**Status:** Superseded by ADR-014
**Date:** 2026-09-14
**Owners:** Technology/Operations

## Decision

The public marketing Site remains hosted through Sites. The future application, API, database, authentication, payments, storage, jobs, and observability are designed for Azure-first deployment. Cloudflare is optional and must not become an undocumented dependency.

ADR-014 supersedes the public-site hosting portion of this decision. The
Azure-first application boundary remains in force.

## Consequences

Provider adapters keep the domain portable. Azure service selections, regions, data residency, cost, backup, and recovery targets require implementation ADRs before production provisioning.
