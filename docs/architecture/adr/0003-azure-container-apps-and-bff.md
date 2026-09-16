# ADR-0003: Host the Pilot on Azure Container Apps Behind a Web BFF

- **Status:** Superseded by ADR-0008
- **Date:** 2026-09-09

## Context

KEYFORTA needs a public, mobile-first Next.js application and an API that is not
reachable directly from the public internet. Browser calls currently target an
absolute API URL, which would require public API ingress and cross-origin
configuration in production.

The pilot does not justify Kubernetes or independently operated microservices.
It does require separate development, test, and production deployment stamps,
managed identities, private access to data services, revision-based deployment,
and scale controls.

## Decision

Deploy the Next.js web application, Fastify API, and asynchronous worker as
separate Azure Container Apps in one workload-profile Container Apps environment
per deployment stamp.

- The Container Apps environment is integrated with a dedicated VNet subnet.
- The web application has public HTTPS ingress.
- The API has internal ingress and is reachable only inside the Container Apps
  environment and VNet boundary.
- The worker has no ingress.
- Browsers call same-origin Next.js route handlers. These BFF routes validate the
  user session and forward requests to the internal API.
- The API independently validates identity, membership, authorization, input,
  idempotency, and command context. Network placement and BFF validation do not
  replace application authorization.
- User-assigned managed identities are separate for web, API, worker, database
  access, and deployment automation.
- The web application never exposes an internal API hostname, database
  credential, storage credential, or service token to browser code.
- Core workflows remain available when AI services are unavailable.

Use one Azure subscription for the pilot with separate resource groups,
networks, identities, and data services for `dev`, `test`, and `prod`. The
primary region is South Africa North. Production can move to a separate
subscription later without changing the stamp boundary.

## Network allocation

The initial address spaces are intentionally non-overlapping:

| Stamp | VNet CIDR      | Container Apps subnet | PostgreSQL subnet | Private endpoint subnet |
| ----- | -------------- | --------------------- | ----------------- | ----------------------- |
| dev   | `10.20.0.0/20` | `10.20.0.0/23`        | `10.20.2.0/27`    | `10.20.2.32/27`         |
| test  | `10.21.0.0/20` | `10.21.0.0/23`        | `10.21.2.0/27`    | `10.21.2.32/27`         |
| prod  | `10.22.0.0/20` | `10.22.0.0/23`        | `10.22.2.0/27`    | `10.22.2.32/27`         |

The PostgreSQL subnet is delegated only to Azure Database for PostgreSQL
Flexible Server. The Container Apps subnet is dedicated only to the Container
Apps environment. Address spaces must not be resized or reused after delegated
resources are created.

## Consequences

- Browser traffic has one public origin and does not need production CORS access
  to the API.
- Public attack surface is limited to the web application.
- Web, API, and worker revisions can scale and deploy independently while
  remaining part of one modular monolith.
- One Container Apps environment per stamp increases isolation and avoids
  sharing production networking or telemetry with nonproduction.
- A compromised web process still cannot bypass API authorization or database
  row policies.
- Next.js must run as a server container rather than a static-only export.
- The BFF adds a server hop, but it centralizes session handling, response
  filtering, correlation IDs, and low-bandwidth response shaping.

## Rejected alternatives

- **Public API with CORS:** rejected because it expands the public attack surface
  and exposes internal service topology to browsers.
- **Kubernetes:** rejected because its operational cost is not justified for the
  pilot.
- **Independent microservices:** rejected until scaling, regulation, deployment,
  or team ownership creates a measurable need.
- **Direct database access from Next.js or AI models:** rejected because it
  bypasses the API authorization and audit boundary.

## Validation

Before deployment:

1. A browser can reach the API only through a same-origin BFF route.
2. Direct internet access to the API fails.
3. API authorization and cross-organization isolation tests pass even when
   client-supplied identifiers are manipulated.
4. Web, API, and worker managed identities have only their documented roles.
5. Core lease, payment, receipt, and maintenance workflows operate with AI
   disabled.

## References

- [Azure Container Apps networking](https://learn.microsoft.com/azure/container-apps/networking)
- [Authenticate to Azure from GitHub Actions by OIDC](https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect)
