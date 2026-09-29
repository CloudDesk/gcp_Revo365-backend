# Retail In-store Receipts and Manual Invoice Allocation

## Implemented scope

This Phase 1 slice allows an authorized Admin or Accountant to record money
received against existing Retail In-store sales invoices.

The flow is available from the selected active Bank/Cash account's
**Transactions** tab through **Record receipt**.

## Invoice eligibility

An invoice is eligible when:

- `revoinvoice.invoicefor = product`
- The linked order has `ordername = storepurchase`, or the invoice snapshot has
  `invoicedata.ordername = storepurchase`
- The invoice belongs to the selected existing customer
- The calculated outstanding amount is greater than zero

Customer names are never entered as free text.

The invoice amount is resolved from the same legacy invoice fields used by the
invoice service. This also supports manual Store invoices whose old
`balanceamount` is zero but whose invoice JSON contains the actual total.

## User flow

1. Open an active Bank or Cash account.
2. Open **Transactions**.
3. Select **Record receipt**.
4. Enter the receipt date and received amount.
5. Select an existing customer with outstanding Retail invoices.
6. Select one or more invoices.
7. Enter the allocation for each invoice.
8. The allocated total must exactly equal the received amount.
9. Post the receipt.

TDS is intentionally excluded from this slice.

## Accounting and data updates

The posting is atomic:

```text
Debit  Selected Bank/Cash account
Credit Accounts Receivable
```

It also:

- Creates one posted `bank_transactions` record
- Increases the selected account's running balance
- Creates one posted journal with balanced lines
- Creates one `bank_transaction_allocations` row per selected sales invoice
- Appends the receipt to `revoinvoice.paymentdata`
- Updates `paidamount`, `balanceamount`, `paymentstatus`, and `lastpaymentdate`
- Creates a `finance_audit_events` record

Invoice status uses the existing backend values:

- `pending`
- `partially_paid`
- `paid`

## Safety controls

- Only active Bank/Cash accounts accept receipts.
- All invoices must belong to the selected customer.
- Allocation cannot exceed invoice outstanding.
- Receipt amount must equal the total allocation.
- Duplicate invoice IDs are rejected.
- Backdated posting remains disabled.
- A client-generated request reference prevents duplicate submission.
- The database unique index prevents duplicate active allocations for the same
  transaction and invoice.

## APIs

```text
GET  /finance/retail/customers
GET  /finance/retail/customers/:customerId/outstanding-invoices
POST /finance/bank-accounts/:accountId/transactions/retail-receipt
```

All routes use the existing Cash and Bank permission object.

## Database deployment

Apply this single dated migration in each environment:

```text
src/database/migrations/20260731_cash_bank_retail_receipts.sql
```

It adds the allocation uniqueness control and records:

```text
20260731_cash_bank_retail_receipts_v1
```

No existing invoice or transaction data is changed by the migration.

After deployment:

```bash
npm run verify:finance-foundation
```

Restart the backend before UI testing so the new routes are registered.

## Deferred

- TDS Receivable
- TDS Payable
- Supplier bill payments
- E-commerce advance-to-invoice mapping
- Rental receipts
- In-store Service/SR receipts
- Reversals and refunds
