# Phase 3: Customer and Supplier Statement Requirements

## 1. Document Purpose

This document defines the Phase 3 requirements for:

- Sales Customer list and customer details.
- Customer receivable visibility.
- Customer Payments sourced from the Cash and Bank Account module.
- Customer transaction history for Invoices, Customer Payments, Estimates, and
  Delivery Challans.
- Creation of Delivery Challans against existing Invoice line items.
- Customer Statements and Supplier Statements containing the relevant source
  documents and Cash/Bank settlement transactions.

The reference screenshots are used only as general layout references. Features
visible in those screenshots but not explicitly included in this document are
not part of this phase.

## 2. Status and Dependencies

| Item | Value |
| --- | --- |
| Delivery phase | Phase 3 |
| Requirement status | Approved for implementation |
| Implementation status | In progress — base Customer Statement read slice completed |
| Primary dependencies | Customer master, supplier master, sales invoices, supplier bills, estimates, Cash and Bank transactions, document allocations |

Related implementation references:

- [Cash and Bank Phase 1 Implementation Report](../cash-bank-account/CASH_BANK_PHASE_1_IMPLEMENTATION_REPORT.md)
- [Chart of Accounts Requirements](../chart-of-account/CHART_OF_ACCOUNT_REQUIREMENTS.md)

Phase 3 must reuse the existing Cash and Bank transaction, journal, allocation,
TDS, invoice-balance, and bill-balance logic. It must not introduce a second
payment ledger or duplicate payment records in a Customer or Supplier module.

### 2.1 Base Implementation Completed

The first implementation slice establishes:

- Finance-authorized Customer Statement read API.
- Customer validation and date-range validation.
- Chronological Invoice and posted Customer Payment rows.
- Grouped Cash/Bank allocation totals so multi-Invoice payments are not
  duplicated.
- Opening, period Invoice, payment, settlement, TDS, unapplied, and closing
  statement summaries.
- Canonical current Receivable calculated from existing Invoice balances.
- A dedicated permission-controlled Customer Statement list and detail
  workspace that does not reuse the legacy Customer page components.
- A dedicated **Customer Statement** sidebar entry with list and detail routes.
- Default collapsed-sidebar behaviour for the Customer Statement route family,
  consistent with Cash and Bank Accounts and Chart of Accounts.
- Date filters, summary loading states, statement table, pagination, empty
  state, and error state.
- A focused Customer list showing Customer, Business Customer tag, GST,
  Payment Status, and Balance Amount, with Business Customers ordered first by
  the backend.
- Dedicated detail tabs for Overview, Transactions, and Statement, with
  customer information and Receivable summaries.
- Focused automated tests for ordering, running balance, opening balance, and
  India business-date conversion.

This base slice does not mark the full Phase 3 scope complete. Customer Payment
creation from the Customer page, the consolidated Transactions workspace,
Estimates integration, Delivery Challan storage and creation, Supplier
Statement, statement export, and full integration tests remain subsequent
slices.

## 3. Scope

### 3.1 Included

1. Sales Customer list with customer details and current Receivables.
2. Customer detail workspace.
3. Customer Payments list sourced from Cash and Bank transactions.
4. Creation of a Customer Payment from the Customer workspace by reusing the
   existing Cash and Bank Customer Receipt flow.
5. Customer transaction sections for:
   - Invoices
   - Customer Payments
   - Estimates
   - Delivery Challans
6. Delivery Challan creation from an existing Invoice and selected Invoice
   line items.
7. Multiple Delivery Challans against one Invoice, limited by the Invoice
   line's remaining deliverable quantity.
8. Customer Statement containing relevant Invoices and Customer Payment
   transactions.
9. Supplier Statement containing relevant Bills and Supplier Payment
   transactions.
10. Organization, customer, supplier, date, permission, and status scoping.

### 3.2 Excluded

The following are not part of this phase unless separately approved:

- Additional transaction types shown in the reference application.
- Retainer invoices, recurring invoices, credit notes, sales orders, expenses,
  emails, comments, or customer portal features.
- Creating a Delivery Challan without an Invoice.
- Creating a Delivery Challan for a different customer than the Invoice.
- Editing Invoice prices, taxes, discounts, or totals from a Delivery Challan.
- Using a Delivery Challan to update receivables or Cash/Bank balances.
- Creating a separate customer-payment table that duplicates Cash and Bank
  transactions.
- Creating a separate supplier-payment table that duplicates Cash and Bank
  transactions.
- Replacing the existing invoice/bill balance and settlement calculations.
- Parent/child customer or supplier consolidation.
- Multi-currency conversion or exchange gain/loss calculation beyond the
  currency support already implemented by the source modules.

## 4. Core Principles

### 4.1 Single Source of Truth

| Business information | Source of truth |
| --- | --- |
| Customer details | Existing customer master |
| Supplier details | Existing supplier master |
| Invoice amount and balance | Existing sales Invoice record and its successful settlements |
| Bill amount and balance | Existing supplier Bill record and its successful settlements |
| Customer Payment | Existing posted Cash and Bank Customer Receipt transaction |
| Supplier Payment | Existing posted Cash and Bank Supplier Payment transaction |
| Payment-to-document mapping | Existing transaction allocation records |
| Estimate | Existing Estimate module |
| Delivery Challan | New Delivery Challan header and line records created against an Invoice |
| Accounting entry | Existing journal entry and journal line records |

### 4.2 No Duplicate Financial Posting

Opening or displaying a Customer/Supplier Statement must be read-only and must
not create any journal entry, payment, allocation, or document update.

Creating a Customer Payment from the Customer page must call the same posting
workflow used by the Cash and Bank Account module. A successful payment must
produce one Cash/Bank transaction and its existing journal/allocation effects.
The Customer page only provides an additional entry point and filtered view.

### 4.3 Organization Isolation

Every list, lookup, calculation, transaction, statement, and Delivery Challan
must be restricted to the authenticated user's organization. A record ID from
another organization must be treated as unavailable.

## 5. Sales Customer List

### 5.1 Purpose

The Sales Customer list provides a consolidated view of customers and their
current outstanding receivable amounts.

### 5.2 Required Columns

| Column | Description |
| --- | --- |
| Customer Name | Primary customer display name |
| Company Name | Company or business name when available |
| Email | Primary email when available |
| Phone | Primary phone number when available |
| Receivables | Current outstanding Invoice balance for the customer |

The page may use the application's existing customer fields and naming
conventions. Missing optional details should display `—`, not `null`, `false`,
or `undefined`.

### 5.3 Receivable Calculation

For one customer:

```text
Customer Receivable =
  Sum of positive balance amounts of the customer's non-cancelled Invoices
```

For each Invoice:

```text
Invoice Settled Amount =
  Successful Cash/Bank allocation amount
  + applicable TDS Receivable amount

Invoice Balance =
  Invoice Total - Invoice Settled Amount
```

The calculation must use the existing Invoice balance maintained by the Cash
and Bank settlement workflow when that field is available. The list must not
derive receivables from only the currently visible page of payment
transactions.

Rules:

- Fully settled Invoices contribute zero.
- Partially settled Invoices contribute their positive remaining balance.
- Failed or rolled-back payments do not reduce receivables.
- Reversed transactions affect receivables only through the approved reversal
  and document-balance logic.
- An advance or on-account receipt does not reduce an Invoice balance until it
  is allocated to that Invoice.
- Estimates and Delivery Challans do not affect Receivables.
- Cancelled or void Invoices do not contribute to Receivables.

### 5.4 Search, Pagination, and Interaction

- Search by Customer Name, Company Name, Email, or Phone using existing
  customer-search conventions.
- Paginate results using the common application pagination component.
- The Receivables amount must show a loading placeholder until the value is
  returned; it must not temporarily display `0` during the initial request.
- Selecting a customer row opens that customer's detail workspace.
- Empty and error states must use the common page design and must not expose
  raw backend errors.

## 6. Customer Detail Workspace

### 6.1 Header

The customer detail header should show only available customer information,
including:

- Customer Name
- Company Name, when available
- Email and Phone, when available
- Current Receivable
- Customer status, when maintained by the existing customer module

### 6.2 Required Sections

The workspace must provide the following sections or tabs:

1. Overview
2. Transactions
3. Statement

Only content required by this document should be implemented. The UI does not
need to copy every section shown in the reference screenshots.

### 6.3 Overview

The Overview should display:

- Available customer master details.
- Billing and shipping address when available.
- Current Receivable.
- A concise count or summary of the required transaction types when useful.

The same customer detail must not be repeated in multiple cards without a
clear purpose.

## 7. Customer Transactions

### 7.1 Transaction Types

The customer Transactions section contains exactly these Phase 3 groups:

| Group | Source | Financial effect |
| --- | --- | --- |
| Invoices | Existing sales Invoice modules | Increases customer receivable when valid and posted according to the existing Invoice lifecycle |
| Customer Payments | Existing Cash and Bank Customer Receipt transactions | Reduces Invoice receivable through successful allocations; may remain advance/on-account until allocated |
| Estimates | Existing Estimate module | No receivable or Cash/Bank effect |
| Delivery Challans | New Delivery Challans created against Invoices | Quantity-fulfilment record only; no receivable or Cash/Bank effect |

Each group may be an expandable section or a tab. It must support an empty
state without hiding the other groups.

### 7.2 Invoices

The Invoice list must contain the customer's relevant Invoices across the
supported sales sources, including E-commerce, In-store Sales, Rental, and
Service Request when those modules create sales Invoice records.

Minimum displayed values:

- Invoice Date
- Invoice Number
- Source/Module
- Invoice Amount
- Balance Amount
- Payment Status

Selecting an Invoice should open the existing Invoice detail or view flow. This
phase must not implement a second Invoice editor.

### 7.3 Estimates

The Estimate list must show Estimates associated with the selected customer.

Minimum displayed values:

- Estimate Date
- Estimate Number
- Amount
- Existing Estimate Status

Selecting an Estimate should open the existing Estimate view when one exists.
An Estimate must not affect Receivables, statements, journals, or Cash/Bank
balances merely because it is displayed in the Transactions section.

## 8. Customer Payments

### 8.1 Payment List

Customer Payments must display all posted Cash and Bank Customer Receipt
transactions associated with the selected customer.

The association must use the normalized customer/party identifier stored on
the transaction or its allocations. Customer name text alone must not be used
as the relationship key.

Minimum displayed values:

- Payment Date
- Cash/Bank Transaction Number
- Bank/Cash Account Name
- Bank Name for Bank accounts, when available
- Payment Amount
- Allocation Method or Source
- Applied/Allocated Amount
- Unapplied Amount when applicable
- Transaction Status

Selecting a payment must open the existing transaction detail view, including
its journal and allocations where already supported.

### 8.2 Creating a Customer Payment

The Customer detail page must provide a **Record Customer Payment** action.

The action must:

1. Preselect and lock the current customer unless the user deliberately returns
   to the global Cash and Bank flow.
2. Require selection of an active Bank/Cash account.
3. Open the existing Customer Receipt form and validation logic.
4. Load the selected customer's outstanding Invoices.
5. Allow the existing supported allocation methods and TDS Receivable rules.
6. Post through the existing Cash and Bank transaction service.
7. Refresh Customer Payments, Invoice balances, and customer Receivables after
   a successful post.
8. Show the common success toast.
9. Preserve entered form values when a recoverable validation error occurs.

Permissions must match the existing Cash and Bank transaction-create
permission. Viewing a customer must not automatically grant payment-posting
permission.

### 8.3 Payment Display Rules

- The list must not duplicate a payment once for every Invoice allocation.
- One Cash/Bank transaction appears once in the Customer Payments list.
- Allocation details may appear within an expandable detail or transaction
  modal.
- Payments allocated across multiple Invoices must show their aggregate applied
  amount and retain the individual allocation detail.
- Failed, draft, or rolled-back attempts must not appear as posted payments.
- Reversals must be represented according to the existing Cash and Bank
  reversal design.

## 9. Delivery Challan

### 9.1 Purpose

A Delivery Challan records the quantity physically delivered for selected line
items of an existing Invoice. It does not create a new sale, payment, journal
entry, GST value, or receivable.

### 9.2 Creation Flow

1. Start from the selected customer's Delivery Challans section or from an
   eligible Invoice.
2. Select one existing Invoice belonging to that customer and organization.
3. Load the Invoice line items.
4. Show Invoice Quantity, Previously Delivered Quantity, Remaining Deliverable
   Quantity, and Delivery Quantity for each line.
5. Select one or more line items.
6. Enter a Delivery Quantity for every selected line.
7. Enter the Delivery Challan Date.
8. Save the Delivery Challan header and all selected lines atomically.
9. Refresh the Invoice delivery quantities and Delivery Challan list after a
   successful save.

### 9.3 Required Header Data

| Field | Required | Rule |
| --- | --- | --- |
| Delivery Challan Number | Yes | System-generated unique number using the project's sequence convention |
| Customer | Yes | Derived from the selected Invoice; not freely editable |
| Invoice | Yes | Must belong to the customer and organization |
| Delivery Challan Date | Yes | Valid application date |
| Notes | No | Optional delivery note with a controlled maximum length |

Existing customer and Invoice addresses may be shown on the document but must
not silently overwrite the customer master.

### 9.4 Required Line Data

| Field | Required | Rule |
| --- | --- | --- |
| Invoice Line ID | Yes | Must belong to the selected Invoice |
| Product/Item | Yes | Copied from the Invoice line for display/audit |
| Invoice Quantity | Yes | Read-only value from the Invoice line |
| Previously Delivered Quantity | Yes | Sum of successfully created Delivery Challan quantities for the Invoice line |
| Remaining Deliverable Quantity | Yes | Invoice Quantity minus Previously Delivered Quantity |
| Delivery Quantity | Yes | Must be greater than zero and not exceed Remaining Deliverable Quantity |

Product name, price, tax, discount, and Invoice total must not be editable from
the Delivery Challan.

### 9.5 Quantity Rules

For each Invoice line:

```text
Previously Delivered Quantity =
  Sum of Delivery Quantity from successfully created Challan lines

Remaining Deliverable Quantity =
  Invoice Quantity - Previously Delivered Quantity
```

Validation rules:

- Delivery Quantity cannot be zero, negative, `null`, `false`, blank, or
  non-numeric.
- Delivery Quantity cannot exceed Remaining Deliverable Quantity.
- At least one line with a valid Delivery Quantity is required.
- A fully delivered line cannot be selected for another Delivery Challan.
- The backend must recalculate remaining quantity; it must not trust frontend
  totals.
- Multiple Delivery Challans may be created for one Invoice until all eligible
  Invoice line quantities are delivered.
- The sum of Delivery Challan quantities for an Invoice line must never exceed
  the Invoice line quantity.
- Delivery Challan creation must lock or safely revalidate Invoice delivery
  quantities to prevent concurrent over-delivery.

### 9.6 Example

Invoice `INV-1001` contains:

| Item | Invoice Quantity | Already Delivered | Remaining | New Delivery |
| --- | ---: | ---: | ---: | ---: |
| Laptop | 10 | 0 | 10 | 4 |

After the first Delivery Challan is created:

```text
Previously Delivered = 4
Remaining Deliverable = 6
```

A second Delivery Challan may deliver up to 6. A request to deliver 7 must be
rejected by the backend even if the frontend submits it.

### 9.7 Delivery Challan List

Minimum displayed values:

- Delivery Challan Number
- Invoice Number
- Delivery Challan Date
- Delivered line count or total delivered quantity

Selecting a Delivery Challan opens a read-only detail showing its Invoice and
line-level delivered quantities.

No payment status should be displayed as a Delivery Challan status. Invoice
payment status and physical delivery progress are separate concepts.

## 10. Customer Statement

### 10.1 Purpose

The Customer Statement provides a chronological view of the selected
customer's relevant Invoices and Cash/Bank Customer Payments.

### 10.2 Included Rows

The statement must include:

1. Relevant non-cancelled Invoices for the customer.
2. Posted Cash and Bank Customer Receipt transactions associated with the
   customer.
3. Invoice allocation/settlement impact needed to explain the change in the
   customer's outstanding balance.

Estimates and Delivery Challans are not financial statement rows because they
do not change receivables or Cash/Bank balances.

### 10.3 Statement Filters

Required filters:

- From Date
- To Date

Rules:

- Default to the project's approved statement date range.
- From Date cannot be later than To Date.
- Both boundary dates are inclusive.
- The customer and organization are fixed by the current context.
- Pagination or controlled server-side loading is required for large histories.

### 10.4 Statement Summary

The statement should display:

- Opening Receivable
- Invoice Amount raised within the period
- Customer Payment Amount received within the period
- TDS Receivable settled within the period, when present in existing
  allocations
- Unapplied/Advance Amount when present
- Closing Receivable

```text
Opening Receivable =
  Customer's document-derived receivable immediately before From Date

Closing Receivable =
  Customer's document-derived receivable as of To Date
```

An unallocated advance payment may be shown in the statement as a payment or
advance, but it must not reduce an Invoice's Receivable until the existing
allocation workflow applies it to an Invoice.

### 10.5 Statement Rows

Minimum columns:

| Column | Description |
| --- | --- |
| Date | Invoice date or Cash/Bank transaction date |
| Transaction Type | Invoice or Customer Payment |
| Reference | Invoice Number or Bank Transaction Number |
| Description | Source/module, allocation summary, or remarks |
| Invoice Amount | Amount increasing Receivable |
| Payment Amount | Actual Cash/Bank receipt amount |
| Settled Amount | Amount applied to Invoice balance, including applicable TDS settlement |
| Balance | Running document-derived Receivable |

Rows must use a deterministic order. When multiple rows have the same date,
use posting timestamp and then the stable record ID/reference as tie-breakers.

### 10.6 Duplicate Prevention

- An Invoice appears once as its originating statement row.
- A Cash/Bank payment appears once as its payment row.
- Multiple Invoice allocations may be summarized on the payment row and shown
  separately in payment detail.
- The query must not multiply payment amounts by joining one transaction to
  multiple allocation rows.
- Summary totals must be calculated independently or from correctly grouped
  records, not by summing duplicated display joins.

## 11. Supplier Statement

### 11.1 Purpose

The Supplier Statement provides a chronological view of the selected
supplier's relevant Bills and Cash/Bank Supplier Payments.

### 11.2 Included Rows

The statement must include:

1. Relevant non-cancelled supplier Bills.
2. Posted Cash and Bank Supplier Payment transactions associated with the
   supplier.
3. Bill allocation/settlement impact needed to explain the change in the
   supplier's outstanding payable balance.

### 11.3 Statement Summary

The Supplier Statement should display:

- Opening Payable
- Bill Amount raised within the period
- Supplier Payment Amount paid within the period
- TDS Payable settled within the period, when present in existing allocations
- Closing Payable

```text
Supplier Payable =
  Sum of positive balance amounts of the supplier's non-cancelled Bills
```

The existing Bill balance and status remain transaction-derived from Cash and
Bank Supplier Payments and TDS Payable allocations.

### 11.4 Statement Rows

Minimum columns:

| Column | Description |
| --- | --- |
| Date | Bill date or Cash/Bank transaction date |
| Transaction Type | Bill or Supplier Payment |
| Reference | Bill Number or Bank Transaction Number |
| Description | PO/source, allocation summary, or remarks |
| Bill Amount | Amount increasing Payable |
| Payment Amount | Actual Cash/Bank payment amount |
| Settled Amount | Amount reducing Bill balance, including applicable TDS settlement |
| Balance | Running document-derived Payable |

The same date, organization, pagination, stable ordering, and duplicate
prevention rules defined for the Customer Statement apply to the Supplier
Statement.

## 12. Backend Requirements

The backend must provide operations equivalent to the following. Exact route
names may follow the existing API conventions.

### 12.1 Customer Operations

- List Sales Customers with paginated customer details and Receivables.
- Get one Customer Overview with current Receivable.
- List a customer's Invoices.
- List a customer's Cash/Bank Customer Payments.
- List a customer's Estimates.
- List a customer's Delivery Challans.
- Get a Customer Statement for an inclusive date range.

### 12.2 Delivery Challan Operations

- List eligible Invoices for the selected customer.
- Get Invoice lines with Invoice Quantity, Previously Delivered Quantity, and
  Remaining Deliverable Quantity.
- Create a Delivery Challan atomically.
- Get one Delivery Challan with line details.

### 12.3 Supplier Operations

- Get a Supplier Statement for an inclusive date range.

### 12.4 Payment Posting

Customer Payment creation must reuse the existing Cash and Bank Customer
Receipt posting endpoint/service. Supplier Statement is read-only in this
phase and reads the existing Supplier Payment records.

### 12.5 Response Rules

- Numeric amounts must be returned as numeric-compatible values and formatted
  in the frontend using the common money formatter.
- Dates must follow the project's API date convention.
- Lists must provide total-record and pagination metadata.
- Missing optional values must be `null` or omitted in the API and displayed as
  `—` in the UI; they must not be converted to the text `false`.
- Responses must not expose database errors, SQL, stack traces, or internal
  implementation details.

## 13. Conceptual Data Requirements

### 13.1 Delivery Challan Header

The Delivery Challan header requires data equivalent to:

- Internal ID
- Organization ID
- Delivery Challan Number
- Customer ID
- Invoice ID
- Delivery Challan Date
- Notes
- Created By
- Created Date
- Updated By/Date where applicable

### 13.2 Delivery Challan Line

Each line requires data equivalent to:

- Internal ID
- Delivery Challan ID
- Invoice Line ID
- Product/Item reference
- Delivered Quantity
- Created audit fields

### 13.3 Constraints and Indexes

- Delivery Challan Number must be unique within the organization.
- Customer, Invoice, and Invoice Line relationships must be enforced or
  validated transactionally.
- Delivery Quantity must be greater than zero.
- Index by Organization and Customer.
- Index by Organization and Invoice.
- Index Delivery Challan lines by Invoice Line ID for delivered-quantity sums.

The final implementation must use the project's master migration/change file
policy so the same schema can be deployed safely to every environment.

## 14. Permissions

Minimum permission separation:

| Action | Required capability |
| --- | --- |
| View customer list/details/transactions | Existing customer read permission |
| View Customer Statement | Customer read plus approved finance visibility |
| Record Customer Payment | Existing Cash and Bank transaction-create permission |
| View Delivery Challan | Customer/Invoice read permission |
| Create Delivery Challan | Approved sales/delivery create permission |
| View Supplier Statement | Supplier read plus approved finance visibility |

The implementation should map these capabilities to existing permission keys
where available rather than introducing duplicate permission systems.

## 15. Validation and Error Handling

### 15.1 General

- Validate organization ownership for every identifier.
- Validate required IDs as integers using the existing request-validation
  convention.
- Return field-specific validation messages where the user can correct input.
- Preserve entered frontend values after recoverable validation responses.
- Use common toast messages for successful create/post actions.
- Use inline field errors for field-specific validation failures.

### 15.2 Required Business Errors

The UI must handle messages equivalent to:

- `Customer not found.`
- `Supplier not found.`
- `Invoice not found for this customer.`
- `Invoice line is not available for delivery.`
- `Delivery quantity must be greater than zero.`
- `Delivery quantity cannot exceed the remaining deliverable quantity.`
- `The remaining delivery quantity changed. Refresh and try again.`
- `No active Bank/Cash account is available for this payment.`
- `From Date cannot be later than To Date.`
- `Unable to load the statement. Please try again.`

## 16. Audit Requirements

- Delivery Challan creation must record organization, user, and timestamp.
- Customer Payment creation retains the existing Cash and Bank audit trail.
- Statements are read-only and do not create financial audit records merely by
  being viewed.
- Statement rows must retain navigable source references so users can inspect
  the original Invoice, Bill, or Cash/Bank transaction.

## 17. UI and UX Requirements

- Use the existing application layout, breadcrumbs, cards, tables, pagination,
  modal, toast, and error-state components.
- Keep primary and secondary text consistently aligned in tables.
- Avoid unnecessary horizontal scrolling on laptop screens.
- Truncate long descriptions in tables and show the complete text through a
  tooltip or detail view.
- Use loading placeholders instead of initially rendering incorrect zero
  values for Receivables, Payables, and statement summaries.
- Disable repeated submit actions while a Payment or Delivery Challan is being
  posted.
- Refresh only the affected data after a successful action where practical.
- The layout may be inspired by the attached screenshots but must contain only
  the Phase 3 content defined in this document.

## 18. Acceptance Criteria

### 18.1 Sales Customers

1. The Sales Customer list shows customer details and the correct current
   Receivable.
2. The Receivable does not flash `0` while it is loading.
3. Paid Invoices contribute zero and partially paid Invoices contribute only
   their remaining balance.
4. Estimates and Delivery Challans do not affect Receivables.
5. Selecting a customer opens the correct customer workspace.

### 18.2 Customer Payments

1. All posted Cash and Bank Customer Receipt transactions for the customer are
   listed.
2. A payment allocated to multiple Invoices appears only once in the payment
   list.
3. Recording a payment from the customer page reuses the existing Cash and
   Bank workflow.
4. Successful posting updates the payment list, affected Invoice balances, and
   customer Receivable.
5. No duplicate customer-payment or journal record is created.

### 18.3 Customer Transactions

1. Invoices, Customer Payments, Estimates, and Delivery Challans are available
   as separate groups.
2. Every group is filtered by the current customer and organization.
3. Source links open the existing source detail where available.

### 18.4 Delivery Challans

1. A Delivery Challan can only be created from an existing Invoice.
2. Invoice line quantities and remaining quantities are shown.
3. Delivery Quantity must be greater than zero.
4. The backend rejects any quantity above the remaining Invoice line quantity.
5. Multiple Delivery Challans can be created until the Invoice quantity is
   fully delivered.
6. Concurrent requests cannot over-deliver an Invoice line.
7. Creating a Delivery Challan does not change Invoice amount, Receivable, GST,
   journal entries, or Bank/Cash balance.

### 18.5 Statements

1. Customer Statement shows the customer's relevant Invoices and posted
   Cash/Bank Customer Payments.
2. Supplier Statement shows the supplier's relevant Bills and posted Cash/Bank
   Supplier Payments.
3. Opening and closing balances match the document-derived Receivable or
   Payable for the selected dates.
4. TDS settlement is included when it is already recorded against the source
   document allocation.
5. Estimates and Delivery Challans do not appear as financial statement rows.
6. Multi-document allocations do not duplicate the Cash/Bank payment amount.
7. Date filtering is inclusive and stable ordering is maintained.
8. Viewing or exporting a statement does not create financial records.

## 19. Minimum Test Scenarios

1. Customer with no Invoice and no Payment.
2. Customer with one unpaid Invoice.
3. Customer with one partially paid Invoice.
4. Customer with one fully paid Invoice.
5. Customer Payment allocated across multiple Invoices.
6. Customer advance/on-account Payment with no Invoice allocation.
7. Customer Payment with TDS Receivable.
8. Failed Payment does not change Receivable or statement totals.
9. One Invoice delivered through multiple Delivery Challans.
10. Delivery Quantity equal to Remaining Deliverable Quantity succeeds.
11. Zero, negative, blank, and over-limit Delivery Quantity fail.
12. Two concurrent Delivery Challans cannot exceed Invoice Quantity.
13. Customer Statement with opening balance and in-period Invoice and Payment.
14. Supplier Statement with partial Bill payment and TDS Payable.
15. Multi-allocation transaction appears once in a statement.
16. Cross-organization customer, supplier, Invoice, Bill, or Delivery Challan
    access is rejected.

## 20. Definition of Done

Phase 3 is complete only when:

1. All included backend operations, frontend pages, and validation rules are
   implemented.
2. Customer Payments reuse the existing Cash and Bank transaction service.
3. Delivery Challan quantity integrity is enforced by both frontend and
   backend validation.
4. Customer and Supplier Statement totals reconcile with source Invoice/Bill
   balances and Cash/Bank allocations.
5. No transaction or allocation is duplicated by statement queries.
6. Permissions and organization isolation are verified.
7. Database changes are included in the approved deployment SQL/migration
   process.
8. Backend automated tests and frontend production build pass.
9. Acceptance scenarios in this document are verified with representative
   data.
