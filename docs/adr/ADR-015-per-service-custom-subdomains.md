# ADR-015: Per-service custom subdomains and portal-web deployment

**Status:** Proposed — requires acceptance before implementation

## Context

ADR-014 gave the public site a custom domain (`keyforta.com` apex + `www`) but
left every other service on its Azure-generated Container Apps hostname:

- `api` (Fastify backend) — Azure-generated hostname only, no custom domain.
- `admin-web` — Azure-generated hostname only, no custom domain.
- `portal-web` — not deployed at all. It has no Dockerfile, no Bicep
  `Microsoft.App/containerApps` resource, and `deploy.yml` explicitly rejects
  the `portal-web` scope today (`"reserved but has no approved image and
  Azure resource definition yet"`).

The product owner has requested a consistent per-service domain scheme:

| Service | Requested hostname |
| --- | --- |
| public-web | `keyforta.com` (already live, ADR-014) |
| portal-web | `portal.keyforta.com` |
| admin-web | `admin.keyforta.com` |
| api | `api.keyforta.com` |

`mcp` was also requested at `mcp.keyforta.com`, but that is **out of scope
for this ADR**: `mcp` already has its own dedicated `infra/bicep/mcp.bicep`
resource, its own `deploy-mcp.yml` workflow, and `mcp.keyforta.com` is
already the hardcoded target hostname in that workflow, per ADR-012 and
`docs/operations/MCP_DEV_RUNBOOK.md` / `docs/engineering/
MCP_DEV_DEPLOYMENT_PLAN.md`. Standing it up is a matter of running the
existing `deploy-mcp.yml` bootstrap (DNS CNAME + `bindMcpCertificate`) — no
new ADR, Bicep, or deploy-workflow change is required.

Two things are new relative to ADR-014's scope and therefore need their own
decision record rather than silent implementation:

1. **A new deployable service.** Per this repository's working agreement,
   "New deployable services require an accepted ADR showing a measurable
   need." `portal-web` has source, tests, and a Vite build in
   `apps/portal-web`, but no build/runtime image and no production resource.
   **Measurable need (must be filled in before acceptance):** the product
   owner has requested landlord/tenant portal access at
   `portal.keyforta.com` as a distinct surface from `keyforta.com` (public
   marketing/discovery) and `admin.keyforta.com` (internal operations). The
   specific baseline this ADR needs before it can move to Accepted: which
   user-facing capability in `apps/portal-web` is blocked on deployment
   today (e.g. a named workflow currently unreachable in any environment),
   and the accepting owner who confirms that need. Until those two are
   recorded here, this ADR stays Proposed.
2. **Exposing `api` and `admin-web` on the public internet under predictable
   hostnames.** Today `admin-web`'s Azure-generated hostname is not linked
   from anywhere public, which is a (weak) form of obscurity. Moving it to
   `admin.keyforta.com` is a deliberate trade: better operability and TLS
   hygiene, at the cost of a guessable admin URL. This ADR treats that as an
   accepted trade — the boundary is enforced by Entra authentication and
   authorization, not by hostname secrecy — but it is called out explicitly
   so the trade is a recorded decision, not an oversight.

## Decision (proposed)

- `https://keyforta.com` remains the canonical public origin (unchanged from
  ADR-014).
- `https://portal.keyforta.com`, `https://admin.keyforta.com`, and
  `https://api.keyforta.com` become the canonical origins for portal-web,
  admin-web, and the API, respectively, in the `dev` pilot environment.
  Production remains out of scope until a separate production launch
  decision (see ADR-009). `mcp.keyforta.com` is excluded from this decision
  (see Context) and follows its own already-approved `deploy-mcp.yml` path.
- `portal-web` becomes an approved deployable service: it gets a
  `deployments/azure/docker/portal-web.Dockerfile` (static Vite build served
  by `nginx-unprivileged`, mirroring `admin-web.Dockerfile`) and a
  `Microsoft.App/containerApps` Bicep resource, following the same
  bootstrap sequencing ADR-014 established for public-web (Disabled binding
  first, then managed certificate + SNI-enabled binding once DNS resolves
  directly to Azure).
- Each new hostname gets its own Azure Container Apps managed certificate,
  validated the same way ADR-014 validates `keyforta.com`/`www`: apex-style
  records use HTTP domain-control validation where applicable, and
  CNAME-style subdomain records use CNAME validation. Cloudflare remains
  authoritative DNS and each new record stays DNS-only (unproxied) so Azure
  can issue and renew certificates.
- `api`'s `CORS_ALLOWED_ORIGIN` is extended to include
  `https://portal.keyforta.com`, `https://admin.keyforta.com`, and the API's
  own custom domain does not itself appear in CORS (CORS lists browser
  origins, not the API's own hostname). The web/admin parameters currently
  hold Azure-generated hostnames; the staged rollout below adds each new
  custom-domain origin alongside the existing one and removes the old
  origin only after that service has redeployed and been smoke-tested — see
  the per-stage sequencing, not an atomic swap.
- Each frontend's configured API base URL moves from the API's
  Azure-generated hostname to `https://api.keyforta.com`. `public-web` is
  included in this: it currently receives `KEYFORTA_API_BASE_URL` derived
  from `apiFqdn` (`infra/bicep/apps.bicep:143,191`), so the rollout below
  adds an explicit `public-web` redeploy-and-smoke-test phase once `api`'s
  custom domain is live — not just `admin-web`/`portal-web`.
- Moving `admin-web` and `portal-web` to new origins also changes their MSAL
  redirect origins. Both apps require exact deployed `/auth/callback` URIs
  registered on their Entra app registrations
  (`apps/admin-web/README.md:22-24`, `apps/portal-web/README.md:26`,
  `infra/README.md:607-608`). The rollout below adds the two new redirect
  URIs (`https://admin.keyforta.com/auth/callback`,
  `https://portal.keyforta.com/auth/callback`) to the Entra SPA allowlists
  before their custom-domain bindings go live, so sign-in does not break on
  cutover.
- `deploy.yml`'s scope allowlist gains a real `portal-web` case (build, push,
  plan, deploy) once the Bicep resource exists; the `mcp` reserved case is
  unaffected.
- Rollout is staged per service, and each stage keeps the prior origin
  working until the new one is verified rather than cutting over
  atomically:
  1. **api**: add the Entra redirect URIs above where applicable, then apply
     the same "plan → apply with bindings disabled → apply with managed
     certs and SNI-enabled bindings" phases ADR-014 used for public-web.
     `CORS_ALLOWED_ORIGIN` gains new custom-domain origins as their owning
     services cut over (stages 3-4 below), but `https://keyforta.com`
     (public-web's origin, which never changes — see stage 2) and the
     still-live `admin-web` Azure-generated origin both stay in
     `CORS_ALLOWED_ORIGIN` — the latter until admin-web has redeployed
     against `https://api.keyforta.com` and been smoke-tested; removing it
     first would immediately break the still-live admin app
     (`infra/bicep/apps.bicep:33,101`).
  2. **public-web**: redeploy with `KEYFORTA_API_BASE_URL` pointed at
     `https://api.keyforta.com` and smoke-test. Unlike admin-web/portal-web,
     public-web's own browser origin never changes — it is still served
     from `https://keyforta.com` regardless of which API endpoint it calls
     — so `https://keyforta.com` stays in `CORS_ALLOWED_ORIGIN`
     permanently; only its API base URL changes in this stage, not its CORS
     origin.
  3. **admin-web**: add its Entra redirect URI, bind `admin.keyforta.com`
     following the same disabled-then-SNI-enabled phases, redeploy pointed
     at `https://api.keyforta.com`, smoke-test, then remove its old origin
     from `CORS_ALLOWED_ORIGIN`.
  4. **portal-web**: stand up the Container App, add its Entra redirect
     URI, bind `portal.keyforta.com`, deploy pointed at
     `https://api.keyforta.com`, then add its origin to
     `CORS_ALLOWED_ORIGIN` and smoke-test.

  Each stage's certificate/binding phase mirrors ADR-014's fail-closed
  bootstrap. For `public-web`'s apex+www pair, that means a one-of-two
  hostname state fails closed for review, as ADR-014 already established.
  Each of `admin`, `api`, and `portal` is a single custom hostname (no
  pair), so its bootstrap is a simple binary sequence — Disabled binding
  applied and verified, then managed certificate and SNI-enabled binding
  applied and verified — with no partial multi-hostname state to reason
  about.

## Consequences

- Three new Azure managed certificates and hostname bindings (`portal`,
  `admin`, `api` — ADR-014's two `public-web` certificates are unchanged,
  and `mcp`'s certificate is already covered by its own `deploy-mcp.yml`),
  and three new Cloudflare DNS-only CNAME records for the same hostnames,
  need to be created and coordinated with the deploy workflow's staged
  bootstrap — the same operational discipline ADR-014 introduced, applied
  three more times.
- `admin.keyforta.com` becoming a public, predictable hostname is a
  deliberate trade of obscurity for operability; it does not change or
  weaken authentication/authorization, which remains the actual access
  control.
- Introducing `portal-web` as a deployable service adds a fourth Container
  App to the shared environment (additional scale-to-zero compute cost, one
  of the three new managed certificates above, and a fourth image to
  build/scan/patch in CI).
- This does not declare any of these hostnames production-ready or authorize
  real tenant data; that remains gated by ADR-009's open decisions register.
- Rollback for any single hostname mirrors ADR-014: restore the prior
  Cloudflare record (or remove it, for portal-web) and remove the Azure
  hostname binding through a reviewed forward infrastructure change.

## Required before implementation

This ADR must move from **Proposed** to **Accepted** (with an owner and
date) before any Bicep, Dockerfile, or `deploy.yml` change described above is
merged, per this repository's rule that production infrastructure/deployment
and new deployable services stop for human approval first.
