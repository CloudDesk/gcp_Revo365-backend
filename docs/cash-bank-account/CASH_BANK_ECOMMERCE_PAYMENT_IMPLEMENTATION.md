# E-commerce Automatic Payment Entries

## Implemented Scope

This backend slice records successful e-commerce product payments in the Cash
and Bank module.

Eligible orders must have:

```text
ordername = online
invoicefor = product
```

The following flows are excluded:

- Rental and Product Rental
- Retail Store Purchase
- Repair and Service Request
- Failed or authorized-but-not-captured payments

## Trigger

The integration runs after the existing successful transaction record and order
payment state have been written. Razorpay checkout confirmation, Razorpay
captured-payment webhooks, and the existing PhonePe success flow all use this
integration.

Repeated callbacks are safe. The finance event and bank transaction both have
provider payment-reference uniqueness controls.

## Accounting Entry

Until invoice allocation is implemented in the next slice:

```text
Debit  E-commerce Default Bank Account
Credit Customer Advances
```

The integration creates:

- A system Bank transaction with `entryside = debit`
- An increased running/available balance
- A posted journal entry with balanced journal lines
- An open Customer Advance in `party_unapplied_amounts`
- A finance audit event

The Bank transaction uses:

```text
sourcetype = ecommerce_order
allocationmethod = advance
entrymode = system
```

## Durable Pending Behaviour

The successful customer checkout must not fail because Finance configuration is
missing.

Every eligible payment is first written to:

```text
ecommerce_payment_finance_events
```

If no active e-commerce default Bank account exists, the event remains:

```text
status = pending
failurecode = ECOMMERCE_DEFAULT_BANK_ACCOUNT_MISSING
```

After marking an active Bank account as the e-commerce default, retry pending
events with:

```bash
npm run process:ecommerce-finance
```

An optional processing limit can be supplied:

```bash
npm run process:ecommerce-finance -- 200
```

## E-commerce Default Bank Account

Create a Bank account and mark **E-commerce default account** in the account
create/edit modal.

Rules:

- Only an active Bank account can be selected.
- Only one account can be the default per organization.
- Replacing an existing default requires explicit user confirmation.
- Razorpay and PhonePe product-order receipts use the same default account in
  this phase.
- Provider/payment-method mappings are retained as future foundation but are
  not used by the Phase 1 automatic posting flow.

## Deployment

For the frozen Phase 1 database deployment, apply:

```text
src/database/releases/20260730_cash_bank_phase1_release.sql
```

Then run:

```bash
npm run verify:finance-foundation
```

The verification command is read-only and must be run against each configured
environment after database deployment.

## Deferred to the Next Slice

- Matching the Customer Advance to an existing invoice
- Matching it when the invoice is generated later
- Updating invoice paid/partial/unpaid status from finance allocations
- Refund and payment-reversal accounting
