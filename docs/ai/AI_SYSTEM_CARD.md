# AI System Card

## Purpose

KEYFORTA AI helps authorized users retrieve, explain, classify, summarize, and
draft work related to their property relationship.

## Approved future capabilities

Only synthetic `system.health` is implemented, and its deployment path remains
inactive. The following tenant-data capabilities remain deferred until their
authorization, privacy, evaluation, operations, and release gates pass:

- Explain an authorized tenant balance and cite its charges and payments
- Explain an authorized lease clause and cite the exact document version
- Draft courteous reminders for human review
- Summarize and classify maintenance requests
- Extract proposed structured fields into a review queue

## Prohibited autonomous outcomes

- Tenant acceptance or rejection
- Rent changes or signed-term modification
- Eviction or legal conclusions
- Financial posting, refund, or movement of money without the defined approval
- Disclosure across tenants or organizations
- Converting an unsupported model statement into a business fact

## Safe fallback

When evidence is missing, access is denied, confidence is inadequate, a tool
fails, or model service is unavailable, the assistant states the limitation and
routes the user to the deterministic workflow or a human.

## Model Context Protocol boundary

KEYFORTA exposes a standalone, authenticated, read-only MCP service
(`apps/mcp-server`) for Claude and ChatGPT-compatible remote MCP clients. The
implemented inactive slice returns only synthetic service metadata through the
`system.health` capability tool.

The service performs no outbound Anthropic or OpenAI API call, holds no
provider credential, reads no database, accepts no client-supplied
organization context, and offers no write tool or autonomous decision. Public
ingress, provider connections, paid services, tenant-data tools, and production
deployment remain separately gated. When the MCP service or any model client is
unavailable, deterministic product workflows are unaffected.
