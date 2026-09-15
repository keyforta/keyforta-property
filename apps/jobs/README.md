# Jobs

The asynchronous worker boundary for notifications, payment reconciliation, evidence processing, reporting, and integration delivery. It consumes versioned API events through a transactional outbox; it must not bypass domain authorization or write private tables directly.
