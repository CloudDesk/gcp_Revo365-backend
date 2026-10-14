# Chart of Accounts — AR, AP and GST Fixes

**Prepared:** 14 October 2026
**Scope:** Requirements 1 (AR/AP details), 6 (GST ledger), 8 (system accounts in
list) and 9 (individual GST accounts)
**Database changes:** None. No new journal postings.

## 1. Requirement status

| # | Requirement | Status |
|---|---|---|
| 1 | AR/AP details show invoices/bills together with receipts/payments | Fixed — one combined history with running balance |
| 6 | GST account shows its transactions in Debit/Credit format | Already working — unchanged |
| 8 | AR, AP and GST accounts listed like other accounts with a small indicator | Fixed — restored after the 13 Oct merge removed it |
| 9 | Six individual GST accounts | Fixed — visible again through requirement 8 |

## 2. What changed

### System accounts in the list (requirements 8 and 9)

- The 13 Oct merge of "CR COA 1" and "COA Changes" dropped the system-account
  condition from the list query, and "Chart of Account Fix 2" then removed the
  leftover `$2` parameter. The list showed user-created accounts only.
- The list again includes Accounts Receivable, Accounts Payable, Output
  CGST/SGST/IGST and Input CGST/SGST/IGST with the **Automatic** indicator.
- System accounts are always listed first, in that order, followed by
  user-created accounts (newest modified first). Filters and search still
  apply; matching system accounts stay on top.
- System accounts cannot be edited, deactivated or deleted (existing backend
  and frontend guards, unchanged).
- New: these eight account types are hidden from the **Create account** type
  dropdown and rejected by the backend, so a duplicate "Accounts Receivable"
  cannot be created manually.

### AR/AP combined history (requirement 1)

Invoice and bill creation does not post to the AR/AP control accounts, so the
old ledger showed payments only. The Ledger Entries tab for AR/AP now shows one
calculated history, newest first, with a running balance:

| Account | Debit | Credit |
|---|---|---|
| Accounts Receivable | Customer invoice | Receipt or On Account applied (reference shows the invoice it settled) |
| Accounts Payable | Payment or On Account applied (reference shows the bill it settled) | Supplier bill |

- A receipt/payment with TDS is one row; the narration shows "Received/Paid
  X + TDS Y".
- Older payments recorded before the finance module are included.
- If a document is marked paid without payment details, an **Adjustment** row
  keeps the balance equal to the document's outstanding amount.
- A payment dated before its invoice is listed after that invoice.
- Cancelled invoices/bills are excluded.
- The separate invoice/bill table and the "Accounting ledger postings" section
  are removed from the AR/AP page.

### Balances (consistency)

- AR/AP balance in the list and on the Overview tab equals the Amount
  Receivable / Amount Payable cards.
- The Amount Payable card was summing bills across all organizations; it now
  uses this organization's bills only.
- With a date filter, AR, AP and GST accounts show that period's movement
  (same as journal-based accounts), and AR/AP are listed when an invoice/bill
  falls in the period.

## 3. Files changed

| Repository | File |
|---|---|
| Backend | `src/services/financeAccount.service.ts` |
| Backend | `src/utils/finance/controlAccountHistory.utils.ts` (new) |
| Backend | `src/tests/financeFoundation.test.ts` |
| Frontend | `src/Pages/V2/ChartOfAccounts/ChartAccountDetail.tsx` |
| Frontend | `src/Pages/V2/ChartOfAccounts/ChartAccountModal.tsx` |
| Frontend | `src/Pages/V2/ChartOfAccounts/types.ts` |

Prerequisite: migration `20261013_chart_accounts_list_system_defaults.sql` must
have been applied (it creates the eight system accounts).

## 4. Manual test steps

### A. System accounts in the list

1. Open Chart of Accounts. Confirm the eight system accounts appear with the
   Automatic indicator and the generic Input GST / Output GST accounts do not.
2. Filter Assets: AR and the three Input GST accounts appear. Filter
   Liabilities: AP and the three Output GST accounts appear.
3. Search "Receivable" and "SYS-AR": AR is returned.
4. Open AR and one GST account: no Edit, Deactivate or Delete; the list
   checkbox cannot be ticked.
5. Click Create account: none of the eight system types are in the dropdown.
6. Manually created accounts can still be created, edited, deactivated and
   deleted as per permissions.

### B. Accounts Receivable history

1. Open Accounts Receivable → Ledger Entries.
2. Pick an unpaid invoice: one Debit row; balance increases.
3. Pick a partly paid invoice: invoice Debit plus receipt Credit rows; the
   receipt row shows "For INV-…".
4. Pick a fully paid invoice: invoice and receipts net to zero for that invoice.
5. Pick a receipt with TDS: narration shows the received amount + TDS.
6. Apply an On Account amount to an invoice: an "On Account" row appears.
7. The latest balance equals the Amount Receivable card, the AR row balance in
   the list, and the Overview tab balance.

### C. Accounts Payable history

Repeat B with supplier bills (bill = Credit, payment = Debit). The latest
balance equals the Amount Payable card.

### D. Date filter

1. In the list, choose "This month". AR, AP and each GST account show only this
   month's amounts.
2. Clear the filter: all-time balances return.

### E. Regression

1. GST accounts still open with the Debit/Credit GST ledger.
2. Bank/Cash and Direct Ledger entries on other accounts are unchanged and
   their transaction rows still open the transaction details.

## 5. Automated checks

- Backend `npm test`: 257 / 257 passed, including four new AR/AP history tests.
- Backend `npm run build`: passed.
- Frontend `tsc --noEmit` and ESLint on changed files: passed.
