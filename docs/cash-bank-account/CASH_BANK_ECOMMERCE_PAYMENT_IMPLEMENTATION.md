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
Debit  Mapped Bank/Cash Account
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

If no active provider/payment-method mapping exists, the event remains:

```text
status = pending
failurecode = PAYMENT_ACCOUNT_MAPPING_MISSING
```

After configuring the mapping, retry pending events with:

```bash
npm run process:ecommerce-finance
```

An optional processing limit can be supplied:

```bash
npm run process:ecommerce-finance -- 200
```

## Payment Account Mapping

Create the Bank/Cash account first, then configure the settlement destination.
The effective date must be on or before the payments that should use it.

Example wildcard Razorpay mapping:

```sql
INSERT INTO payment_account_mappings (
    organizationid,
    provider,
    paymentmethod,
    bankcashaccountid,
    effectivefrom,
    status,
    createdby,
    modifiedby
)
VALUES (
    1,
    'razorpay',
    '*',
    <bank_cash_account_id>,
    <effective_from_date>,
    'active',
    'configuration',
    'configuration'
);
```

Use `phonepe` as the provider for PhonePe payments. A method-specific mapping
is selected before a `*` wildcard mapping.

## Deployment

Apply:

```text
src/database/migrations/20260730_cash_bank_ecommerce_payment_events.sql
```

Then run:

```bash
npm run verify:finance-foundation
```

The migration has not been applied automatically as part of the local
implementation.

## Deferred to the Next Slice

- Matching the Customer Advance to an existing invoice
- Matching it when the invoice is generated later
- Updating invoice paid/partial/unpaid status from finance allocations
- Refund and payment-reversal accounting
