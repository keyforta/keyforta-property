# ADR-0008: Use Direct Browser Access to the Public API

- **Status:** Accepted
- **Date:** 2026-09-16
- **Supersedes:** The web BFF and internal API ingress decisions in ADR-0003

## Context

The pilot has one browser client and one modular-monolith API. A web BFF adds a
second validation and proxy layer before authenticated browser workflows exist.
The additional route handlers, runtime configuration, tests, and server hop do
not provide enough current value to justify that complexity.

## Decision

Expose the Fastify API through public HTTPS ingress. Browser integrations call
it directly when they replace the current UI fixtures.
Production CORS permits only the deployed web origin and does not permit
credentialed cross-origin requests. Anonymous property discovery retains its
strict public projection. Every protected API operation must independently
validate the bearer token, membership, role, organization, resource scope, and
input; CORS and network placement are not authorization controls.

The web application does not proxy API requests, hold API access tokens in a
server session, access persistence, or contain domain rules. Future browser
authentication must use authorization code with PKCE and send bearer tokens to
the API. The token-storage design requires a separate security review before
authenticated browser workflows are enabled.

## Consequences

- The API hostname and public health surface are visible on the internet.
- One server hop and the BFF-specific code and configuration are removed.
- CORS is fail-closed in production and restricted to the configured web origin.
- Rate limiting, abuse monitoring, token handling, and API hardening become
  release requirements before external beta.
- Browser-held bearer tokens increase the consequence of an XSS defect compared
  with HTTP-only BFF session cookies.

## Validation

1. API tests prove allowed-origin access and deny CORS headers to other origins.
2. Anonymous projections continue stripping non-public property fields.
3. Protected routes continue enforcing API authorization and cross-organization
   isolation independently of CORS.
4. Deployment smoke tests verify web health, API health, and the exact allowed
   origin.
5. Bicep exposes no BFF-only internal API URL or session configuration.

## Rollback

Restore API ingress to internal, restore the same-origin proxy routes, and move
browser token handling back to an HTTP-only server session under a new reviewed
change. No data migration is required.