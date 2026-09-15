# Pilot Rulebook

**Status:** Approved for synthetic-data prototype; legal confirmation required
before real tenant use  
**Decision owner:** Celestin Mbuyamba  
**Last updated:** 2026-09-09

This rulebook makes pilot assumptions visible and testable. A rule marked
pending must not be silently inferred by application code or AI.
The product owner approved the discounted first advance-rent allocation for the
synthetic-data prototype on 2026-09-09; legal review is still required before
real tenant use.

## Approved rules

| Area                    | Pilot rule                                                        |
| ----------------------- | ----------------------------------------------------------------- |
| Currency                | USD for the first executable scenarios; amounts use integer cents |
| Base rents              | Unit A: $400; Unit B: $350; Unit C: $250                          |
| Introductory concession | 10% of rent for the first two scheduled periods                   |
| Refundable guarantee    | Three times the contractual base rent                             |
| Advance rent            | One scheduled rent period, allocated to period one                |
| Advance-rent concession | The first advance-rent allocation receives the 10% concession     |
| Separation              | Guarantee and rent are distinct obligations and allocations       |
| AI authority            | AI may explain the calculation but may not post or modify money   |

## Signing calculations

| Unit | Guarantee | Advance rent | Total due at signing |
| ---- | --------: | -----------: | -------------------: |
| A    |    $1,200 |         $360 |               $1,560 |
| B    |    $1,050 |         $315 |               $1,365 |
| C    |      $750 |         $225 |                 $975 |

The total due at signing is the refundable guarantee plus the discounted first
rent installment. The next unpaid installment is period two.

## Pending decisions

- Contractual rent due day and any grace period
- Accepted collection methods: cash, bank transfer, and mobile money details
- CDF conversion source, rate timestamp, rounding, and who accepts rate risk
- Late-payment consequence and communication sequence
- Guarantee deduction categories, evidence, approval, and dispute process
- Guarantee refund deadline and payment method
- Early termination and renewal treatment
- Receipt numbering format and whether one payment receipt may show multiple
  allocations

## Required edge-case scenarios

Before real tenant data is imported, acceptance tests must cover:

1. Partial payment allocated between guarantee and rent
2. Overpayment retained as unapplied funds or returned through an approved path
3. Duplicate payment evidence or provider callback
4. Reversal of a rejected or mistaken payment
5. Payment offered in a currency different from the lease currency
6. Early termination with guarantee deductions and a remaining refund

## Legal checkpoint

A qualified DRC reviewer must confirm the terminology, refundability, lawful
deductions, required notices, receipt content, and contract language. Until
then, the approved rules are product hypotheses used only with synthetic data.
