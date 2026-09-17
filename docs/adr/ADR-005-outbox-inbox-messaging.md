# ADR-005: Transactional Outbox and Inbox Deduplication

**Status:** Accepted
**Date:** 2026-09-14
**Owners:** Architecture/Operations

## Decision

Aggregate changes, audit records, and outbox events commit in one database transaction. Consumers record `(consumer, eventId)` in an inbox before applying effects.

```mermaid
sequenceDiagram
	autonumber
	participant Command as Authorized domain command
	participant DB as PostgreSQL transaction
	participant Worker as Outbox worker
	participant Transport as Event transport
	participant Consumer as Consumer
	participant Inbox as inbox_messages
	participant Ops as Operations

	Command->>DB: Begin transaction
	Command->>DB: Mutate aggregate
	Command->>DB: Append correlated audit_events row
	Command->>DB: Append versioned outbox_events row
	DB-->>Command: Atomic commit of aggregate, audit, and outbox

	rect rgb(245, 245, 245)
		Note over Worker,Ops: Accepted target worker path, not active in the current schema or runtime
		Worker->>DB: Claim a pending outbox event
		DB-->>Worker: Event envelope and attempt state
		Worker->>Transport: Deliver event at least once
		Transport->>Consumer: Deliver event envelope
		Consumer->>Inbox: Insert unique (consumer_name, event_id) before effects
		alt Inbox row inserted
			Consumer->>Consumer: Apply idempotent business effect
			Consumer->>Inbox: Mark processed
			Consumer-->>Transport: Acknowledge delivery
			Transport-->>Worker: Delivery acknowledged
			Worker->>DB: Mark outbox event published
		else Duplicate event ID
			Inbox-->>Consumer: Existing receipt
			Consumer-->>Transport: Acknowledge duplicate without repeating effect
			Transport-->>Worker: Duplicate acknowledged
			Worker->>DB: Mark outbox event published
		else Delivery or processing failure
			Consumer-->>Transport: Failure or no acknowledgement
			Transport-->>Worker: Delivery not completed
			Worker->>DB: Record attempt and last error
			Worker->>Worker: Retry with bounded backoff
			alt Retry limit reached
				Worker->>DB: Enter visible dead-letter state
				Worker-->>Ops: Surface event, attempts, and error
				Ops->>Worker: Authorize controlled replay
				Worker->>Transport: Replay with the same event ID
			else Outcome remains unresolved
				Ops->>DB: Reconcile aggregate, inbox, and delivery state
			end
		end
	end
```

## Consequences

Events may be delivered more than once but business effects are idempotent. Failed messages retry with backoff and then enter a visible dead-letter state. Event schemas are versioned and additive within a major version.
