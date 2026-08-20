# Journal Module & Accounting Concepts Guide (Plain English & 100% Finance Accurate)

This document is a practical, easy-to-understand guide for developers, product managers, and accountants explaining how the **Journal Module**, **Cash & Bank**, and **Chart of Accounts** work together in our system.

---

> ### 💡 The Core Concept: What is a Journal?
> **A Journal is an exchange of accounting value between 2 or more accounts in the Chart of Accounts.**
> - **NO real cash or bank money moves.**
> - Value is **given by one account (Credit)** and **received by another account (Debit)**.
> - **`Total Value Given (Credit) = Total Value Received (Debit)`**
>
> **Examples of Value Movement:**
> - **Depreciation:** Value moves from *Car Asset (Credit)* $\rightarrow$ *Depreciation Expense (Debit)*.
> - **Reclassification:** Value moves from *Rent Expense (Credit)* $\rightarrow$ *Electricity Expense (Debit)*.
> - **Accrual:** Value moves from *Salary Payable (Credit)* $\rightarrow$ *Salary Expense (Debit)*.
> - **Loan:** Value moves from *Car Loan Liability (Credit)* $\rightarrow$ *Car Asset (Debit)*.

---

## ⚡ 30-Second Developer Quick Cheat Sheet

| Feature / Action | When to use | Related Entry Picker | Affects Bank? | Example |
|---|---|:---:|:---:|---|
| **General entry** | Brand new standalone non-cash adjustment | **HIDDEN** | ❌ NO | Asset depreciation, buying asset on loan, inventory write-off |
| **Accrual / new entry** | Record expense/revenue **now** before bank payment **later** | **HIDDEN** | ❌ NO | Month-end Salary Expense Dr / Salary Payable Cr |
| **Reclassification** | Move an amount from Account A to Account B (already paid/posted) | **REQUIRED** | ❌ NO | Splitting ₹10,000 from Rent to Amenities after paying ₹50,000 |
| **Correction** | Adjust an error, under-posting, or over-estimate on a past entry | **REQUIRED** | ❌ NO | Adding ₹2,000 extra depreciation or reducing ₹2,000 excess EB accrual |
| **Reverse Journal** | 100% cancel an erroneous posted journal back to ₹0.00 | **AUTOMATIC** (1-Click) | ❌ NO | Completely cancelling duplicate or mistaken posted journal |
| **Cash & Bank Direct Ledger** | Real money physically enters or leaves the Bank account | *N/A* (Bank is automatic) | ✅ **YES** | Paying ₹50,000 rent from HDFC Bank, paying ₹10,000 salary |

---

## 1. Cash & Bank Direct Ledger vs. Journal Entry

| Feature | Cash & Bank Direct Ledger | Journal Entry (Manual Journal) |
|---|---|---|
| **Does money move in Bank/Cash?** | **YES** (Bank/Cash balance changes) | **NO** (Zero bank movement, non-cash) |
| **Where to record?** | Cash & Bank Accounts module | Journal module |
| **Number of lines entered** | **1 line** (The system automatically knows the Bank account is the other side) | **2 or more lines** (You manually specify both Debit and Credit accounts) |
| **Primary purpose** | Actual deposits, withdrawals, vendor payments, customer receipts, office expenses paid by cash/bank | Accruals, depreciation, expense reclassification, accounting corrections, year-end adjustments |

---

## 2. Why Does "Debit" in Bank Appear as "Credit" on Chart of Accounts?

In **Double-Entry Accounting**, every transaction must have two equal and opposite sides (`Total Debit = Total Credit`):

| If in Cash & Bank you do: | Bank Account Side | Chart of Accounts (Counterparty) Side |
|---|---|---|
| **Deposit / Money Received** | Bank is **Debited (+)** *(Bank asset increases)* | Counterparty is **Credited (-)** *(e.g., Sales / Income increases)* |
| **Withdrawal / Money Paid** | Bank is **Credited (-)** *(Bank asset decreases)* | Counterparty is **Debited (+)** *(e.g., Rent Expense increases)* |

---

## 3. The 4 Journal Purposes Explained with Real-World Examples

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             JOURNAL PURPOSES                                │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ 1. GENERAL ENTRY              │ 2. ACCRUAL / NEW ENTRY                      │
│    • Standalone non-cash      │    • Record expense/revenue NOW before      │
│      adjustments              │      bank payment happens LATER             │
│    • No related entry needed  │    • No related entry needed                │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ 3. RECLASSIFICATION           │ 4. CORRECTION                               │
│    • Move an existing posted  │    • Fix an error in an earlier entry       │
│      expense/asset to another │    • Requires linking to the original       │
│    • Requires linking to the  │      posted transaction                     │
│      original transaction     │                                             │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

---

### Purpose 1: General Entry (Standalone Non-Cash Adjustments)

#### Example A: Asset Depreciation (Wear & Tear)
You bought a Car for ₹10,00,000. After 1 year, it lost ₹10,000 in value.
- **Did money leave your bank?** No.
- **How to record in Journal (General entry):**
  - **Line 1:** `Depreciation Expense` $\rightarrow$ **Debit ₹10,000** *(Records expense in Profit & Loss)*
  - **Line 2:** `Car (Asset)` $\rightarrow$ **Credit ₹10,000** *(Reduces Car value on Balance Sheet from ₹10L to ₹9.9L)*

#### Example B: Buying an Asset on Loan / EMI
You buy a ₹10,00,000 Car with ₹2,00,000 down payment and ₹8,00,000 loan:
1. **Down payment (Cash & Bank):** Pay ₹2,00,000 to `Car` account from Bank.
2. **Loan part (Journal - General entry):**
   - Line 1: `Car (Asset)` $\rightarrow$ **Debit ₹8,00,000**
   - Line 2: `Car Loan (Liability)` $\rightarrow$ **Credit ₹8,00,000**
   *(Now Car asset = ₹10,00,000, and Car Loan liability = ₹8,00,000)*
3. **Monthly EMI payment (Cash & Bank):** Pay ₹20,000 to `Car Loan` account each month until loan balance reaches ₹0!

---

### Purpose 2: Accrual / New Entry (Recognizing Expenses Before Payment)

> **Accounting Rule:** Expenses and revenues must be recorded in the exact month they happen, NOT when the cash is paid.

#### Example: August Staff Salary Paid on September 5th
- **Total Salary:** ₹1,00,000 for August work.
- **Payment Date:** September 5th from HDFC Bank.

#### Step 1: On 31st August $\rightarrow$ Create Accrual Journal in Journal Module
- **Line 1:** `Salary Expense` (Expense) $\rightarrow$ **Debit ₹1,00,000** *(August books record the expense)*
- **Line 2:** `Salary Payable` (Other Current Liability) $\rightarrow$ **Credit ₹1,00,000** *(Company acknowledges debt)*

#### Step 2: On 5th September $\rightarrow$ Pay from Cash & Bank
- In **Cash & Bank $\rightarrow$ Direct Ledger Entry**: Pay ₹1,00,000 to `Salary Payable`.
- **Bank:** Credited ₹1,00,000 *(Money leaves bank)*.
- **Salary Payable:** Debited ₹1,00,000.

#### How `Salary Payable` Tallies to ₹0.00:
| Date | Module | Entry | Debit | Credit | Running Balance |
|---|---|---|:---:|:---:|:---:|
| **31 Aug** | **Journal** *(Accrual)* | Journal Entry | — | **₹1,00,000** | **₹1,00,000 (Owed)** |
| **05 Sep** | **Cash & Bank** *(Direct Ledger)* | Bank Payment | **₹1,00,000** | — | **₹0.00 (Cleared)** |

---

### Purpose 3: Reclassification (Moving Between Accounts Without Touching Bank)

> **Accounting Rule:** Moving an amount from one account to another account because it was categorized under the wrong name earlier.

#### Case A: Reclassifying a Bank Payment (Lump-sum Payment Adjustment)

**The Business Situation:**
You paid **₹50,000** to your landlord from Bank (`BT-00000066`). At the time of payment, the full amount was recorded as `Rent Expense`. Later, upon receiving the detailed invoice, you discover:
- **₹40,000** was for actual Rent.
- **₹10,000** was for Common Amenities (`Miscellaneous Workspace Expenses` - parking, lift, cafeteria).

**How to fix it via Reclassification:**
- **Do NOT touch Bank:** The ₹50,000 real money payment from the bank was 100% correct.
- **In Journal Module $\rightarrow$ Create Journal:**
  - **Purpose:** `Reclassification`
  - **Related Entry:** Select `JE-00000070` (`BT-00000066` Rent ₹50,000).
  - **Description:** `Reclassify ₹10,000 amenities portion from rent payment`.
  - **Line 1:** `Miscellaneous Workspace Expenses` $\rightarrow$ **Debit ₹10,000** *(Adds ₹10,000 to Amenities)*
  - **Line 2:** `Rent Expense` $\rightarrow$ **Credit ₹10,000** *(Reduces Rent from ₹50,000 to ₹40,000)*

**Exact Before & After Ledger Balances:**
| Account | Before Reclassification | Reclassification Journal | After Reclassification |
|---|:---:|:---:|:---:|
| **Rent Expense** | ₹50,000.00 | **Credit ₹10,000.00** | **₹40,000.00 (Correct!)** |
| **Miscellaneous Workspace Expenses** | ₹0.00 | **Debit ₹10,000.00** | **₹10,000.00 (Correct!)** |
| **Cash & Bank Balance** | -₹50,000.00 | *Untouched* | **-₹50,000.00 (Zero duplicate!)** |

> **Note on Upfront Split vs. Reclassification:**
> - If you knew the breakdown **before paying**: You could create two separate Accrual Journals upfront (Rent ₹40K / Amenities ₹10K) and pay both from Bank.
> - If you paid the ₹50,000 **first** in one shot: You use **Reclassification** to cleanly adjust the ₹10,000 split afterwards without modifying past bank statements.
> - **Both paths result in the exact same 100% accurate financial balances.**

STEP 1: In Cash & Bank
─────────────────────────────────────────────────────────────────────────────
• You pay ₹50,000 to Landlord under "Rent Expense".
• (Bank balance decreases by ₹50,000; "Rent Expense" becomes ₹50,000).

                         ▼
STEP 2: In Journal Module (ONLY 1 Journal Created)
─────────────────────────────────────────────────────────────────────────────
• You create ONLY ONE Reclassification Journal:
    - Line 1: Miscellaneous Workspace Expenses ──► Debit  ₹10,000
    - Line 2: Rent Expense                     ──► Credit ₹10,000

                         ▼
RESULT (Everything is 100% Sorted!):
─────────────────────────────────────────────────────────────────────────────
• Rent Expense                   = ₹40,000.00  (₹50K minus ₹10K)
• Miscellaneous Workspace Expenses = ₹10,000.00  (New balance)
• Cash & Bank Paid               = ₹50,000.00  (Untouched)


---

#### Case B: Reclassifying an Earlier Manual Journal
Last month, you created a Manual Journal placing ₹15,000 into `Office Supplies Expense`. Today, you realize ₹5,000 of that was actually `Software Subscription`:
- **In Journal Module $\rightarrow$ Create Journal:**
  - **Purpose:** `Reclassification`
  - **Related Entry:** Select `JE-00000093` (`Manual Journal` Office Supplies ₹15,000).
  - **Line 1:** `Software Subscription` $\rightarrow$ **Debit ₹5,000** *(Adds ₹5,000 to Software)*
  - **Line 2:** `Office Supplies Expense` $\rightarrow$ **Credit ₹5,000** *(Reduces Office Supplies from ₹15,000 to ₹10,000)*
- **Result in Ledgers:**
  - `Office Supplies Expense` balance: ₹15,000 - ₹5,000 = **₹10,000.00**
  - `Software Subscription` balance: **₹5,000.00**

---

### Purpose 4: Correction (Fixing Errors, Miscalculations, or Changed Actuals)

> **Accounting Rule:** An adjusting journal used to **fix an error or miscalculation in an earlier posted entry** (such as adjusting an estimated accrual when the actual bill arrives, or fixing an under/over-posting) without deleting or altering past accounting history.

---

#### Case A: Adjusting an Over-Estimated Accrual (Reducing Excess by ₹2,000)
**The Situation:**
On 31st August, you estimated and accrued **₹12,000** for Electricity (`JE-00000097`):
- `Electricity Expense`: Debit ₹12,000
- `Electricity Expenses Payable`: Credit ₹12,000

On 10th September, the actual Electricity Board bill arrives and is only **₹10,000** (you over-accrued by **₹2,000**).

**How to enter in the Correction Modal:**
- **Purpose:** `Correction`
- **Related Entry:** Select `JE-00000097`.
- **Description:** `Correction: Adjust ₹2,000 excess electricity accrual to match actual bill`.

**Lines Table (Reducing the ₹2,000 excess):**
| Row | Account | Debit | Credit | What this does: |
|:---:|---|:---:|:---:|---|
| **Row 1** | **`Electricity Expenses Payable`** | **2000** | — | Reduces the liability you owe by ₹2,000. |
| **Row 2** | **`Electricity Expense`** | — | **2000** | Reduces the recorded expense by ₹2,000. |

**Result in Ledgers:**
| Account | Initial Accrual | Correction Journal | Net True Balance |
|---|:---:|:---:|:---:|
| **Electricity Expense** | ₹12,000.00 (Dr) | **₹2,000.00 (Cr)** | **₹10,000.00 (True Expense!)** |
| **Electricity Expenses Payable** | ₹12,000.00 (Cr) | **₹2,000.00 (Dr)** | **₹10,000.00 (True Bill to Pay!)** |

---

#### Case B: Adding an Under-Recorded Calculation (Adding Extra ₹2,000)
**The Situation:**
You posted a Depreciation entry `JE-00000089` for **₹10,000**, but later discovered the true asset depreciation should be **₹12,000** (short by **₹2,000**).

**How to enter in the Correction Modal:**
- **Purpose:** `Correction`
- **Related Entry:** Select `JE-00000089`.
- **Description:** `Correction: Add ₹2,000 under-depreciated amount for Car`.

**Lines Table (Adding the extra ₹2,000):**
| Row | Account | Debit | Credit | What this does: |
|:---:|---|:---:|:---:|---|
| **Row 1** | **`Depreciation Expense`** | **2000** | — | Adds ₹2,000 more to Depreciation Expense. |
| **Row 2** | **`Car` (Asset)** | — | **2000** | Reduces the Car asset value by another ₹2,000. |

**Result in Ledgers:**
| Account | Initial Entry (`JE-00000089`) | Correction Entry | Net True Balance |
|---|:---:|:---:|:---:|
| **Depreciation Expense** | ₹10,000.00 (Dr) | **₹2,000.00 (Dr)** | **₹12,000.00 (True Expense!)** |
| **Car (Asset)** | -₹10,000.00 (Cr) | **-₹2,000.00 (Cr)** | **-₹12,000.00 (True Reduction!)** |

---

## 4. Reclassification vs. Reverse: How to Choose?

| Scenario | Reclassification | Reverse |
|---|---|---|
| **What it does** | **Moves only a specific portion** (e.g., ₹5,000 out of ₹15,000) from Account A to Account B. | **Cancels 100% of the entire entry** back to ₹0.00. |
| **When to use** | Part of the entry was correct (₹10,000 valid), but part was in the wrong category (₹5,000). | The entire entry was completely mistaken, duplicate, or invalid. |
| **How it works** | Creates an adjustment journal transferring between Account A and Account B. | Creates a new linked journal with all Debit and Credit lines swapped. |

#### Decision Rule:
- **Want to wipe out the whole entry?** $\rightarrow$ Click **Reverse**.
- **Want to move an amount from Account A to Account B?** $\rightarrow$ Create a **Reclassification** journal.

---

## 5. Reverse Journal (Cancelling a Posted Journal in Full)

> **The Golden Law of Accounting Audits:**
> **A Posted Journal is 100% PERMANENT and IMMUTABLE. It can NEVER be edited or deleted.**
> 
> In all standard financial software (SAP, Oracle, QuickBooks, Zoho, and our system), allowing anyone to delete or edit posted accounting records is strictly illegal. It destroys audit trails and opens risks of financial fraud. The only legally compliant way to cancel an erroneous posted journal is to create an **Exact Opposite Entry (Reversal)** that restores account balances back to their previous state.

---

### How the Reverse Mechanism Works Behind the Scenes:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       REVERSE JOURNAL ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Original Journal (JE-00000089):                                          │
│    • Remains permanently in the audit log.                                  │
│    • Status changes from "Posted" ──► "Reversed".                           │
│    • Reverse button is automatically disabled to prevent duplicate reversals│
│                                                                             │
│ 2. System Generates a NEW Linked Journal (JE-00000090):                     │
│    • Source is classified as "Journal Reversal".                            │
│    • reversalofid is linked directly to JE-00000089.                        │
│    • All lines are copied with DEBIT and CREDIT SWAPPED.                    │
│    • Automatically posted to the ledger immediately.                        │
│                                                                             │
│ 3. Account Balances Zero Out:                                               │
│    • The opposite Debit/Credit completely offsets the original numbers.     │
│                                                                             │
│ 4. 1-Click Bidirectional Audit Navigation:                                  │
│    • From Original: Click "Reversed by JE-00000090" to view reversal.       │
│    • From Reversal: Click "Reversal of JE-00000089" to view original.       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Step-by-Step Numerical Walkthrough:

Suppose you posted a Manual Journal **`JE-00000089`** for ₹10,000 Car Depreciation:

#### Step 1: The Original Posted Journal (`JE-00000089`)
| Line | Account | Account Type | Debit | Credit |
|:---:|---|---|:---:|:---:|
| Line 1 | `Depreciation Expense` | Expense | **₹10,000.00** | — |
| Line 2 | `Car` | Fixed Asset | — | **₹10,000.00** |

*Ledger State before reversal:* `Depreciation Expense = ₹10,000.00`, `Car = ₹9,90,000.00`.

---

#### Step 2: You Click "Reverse" $\rightarrow$ System Creates `JE-00000090`
The system automatically creates a mirror-opposite Journal:

| Line | Account | Account Type | Debit | Credit | Why it changed: |
|:---:|---|---|:---:|:---:|---|
| Line 1 | `Depreciation Expense` | Expense | — | **₹10,000.00** | **Credit** (Cancels out previous ₹10K Debit) |
| Line 2 | `Car` | Fixed Asset | **₹10,000.00** | — | **Debit** (Restores the ₹10K Car Asset value) |

---

#### Step 3: Final Balance Sheet & Profit/Loss Result
| Account | Original Entry (`JE-89`) | Reversal Entry (`JE-90`) | Net Account Balance |
|---|:---:|:---:|:---:|
| **Depreciation Expense** | +₹10,000.00 (Dr) | -₹10,000.00 (Cr) | **`₹0.00` (Cancelled!)** |
| **Car (Asset)** | -₹10,000.00 (Cr) | +₹10,000.00 (Dr) | **`₹10,00,000.00` (Restored!)** |

---

### Key Protections Enforced by the System:
1. **Single Reversal Constraint:** A PostgreSQL partial unique index ensures that an entry can only be reversed **once**, preventing race conditions or duplicate clicks.
2. **Cannot Reverse a Reversal:** A Reversal Journal itself cannot be reversed again.
3. **Cannot Reverse a Draft:** Only `posted` entries can be reversed.
4. **Drafts have no Reversal:** Unwanted Drafts are simply edited or discarded.



---

## 6. Why We Need the "+ Add Line" Button (Compound Entries)

Journals often involve **more than 2 accounts**. The `+ Add line` button allows splitting amounts:

#### Example: Payroll with TDS and PF Deductions
- Gross Salary: ₹1,00,000
- TDS Tax Deducted: ₹10,000
- PF Deducted: ₹12,000
- Net Payable: ₹78,000

| Line | Account | Account Type | Debit | Credit |
|:---:|---|---|:---:|:---:|
| **1** | Salary Expense | Expense | **₹1,00,000** | — |
| **2** | TDS Payable | Liability | — | **₹10,000** |
| **3** | PF Payable | Liability | — | **₹12,000** |
| **4** | Salary Payable | Liability | — | **₹78,000** |
| **TOTALS** | | | **₹1,00,000** | **₹1,00,000** |

---

## 7. How Chart of Accounts Types Work

When creating accounts in Chart of Accounts, select the appropriate Category & Type:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CHART OF ACCOUNTS SETUP                             │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ For Expenses                  │ • Salary Expense, Rent Expense, Depreciation│
│                               │ • Account Type: Expense / Other Expense     │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ For Liabilities / Payables    │ • Salary Payable, Audit Fees Payable        │
│                               │ • Account Type: Other Current Liability     │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ For Fixed Assets              │ • Car, Office Equipment, Computers          │
│                               │ • Account Type: Fixed Asset                 │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ For Prepaid Expenses          │ • Prepaid Insurance, Prepaid Rent           │
│                               │ • Account Type: Other Current Asset         │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

> **Note:** Customers and Suppliers are **NOT** created as Chart of Accounts records. They are managed in Customer/Supplier masters and automatically use the central Accounts Receivable (AR) and Accounts Payable (AP) control accounts.

---

## 8. Frequently Asked Questions & Clarifications

### Q1: Does creating a Chart of Account automatically create a Payable and Receivable under it?
**No.** Accounts in the Chart of Accounts are 1-to-1 standalone entities. Most accounts (e.g. Car, Depreciation, Bank, Cash) never have payables or receivables. If you need a payable (e.g., `Salary Payable`), you create it explicitly under `Other Current Liability`.

### Q2: Why does a saved Draft show ₹0.00 balance in the Chart of Accounts?
**Drafts have zero accounting effect.** Until an accountant clicks **Post**, the draft is just a work-in-progress note. As soon as you click **Post**, the ledger entries and account balances update immediately.

### Q3: When is balancing strictly enforced?
- **In Draft:** You can save unbalanced lines temporarily (e.g., Debit ₹10,000 / Credit ₹1,000) so you don't lose your work.
- **In Post:** Strictly blocked! The **Post** button is disabled until `Total Debit == Total Credit` (Difference = ₹0.00) with at least 2 valid lines.

### Q4: How does buying a Car on EMI work across modules?
1. **Down Payment (Cash & Bank):** Pay down payment from Bank to `Car` (Fixed Asset).
2. **Loan Financed Part (Journal - General Entry):** `Car` Dr / `Car Loan` (Liability) Cr.
3. **Monthly EMI (Cash & Bank):** Pay monthly EMI from Bank to `Car Loan` (reducing loan liability each month until ₹0).

### Q5: What if an error was entered in the Cash & Bank module?
- **Wrong Category (Money amount correct):** Do not touch Cash & Bank. Create a **Reclassification Journal** to move the amount from the wrong account to the right account.
- **Wrong Side (Recorded Deposit instead of Withdrawal):** In Cash & Bank, record an offsetting transaction (opposite side) against the same account to cancel the error back to ₹0.00, then record the correct transaction.

