# On Account Of — Reference and Movement Requirement Plan

## 1. Document Status

This is a planning and accounting-reference document only. It does not confirm
that the described APIs, database tables, screens, or posting services are
implemented.

The Customer-to-Customer Journal transfer and later-payment replacement flow
in section 10 is BA-approved as a requirement. Its implementation is not
claimed by this document.

This document extends the Cash and Bank Account Phase 1 requirements so the
**On Account Of** capability can grow safely beyond a single unapplied amount.

## 2. Purpose

An organization may receive money from a Customer or pay money to a Supplier
before selecting an Invoice or Bill. Over time, the same party may have:

- Multiple On Account receipts or payments
- Partial adjustments against multiple documents
- TDS adjustments
- Reversals
- Approved Journal transfers
- Corrections and reclassifications
- Transactions from multiple Bank/Cash accounts

A single mutable balance is not sufficient for this history. Every originating
amount and every later movement needs a stable, navigable reference.

## 3. Terminology

| Term | Meaning |
| --- | --- |
| Reference | Free-text external or internal supporting reference |
| On Account Of | Structured mapping to one existing Customer or Supplier |
| On Account Reference | System-generated identity for one traceable On Account source amount |
| On Account Movement | An immutable increase or decrease recorded against an On Account Reference |
| Available Amount | Amount that remains available for future allocation or approved transfer |
| Bank Portion | Actual money portion applied from On Account; excludes TDS |
| Total Settlement | Bank Portion + TDS amount |

## 4. Stable Reference Number

Every new On Account source must receive a system-generated unique reference.

Proposed display formats:

```text
OA-C-00000001   Customer On Account
OA-S-00000001   Supplier On Account
```

Rules:

- The reference number is immutable and unique within the organization.
- It is different from the Bank Transaction Number, Journal Number, Invoice
  Number, Bill Number, and user-entered Reference.
- The source Bank Transaction or Journal retains its own number and links to the
  On Account Reference by ID.
- Search must support the On Account Reference, party name, transaction number,
  Journal number, document number, and external reference.
- A displayed reference must never be manufactured from Description text.

## 5. Reference Ownership

Each On Account Reference belongs to exactly one:

- Organization
- Party Type: Customer or Supplier
- Party ID from the authoritative Customer/Supplier master
- Currency

A reference cannot be reassigned to another party after posting. A correction
must use reversal and reposting or an explicitly approved transfer workflow.

## 6. Source Creation

### 6.1 Cash/Bank source

When money actually moves through Cash/Bank:

1. Post one normal Cash/Bank transaction.
2. Create its balanced Journal.
3. Create one On Account Reference for the selected Customer/Supplier.
4. Add an immutable `cash_bank_origin` movement that increases the Available
   Amount.
5. Link the movement to the Bank Transaction and its Journal.

The On Account Reference does not replace the Bank Transaction. It tracks how
the already-recorded money remains available and is later used.

### 6.2 Journal-transfer source

An approved Customer-to-Customer Journal may transfer an unused On Account Of
amount from one Customer to another without a new Bank/Cash movement.

Requirements:

- The Journal line must include **On Account Of**, Party Type, Party ID, and On
  Account Reference.
- The Journal must be balanced and use approved control accounts.
- The source reference receives a `journal_transfer_out` movement and the
  destination receives a linked `journal_transfer_in` movement.
- The Cash/Bank available balance remains unchanged.
- An arbitrary manual Journal must not silently create or change On Account
  value without this explicit relationship and backend validation.
- This approval applies to Customer-to-Customer transfer only. Supplier and
  mixed Customer/Supplier transfer types remain outside the approved scope.

## 7. Multiple Entries for the Same Party

A Customer or Supplier may have many On Account References.

Example:

| Reference | Source | Original | Applied | Available |
| --- | --- | ---: | ---: | ---: |
| OA-C-00000010 | BT-00000120 | 20,000.00 | 5,000.00 | 15,000.00 |
| OA-C-00000011 | BT-00000132 | 50,000.00 | 0.00 | 50,000.00 |
| **Party total** |  | **70,000.00** | **5,000.00** | **65,000.00** |

Rules:

- New entries increase the party-level total but do not overwrite or merge the
  source records.
- The UI must show both the aggregate party balance and individual references.
- An adjustment must record exactly which references supplied the amount.
- If automatic consumption is allowed, use a deterministic approved rule such
  as oldest open reference first. The movement history must still identify each
  consumed reference.

## 8. Movement Ledger

The authoritative balance should be explainable from immutable movements.

Minimum movement types:

| Movement Type | Balance Effect | Typical Source |
| --- | ---: | --- |
| `cash_bank_origin` | Increase | Customer receipt or Supplier payment |
| `journal_transfer_in` | Increase | Approved Journal transfer into On Account |
| `document_allocation` | Decrease | Invoice/Bill bank-portion adjustment |
| `journal_transfer_out` | Decrease | Approved Journal transfer out of On Account |
| `reversal` | Opposite of original | Reversal workflow |
| `correction` | Increase/Decrease | Approved migration or controlled correction |

Balance formula:

```text
Available Amount = Total Increase Movements - Total Decrease Movements
```

Stored Original, Applied, and Remaining values may be retained as performance
snapshots, but they must reconcile to the movement ledger.

No posted movement may be edited or deleted. Corrections create new movements.

## 9. Document Adjustment

### 9.1 Customer

- Customer On Account may be adjusted only against eligible Invoices belonging
  to the same Customer.
- The Bank Portion decreases On Account Available Amount.
- TDS Receivable settles the remaining approved Invoice portion through its
  ledger and does not decrease On Account.

Example:

```text
On Account available       ₹50,000
Invoice outstanding        ₹50,000
Bank Portion               ₹45,000
TDS Receivable              ₹5,000
Total Invoice settlement   ₹50,000
On Account remaining        ₹5,000
```

Reclassification:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Customer Advances | 45,000.00 | 0.00 |
| TDS Receivable | 5,000.00 | 0.00 |
| Accounts Receivable | 0.00 | 50,000.00 |

### 9.2 Supplier

- Supplier On Account may be adjusted only against eligible Bills belonging to
  the same Supplier.
- The Bank Portion decreases On Account Available Amount.
- TDS Payable settles the remaining approved Bill portion through its ledger
  and does not decrease On Account.

Example:

```text
On Account available       ₹50,000
Bill outstanding           ₹50,000
Bank Portion               ₹45,000
TDS Payable                 ₹5,000
Total Bill settlement      ₹50,000
On Account remaining        ₹5,000
```

Reclassification:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Accounts Payable | 50,000.00 | 0.00 |
| Supplier Advances | 0.00 | 45,000.00 |
| TDS Payable | 0.00 | 5,000.00 |

### 9.3 Allocation rules

- Full and partial adjustment are allowed.
- One reference may adjust multiple documents.
- One document may consume multiple On Account References.
- Total Bank Portion cannot exceed the selected references' Available Amount.
- Total Settlement cannot exceed the documents' current outstanding amount.
- Documents and references must belong to the same party and organization.
- Currency must match unless a future approved foreign-currency workflow
  supplies an exchange rate and gain/loss treatment.
- Adjustment does not create another Bank/Cash transaction.

## 10. Journal Transfers

Journal transfers are controlled movements, not ordinary edits or free-form
manual Journal lines.

### 10.1 Approved Customer-to-Customer transfer

When the Journal is Customer-related and uses an approved Accounts
Receivable/Customer Advances control-account context, Finance may select a
source Customer and transfer an amount from that Customer's unused On Account
Of balance to a different destination Customer.

Example:

1. Customer **Texve** has `₹1,00,000` available under a traceable On Account
   Reference.
2. Finance transfers `₹1,00,000` to Customer **Clouddesk** through the dedicated
   Journal workflow.
3. Texve receives a linked `journal_transfer_out` movement and Clouddesk
   receives a linked `journal_transfer_in` movement.
4. Clouddesk may use the transferred reference to clear only Clouddesk's
   eligible Invoices through the normal On Account Of allocation flow.

Party-subledger Journal:

| Account and party | Debit | Credit |
| --- | ---: | ---: |
| Customer Advances — Texve | 1,00,000.00 | 0.00 |
| Customer Advances — Clouddesk | 0.00 | 1,00,000.00 |

The control account nets to zero. The Journal transfers ownership of an
already-recorded amount between Customer subledgers; it does not record another
receipt or change any Bank/Cash balance.

### 10.2 Transfer controls

1. A transfer has its own Journal Number and transfer reference.
2. Source Customer, source On Account Reference, destination Customer, and
   destination transferred reference are explicit and immutable after posting.
3. Transfer Out cannot exceed source Available Amount.
4. Both movement records and the balanced Journal post atomically.
5. No Bank/Cash balance is changed.
6. The source transaction and all prior movements remain unchanged.
7. Source and destination Customers must be different, active, in the same
   organization, and use the same currency.
8. The destination reference remains owned by the destination Customer and may
   be allocated only to that Customer's Invoices.
9. Supplier-to-Supplier, Customer-to-Supplier, Supplier-to-Customer, and
   cross-organization transfers are blocked unless separately approved.
10. Party/control-account compatibility is backend validated. A Customer
    transfer cannot be posted through Supplier control accounts.
11. Parent/group/main-heading accounts cannot be selected; only approved actual
    posting accounts are allowed.
12. Admin and Accountant roles have full access to the operation. The backend
    must still enforce the transfer capability and require a client-generated
    idempotency reference.
13. Concurrent allocation and transfer attempts must lock and re-check the
    source Available Amount.
14. Generic manual Journal posting must not bypass On Account validations.

### 10.3 Later destination payment and transfer replacement

If Clouddesk later pays `₹1,00,000` through Bank:

1. Record the Bank receipt once against Clouddesk through the Cash and Bank
   module.
2. Create a separate Bank-origin Clouddesk On Account Reference. The payment
   must not silently overwrite the transferred reference or automatically
   reverse the earlier Journal.
3. Finance may invoke an explicit **Replace Transfer With Payment** action and
   select the earlier transfer.
4. Verify that the later payment belongs to Clouddesk and has sufficient unused
   value for the intended replacement.
5. Reverse/un-clear only the Clouddesk Invoice allocations funded by the
   transferred reference, restoring those Invoice balances and statuses.
6. Create linked reversal movements and the opposite Journal to return the
   amount to Texve:

| Account and party | Debit | Credit |
| --- | ---: | ---: |
| Customer Advances — Clouddesk transferred reference | 1,00,000.00 | 0.00 |
| Customer Advances — Texve restored reference | 0.00 | 1,00,000.00 |

7. Texve's original On Account Of availability is restored and may be applied
   against Texve's Invoices through the normal flow.
8. Clouddesk's later Bank-origin amount remains available for Clouddesk and may
   be applied to its Invoices separately.

The original Bank Transaction, transfer Journal, transfer movements, Invoice
allocations, later Bank receipt, and all reversal records remain visible and
linked. Nothing posted is deleted or rewritten. The replacement must lock every
affected reference, allocation, Invoice, and Journal and commit atomically. If
the dependency chain cannot be safely restored, it must fail without partial
changes and identify the item requiring Finance review.

## 11. Proposed Conceptual Data Model

The existing `party_unapplied_amounts` foundation may be migrated or extended,
but the scalable model needs the following concepts.

### 11.1 On Account Reference header

| Field | Purpose |
| --- | --- |
| ID | Stable primary key |
| Organization ID | Tenant boundary |
| On Account Number | `OA-C-*` or `OA-S-*` display reference |
| Party Type / Party ID | Customer/Supplier ownership |
| Currency | Reference currency |
| Original Source Type / ID | Bank Transaction or approved Journal |
| Original Amount | Initial amount |
| Available Amount | Concurrency-controlled snapshot |
| Status | Open, Partially Applied, Fully Applied, Reversed |
| Version | Optimistic concurrency |
| Audit fields | Created/modified metadata |

### 11.2 On Account movements

| Field | Purpose |
| --- | --- |
| ID | Movement identity |
| On Account Reference ID | Parent reference |
| Movement Type | Origin, allocation, transfer, reversal, correction |
| Direction | Increase or Decrease |
| Amount | Positive movement magnitude |
| Bank Transaction ID | When sourced from Cash/Bank |
| Journal Entry ID / Line ID | Accounting evidence |
| Allocation ID | Invoice/Bill adjustment link |
| Related Reference ID | Transfer counterpart when applicable |
| Idempotency Reference | Prevent duplicate movements |
| Audit fields | Actor and timestamp |

### 11.3 Transfer and replacement relationship

The scalable model must also retain:

- Transfer identity and Journal ID
- Source and destination Customer IDs
- Source and destination On Account Reference IDs
- Paired Transfer Out and Transfer In movement IDs
- Amount and currency
- Status such as Posted, Partially Allocated, Replaced, or Reversed
- Later Bank-origin replacement Reference ID, when selected
- Reversal Journal and reversal movement IDs
- Every downstream Invoice allocation funded by the transferred reference
- Idempotency, actor, timestamps, and reason

### 11.4 Allocation source bridge

When one document consumes multiple references, or one reference settles
multiple documents, a bridge must record:

- On Account Reference ID
- On Account Movement ID
- Bank Transaction Allocation ID
- Document Type / ID / Number
- Bank Portion
- TDS Amount
- Total Settlement
- Status and reversal relationship

## 12. Status and Lifecycle

| Condition | Status |
| --- | --- |
| Available = Original and Applied = 0 | Open |
| Available > 0 and Applied > 0 | Partially Applied |
| Available = 0 | Fully Applied |
| Source transaction reversed | Reversed |

Status is derived from valid movements and should not be freely editable.

## 13. User Interface Plan

### List

Minimum columns:

- On Account Reference
- Date
- Customer/Supplier
- Original Source and Transaction Number
- Original Amount
- Applied Amount
- Available Amount
- Currency
- Status
- Last Movement Date

### Detail

Minimum sections:

- Reference and party header
- Original Cash/Bank transaction or Journal source
- Available balance summary
- Movement timeline
- Invoice/Bill allocations
- Journal transfers
- Reversals and audit information

Available actions are context-sensitive:

- Adjust Against Invoice/Bill
- Transfer through approved Journal workflow
- Replace Transfer With Payment when an eligible later destination-Customer
  Bank-origin reference exists
- Reverse, subject to permission and downstream-allocation rules
- Open source Transaction, Journal, Invoice, Bill, Customer, or Supplier

## 14. Validation, Concurrency, and Idempotency

- Lock the On Account Reference and affected documents while applying or
  transferring an amount.
- Re-read Available and Outstanding amounts inside the transaction.
- Require a client-generated idempotency reference for every posting action.
- Prevent negative Available Amount.
- Prevent duplicate source movements and duplicate active allocation links.
- Allow only one active replacement/reversal chain for a transfer.
- Never infer replacement merely from a later payment; require an explicit
  authorized action selecting both records.
- Post movement, allocation, Journal, document balance, statement effect, and
  audit event atomically.
- A failed operation must leave all balances unchanged.

## 15. Statements and Reporting

Customer and Supplier statements should show On Account separately from
Invoice/Bill outstanding.

Minimum reporting values:

- Opening On Account Available
- Increases from Cash/Bank and Journal transfers
- Decreases from document allocations and Journal transfers
- TDS settled during document allocation
- Closing On Account Available
- Reference-level and party-level totals

An On Account movement must be traceable from the statement to its reference,
source Transaction/Journal, and affected document.

## 16. Migration and Backward Compatibility

- Existing `party_unapplied_amounts` records must receive stable On Account
  References before the new model becomes authoritative.
- Preserve original Bank Transaction IDs, party mapping, amounts, dates,
  references, and statuses.
- Generate opening movements that reconcile exactly to each migrated record's
  current remaining amount.
- Do not rewrite historical Journals merely to populate the new reference.
- Existing APIs may expose compatibility fields while new clients use the
  reference and movement model.

## 17. Minimum Acceptance Scenarios

1. Create multiple Customer On Account receipts and verify the aggregate and
   reference-level balances.
2. Create multiple Supplier On Account payments and verify the same.
3. Fully allocate one reference to one document.
4. Partially allocate one reference and retain its remaining amount.
5. Allocate one reference across multiple documents.
6. Allocate one document from multiple references.
7. Apply Customer TDS Receivable without reducing On Account by the TDS amount.
8. Apply Supplier TDS Payable without reducing On Account by the TDS amount.
9. Transfer `₹1,00,000` from Texve to Clouddesk through Journal without changing
   Bank/Cash and verify the paired reference movements.
10. Reject a transfer greater than Texve's Available Amount.
11. Reject same-Customer, Supplier, mixed-party, cross-organization,
    currency-mismatched, and unauthorized transfers.
12. Allocate the transferred Clouddesk reference only to Clouddesk Invoices.
13. Record Clouddesk's later Bank payment as a separate On Account Reference;
    verify that it does not automatically reverse the transfer.
14. Explicitly replace the transfer with the later payment, reverse/un-clear
    only transfer-funded Invoice settlements, restore Texve's balance, and
    retain Clouddesk's Bank-origin balance.
15. Reject a replacement when linked state cannot be safely restored and verify
    complete rollback.
16. Reverse a valid source or movement without deleting history.
17. Verify duplicate and concurrent requests do not create duplicate effects.
18. Reconcile header snapshots to immutable movements and party totals.

## 18. Decisions Required Before Implementation

1. Whether automatic allocation consumes oldest references first or requires
   explicit user selection.
2. Whether Supplier-to-Supplier or mixed Customer/Supplier transfer types are
   ever permitted; they are excluded until separately approved.
3. Whether one source Bank Transaction can create more than one On Account
   Reference.
4. Foreign-currency and exchange-rate treatment.
5. Final UI confirmation and Finance-review behavior when dependent allocations
   prevent safe replacement; the required atomic reversal outcome is defined.
6. Retention and display rules for fully applied references.
