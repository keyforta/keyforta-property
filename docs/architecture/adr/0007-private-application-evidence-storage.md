# ADR-0007: Store Application Evidence in Private Azure Blob Storage

> **Candidate record:** This file does not supersede the accepted
> [ADR-006](../../adr/ADR-006-private-document-storage.md). In particular,
> ADR-006's fresh authorization and short-lived signed URL decision controls
> until a reviewed ADR reconciles the download approach described here.

- **Status:** Proposed candidate; not approved for implementation
- **Date:** 2026-09-10
- **Relationship:** Does not supersede accepted ADR-006 or authorize its
    divergent API-proxied download design

## Context

Tenants need to provide identity, income, address, and rental-reference evidence
for human application review. These files contain sensitive personal data and
must not enter PostgreSQL, public object paths, source control, AI prompts, or an
unapproved third-party scanning service.

The application decision remains human-only. Evidence availability must not make
approval autonomous or cause a reservation, lease, refund, pricing, or money
movement action.

## Proposed decision

Use one private, locally redundant StorageV2 account in South Africa North and a
private `tenant-applications` container. The API accesses the container through
its managed identity and container-scoped Storage Blob Data Contributor role.
Shared-key authentication and anonymous Blob access are disabled. Authorized
browsers upload and download through the API; the product does not issue browser
SAS tokens.

Accept PDF, JPEG, and PNG files up to 10 MB. Validate declared MIME type and file
signature, use opaque blob paths, retain the original filename only as protected
metadata, and record SHA-256 in PostgreSQL and Blob metadata. PostgreSQL stores
immutable, versioned, organization-scoped metadata under forced RLS.

Enable Microsoft Defender for Storage on-upload malware scanning with Blob Index
Tags and a monthly cost cap. Every file is unavailable while its result is
missing, pending, not scanned, or malicious. Only the exact `No threats found`
result permits API-proxied download. Enable Blob soft delete for seven days and
enable Defender's built-in soft-delete-malicious-blobs control during deployment
verification when that control is not exposed by the supported Bicep schema.

Record upload and successful download audit events with actor, organization, and
correlation identifiers. Preserve application review as an explicit human action
that cannot create or activate a lease or reserve a unit.

### Evidence security sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Authorized browser user
    participant API as API authorization and evidence route
    participant Validate as File validation
    participant PG as PostgreSQL metadata and policy
    participant Blob as Private Blob storage
    participant Defender as Defender malware scan
    participant Audit as Audit log
    participant Jobs as Retention job

    User->>API: Upload evidence through authenticated application request
    API->>PG: Authorize actor, organization, application, and evidence access
    API->>Validate: Check size, declared MIME, signature, and non-empty content
    alt Validation fails
        Validate-->>API: Reject unsupported, oversized, empty, or mismatched file
        API-->>User: Sanitized rejection, no object stored
    else Validation succeeds
        Validate-->>API: Validated bytes and SHA-256
        API->>Blob: Store bytes at opaque path in private container
        API->>PG: Append immutable versioned metadata, hash, and scan-unavailable state
        API->>Audit: Record upload with actor, organization, and correlation context
        API-->>User: Upload accepted but unavailable pending scan
        Defender->>Blob: Scan uploaded object and write scan-result tag
        alt Result missing, pending, failed, or not scanned
            Note over API,Blob: Evidence remains unavailable and download fails closed
        else Result is malicious
            Note over API,Blob: Deny access, quarantine or soft-delete control applies
        else Exact result is No threats found
            Note over API,Blob: Object becomes eligible for an authorized download
        end
    end

    User->>API: Request evidence download
    API->>PG: Fresh actor, organization, role, resource, retention, and legal-hold authorization
    alt Authorization denied
        PG-->>API: Denied without disclosing evidence metadata
        API-->>User: Download denied, no Blob request made
    else Authorization succeeds
        PG-->>API: Authorized immutable metadata and opaque storage key
        API->>Blob: Read current malware-scan result tag
        alt Storage or scan result unavailable
            API-->>User: Service unavailable, no bytes disclosed
        else Missing, pending, failed, or not scanned
            API-->>User: Download denied, evidence unavailable
        else Malicious
            API-->>User: Download denied, no bytes disclosed
        else Exact result is No threats found
            API->>Blob: Read verified private object by opaque storage key
            Blob-->>API: Evidence bytes
            API->>Audit: Record successful download with actor, organization, and correlation context
            API-->>User: Stream evidence through API proxy
            Note over User,Blob: Browser receives no Blob URL, storage credential, or SAS token
        end
    end

    opt Approved policy-driven retention execution
        Jobs->>PG: Load active policy and exclude active legal holds
        alt Retention elapsed and no legal hold permits action
            Jobs->>Blob: Apply approved retention action to object bytes
            Jobs->>PG: Record retention outcome without overwriting version history
            Jobs->>Audit: Record policy version, counts, and outcome
        else Legal hold active or policy does not permit action
            Note over Jobs,Blob: Preserve evidence, no irreversible deletion
        end
    end
```

## Consequences

- Sensitive evidence is stored outside the relational database and remains
  inaccessible to browsers and landlords until Defender reports it clean.
- Defender scanning and Blob transactions add usage-based cost; a 100 GB monthly
  cap bounds scanning cost but can leave later files unavailable when exhausted.
- The API remains usable without storage configuration, but evidence routes fail
  closed with a service-unavailable response.
- The pilot gains one managed resource that must be included in access reviews,
  incident response, retention checks, and deployment validation.

## Validation

1. Cross-role and cross-organization tests prove tenant ownership and landlord
   review authorization at the API and PostgreSQL boundaries.
2. Unsupported, oversized, empty, and signature-mismatched files are rejected.
3. Pending, not-scanned, and malicious files cannot be downloaded; clean files
   can be downloaded only through an authorized API request.
4. Bicep compiles and assigns no storage keys or public container access.
5. Deployment verification confirms Defender writes Blob Index Tags and soft
   deletes a synthetic EICAR test blob without using real tenant data.
