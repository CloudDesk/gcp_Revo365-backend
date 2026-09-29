-- Allow multiple Cash/Bank accounts to use the same display name.
--
-- Account codes remain unique, and bank account numbers remain protected by
-- uq_bank_cash_accounts_number_hash. Non-unique name indexes retain search
-- performance without blocking legitimate duplicate display names.

DROP INDEX IF EXISTS uq_bank_cash_accounts_name;
DROP INDEX IF EXISTS uq_finance_accounts_name;

CREATE INDEX IF NOT EXISTS idx_bank_cash_accounts_name
    ON bank_cash_accounts (organizationid, LOWER(accountname));

CREATE INDEX IF NOT EXISTS idx_finance_accounts_name
    ON finance_accounts (organizationid, LOWER(accountname));

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260730_cash_bank_duplicate_account_names_v1',
    'Allow duplicate Cash and Bank account display names'
)
ON CONFLICT (version) DO NOTHING;
