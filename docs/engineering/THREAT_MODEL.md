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
    API -->|"6. Evidence crossing: Malicious or exposed evidence; validated private upload and API-proxied download"| Blob
    Providers -->|"7. Scan-result crossing: Malicious or exposed evidence; exact clean result required"| Blob
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

| Abuse case                                   | Existing mitigation                                                                             | Residual risk / action                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Cross-organization read/write                | Server authorization, membership/assignment checks, forced RLS, negative integration tests      | Expand tests with every data path; treat any leak as critical                    |
| Session/token theft or redirect manipulation | OIDC PKCE, exact CORS origin, fixed public callback, HTTPS endpoint validation                 | Browser token storage, MFA, and External ID policy require security review        |
| Duplicate or altered payment                 | Organization-scoped idempotency/provider uniqueness, balanced ledger, reversal/replacement      | Provider authentication adapter and reconciliation evidence remain release gates |
| Malicious or exposed evidence                | Private Blob, signature/size/MIME checks, opaque names, Defender-gated proxy download           | Monitor scan age/quota and exercise malicious upload runbook                     |
| SQL or object-ID injection                   | Zod contracts, parameterized queries, resource authorization, RLS                               | Continue negative and cross-org tests                                            |
| Anonymous viewing-inquiry flooding           | Honeypot, per-replica IP rate limit, listing/email duplicate suppression                        | Shared edge or distributed limiter remains required before external beta          |
| CI/deployment compromise                     | GitHub OIDC, exact-SHA plan evidence, immutable tags, environment gate                          | Enable platform secret/code scanning and review action pinning                   |
| AI prompt/tool abuse                         | No direct database, narrow typed authorized tools, human high-impact decisions, AI-off fallback | Runtime AI remains deferred until executable evals pass                          |
| Sensitive telemetry disclosure               | Sanitized API errors and logging conventions                                                    | Structured telemetry implementation and retention approval pending               |

Security assumptions: Azure/GitHub identity controls are administered correctly,
managed identity object IDs are trusted configuration, TLS endpoints are valid,
and PostgreSQL/Blob platform encryption operates as documented. These assumptions
must be tested operationally, not inferred from code alone.
