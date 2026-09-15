# ADR-011: Public Property Discovery Route

**Status:** Accepted for MVP
**Date:** 2026-09-15
**Owners:** Product, Technology/Architecture, Security, Data

## Context

The authoritative OpenAPI contract and public-web operation map use
`GET /api/v1/properties` and `GET /api/v1/properties/{propertyId}` for anonymous
property discovery. The backend endpoint inventory also listed equivalent
`/public/properties` routes, leaving authentication and response shape
ambiguous. Issue [#1](https://github.com/keyforta/keyforta-property/issues/1)
approves adapting the source API to KEYFORTA's canonical contract.

## Decision

Use the existing `/api/v1/properties` paths for anonymous property discovery.
Only the GET operations are public. They return a strict published public-safe
projection defined by OpenAPI and include request metadata. Protected create,
update, archive, verification, and portfolio operations retain bearer
authentication and server-side organization authorization.

Public discovery handlers must project responses at the transport boundary even
when a gateway claims to return a safe type. Unpublished inventory, organization
IDs, owner or manager IDs, verification evidence, private documents, tenant
data, and financial data must never be serialized by these operations.

## Consequences

- Public clients retain the route already published by `docs/openapi.yaml` and
  `packages/contracts`.
- HTTP method security is explicit: anonymous GET does not imply anonymous
  mutation access.
- A future authenticated portfolio read that needs private fields must use a
  separate authorized projection and cannot broaden this public response.
- API tests must inject over-returning gateways and verify that private fields
  are removed before serialization.

## Rejected alternatives

- **Keep both route families:** rejected because duplicate public contracts can
  drift and complicate authorization review.
- **Return richer fields when a bearer token is present:** rejected because a
  public endpoint must have one stable, least-privilege response contract.