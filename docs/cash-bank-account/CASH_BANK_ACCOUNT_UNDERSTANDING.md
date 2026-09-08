# Cash & Bank Account Module — Requirements Understanding

## Document Purpose

This document records the current functional understanding of the Cash & Bank
Account module, including the corrections provided by the Finance team.

This is the initial requirements baseline. It will be refined after reviewing
the detailed functional documentation and before implementation begins.

## 1. Account Management

The system must allow users to create and manage:

- Bank accounts
- Cash accounts

Each bank or cash account must maintain its own Transactions tab.

## 2. Transactions Tab

The Transactions tab must contain the following fields:

| Field | Description |
| --- | --- |
| Date | Date of the transaction |
| Name | An existing Customer, Supplier, or Chart of Accounts ledger |
| Debit/Credit | Indicates whether the transaction is a debit or credit |
| Invoice/Bill | Outstanding invoices or bills associated with the selected Customer or Supplier |
| TDS Adjustment | TDS Receivable or TDS Payable adjustment applicable to the transaction |
| Amount | Entered transaction amount |
| Running/Available Balance | Balance calculated after applying the transaction |
| Remarks | Optional transaction remarks |

## 3. Name Selection

The Name field must allow the user to select from existing:

- Customers
- Suppliers
- Ledger accounts created under the Chart of Accounts

Manual entry must not be allowed in banking transactions.

## 4. Invoice and Bill Mapping

When a Customer or Supplier is selected, the system must display the related
outstanding invoices or bills.

Each invoice or bill option must show:

- Invoice/Bill number
- Invoice/Bill date
- Outstanding amount

The user must be able to select one or multiple invoices or bills for a
transaction.

The allocation method for transactions mapped to multiple invoices or bills
must be confirmed. Possible methods include:

- Manual allocation
- Oldest outstanding document first
- Another Finance-approved allocation rule

## 5. TDS Adjustments

### 5.1 Supplier Payment

When the selected Name is a Supplier:

- Display the available TDS Payable ledgers.
- Allow the user to select the applicable TDS Payable ledger.
- Allow the user to enter the deducted TDS amount.

### 5.2 Customer Receipt

When the selected Name is a Customer:

- Display a TDS Receivable section or popup.
- Display the available TDS Receivable ledgers.
- Allow the user to select the applicable TDS Receivable ledger.
- Allow the user to enter the TDS amount.

## 6. Settlement and Payment Status

The value used to settle the selected invoice or bill must be calculated as:

```text
Settlement Value = Entered Debit/Credit Amount + TDS Adjustment Amount
```

Based on the calculated Settlement Value and the outstanding amount, the
corresponding invoice or bill payment status must automatically become:

- Fully Paid
- Partially Paid
- Unpaid

When multiple invoices or bills are selected, the status of each document must
be calculated using the amount allocated to that individual document.

## 7. Running/Available Balance

The Transactions tab must show a running balance for each transaction.

The balance must be calculated in transaction order using:

```text
Running Balance = Previous Running Balance + Debit Amount - Credit Amount
```

Therefore:

- Debit increases the account balance.
- Credit decreases the account balance.

The opening balance and the ordering rules for transactions with the same date
must be confirmed in the detailed design.

## 8. E-commerce Transactions

For transactions originating from an e-commerce platform:

- Populate the Customer name automatically.
- Populate the order amount automatically.
- Record the received amount in the Debit column of the bank transaction.
- Make the transaction available for reconciliation against the corresponding
  sales invoice.

## 9. Items Requiring Confirmation

The following items will be confirmed through the detailed functional
documentation and Finance review:

1. Allocation method when multiple invoices or bills are selected.
2. Opening balance source for each bank or cash account.
3. Ordering rule for calculating the running balance when transactions share
   the same date.
4. Treatment of overpayments, advances, refunds, reversals, and transaction
   deletion.
5. Whether an Unpaid status is applicable to a saved transaction with a zero
   settlement value.
6. Currency and exchange-rate handling for foreign-currency accounts.
7. Reconciliation workflow and reconciliation statuses.

## 10. Implementation Status

No implementation decisions are recorded in this document yet. The frontend
screens, backend APIs, database design, validations, permissions, and accounting
journal entries will be defined after the detailed source documentation is
reviewed.
