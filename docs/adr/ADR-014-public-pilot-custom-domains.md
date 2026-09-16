# ADR-014: Public pilot custom domains

**Status:** Accepted on 2026-09-16

## Context

The public KEYFORTA site is moving from its existing Cloudflare-backed host to
the Azure Container Apps `dev` pilot. Cloudflare remains the authoritative DNS
provider. Azure Container Apps managed certificates require the apex A record
and each subdomain CNAME to resolve directly to Azure; proxied or intermediate
Cloudflare targets prevent certificate issuance and renewal.

The API permits one exact browser origin. Moving the web origin from its Azure
generated hostname to `https://keyforta.com` therefore requires a coordinated
API configuration update.

## Decision

- `https://keyforta.com` is the canonical public web origin.
- `https://www.keyforta.com` redirects permanently to the same path on the
  canonical apex origin.
- Cloudflare remains authoritative for `keyforta.com`, but the apex A record and
  `www` CNAME remain DNS-only while Azure managed certificates are assigned.
- Azure Bicep owns both managed certificates and Container Apps hostname
  bindings. The SHA-bound deployment workflow owns plan, deployment, and smoke
  evidence.
- API CORS permits only `https://keyforta.com`; the Azure-generated web hostname
  is no longer an allowed browser origin.

This decision supersedes the public-site hosting portion of ADR-008. It does not
declare the `dev` stamp production-ready or authorize real tenant data.

## Consequences

- The DNS cutover and certificate deployment must be coordinated to limit the
  period in which the apex points to Azure before its hostname is secured.
- The pilot remains scale-to-zero and may have cold-start latency.
- Cloudflare proxying, caching, WAF, and redirect rules are not in the serving
  path. Enabling them requires a separate reviewed certificate and edge design.
- Rollback restores the prior Cloudflare apex records and removes the Azure
  hostname bindings through a reviewed forward infrastructure change.