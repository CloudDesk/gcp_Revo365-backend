# Cash and Bank Account Foundation Deployment

## Purpose

This document defines how the Cash and Bank Account foundation database schema
must be promoted consistently across DEV, UAT, and PROD.

## Schema Source of Truth

The initial consolidated schema is:

```text
src/database/migrations/20260730_cash_bank_account_foundation.sql
```

Current schema version:

```text
20260730_cash_bank_account_foundation_v1
```

The foundation has now been applied to an environment. The baseline is
therefore immutable. The standard Admin/Accountant permission correction is:

```text
src/database/migrations/20260730_cash_bank_standard_permissions.sql
```

Permission schema version:

```text
20260730_cash_bank_standard_permissions_v1
```

The e-commerce automatic-payment event migration is:

```text
src/database/migrations/20260730_cash_bank_ecommerce_payment_events.sql
```

E-commerce payment schema version:

```text
20260730_cash_bank_ecommerce_payments_v1
```

The baseline contains the complete initial definitions for:

- Finance accounts
- Bank/Cash accounts
- Bank transactions
- Invoice/Bill allocations
- Party advances and On Account balances
- Journal entries and journal lines
- Payment-provider account mappings
- Simplified TDS section dropdown catalogue
- Durable e-commerce payment finance events
- Finance audit events
- Required system ledgers

## Migration Change Rule

### Before first deployment

The baseline file may be updated while the module is under initial development.
The final initial column definitions must be maintained in each `CREATE TABLE`
statement. Do not create an incomplete table and add its initial columns later
in the same baseline.

### After first deployment to any environment

The baseline becomes immutable.

Do not edit an applied baseline because an existing table will not receive a
new column merely because its original `CREATE TABLE IF NOT EXISTS` statement
was edited.

Every later database change must use a new dated, idempotent migration:

```text
YYYYMMDD_cash_bank_<change_name>.sql
```

Examples:

```text
20260805_cash_bank_add_reconciliation_status.sql
20260812_cash_bank_add_gateway_settlement.sql
```

This immutable-migration approach is the safe source of truth across multiple
environments.

## Required Environment Configuration

Each environment must configure:

```text
FINANCE_ENCRYPTION_KEY=<environment secret of at least 16 characters>
```

Rules:

- Store the value in the environment’s secret manager.
- Do not commit it to Git.
- Keep it stable for the lifetime of that environment.
- Back it up using the organization’s secret-management process.
- Use different secrets for DEV, UAT, and PROD.

The key protects bank account numbers. API responses expose only the last four
characters.

## Deployment Sequence

Run these steps separately in DEV, UAT, and PROD.

### 1. Deploy the exact same commit

Record the Git commit SHA before migration.

### 2. Build

```bash
npm run build
```

### 3. Apply migrations

Development:

```bash
npm run migrate:dev
```

Compiled deployment:

```bash
npm run migrate
```

The migration runner:

- Obtains a PostgreSQL advisory lock.
- Applies SQL files in filename order.
- Wraps each file in a transaction.
- Stops and fails the deployment if any file fails.
- Releases the lock after completion.

### 4. Verify the environment

```bash
npm run verify:finance-foundation
```

Verification fails if:

- A required table is missing.
- A required column is missing.
- The foundation schema version is missing.
- Required system accounts are missing.
- The 12 supplied TDS section rows are missing.
- Admin or Accountant is missing standard read/create/edit permissions.

### 5. Record deployment evidence

For each environment, record:

| Field | Value |
| --- | --- |
| Environment | DEV/UAT/PROD |
| Git commit SHA | Deployed commit |
| Migration time | Timestamp |
| Migration result | Passed/Failed |
| Verification result | Passed/Failed |
| Executed by | User/service |
| Notes | Any observations |

Do not promote to the next environment unless migration and verification pass.

## Rollback Rule

Do not manually drop finance tables from a shared environment.

Before production migration:

- Take a database backup/snapshot.
- Confirm the restore procedure.
- Confirm the encryption secret is safely stored.

After accounting transactions exist, schema rollback must be designed as a
separate reviewed migration. Posted accounting records must not be deleted.

## Current Deployment Status

The foundation code and migration have been created locally. The migration has
not been executed against DEV, UAT, or PROD as part of this implementation
step.
