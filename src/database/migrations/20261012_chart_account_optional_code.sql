-- User-created Chart of Accounts records may omit Account Code.
-- System and operational finance accounts must continue to have a code.

ALTER TABLE finance_accounts
    ALTER COLUMN accountcode DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_finance_accounts_optional_user_code'
          AND conrelid = 'finance_accounts'::regclass
    ) THEN
        ALTER TABLE finance_accounts
            ADD CONSTRAINT chk_finance_accounts_optional_user_code
            CHECK (
                (accountcode IS NULL AND isusercreatedchartaccount = TRUE)
                OR NULLIF(BTRIM(accountcode), '') IS NOT NULL
            );
    END IF;
END
$$;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20261012_chart_account_optional_code',
    'Allow user-created Chart of Accounts records to omit Account Code'
)
ON CONFLICT (version) DO NOTHING;
