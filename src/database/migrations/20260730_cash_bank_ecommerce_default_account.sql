-- Add an organization-level default Cash/Bank destination for e-commerce
-- receipts. This migration is idempotent and is the single deployment file
-- for this feature across development, UAT, and production.

ALTER TABLE bank_cash_accounts
    ADD COLUMN IF NOT EXISTS isecommercedefault BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_cash_accounts_ecommerce_default
    ON bank_cash_accounts (organizationid)
    WHERE isecommercedefault = TRUE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_bank_cash_accounts_ecommerce_default_active'
          AND conrelid = 'bank_cash_accounts'::regclass
    ) THEN
        ALTER TABLE bank_cash_accounts
            ADD CONSTRAINT chk_bank_cash_accounts_ecommerce_default_active
            CHECK (isecommercedefault = FALSE OR status = 'active');
    END IF;
END
$$;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260730_cash_bank_ecommerce_default_account_v1',
    'Single active e-commerce default Cash/Bank account per organization'
)
ON CONFLICT (version) DO NOTHING;
