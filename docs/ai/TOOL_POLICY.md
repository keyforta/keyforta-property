# AI Tool Policy

1. Tools expose business capabilities, never raw database access.
2. The application establishes actor and organization context; the model cannot
   supply or override it.
3. Read tools return only the minimum authorized fields needed for the task.
4. Write tools validate normal domain rules and default to preview mode.
5. Lease, notice, ledger, payment, refund, access, and disclosure changes require
   explicit confirmation at the application layer.
6. Tool calls, evidence references, result status, model configuration, and
   human decisions receive one correlation ID and auditable record.
7. Model-generated text is escaped and treated as untrusted at every output
   boundary.

## Remote MCP boundary

8. `apps/mcp-server` is the only Model Context Protocol boundary. It is a
   standalone service approved for a synthetic-only ChatGPT connection in the
   dev environment through the protected activation process. It remains
   unavailable in production and has no private API, database, tenant-data, or
   model-provider access.
9. Every MCP request is authenticated before protocol dispatch. Actor identity
   comes from the approved authentication boundary, never from JSON-RPC
   content, tool arguments, or client-supplied organization context.
10. The first slice exposes only server metadata and the synthetic read-only
    `system.health` capability tool. Tenant, lease, payment, document,
    maintenance, and other business tools, and every write tool, require
    separate product, architecture, and security/privacy approval.
11. Missing identity, unsupported origins, unsupported protocol versions,
    malformed messages, insufficient scope, and unknown or expired sessions
    fail closed with sanitized errors carrying only a stable reason and
    correlation ID.
12. MCP audit records retain correlation ID, client identity, protocol version,
    method, tool name, result status, denial reason, policy version, and a
    hashed session reference. They never retain credentials, prompts, tool
    arguments, tool results, or personal data.

## AI and MCP tool-boundary sequence

The first section is the current approved synthetic capability. The second is a
security contract for future tenant-data AI and remains inactive and deferred
until its separate product, architecture, and security/privacy approvals exist.

```mermaid
sequenceDiagram
    autonumber
    actor Human as Human user
    participant App as KEYFORTA application
    participant Model as Model client
    participant MCP as Authenticated MCP boundary
    participant Tool as Narrow typed tool
    participant API as Authorized application capability
    participant Audit as Bounded audit record
    participant Workflow as Deterministic workflow

    rect rgb(235, 245, 239)
        Note over Model,Audit: CURRENT: synthetic-only development system.health
        Model->>MCP: Authenticated request with approved client identity
        MCP->>MCP: Validate session, protocol, method, strict empty input, and scope
        alt Authentication, scope, protocol, or schema invalid
            MCP->>Audit: Record sanitized denial metadata and correlation ID
            MCP-->>Model: Fail closed with stable sanitized reason
        else Request valid
            MCP->>Tool: Invoke read-only system.health
            Tool-->>MCP: Strict allowlisted synthetic minimum fields
            MCP->>MCP: Validate structured result and treat tool output as untrusted
            MCP->>Audit: Record bounded result metadata and correlation ID
            MCP-->>Model: Synthetic health result only
        end
        Note over MCP,API: No tenant data, private API, database, provider access, or write tool
    end

    rect rgb(245, 245, 245)
        Note over Human,Audit: INACTIVE / DEFERRED: future tenant-data AI security contract
        Human->>App: Request an assisted task
        App->>App: Establish authenticated actor and organization context from protected state
        App->>Model: Send only approved minimum task context
        Model->>MCP: Request allowlisted tool with narrow typed arguments
        Note over Model,MCP: Model cannot supply or override actor or organization context
        MCP->>MCP: Strictly validate tool name, argument schema, scope, and policy version
        MCP->>Tool: Invoke tool with application-established context
        Tool->>API: Request narrow capability with minimum necessary fields
        API->>API: Reauthorize actor, organization, role, and resource and enforce domain rules
        API-->>Tool: Minimum authorized structured result
        Tool-->>MCP: Typed structured result
        MCP->>MCP: Validate result and treat all returned or generated text as untrusted
        MCP->>Audit: Record correlation, evidence references, tool, status, and policy metadata
        MCP-->>Model: Minimum validated tool result
        Model-->>App: Untrusted draft or recommendation
        App->>App: Escape output and verify evidence references
        alt Consequential action proposed
            App->>Human: Require explicit review and confirmation
            Human->>App: Confirm or reject through deterministic application control
            App->>Audit: Record human decision with the same correlation ID
        else Read-only assistance
            App-->>Human: Present bounded output with evidence or limitation
        end
        alt Model or tool unavailable, denied, or inadequate
            App-->>Human: State limitation without inventing a result
            App->>Workflow: Route to usable deterministic workflow or human process
        end
        Note over Model,API: No direct model access to PostgreSQL, Blob storage, or raw business capabilities
    end
```
