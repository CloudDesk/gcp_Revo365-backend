# TDS allocation implementation

## Debit receipt — implemented

Retail/manual customer receipts support invoice-level TDS Receivable.

For every selected sales invoice the user can record:

- Bank allocation amount
- TDS Receivable amount

The TDS Receivable amount is entered manually. Selecting a statutory TDS
section is not part of the manual in-store debit receipt flow.

The posting formula is:

```text
Bank debit = sum(allocation amount)
Invoice settlement = allocation amount + TDS Receivable amount
Invoice balance after = outstanding before - invoice settlement
```

Example:

```text
Invoice outstanding     100,000
Bank receipt              50,000
TDS Receivable            10,000
Invoice settlement        60,000
Invoice balance after     40,000
```

Journal:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Selected Bank/Cash | 50,000 | 0 |
| TDS Receivable | 10,000 | 0 |
| Accounts Receivable | 0 | 60,000 |

Each allocation stores the TDS Receivable ledger, bank allocation, TDS amount,
total settled amount and adjustment type. Invoice locking and balance
validation are performed again inside the same database transaction before
posting.

## Credit/payment — planned

Credit-side TDS Payable must reuse the same normalized allocation table with
`documenttype = purchase_bill`, while keeping a separate posting service and UI.
The implementation must cover these three layers together:

1. Supplier and outstanding purchase-bill selection.
2. Per-bill bank allocation, TDS section and TDS Payable amount.
3. Atomic bill balance/status update and balanced journal posting:
   Accounts Payable debit, Bank/Cash credit and TDS Payable credit.

Credit posting must not be enabled until purchase-bill locking, idempotency,
reversal and audit tests are implemented.
