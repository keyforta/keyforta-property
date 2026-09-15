# Domain Model

## Structural hierarchy

`Organization → Portfolio → Property → Building → Unit`

## Initial bounded modules

1. Identity and organization
2. Party and relationship
3. Property and unit
4. Leasing and occupancy
5. Billing and ledger
6. Payments and reconciliation
7. Maintenance and inspection
8. Document and communication
9. Reporting
10. AI orchestration
11. Integration adapters

## Core invariants

- Organization is the commercial data-isolation boundary.
- A unit cannot have conflicting active occupancy for the same dates unless the
  lease model explicitly permits a shared arrangement.
- An active lease points to one immutable approved terms version.
- A charge schedule is derived from approved terms and retains the derivation
  version.
- Posted ledger entries are immutable and balanced under the defined subledger
  policy.
- AI recommendations are not domain facts until accepted through an authorized
  command.
