# User Flow Diagrams

**Status:** Descriptive companion to [Product Role Use Cases](PILOT_ROLE_USE_CASES.md)
**Snapshot:** 2026-09-17

These diagrams visualize approved journeys and current delivery status. They do
not add or change requirements; `PILOT_ROLE_USE_CASES.md` remains authoritative.
Mobile and desktop use the same responsive web experiences. Native applications
are out of scope.

## Status legend

- **[UI]** Implemented user interface
- **[API]** Implemented API or domain capability; a complete user interface is
  not implied
- **[MOCK]** Prototype or browser-local mock
- **[PLAN]** Planned behavior from approved product documentation

Exit nodes use the status of the behavior that owns the exit. “Provider
unavailable” means the affected provider-backed step reports a clear status;
unaffected core work continues where the approved requirements allow it.

## 1. Shared entry, authentication, role, and channel handoff

```mermaid
flowchart LR
  subgraph Visitor[Visitor or member]
    A["Open responsive public web [UI]"]
    B{"Choose path [UI]"}
    C["Browse public content or listings [UI]"]
    D["Choose secure sign-in [UI]"]
  end
  subgraph Identity[Microsoft Entra External ID]
    E["Authenticate verified identity [UI]"]
    EU["Provider unavailable: show status; public paths remain usable [UI]"]
  end
  subgraph Domain[Authorization and role resolution]
    F["Derive active membership, role, organization, and assignment [API]"]
    FD["Denied: no authorized active context; reveal no private data [API]"]
    FR["Revoked membership or assignment: remove access immediately [API]"]
    G{"Authorized channel [API]"}
  end
  subgraph Channels[Responsive web channels]
    H["Tenant access-confirmation workspace [PLAN]"]
    I["Landlord workspace [API]"]
    J["Manager assigned-property workspace [API]"]
    K["Operator assigned-work workspace [MOCK]"]
    L["Platform admin onboarding console [UI]"]
    M["Role workspace shell and sample records [MOCK]"]
  end

  A --> B
  B --> C
  B --> D --> E
  E -. provider failure .-> EU
  E --> F
  F --> FD
  F --> FR
  F --> G
  G --> H
  G --> I
  G --> J
  G --> K
  G --> L
  D -. local demo route .-> M
```

## 2. Public discovery and viewing inquiry

```mermaid
flowchart LR
  subgraph Visitor[Public visitor]
    A["Open published catalogue [UI]"]
    B["Filter by district, bedrooms, and maximum rent [UI]"]
    C{"Published results [UI]"}
    D["Empty: no matching listings; reset filters [UI]"]
    E["Open stable listing detail [UI]"]
    F["Submit viewing inquiry [UI]"]
    V["Validation error: correct fields [UI]"]
    S["Inquiry received [UI]"]
    N["No public application or reservation [UI]"]
  end
  subgraph PublicAPI[Public listing and inquiry API]
    L["Loading listing projection [UI]"]
    P["Return public-safe published fields only [API]"]
    X["Unavailable or not found: retry or return to catalogue [UI]"]
    Q["Validate, suppress abuse, and link responsible organization [API]"]
    U["Duplicate: suppress repeated inquiry [API]"]
  end

  A --> B --> L --> P --> C
  C -->|none| D
  C -->|results| E --> F
  L -. request failure .-> X
  E -. withdrawn or unknown .-> X
  F --> Q
  Q -->|invalid| V --> F
  Q -->|duplicate| U
  Q -->|accepted| S --> N
```

## 3. Prospective landlord onboarding

```mermaid
flowchart LR
  subgraph Applicant[Prospective landlord]
    A["Choose landlord onboarding [UI]"]
    B["Authenticate with External ID [UI]"]
    C["Enter name and proposed organization [UI]"]
    D["Submitting [UI]"]
    V["Validation error: correct fields [UI]"]
    U["Provider or API unavailable: show status and retry [UI]"]
    P["Pending human review [UI]"]
    DP["Duplicate pending application: do not create another [UI]"]
    R["Rejected: no organization or membership [API]"]
    S["Approved: landlord access can resolve [API]"]
  end
  subgraph Admin[Allowlisted platform administrator]
    AL["Authenticate and load review queue [UI]"]
    AE["Loading or empty queue [UI]"]
    AD["Denied: identity not allowlisted [UI]"]
    H["Review application; enter required reason [UI]"]
    J{"Approve or reject [UI]"}
    F["Decision failure: refresh and retry [UI]"]
  end
  subgraph OnboardingAPI[Onboarding domain]
    I["Create one pending application for verified identity [API]"]
    DD["Duplicate or already decided: reject conflicting command [API]"]
    O["Atomically create organization and active landlord membership [API]"]
    AU["Preserve immutable applicant, admin, outcome, time, and correlation [API]"]
  end

  A --> B
  B -. identity unavailable .-> U
  B --> C --> D --> I
  I -->|invalid| V --> C
  I -->|pending exists| DP
  I -->|created| P
  AL --> AE
  AL --> AD
  AL --> H --> J
  J -->|conflict| DD
  J -. request failure .-> F
  J -->|reject| R --> AU
  J -->|approve| O --> AU --> S
```

## 4. Invited tenant application and access confirmation

```mermaid
flowchart LR
  subgraph Landlord[Landlord]
    A["Create expiring tenant invitation [API]"]
    B["Reveal invitation token once [API]"]
    BR["Replace lost pending link; revoke old invitation [API]"]
    H["Review submitted application and scan status [PLAN]"]
    J{"Record one human decision with notes [PLAN]"}
    RJ["Reject: no reservation, lease, or money movement [PLAN]"]
  end
  subgraph Tenant[Invited tenant]
    C["Open invitation and sign in with invited email [API]"]
    D["Complete structured application [PLAN]"]
    V["Validation error: correct application or file [PLAN]"]
    E["Upload versioned PDF, JPEG, or PNG evidence up to 10 MB [PLAN]"]
    W["Scan pending or unavailable: file cannot be downloaded [PLAN]"]
    X["Malicious or failed scan: file denied [PLAN]"]
    P["Application pending human review [PLAN]"]
    AC["Accepted tenant enters access-confirmation workspace [PLAN]"]
    NA["Lease, payment, receipt, and maintenance views unavailable [PLAN]"]
  end
  subgraph Authorization[Invitation, evidence, and membership controls]
    I["Validate token, expiry, status, and exact email [API]"]
    ID["Denied: invalid, expired, revoked, used, or email mismatch [API]"]
    S["Defender scan result [PLAN]"]
    CL["Clean evidence available after fresh authorization by short-lived signed URL [PLAN]"]
    M["Create tenant identity and active organization membership [API]"]
  end

  A --> B --> C --> I
  B -. link lost .-> BR --> C
  I -->|denied| ID
  I -->|valid| M --> D
  D -->|invalid| V --> D
  D --> E --> S
  S -->|pending or provider unavailable| W
  S -->|failed or malicious| X
  S -->|clean| CL --> P --> H --> J
  J -->|reject| RJ
  J -->|approve| AC --> NA
```

Approval does not reserve a unit or create or activate a lease. The
access-confirmation workspace is intentionally limited until tenant-scoped read
contracts and authorization tests are implemented.

## 5. Landlord portfolio, invitations, provenance, and activation

```mermaid
flowchart LR
  subgraph Landlord[Landlord]
    A["Select explicit organization context [API]"]
    B["Open portfolio [API]"]
    E["Empty portfolio: show no synthetic replacement records [API]"]
    C["Search bounded properties, units, leases, and active managers [API]"]
    I["Create, replace, or revoke manager or tenant invitation [API]"]
    D["Select unleased unit and active tenant; enter exact terms [API]"]
    P{"Choose draft provenance [API]"}
    PA["Approved same-organization, same-tenant application; unused [API]"]
    PH["Historical or external lease with required justification [API]"]
    V["Validation or provenance conflict: correct inputs [API]"]
    R["Review exact draft [API]"]
    X["Explicitly activate lease [PLAN]"]
    S["Accepted immutable version and generated obligations [PLAN]"]
  end
  subgraph Manager[Manager]
    M["Open only actively assigned properties [API]"]
    MP["Prepare operational records or proposed terms [PLAN]"]
    MD["Denied or revoked: property disappears; history remains attributable [API]"]
    MX["Cannot activate lease [API]"]
  end
  subgraph Domain[Organization authorization and lease domain]
    O["Verify active membership, role, organization, and assignment [API]"]
    OD["Denied: wrong or inactive organization context [API]"]
    IV["Invitation invalid, expired, revoked, used, or email mismatch [API]"]
    L["Append audited unaccepted draft with immutable provenance [API]"]
    LC["Activation conflict or incomplete draft: remain unaccepted [PLAN]"]
  end

  A --> O
  O -->|denied| OD
  O -->|landlord| B
  O -->|manager| M
  B -->|none| E
  B --> C
  C --> I
  I --> IV
  C --> D --> P
  P --> PA --> L
  P --> PH --> L
  P -->|invalid| V --> D
  L --> R --> X
  X -->|conflict| LC --> R
  X -->|accepted| S
  M --> MP --> MX
  M --> MD
```

## 6. Cross-role maintenance journey

```mermaid
flowchart LR
  subgraph Tenant[Tenant]
    A["Submit description, photos, and access preference [PLAN]"]
    AV["Validation error: add required details [PLAN]"]
    AT["Track retained status and evidence [PLAN]"]
    C{"Confirm completion or dispute and reopen [PLAN]"}
  end
  subgraph Manager[Assigned manager]
    M["Review request for assigned property [PLAN]"]
    MD["Denied or revoked assignment: no property access [PLAN]"]
    T["Human confirms urgency, priority, and assignment [PLAN]"]
    Q{"Estimate or exceptional spend needs approval [PLAN]"}
    CL["Close with status history and evidence retained [PLAN]"]
  end
  subgraph Assistant[Optional assistant]
    AI["Suggest category, urgency, questions, and summary [PLAN]"]
    AU["AI unavailable or insufficient evidence: abstain; continue human workflow [PLAN]"]
  end
  subgraph Operator[Assigned maintenance operator]
    O["Receive only assigned work and defined access window [PLAN]"]
    OD["Denied: unassigned, expired, or revoked access [PLAN]"]
    W["Record arrival, work, materials, cost, and evidence [PLAN]"]
  end
  subgraph Landlord[Landlord]
    L{"Human approve or reject exceptional spend [PLAN]"}
    LR["Rejected proposal returns for revision [PLAN]"]
  end

  A -->|invalid| AV --> A
  A --> M
  M --> MD
  M --> AI
  AI -. provider unavailable or no evidence .-> AU --> T
  AI --> T
  T --> Q
  Q -->|approval required| L
  L -->|reject| LR --> T
  L -->|approve| O
  Q -->|within delegated authority| O
  O --> OD
  O --> W --> AT --> C
  C -->|confirm| CL
  C -->|dispute or reopen| M
```

Maintenance remains a planned vertical slice. The manager and operator lanes
show only the authority and lifecycle already grounded in the approved role use
cases and product blueprint; they do not define new thresholds, statuses, or
service commitments.