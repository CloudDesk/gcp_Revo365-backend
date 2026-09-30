-- Track the supplier-specific, GST-exclusive acquisition cost of each stock row.
-- Columns remain nullable for legacy records; application validation requires
-- both values whenever a stock record is created or edited.
ALTER TABLE stock_revo
    ADD COLUMN IF NOT EXISTS supplierid INTEGER,
    ADD COLUMN IF NOT EXISTS purchaseprice NUMERIC(14, 2);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_stock_revo_supplier'
          AND conrelid = 'stock_revo'::regclass
    ) THEN
        ALTER TABLE stock_revo
            ADD CONSTRAINT fk_stock_revo_supplier
            FOREIGN KEY (supplierid) REFERENCES supplier(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_stock_revo_purchaseprice_positive'
          AND conrelid = 'stock_revo'::regclass
    ) THEN
        ALTER TABLE stock_revo
            ADD CONSTRAINT chk_stock_revo_purchaseprice_positive
            CHECK (purchaseprice IS NULL OR purchaseprice > 0);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_stock_revo_supplierid
    ON stock_revo(supplierid);
