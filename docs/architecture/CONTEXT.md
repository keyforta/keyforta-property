# System Context

```mermaid
flowchart LR
    Tenant[Tenant] --> Platform[KEYFORTA platform]
    Landlord[Landlord or manager] --> Platform
    Vendor[Maintenance vendor] --> Platform
    Operator[Platform operator] --> Platform
    Platform --> Identity[Customer identity provider]
    Platform --> Payment[Payment adapters]
    Platform --> Messaging[Email, SMS, messaging adapters]
    Platform --> Models[Approved AI models]
```

KEYFORTA owns the authoritative property, party, lease, operational, document,
and financial subledger records. External providers supply identity, delivery,
payment events, or model inference; they do not replace KEYFORTA’s business
state or authorization decisions.
