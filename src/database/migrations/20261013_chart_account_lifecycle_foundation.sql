-- Chart of Accounts lifecycle database foundation.
--
-- This migration is intentionally additive and idempotent. It adds the data
-- needed by later lifecycle service phases without changing current query or
-- posting behavior.

ALTER TABLE finance_accounts
    ADD COLUMN IF NOT EXISTS isdeleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deletedby VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deleteddate BIGINT,
    ADD COLUMN IF NOT EXISTS deletionbatchid UUID;

ALTER TABLE bank_transactions
    ADD COLUMN IF NOT EXISTS isdeleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deletedby VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deleteddate BIGINT,
    ADD COLUMN IF NOT EXISTS deletionbatchid UUID,
    ADD COLUMN IF NOT EXISTS deactivatedbychartaccountid BIGINT,
    ADD COLUMN IF NOT EXISTS deactivatedby VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deactivateddate BIGINT;

ALTER TABLE journal_entries
    ADD COLUMN IF NOT EXISTS isdeleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deletedby VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deleteddate BIGINT,
    ADD COLUMN IF NOT EXISTS deletionbatchid UUID,
    ADD COLUMN IF NOT EXISTS deactivatedbychartaccountid BIGINT,
    ADD COLUMN IF NOT EXISTS deactivatedby VARCHAR(255),
    ADD COLUMN IF NOT EXISTS deactivateddate BIGINT;

-- Extend existing state constraints only when the deployed definition does
-- not already support the lifecycle inactive state.
DO $$
DECLARE
    constraint_definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid)
      INTO constraint_definition
      FROM pg_constraint
     WHERE conrelid = 'bank_transactions'::regclass
       AND conname = 'chk_bank_transactions_status';

    IF constraint_definition IS NULL
       OR POSITION('inactive' IN LOWER(constraint_definition)) = 0 THEN
        ALTER TABLE bank_transactions
            DROP CONSTRAINT IF EXISTS chk_bank_transactions_status;
        ALTER TABLE bank_transactions
            ADD CONSTRAINT chk_bank_transactions_status
            CHECK (postingstatus IN ('draft', 'posted', 'inactive', 'reversed'));
    END IF;
END
$$;

DO $$
DECLARE
    constraint_definition TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid)
      INTO constraint_definition
      FROM pg_constraint
     WHERE conrelid = 'journal_entries'::regclass
       AND conname = 'chk_journal_entries_status';

    IF constraint_definition IS NULL
       OR POSITION('inactive' IN LOWER(constraint_definition)) = 0 THEN
        ALTER TABLE journal_entries
            DROP CONSTRAINT IF EXISTS chk_journal_entries_status;
        ALTER TABLE journal_entries
            ADD CONSTRAINT chk_journal_entries_status
            CHECK (status IN ('draft', 'posted', 'inactive', 'reversed'));
    END IF;
END
$$;

-- Lifecycle ownership links prevent a later activation from restoring a
-- transaction or journal that was made inactive by another workflow.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'bank_transactions'::regclass
           AND conname = 'fk_bank_transactions_deactivated_chart_account'
    ) THEN
        ALTER TABLE bank_transactions
            ADD CONSTRAINT fk_bank_transactions_deactivated_chart_account
            FOREIGN KEY (deactivatedbychartaccountid)
            REFERENCES finance_accounts(id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'journal_entries'::regclass
           AND conname = 'fk_journal_entries_deactivated_chart_account'
    ) THEN
        ALTER TABLE journal_entries
            ADD CONSTRAINT fk_journal_entries_deactivated_chart_account
            FOREIGN KEY (deactivatedbychartaccountid)
            REFERENCES finance_accounts(id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

-- Soft-deleted user-created accounts must not reserve their former name or
-- optional account code. System and all other non-deleted finance accounts
-- remain protected by the organization-scoped code index.
DROP INDEX IF EXISTS uq_finance_accounts_code;
DROP INDEX IF EXISTS uq_finance_accounts_code_normalized;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_accounts_code_normalized
    ON finance_accounts (organizationid, LOWER(BTRIM(accountcode)))
    WHERE isdeleted = FALSE;

DROP INDEX IF EXISTS uq_finance_chart_accounts_name_normalized;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_chart_accounts_name_normalized
    ON finance_accounts (organizationid, LOWER(BTRIM(accountname)))
    WHERE isusercreatedchartaccount = TRUE
      AND isdeleted = FALSE;

DROP INDEX IF EXISTS idx_finance_chart_accounts_list;
CREATE INDEX IF NOT EXISTS idx_finance_chart_accounts_list
    ON finance_accounts (
        organizationid,
        isdeleted,
        status,
        accounttype,
        accountsubtype
    )
    WHERE isusercreatedchartaccount = TRUE;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_chart_account_lifecycle
    ON bank_transactions (
        organizationid,
        counterpartyaccountid,
        isdeleted,
        postingstatus,
        bankcashaccountid
    )
    WHERE allocationmethod = 'direct_ledger'
      AND partytype = 'ledger';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_deactivated_chart_account
    ON bank_transactions (deactivatedbychartaccountid, id)
    WHERE deactivatedbychartaccountid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_deactivated_chart_account
    ON journal_entries (deactivatedbychartaccountid, id)
    WHERE deactivatedbychartaccountid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_accounts_deletion_batch
    ON finance_accounts (deletionbatchid, id)
    WHERE deletionbatchid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_deletion_batch
    ON bank_transactions (deletionbatchid, id)
    WHERE deletionbatchid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_deletion_batch
    ON journal_entries (deletionbatchid, id)
    WHERE deletionbatchid IS NOT NULL;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20261013_chart_account_lifecycle_foundation_v1',
    'Chart of Accounts soft-delete, inactive transaction and lifecycle metadata foundation'
)
ON CONFLICT (version) DO NOTHING;
