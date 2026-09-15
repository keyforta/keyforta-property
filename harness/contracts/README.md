# Harness contracts

The task contract schema is authoritative in `../schemas/`. Runtime API contracts
remain authoritative in `packages/contracts`; the harness never duplicates them.
A task may reference those schemas as acceptance evidence but cannot modify
functional behavior without product-owner approval.
