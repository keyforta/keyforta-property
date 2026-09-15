# ADR-002: Organization Isolation and Authorization

**Status:** Accepted
**Date:** 2026-09-14
**Owners:** Security/Architecture

## Decision

Organization ownership is present from day one. The API resolves organization scope from validated identity and active membership, applies relationship/resource/time-window policies, and uses PostgreSQL row-level security as defense in depth.

## Rules

- Client-supplied organization IDs cannot expand access.
- Cross-organization references are rejected.
- Manager access is effective-dated and scoped.
- Operator access is assignment- and access-window-bounded.
- Support access is explicit, reason-coded, expiring, visible, and audited.

## Consequences

Every organization-owned table requires `organization_id`; repository queries require scope; authorization tests include broken-object and expired-scope cases.
