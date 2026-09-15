# ADR-006: Private Object Storage for Documents and Evidence

**Status:** Accepted
**Date:** 2026-09-14
**Owners:** Security/Documents

## Decision

Document binaries and maintenance evidence are stored in private object storage. The database stores metadata, content hash, related aggregate, retention/legal-hold state, and access grants.

## Consequences

Downloads require a fresh relationship/access-window check and short-lived signed URL. Public routes never return storage keys or private document content. Version history is preserved.
