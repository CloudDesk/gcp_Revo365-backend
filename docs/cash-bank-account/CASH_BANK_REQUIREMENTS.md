# Cash and Bank Account Module Requirement

## Manual Bank Entry, Auto Balance Calculation and Invoice/Bill Allocation

## Who

For:

- Admin
- Accounting Team
- Finance Team

## Context

We need a new tab for:

- Cash
- Credit Card
- Bank Account

This module will be used to create and maintain the organization’s own bank and
cash accounts.

When the user adds a bank or cash account for the first time, the user will
enter the Opening Balance.

After that, when the user enters bank entries manually, the system should
automatically calculate the Available Balance based on the opening balance and
all upcoming transactions.

The user should manually enter only:

- Date
- Account Name
- Debit amount or Credit amount

The user should not manually enter the available balance.

If the selected Account Name is a customer or vendor and pending
invoices/bills are available, the system should show an allocation popup. The
user should manually allocate the bank entry amount against pending invoices or
bills.

If TDS is applicable, the allocation popup should also allow the user to select
TDS Applied as Yes/No and enter the TDS Amount.

## Objective

Create a Cash and Bank Account Module where the user can:

- Update bank balance, receivable, payable, and reports.

## Why

This module is required because the organization may have multiple bank
accounts and cash accounts.

The accounting team should be able to maintain entries for each account
separately.

Also, when the bank entry is related to a customer or vendor, the amount should
be properly allocated against pending invoices or bills. This will keep
receivable and payable reports accurate.

## Post-Development Scenario

1. After development, the user opens the Cash and Bank Account module.
2. The user clicks **Add Bank Account** and creates a bank or cash account.
3. While adding the account, the user enters the opening balance.
4. After saving, the account appears in the Cash and Bank Account list.
5. The user clicks a particular account, for example, SBI Bank.
6. The SBI Bank ledger screen opens.
7. The user enters bank entries row by row using Date, Account Name, and
   Debit/Credit amount.
8. The system automatically calculates Available Balance after each entry.
9. If the Account Name selected is a customer or vendor and pending
   invoices/bills exist, the system opens an allocation popup.
10. The user allocates the amount manually against pending invoices or bills.
11. If TDS is applicable, the user selects TDS Applied as Yes and enters the
    TDS Amount.
12. The system allows posting only when the bank entry amount and allocation
    amount match.

## 1. Module Name

**Cash and Bank Account**

## 2. Main Page Layout

### Cash and Bank Account

The **Add Bank Account** button should be shown in the left corner.

## 3. Add Bank Account Form Layout

### Add Bank Account

| Field Name | Requirement |
| --- | --- |
| Account Type | Bank / Cash |
| Account Name | Enter bank or cash account name |
| Bank Name | Required only for bank account |
| Account Number | Required only for bank account |
| IFSC Code | Required only for bank account |
| Branch Name | Optional |
| Opening Balance | Mandatory |
| Opening Balance Date | Mandatory |
| Status | Active / Inactive |

If Account Type is Cash, then Bank Name, Account Number, and IFSC are not
required.

## 4. Selected Bank Entry Screen Layout

When the user clicks one bank account, that bank’s transaction screen should
open.

Example: **SBI Bank**

| Opening Balance | Current Available Balance |
| ---: | ---: |
| 1,684.79 | 184.79 |

## 5. Manual Entry Rule

In the bank entry row, the user should manually enter only:

- Date
- Account Name
- Debit amount or Credit amount

Available Balance should be auto-calculated by the system.

The user should not manually edit Available Balance.

## 6. Debit and Credit Meaning

In this bank entry screen:

- **Debit** = Money coming into bank
- **Credit** = Money going out from bank

## 7. Available Balance Calculation

Available Balance should be calculated automatically.

Formula:

```text
Available Balance = Previous Available Balance + Debit Amount - Credit Amount
```

## 8. Account Name Search Rule

The Account Name field should be searchable.

If the user types one letter, related accounts should be shown.

Example:

If the user types **S**, the system should show accounts like:

- Software Subscriptions Charges
- Salary Payable
- Sundar Enterprises

The user can select the required account from the list.

## 9. Entry Validation Rules

- Date is mandatory.
- Account Name is mandatory.
- Either Debit or Credit amount is mandatory.
- Debit and Credit should not both have a value in the same row.
- Debit and Credit should not both be zero.
- Available Balance should be system-calculated only.
- The user should not manually edit Available Balance.
- If Debit is entered, Available Balance should increase.
- If Credit is entered, Available Balance should decrease.

## 10. Pending Invoice/Bill Allocation Rule

If the selected Account Name is a customer or vendor and pending
invoices/bills exist, the system should open an allocation popup after entering
the Debit/Credit amount.

The user can manually allocate the amount against pending invoices or bills.

Posting should be allowed only if:

```text
Bank Entry Amount = Total Allocation Amount
```

If the amounts are not equal, the system should not allow posting.

## 14. Allocation Against Bills Popup Layout

### Pending Invoices/Bills

| Document No | Document Date | Document Amount | Balance Amount | Allocation Amount | TDS Applied | TDS Amount | Total Settled Amount |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| INV/BILL-001 | DD/MM/YYYY | 5,000.00 | 5,000.00 | 0.00 | Yes / No | 0.00 | 0.00 |
| INV/BILL-002 | DD/MM/YYYY | 5,000.00 | 5,000.00 | 0.00 | Yes / No | 0.00 | 0.00 |

## 15. Allocation Against Bills Field Meaning

- **Allocation Amount** means the actual amount received or paid through bank.
- **TDS Applied** means whether TDS is applicable for that invoice or bill.
- **TDS Amount** means the TDS value entered manually by the user.
- **Total Settled Amount** means Allocation Amount + TDS Amount.

## 16. Allocation Against Bills Formula

For each invoice or bill:

```text
Total Settled Amount = Allocation Amount + TDS Amount
```

For a customer receipt:

```text
Accounts Receivable Reduction = Allocation Amount + TDS Amount
```

For a vendor payment:

```text
Accounts Payable Reduction = Allocation Amount + TDS Amount
```

## 17. Customer Receipt with TDS Example

The invoice amount is ₹1,00,000.

The customer paid ₹90,000 into the bank and deducted ₹10,000 as TDS.

| Document No | Document Amount | Balance Amount | Allocation Amount | TDS Applied | TDS Amount | Total Settled Amount |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| INV-001 | 1,00,000.00 | 1,00,000.00 | 90,000.00 | Yes | 10,000.00 | 1,00,000.00 |

| Bank Entry Amount | Total Allocation Amount | Total TDS Amount | Total Settled Amount | Difference |
| ---: | ---: | ---: | ---: | ---: |
| 90,000.00 | 90,000.00 | 10,000.00 | 1,00,000.00 | 0.00 |

### Accounting Impact

| Account | Debit | Credit |
| --- | ---: | ---: |
| Selected Bank Account | 90,000.00 | 0.00 |
| TDS Receivable | 10,000.00 | 0.00 |
| Accounts Receivable / Customer Ledger | 0.00 | 1,00,000.00 |

## 18. Vendor Payment with TDS Example

The vendor bill amount is ₹1,00,000.

We paid ₹90,000 through the bank and deducted ₹10,000 as TDS.

| Document No | Document Amount | Balance Amount | Allocation Amount | TDS Applied | TDS Amount | Total Settled Amount |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| BILL-001 | 1,00,000.00 | 1,00,000.00 | 90,000.00 | Yes | 10,000.00 | 1,00,000.00 |

| Bank Entry Amount | Total Allocation Amount | Total TDS Amount | Total Settled Amount | Difference |
| ---: | ---: | ---: | ---: | ---: |
| 90,000.00 | 90,000.00 | 10,000.00 | 1,00,000.00 | 0.00 |

### Accounting Impact

| Account | Debit | Credit |
| --- | ---: | ---: |
| Accounts Payable / Vendor Ledger | 1,00,000.00 | 0.00 |
| Selected Bank Account | 0.00 | 90,000.00 |
| TDS Payable | 0.00 | 10,000.00 |

## 19. Validation Rule for Allocation

For bank matching, the amount entered in the bank entry row should match the
Total Allocation Amount, not the Total Settled Amount.

Example:

If the bank entry amount is ₹90,000:

- Total Allocation Amount should be ₹90,000.
- TDS Amount can be ₹10,000.
- Total Settled Amount will be ₹1,00,000.

This is valid because the actual bank amount is ₹90,000.

## 20. Allocation Against Bills Matching Rule

| Condition | System Action |
| --- | --- |
| Bank Entry Amount = Total Allocation Amount | Allow posting |
| Bank Entry Amount ≠ Total Allocation Amount | Do not allow posting |
| Difference = 0 | Save button enabled |
| Difference not 0 | Save button disabled |
| Allocation amount greater than pending balance | Do not allow |
| TDS Applied = No | TDS Amount should be 0.00 or disabled |
| TDS Applied = Yes | TDS Amount should be editable |
| No allocation entered when bills/invoices are pending | Do not allow posting |

Error message:

> Allocated amount does not match the bank entry amount. Please allocate the
> full amount before posting.

## 21. Partial Allocation Rule

Partial allocation should be allowed.

Example:

Bank payment amount = ₹10,000.

| Bill No | Balance Amount | Allocation Amount | Status After Posting |
| --- | ---: | ---: | --- |
| BILL-001 | 8,000.00 | 5,000.00 | Partially Paid |
| BILL-002 | 7,000.00 | 5,000.00 | Partially Paid |

Here, the total allocation is ₹10,000, so posting is allowed.

## 22. Full Bill Allocation Rule

If the allocation amount fully clears a bill/invoice, the status should become
Paid.

| Bill/Invoice No | Balance Amount | Allocation Amount | Status After Posting |
| --- | ---: | ---: | --- |
| INV-001 | 5,000.00 | 5,000.00 | Paid |
| INV-002 | 5,000.00 | 5,000.00 | Paid |

## 23. Final Save Rule

If there is no pending invoice/bill allocation needed, the bank entry can be
posted directly.

If pending allocation is required, the system should allow posting only after
the allocation amount matches the bank entry amount.

After successful posting:

- Available Balance should be auto-calculated.
- Bank/cash ledger balance should update.
- Customer/vendor pending balance should update.
- Invoice/bill status should update.
- Receivable/payable reports should update.
- Trial Balance and Balance Sheet should update.

## 24. Available Balance Update Rule

Available Balance should update only after successful posting.

For Debit:

```text
Available Balance = Previous Available Balance + Debit Amount
```

For Credit:

```text
Available Balance = Previous Available Balance - Credit Amount
```

Example:

```text
Previous Balance = ₹10,01,500
Credit payment = ₹10,00,000
Available Balance = ₹1,500
```

## Advance Allocation Method

Use this when an amount is paid or received in advance and no bill/invoice is
selected now.

This amount should be available later for adjustment against vendor bills.

## Direct Ledger Allocation Method

Use this when the selected account is not a customer/vendor bill allocation
case.

## Selection Rule

After the user enters Date, Account Name, and Debit/Credit amount, the system
should show the allocation method based on account type.

| Account Type | Default Allocation Method | User Can Change? |
| --- | --- | --- |
| Customer | Against Invoice / Advance / On Account | Yes |
| Vendor | Against Bill / Advance / On Account | Yes |
| Expense Account | Direct Ledger | No need to change |
| Income Account | Direct Ledger | No need to change |
| Loan Account | Direct Ledger | Yes, if split required |

## Updated Posting Validation

| Allocation Method | Validation Required |
| --- | --- |
| Against Bill / Invoice | Bank entry amount must match total allocation amount |
| Advance | No bill/invoice allocation required |
| On Account | No bill/invoice allocation required |
| Direct Ledger | No bill/invoice allocation required |
