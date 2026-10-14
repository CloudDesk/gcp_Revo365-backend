-- Unified Accounts Payable Bills.
-- Keeps poinvoice as the single Bill table and is safe to run repeatedly.

ALTER TABLE poinvoice
    ADD COLUMN IF NOT EXISTS billtype VARCHAR(20) NOT NULL DEFAULT 'inventory',
    ADD COLUMN IF NOT EXISTS supplierid BIGINT,
    ADD COLUMN IF NOT EXISTS expenseaccountid BIGINT,
    ADD COLUMN IF NOT EXISTS expensecategory VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payeename VARCHAR(255),
    ADD COLUMN IF NOT EXISTS igst NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taxmode VARCHAR(20) NOT NULL DEFAULT 'cgst_sgst',
    ADD COLUMN IF NOT EXISTS suppliergstin VARCHAR(64),
    ADD COLUMN IF NOT EXISTS placeofsupply VARCHAR(100),
    ADD COLUMN IF NOT EXISTS taxableamount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE poinvoice
    ALTER COLUMN ponumber DROP NOT NULL;

UPDATE poinvoice
SET billtype = COALESCE(NULLIF(TRIM(billtype), ''), 'inventory'),
    igst = COALESCE(igst, 0),
    taxmode = COALESCE(NULLIF(TRIM(taxmode), ''), 'cgst_sgst'),
    taxableamount = COALESCE(taxableamount, GREATEST(COALESCE(subtotal, 0) - COALESCE(discount, 0), 0));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'poinvoice_billtype_check'
          AND conrelid = 'poinvoice'::regclass
    ) THEN
        ALTER TABLE poinvoice
            ADD CONSTRAINT poinvoice_billtype_check
            CHECK (billtype IN ('inventory', 'expense'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'poinvoice_supplierid_fkey'
          AND conrelid = 'poinvoice'::regclass
    ) THEN
        ALTER TABLE poinvoice
            ADD CONSTRAINT poinvoice_supplierid_fkey
            FOREIGN KEY (supplierid) REFERENCES supplier(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'poinvoice_expenseaccountid_fkey'
          AND conrelid = 'poinvoice'::regclass
    ) THEN
        ALTER TABLE poinvoice
            ADD CONSTRAINT poinvoice_expenseaccountid_fkey
            FOREIGN KEY (expenseaccountid) REFERENCES finance_accounts(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_poinvoice_billtype_date
    ON poinvoice (billtype, invoicedate DESC);

CREATE INDEX IF NOT EXISTS idx_poinvoice_expenseaccount
    ON poinvoice (expenseaccountid)
    WHERE billtype = 'expense';

CREATE INDEX IF NOT EXISTS idx_poinvoice_direct_supplier
    ON poinvoice (supplierid, invoicedate DESC)
    WHERE billtype = 'expense' AND supplierid IS NOT NULL;
