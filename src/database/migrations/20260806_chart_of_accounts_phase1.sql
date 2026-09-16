-- Chart of Accounts master migration (Phase 1 + Phase 2).
-- Keep this file idempotent so it can be used as the single deployment
-- reference for every database environment.

-- Phase 2 must remain first so a deployment that already has Phase 1 can
-- apply the Direct Ledger schema without being blocked by earlier master data.
ALTER TABLE bank_transactions
    ADD COLUMN IF NOT EXISTS entryname VARCHAR(255);

ALTER TABLE finance_accounts
    ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE finance_accounts
    ADD COLUMN IF NOT EXISTS isusercreatedchartaccount BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS finance_account_types (
    id BIGSERIAL PRIMARY KEY,
    typecode VARCHAR(50) NOT NULL UNIQUE,
    typename VARCHAR(100) NOT NULL,
    accountcategory VARCHAR(30) NOT NULL,
    categorylabel VARCHAR(50) NOT NULL,
    displayorder INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    isconfigurable BOOLEAN NOT NULL DEFAULT FALSE,
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_finance_account_types_category
        CHECK (accountcategory IN ('asset', 'liability', 'equity', 'income', 'expense')),
    CONSTRAINT chk_finance_account_types_status
        CHECK (status IN ('active', 'inactive'))
);

INSERT INTO finance_account_types (
    typecode,
    typename,
    accountcategory,
    categorylabel,
    displayorder,
    status,
    isconfigurable
)
VALUES
    ('other_asset', 'Other Asset', 'asset', 'Assets', 10, 'active', FALSE),
    ('other_current_asset', 'Other Current Asset', 'asset', 'Assets', 20, 'active', FALSE),
    ('cash', 'Cash', 'asset', 'Assets', 30, 'active', FALSE),
    ('bank', 'Bank', 'asset', 'Assets', 40, 'active', FALSE),
    ('fixed_asset', 'Fixed Asset', 'asset', 'Assets', 50, 'active', FALSE),
    ('stock', 'Stock', 'asset', 'Assets', 60, 'active', FALSE),
    ('payment_clearing', 'Payment Clearing', 'asset', 'Assets', 70, 'active', FALSE),
    ('other_current_liability', 'Other Current Liability', 'liability', 'Liability', 80, 'active', FALSE),
    ('credit_card', 'Credit Card', 'liability', 'Liability', 90, 'active', FALSE),
    ('long_term_liability', 'Long Term Liability', 'liability', 'Liability', 100, 'active', FALSE),
    ('other_liability', 'Other Liability', 'liability', 'Liability', 110, 'active', FALSE),
    ('overseas_tax_payable', 'Overseas Tax Payable', 'liability', 'Liability', 120, 'active', FALSE),
    ('equity', 'Equity', 'equity', 'Equity', 130, 'active', FALSE),
    ('income', 'Income', 'income', 'Income', 140, 'active', FALSE),
    ('other_income', 'Other Income', 'income', 'Income', 150, 'active', FALSE),
    ('expense', 'Expense', 'expense', 'Expense', 160, 'active', FALSE),
    ('cost_of_goods_sold', 'Cost of Goods Sold', 'expense', 'Expense', 170, 'active', FALSE),
    ('other_expense', 'Other Expense', 'expense', 'Expense', 180, 'active', FALSE)
ON CONFLICT (typecode) DO UPDATE SET
    typename = EXCLUDED.typename,
    accountcategory = EXCLUDED.accountcategory,
    categorylabel = EXCLUDED.categorylabel,
    displayorder = EXCLUDED.displayorder,
    status = EXCLUDED.status,
    isconfigurable = EXCLUDED.isconfigurable,
    modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT;

DROP INDEX IF EXISTS uq_finance_accounts_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_accounts_code_normalized
    ON finance_accounts (organizationid, LOWER(TRIM(accountcode)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_chart_accounts_name_normalized
    ON finance_accounts (organizationid, LOWER(TRIM(accountname)))
    WHERE isusercreatedchartaccount = TRUE;

CREATE INDEX IF NOT EXISTS idx_finance_chart_accounts_list
    ON finance_accounts (organizationid, status, accounttype, accountsubtype)
    WHERE isusercreatedchartaccount = TRUE;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260806_chart_of_accounts_phase2',
    'Chart of Accounts master and Direct Ledger Entry narration'
)
ON CONFLICT (version) DO NOTHING;
