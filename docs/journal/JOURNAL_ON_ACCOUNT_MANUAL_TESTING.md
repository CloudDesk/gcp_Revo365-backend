# Journal and On Account Integration — Manual Acceptance Tests

## Prerequisites

- Migrations are applied and the readiness verifier passes.
- Tester has an Admin or Accountant user plus one unauthorized internal user.
- Two active Customers (A and B), one inactive Customer, one Supplier, an eligible A On Account reference, and outstanding B Invoices are available.
- Record starting Cash/Bank balances, transaction counts, Customer On Account totals, and Invoice balances.

## Phase 1–2: contract and boundary

1. Open Journals, On Account, Cash & Bank, Chart of Accounts, and both Customer statements; confirm existing records still load.
2. Create/post/reverse an ordinary manual Journal; confirm its existing lifecycle is unchanged.
3. Confirm the ordinary Journal account selector cannot choose controlled Bank/Cash/Customer Advance accounts.
4. Open Transfer On-Account; confirm only open/partially-applied Customer references with positive availability appear, with reference, Customer, currency, and available amount.
5. Confirm fully applied, reversed, Supplier, and inactive-Customer references are absent.
6. Confirm the destination selector shows active Customers and excludes the selected source Customer.

## Phase 3: transfer posting

1. Transfer a partial amount from Customer A to Customer B.
2. Confirm A availability decreases once and a new B transferred reference increases once by the same amount/currency.
3. Confirm the Journal is posted and Debit equals Credit.
4. Confirm paired `journal_transfer_out` and `journal_transfer_in` movements link to each other and the Journal.
5. Confirm Cash/Bank balances and transaction counts remain exactly unchanged.
6. Double-click submit or replay the same request key; confirm only one Journal, destination reference, and movement pair exist.
7. Negative cases: zero, negative, more than two decimals, amount above availability, same Customer, inactive Customer, stale source version, and changed currency. Each must fail without side effects.

## Phase 4: workspace and traceability

1. In Journals verify Manual Journals, System-Generated, and All Entries tabs return the correct categories.
2. Confirm the transfer appears in System-Generated and All Entries, not Manual Journals.
3. Open its detail and follow source/destination reference links; follow the Journal link back from movement history.
4. Confirm transfer details show both Customers/references, amount, status, and movement identity.
5. Confirm no generic Reverse action is available for a transfer Journal.
6. Sign in as an unauthorized role; confirm transfer/replacement actions are hidden and direct API calls return 403.

## Phase 5: allocation, TDS, and statements

1. Open B's transferred reference and apply part of it to one B Invoice.
2. Apply the remainder across multiple B Invoices.
3. Confirm only Bank Portion consumes On Account availability; TDS settles the Invoice but does not consume extra On Account value.
4. Confirm the reference cannot be used on A's or another Customer's Invoices.
5. Confirm allocation history identifies the exact reference, movement, Invoice, Bank Portion, TDS, and Journal.
6. Confirm A and B Customer statements show transfer out/in with the correct signs and running totals.

## Phase 6: explicit replacement

1. Record a later Bank receipt for B as On Account; confirm this alone does not alter the transfer.
2. Open the transfer Journal and choose Replace with Payment.
3. Confirm only B Bank-origin references in the same currency with enough unused balance appear; Cash-origin, transfers, other Customers, reversed, and insufficient references are absent.
4. Confirm the dialog lists the source/destination, amount, and affected allocation count.
5. Submit replacement and confirm only allocations funded by the transferred reference become reversed.
6. Confirm affected Invoices reopen by Bank Portion plus linked TDS; unrelated payment/allocation history remains unchanged.
7. Confirm A availability is restored exactly once, B's transferred reference is reversed with zero availability, and the selected later Bank reference is unchanged/available.
8. Confirm the opposite Journal balances and both destination-decrease/source-increase replacement movements are paired.
9. Replay the same request key; confirm the original result returns without duplicate effects.
10. Negative cases: another Customer's receipt, Cash account receipt, insufficient balance, currency mismatch, stale Journal version, already replaced transfer, missing allocation link, and concurrent replacement. Each must roll back fully.

## Phase 7: regression and reconciliation

1. Run backend tests/build, frontend type-check/build, and `npm run verify:journal-on-account-baseline`.
2. Confirm source reference snapshot equals immutable movement balance and `original = used + available` for every non-corrupt reference.
3. Confirm every transfer/replacement Journal is balanced and every original transfer has one movement pair.
4. Confirm every replacement has one linked opposite Journal, a reversed destination reference, a replacement reference, and compensating movements.
5. Recheck Cash/Bank, Chart of Accounts, Invoice list/detail, On Account list/detail, and Customer statements.
6. Regression-test Customer advance, Supplier advance, Customer Invoice allocation with TDS, Supplier Bill allocation with TDS, and manual Journal Draft/Post/Reverse.
7. Verify refresh, browser back/forward, pagination, filters, empty results, loading, and safe errors do not create duplicate financial effects.

## Acceptance rule

Do not approve release if any failed request leaves a Journal, movement, reference snapshot, allocation, Invoice balance, audit event, or Cash/Bank value partially changed.
