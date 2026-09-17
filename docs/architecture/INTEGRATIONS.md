# Integration Boundaries

Integrations are adapters around KEYFORTA’s authoritative state.

## Initial adapter categories

| Category  | Inbound responsibility                             | Outbound responsibility                             |
| --------- | -------------------------------------------------- | --------------------------------------------------- |
| Identity  | Verified external subject and authentication event | Sign-in and account-recovery journey                |
| Payment   | Authenticated, replayable transaction status event | Payment request or instructions                     |
| Messaging | Delivery status and authorized user reply          | Notification rendered from an approved template     |
| Document  | Signature, scan, or extraction result              | Versioned document prepared for an authorized user  |
| AI model  | Structured candidate output and usage metadata     | Minimum necessary prompt, evidence, and tool result |

## Adapter rules

- The domain never imports a provider SDK.
- Inbound messages are authenticated, schema-validated, idempotent, and stored
  with provider and correlation references.
- Retries use bounded backoff and a dead-letter or exception queue.
- Provider success does not imply domain success; reconciliation links both.
- Personal data sent to a provider is minimized and governed by documented
  purpose, consent or other authority, retention, region, and deletion rules.
- Every provider requires a failure mode, fallback path, and replacement plan.

## Provider callback sequence

```mermaid
sequenceDiagram
  autonumber
  participant Provider as External provider
  participant API as Provider callback boundary
  participant Receipt as webhook_receipts
  participant Processor as Integration processor
  participant Policy as Authorization policy
  participant Domain as Domain command handler
  participant DB as PostgreSQL transaction
  participant Ops as Operations

  Provider->>API: Callback with signature, timestamp, and provider event ID
  API->>API: Verify signature and timestamp tolerance
  API->>API: Check replay status and provider event identity
  API->>API: Validate callback schema
  alt Authentication, replay, or schema validation fails
    API-->>Provider: Sanitized rejection with request ID
  else Callback is valid
    API->>Receipt: Record provider event ID, payload hash, and verification result
    alt Provider event ID already recorded
      Receipt-->>API: Existing durable receipt
      API-->>Provider: Sanitized duplicate acknowledgement
    else New durable receipt
      Receipt-->>API: Receipt persisted
      API-->>Provider: 202 Accepted after durable receipt
      rect rgb(245, 245, 245)
        Note over Processor,Ops: Accepted target asynchronous path, not active in the current schema or runtime
        Processor->>Receipt: Claim callback for processing
        Processor->>Policy: Authorize organization, resource, and command
        alt Command is authorized and valid
          Policy-->>Processor: Permit
          Processor->>Domain: Invoke authorized domain command
          Domain->>DB: Begin transaction
          Domain->>DB: Mutate aggregate and append audit_events
          Domain->>DB: Append versioned outbox_events event
          DB-->>Domain: Atomic commit of aggregate, audit, and outbox
          Domain-->>Processor: Domain result
          Processor->>Receipt: Mark processed with correlation reference
        else Unauthorized or invalid domain transition
          Policy-->>Processor: Deny or command rejects state
          Processor->>Receipt: Record sanitized processing failure
        else Dependency or processing failure
          Processor->>Receipt: Record attempt and sanitized error
          Processor->>Processor: Retry with bounded backoff
          Processor-->>Ops: Surface unresolved callback or provider mismatch
          Ops->>Processor: Authorize controlled retry or reconciliation
          Processor->>Domain: Reconcile through an authorized domain command
        end
      end
    end
  end

  Note over Provider,DB: Provider status is evidence, not ledger or business truth, and PostgreSQL domain state remains authoritative
```
