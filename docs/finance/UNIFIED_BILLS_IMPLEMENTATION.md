# Unified Supplier and Direct Expense Bills

## Purpose

`poinvoice` is the single Accounts Payable Bill document in Revo365. The
database table name is retained for backwards compatibility; UI and API
terminology should use **Bill** where possible.

This design supports three mutually exclusive origins:

| Scenario | billtype | ponumber | supplierid |
| --- | --- | --- | --- |
| PO Bill | `inventory` | Required | Resolved from Purchase Order |
| Direct Expense Bill with Supplier | `expense` | Null | Required |
| Direct Expense Bill without Supplier | `expense` | Null | Null |

No dummy Supplier, Purchase Request, or Purchase Order is created. No second
Bill table or second payment ledger is introduced.

## Invariants

1. The existing PO Bill endpoint and PO Detail Bill form keep their current
   matching, quantity, price, discount, GST, and PO-total validation.
2. An `inventory` Bill must have a valid Purchase Order. Its supplier is the
   supplier on that PO, not a duplicate field on the Bill.
3. An `expense` Bill must not have a Purchase Order and must have an active
   expense Chart of Accounts ledger.
4. Supplier is optional only for `expense` Bills. When present it must be an
   active Supplier.
5. Every Bill uses the same `balanceamount`, `invoicestatus`, `paymentdata`,
   `bank_transaction_allocations`, Cash/Bank transaction, and audit model.
6. A Bill with a posted Cash/Bank allocation cannot be edited or deleted.
7. Direct Expense Bills without a Supplier are excluded from Supplier
   Statements and Supplier On Account. They are settled through a Bill payment
   action, not a Supplier payment/advance.

## Data model

The following columns belong on `poinvoice`:

- `billtype`: `inventory` or `expense`, non-null and defaulted to `inventory`
  for all historical PO Bills.
- `ponumber`: nullable. It is required only when `billtype = inventory`.
- `supplierid`: nullable FK to `supplier`. It is used for Direct Expense Bills;
  PO Bills resolve their supplier from `purchaseorder.supplierid`.
- `expenseaccountid`: nullable FK to `finance_accounts`. It is retained for
  the future accounting-posting release, but is not shown or required while
  Direct Bills do not create an accrual journal.
- `productdata`: existing JSONB item container. PO Bills retain their existing
  PO-product shape. Expense Bills use direct expense-line objects with
  description/name, quantity, unitPrice and total. `poquantity` and PO line
  matching do not apply to expense lines.

For a Supplier-less bill, `payeename` is used as a document snapshot
when the business needs a counterparty name without creating a Supplier master.
It is never a replacement for `supplierid` in Supplier Statements.

## Service boundaries

- **PO Bill service:** remains PO-only and must not accept an Expense Bill.
- **Direct Bill service:** validates expense fields, selected ledger, optional
  supplier, direct lines and server-calculated totals.
- **Direct Bill history:** lists all `expense` Bills. The supplier-less
  outstanding view is deliberately separate from the all-Bills history so it
  only offers direct Cash/Bank settlement for Bills without a Supplier.
- **Shared Bill utilities:** payment-state calculation, settlement allocation,
  Cash/Bank allocation records and modification locks.
- **Effective supplier resolver:** returns PO supplier for inventory Bills and
  `poinvoice.supplierid` for expense Bills. Supplier payment, outstanding bill,
  statement and Supplier On Account queries must use it.

## Payment and accounting

Existing PO Bill creation does not create an accrual journal. This implementation
does not alter that behavior. Payments continue to debit `SYS-AP`, credit the
selected Bank/Cash ledger, optionally credit TDS Payable, create a
`purchase_bill` allocation, and update the Bill balance/status.

Supplier-backed Direct Expense Bills use the existing Supplier payment workflow.
Supplier-less Direct Expense Bills use the same internal allocation/posting
operation with no supplier party fields and no Supplier On Account or
supplier-specific TDS option.

If authoritative accrual journals are later required, Bill posting must be
introduced consistently for both PO and Expense Bills:

```text
Dr Expense or Inventory / Dr Input GST
    Cr Accounts Payable
```

That is a separate accounting-release decision, not a Direct Bill-only change.

## Statement behavior

- PO Bill: included under the supplier resolved from its PO.
- Direct Expense Bill with Supplier: included under its `supplierid`.
- Direct Expense Bill without Supplier: excluded from all Supplier Statements.

## Migration and deployment

The migration is idempotent and does not backfill `supplierid`. Historic Bills
remain `inventory` and continue to resolve their supplier through their PO.
The deployment must first reconcile schema drift where a target database already
contains some or all of these columns.

## Required regression coverage

1. PO Bill validation rejects non-PO lines and preserves quantity/total caps.
2. Direct Expense Bill accepts no PO and an optional supplier.
3. Direct Expense Bill rejects inactive/non-expense ledgers.
4. Supplier-backed Direct Bills appear in outstanding Bills and statements.
5. Supplier-less Direct Bills are excluded from supplier endpoints and can be
   settled using the shared Cash/Bank allocation path.
6. Direct Bill history shows both supplier-backed and supplier-less expense
   Bills without including any PO Bill.
7. Existing PO Bill payments, Supplier On Account and statements remain
   unchanged.
