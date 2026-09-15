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
