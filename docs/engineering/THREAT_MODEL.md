# Repository threat model

Review before external beta and whenever identity, authorization, payment,
document, AI, provider, or network boundaries change.

## Assets and boundaries

Assets include identities and sessions, organization membership, property and
lease records, applications and evidence, posted financial history, audit events,
infrastructure identities, deployment evidence, and future AI evidence. Boundaries
are browser to public API, API to PostgreSQL/Blob/providers,
GitHub OIDC to Azure, administrator workstation to Azure/PostgreSQL, and future
model tools to authorized application capabilities.

## Entry points and actors

Entry points are public pages, anonymous and bearer-token API routes, invitation
links, uploads, provider callbacks, deployment dispatches, PostgreSQL migrations,
and future AI tool calls. Threat actors include unauthenticated attackers,
malicious or compromised members, cross-organization users, replaying providers,
malicious files/documents, supply-chain attackers, compromised CI identities, and
operators making mistakes.

## Numbered threat-boundary data flow

Edge labels use the abuse-case names below so each trust crossing can be traced
to its existing mitigation and residual action. Dashed flows are inactive or
deferred; they do not describe a production capability.

```mermaid
flowchart LR
    subgraph EXT[External and untrusted boundary]
        Users[Users]
        Admins[Administrators]
        Providers[Payment, identity, and scan providers]
        GitHub[GitHub workflows]
        Models[Model clients]
    end

    subgraph APP[KEYFORTA application trust boundary]
        Web[Public and authenticated web]
        API[Authorized API]
        MCP[MCP service: synthetic-only]
        Jobs[Background jobs]
        FutureAI[Future tenant-data AI: INACTIVE / DEFERRED]
    end

    subgraph DATA[Managed data trust boundary]
        PG[(PostgreSQL with forced RLS)]
        Blob[(Private Blob storage)]
        Telemetry[(Sanitized telemetry and audit)]
        Control[Azure deployment and operations control]
    end

    Users -->|"1. Browser crossing: Session/token theft or redirect manipulation; Anonymous viewing-inquiry flooding"| Web
    Admins -->|"2. Privileged operations crossing: CI/deployment compromise; least privilege and audit"| Control
    Web -->|"3. Public API crossing: Cross-organization read/write; SQL or object-ID injection"| API
    Providers -->|"4. Callback crossing: Duplicate or altered payment; untrusted and replayable input"| API
    API -->|"5. Data crossing: Cross-organization read/write; parameterized queries and forced RLS"| PG
    API -.->|"6. TARGET evidence crossing: validated private upload and ADR-006 authorized download"| Blob
    Providers -.->|"7. TARGET scan-result crossing: exact clean result required"| Blob
    Jobs -->|"8. Worker crossing: Duplicate or altered payment; idempotent outbox and inbox processing"| PG
    Jobs -->|"9. Provider crossing: Duplicate or altered payment; authenticated adapter and reconciliation"| Providers
    GitHub -->|"10. Delivery crossing: CI/deployment compromise; OIDC, exact revision, environment gate"| Control
    Control -->|"11. Workload deployment crossing: CI/deployment compromise; managed identity and immutable artifact"| API
    API -->|"12. Observability crossing: Sensitive telemetry disclosure; sanitized structured events"| Telemetry
    MCP -->|"13. Audit crossing: Sensitive telemetry disclosure; bounded metadata only"| Telemetry
    Models -->|"14. Current MCP crossing: AI prompt/tool abuse; authenticated synthetic system.health only"| MCP
    Models -.->|"15. INACTIVE / DEFERRED: AI prompt/tool abuse; separately approved narrow authorized tools only"| FutureAI
    FutureAI -.->|"16. INACTIVE / DEFERRED: application authorization boundary; no direct model data-store access"| API

    classDef deferred fill:#f4f4f4,stroke:#666,stroke-dasharray: 5 5,color:#222;
    class FutureAI deferred;
```

## Abuse cases and mitigations

| Abuse case | Control status and mitigation | Residual risk / action |
| --- | --- | --- |
| Cross-organization read/write | Implemented in current data paths: server authorization, membership checks, forced RLS, and negative integration tests | Expand tests with every data path; treat any leak as critical |
| Session/token theft or redirect manipulation | Partial: OIDC PKCE, exact CORS origin, fixed callback, and HTTPS endpoint validation | Browser token storage, MFA, and External ID policy require security review |
| Duplicate or altered payment | Foundation: organization-scoped uniqueness, balanced ledger, and reversal/replacement | Provider authentication and reconciliation evidence remain release gates |
| Malicious or exposed evidence | Approved target: private Blob, validation, scan gating, and ADR-006 authorized download | No current evidence route; approve and exercise a runbook before activation |
| SQL or object-ID injection | Implemented in current paths: Zod contracts, parameterized queries, resource authorization, and RLS | Continue negative and cross-organization tests |
| Anonymous viewing-inquiry flooding | Partial: honeypot, per-replica rate limit, and duplicate suppression | Shared edge or distributed limiter remains required before external beta |
| CI/deployment compromise | Implemented repository controls: GitHub OIDC, exact-SHA evidence, immutable tags, and environment gate | GitHub administration remains an external control |
| AI prompt/tool abuse | Current synthetic MCP only: no database, tenant data, write tool, or autonomous decision | Tenant-data AI remains deferred until executable evaluations pass |
| Sensitive telemetry disclosure | Partial: sanitized API errors and logging conventions | Structured telemetry implementation and retention approval pending |

Security assumptions: Azure/GitHub identity controls are administered correctly,
managed identity object IDs are trusted configuration, TLS endpoints are valid,
and PostgreSQL/Blob platform encryption operates as documented. These assumptions
must be tested operationally, not inferred from code alone.
