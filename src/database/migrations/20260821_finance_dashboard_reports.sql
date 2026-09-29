-- Consolidated Finance Dashboard and Finance Reports migration.
-- Includes permission resources, supplier expense-bill fields, TDS government
-- deposits and reporting indexes. Every operation is idempotent.

-- 1. Finance Dashboard and Finance Reports permission resources.
--
-- The existing User Permissions UI uses the standard CRUD shape. These two
-- resources are page-level/read-only resources, so only `read` can be enabled;
-- create/edit/delete remain unavailable.
--
-- Initial defaults:
--   Admin / Accountant -> read = true
--   every other role   -> read = false
--
-- The migration runner executes every SQL file on each deployment. Gate the
-- data rewrite on finance_schema_versions so a later administrator choice to
-- disable read access for Admin or Accountant is not reset on every restart.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM finance_schema_versions
        WHERE version = '20260821_finance_dashboard_reports_permissions_v1'
    ) THEN
        UPDATE permissions p
        SET permissionset = COALESCE(
            (
                SELECT jsonb_agg(permission_item ORDER BY item_order)
                FROM (
                    SELECT
                        item.value AS permission_item,
                        item.ordinality AS item_order
                    FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(COALESCE(p.permissionset, '[]'::jsonb)) = 'array'
                                THEN COALESCE(p.permissionset, '[]'::jsonb)
                            ELSE '[]'::jsonb
                        END
                    ) WITH ORDINALITY AS item(value, ordinality)
                    WHERE COALESCE(item.value->>'objectAPI', '') NOT IN (
                        'finance_dashboard',
                        'finance_reports'
                    )

                    UNION ALL

                    SELECT
                        jsonb_build_object(
                            'object', 'Finance Dashboard',
                            'objectAPI', 'finance_dashboard',
                            'permissions', jsonb_build_object(
                                'read', LOWER(TRIM(COALESCE(p.role, ''))) IN ('admin', 'accountant'),
                                'create', FALSE,
                                'edit', FALSE,
                                'delete', FALSE
                            )
                        ),
                        2147483646::bigint

                    UNION ALL

                    SELECT
                        jsonb_build_object(
                            'object', 'Finance Reports',
                            'objectAPI', 'finance_reports',
                            'permissions', jsonb_build_object(
                                'read', LOWER(TRIM(COALESCE(p.role, ''))) IN ('admin', 'accountant'),
                                'create', FALSE,
                                'edit', FALSE,
                                'delete', FALSE
                            )
                        ),
                        2147483647::bigint
                ) normalized_permissions
            ),
            '[]'::jsonb
        );
    END IF;
END $$;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260821_finance_dashboard_reports_permissions_v1',
    'Admin and Accountant read permissions for Finance Dashboard and Finance Reports'
)
ON CONFLICT (version) DO NOTHING;

-- 2. Supplier expense-bill classification.

ALTER TABLE poinvoice
    ADD COLUMN IF NOT EXISTS billtype VARCHAR(20) DEFAULT 'inventory',
    ADD COLUMN IF NOT EXISTS expensecategory VARCHAR(100),
    ADD COLUMN IF NOT EXISTS expenseaccountid BIGINT REFERENCES finance_accounts(id),
    ADD COLUMN IF NOT EXISTS supplierid BIGINT REFERENCES supplier(id),
    ADD COLUMN IF NOT EXISTS suppliergstin VARCHAR(30),
    ADD COLUMN IF NOT EXISTS placeofsupply VARCHAR(100),
    ADD COLUMN IF NOT EXISTS taxableamount NUMERIC(18,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS igst NUMERIC(18,2) DEFAULT 0;

UPDATE poinvoice SET billtype = 'inventory' WHERE billtype IS NULL;

ALTER TABLE poinvoice
    ALTER COLUMN billtype SET DEFAULT 'inventory',
    ALTER COLUMN billtype SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poinvoice_billtype_check') THEN
        ALTER TABLE poinvoice ADD CONSTRAINT poinvoice_billtype_check
            CHECK (billtype IN ('inventory', 'expense'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_poinvoice_billtype_date
    ON poinvoice (billtype, invoicedate DESC);
CREATE INDEX IF NOT EXISTS idx_poinvoice_expenseaccount
    ON poinvoice (expenseaccountid) WHERE billtype = 'expense';

-- 3. Government TDS challans/deposits. Tax is stored separately from
-- interest, fee and penalty because only tax reduces TDS Payable.

CREATE TABLE IF NOT EXISTS finance_tds_deposits (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL,
    challannumber VARCHAR(80) NOT NULL,
    depositdate DATE NOT NULL,
    financialyear VARCHAR(9) NOT NULL,
    quarter VARCHAR(2) NOT NULL,
    tdssectionid BIGINT REFERENCES tds_sections(id) ON DELETE RESTRICT,
    taxamount NUMERIC(18,2) NOT NULL DEFAULT 0,
    interestamount NUMERIC(18,2) NOT NULL DEFAULT 0,
    feeamount NUMERIC(18,2) NOT NULL DEFAULT 0,
    penaltyamount NUMERIC(18,2) NOT NULL DEFAULT 0,
    totalamount NUMERIC(18,2) GENERATED ALWAYS AS
      (taxamount + interestamount + feeamount + penaltyamount) STORED,
    bsrcode VARCHAR(20),
    challanserialnumber VARCHAR(30),
    cin VARCHAR(80),
    paymentreference VARCHAR(120),
    banktransactionid BIGINT REFERENCES bank_transactions(id) ON DELETE RESTRICT,
    journalentryid BIGINT REFERENCES journal_entries(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'paid',
    notes TEXT,
    createdby VARCHAR(255),
    createddate TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedby VARCHAR(255),
    updateddate TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT finance_tds_deposit_amounts_check CHECK (
      taxamount >= 0 AND interestamount >= 0 AND feeamount >= 0 AND penaltyamount >= 0
      AND (taxamount + interestamount + feeamount + penaltyamount) > 0
    ),
    CONSTRAINT finance_tds_deposit_quarter_check CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
    CONSTRAINT finance_tds_deposit_status_check CHECK (status IN ('draft','paid','reconciled','cancelled')),
    CONSTRAINT finance_tds_deposit_org_challan_unique UNIQUE (organizationid, challannumber)
);

CREATE INDEX IF NOT EXISTS idx_finance_tds_deposits_org_date
    ON finance_tds_deposits (organizationid, depositdate DESC, id DESC)
    WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_finance_tds_deposits_org_fy_quarter
    ON finance_tds_deposits (organizationid, financialyear, quarter, status);

INSERT INTO finance_accounts (organizationid,accountcode,accountname,accounttype,accountsubtype,currencycode,issystem,status,createdby,modifiedby)
SELECT organizationid, seed.accountcode, seed.accountname, 'expense', seed.accountsubtype, 'INR', TRUE, 'active', 'migration', 'migration'
FROM (SELECT DISTINCT organizationid FROM finance_accounts) organizations
CROSS JOIN (VALUES
  ('SYS-TDS-INTEREST-EXPENSE','TDS Interest Expense','tds_interest'),
  ('SYS-TDS-LATE-FEE-EXPENSE','TDS Late Fee Expense','tds_late_fee'),
  ('SYS-TDS-PENALTY-EXPENSE','TDS Penalty Expense','tds_penalty')
) AS seed(accountcode,accountname,accountsubtype)
ON CONFLICT DO NOTHING;

INSERT INTO finance_schema_versions (version, description)
VALUES ('20260821_tds_government_deposits_v1', 'Organization-scoped TDS government challan and deposit records')
ON CONFLICT (version) DO NOTHING;

-- 4. Query support for Dashboard and Reports hot paths.

CREATE INDEX IF NOT EXISTS idx_journal_entries_finance_reports_posted
    ON journal_entries (organizationid, entrydate, id)
    WHERE status = 'posted';

CREATE INDEX IF NOT EXISTS idx_revoinvoice_finance_report_date
    ON revoinvoice (invoicedate DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_revoinvoice_finance_effective_date
    ON revoinvoice ((COALESCE(invoicedate, createddate)) DESC, id DESC)
    WHERE LOWER(COALESCE(paymentstatus, 'pending')) NOT IN ('cancelled', 'void');

CREATE INDEX IF NOT EXISTS idx_poinvoice_finance_report_date
    ON poinvoice (invoicedate DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_poinvoice_finance_effective_date
    ON poinvoice ((COALESCE(invoicedate, createddate)) DESC, id DESC)
    WHERE LOWER(COALESCE(invoicestatus, 'in_progress')) NOT IN ('cancelled', 'void');

CREATE INDEX IF NOT EXISTS idx_bank_allocations_finance_report_document
    ON bank_transaction_allocations (documenttype, status, documentid);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_finance_report_date
    ON bank_transactions (organizationid, transactiondate DESC, postingstatus);

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260821_finance_dashboard_reports_indexes_v1',
    'Posted journal index for Finance Dashboard and Reports'
)
ON CONFLICT (version) DO NOTHING;

-- 5. Product cost basis used by Profit & Loss COGS and stock valuation.
-- Existing products default to zero until their actual purchase price is
-- entered; reporting must never invent a historical cost.

ALTER TABLE product_revo
    ADD COLUMN IF NOT EXISTS purchaseprice NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE product_revo
    DROP CONSTRAINT IF EXISTS chk_product_revo_purchaseprice_nonnegative;

ALTER TABLE product_revo
    ADD CONSTRAINT chk_product_revo_purchaseprice_nonnegative
    CHECK (purchaseprice >= 0);

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260821_finance_dashboard_reports_product_purchase_price_v1',
    'Product purchase price cost basis for COGS and inventory valuation'
)
ON CONFLICT (version) DO NOTHING;
