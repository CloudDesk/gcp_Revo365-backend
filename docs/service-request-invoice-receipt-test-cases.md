# Service Request Invoice Receipt Test Cases

Run these scenarios only in a development/SIT environment with a dedicated test
customer and Bank/Cash account. Automated tests cover calculations and eligibility;
these cases cover authenticated UI, API, PostgreSQL transactions, and permissions.

## Preconditions

- A normal customer and a walk-in customer exist.
- A normal Service Request and a walk-in Service Request can reach approved cost estimation.
- An active Bank account and an active Cash account exist.
- The tester can generate service invoices and post Cash & Bank receipts.
- Record the opening Bank/Cash balance before every receipt case.

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| SRINV-01 | Normal ticket invoice generation | Approve estimation and generate invoice. | Invoice has `invoicefor=service`, correct ticket/customer/amount, Pending status, zero paid, and full balance. Invoices tab appears. |
| SRINV-02 | Walk-in ticket invoice generation | Create walk-in ticket for selected customer, approve estimation, and generate invoice. | Invoice is linked to the selected walk-in customer and ticket. Normal ticket flow is unchanged. |
| SRINV-03 | No accounting entry on generation | Compare Bank/Cash balances and transactions before and after generation. | No Bank/Cash transaction, journal, or balance movement is created. |
| SRINV-04 | Outstanding list | Open an account, click Record receipt, and select the invoice customer. | Service invoice appears with invoice number, ticket number, total, and full outstanding amount. |
| SRINV-05 | Partial Cash receipt | Post 4,000 against a 10,000 invoice without TDS. | Cash balance increases 4,000; invoice paid is 4,000; balance is 6,000; status is Partially Paid. |
| SRINV-06 | Partial Bank receipt with TDS | Post Bank receipt 4,000 and TDS 400 against a 10,000 invoice. | Bank balance increases only 4,000; TDS Receivable is 400; invoice settled is 4,400; balance is 5,600; status is Partially Paid. |
| SRINV-07 | Complete invoice | Post receipt plus optional TDS exactly equal to the remaining balance. | Balance becomes zero; database status is `paid`; UI status is Completed; invoice is removed from outstanding list. |
| SRINV-08 | Multiple receipts | Post two or more partial receipts using Cash and Bank accounts. | Each account receives only its posted amount; payment history contains every successful receipt; totals equal the sum of entries. |
| SRINV-09 | Over-settlement prevention | Enter receipt plus TDS greater than invoice outstanding. | UI blocks posting and API rejects the request; no transaction, journal, allocation, invoice, or account balance changes. |
| SRINV-10 | Customer isolation | Attempt to post an invoice using a different customer ID through the API. | API rejects the allocation and rolls back all accounting changes. |
| SRINV-11 | Idempotent retry | Retry the same receipt request using the same `requestreference`. | Existing receipt is returned; no duplicate transaction, journal, allocation, payment entry, or balance movement. |
| SRINV-12 | Refresh persistence | Post a receipt, reload Cash & Bank and Service Request pages. | Account balance, transaction, invoice summary, payment history, and status remain consistent. |
| REG-01 | Existing in-store sale | Post a receipt against a StorePurchase product invoice. | Existing retail behavior, source, amount, TDS, journal, and status are unchanged. |
| REG-02 | Existing e-commerce order | Complete an online order through its normal payment provider flow. | Automatic e-commerce finance processing remains unchanged; invoice does not enter the manual retail/service receipt branch. |
| REG-03 | Rental/non-eligible invoice | Check rental and unrelated invoice types in Record receipt. | They remain excluded unless supported by their existing dedicated flow. |

## Required amount reconciliation

For every successful receipt:

```text
Bank/Cash balance increase = receipt allocation amount
Invoice settlement         = receipt allocation amount + TDS
Invoice balance            = previous balance - invoice settlement
Journal debits             = Bank/Cash receipt + TDS Receivable
Journal credits            = Accounts Receivable settlement
```

The receipt transaction, journal entry, allocation, invoice update, and account
balance update must either all commit or all roll back.
