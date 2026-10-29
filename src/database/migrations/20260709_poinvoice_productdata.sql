-- ============================================================
-- Migration: PO Bill Product Allocations
-- Tracks which purchase-order product quantities are covered by
-- each supplier bill.
--
-- Safe to run multiple times.
-- ============================================================

ALTER TABLE poinvoice
    ADD COLUMN IF NOT EXISTS productdata JSONB;

ALTER TABLE poinvoice
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sgst NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cgst NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payabletaxamount NUMERIC DEFAULT 0;

UPDATE poinvoice
SET productdata = '[]'::jsonb
WHERE productdata IS NULL;

UPDATE poinvoice
SET subtotal = COALESCE(subtotal, 0),
    discount = COALESCE(discount, 0),
    sgst = COALESCE(sgst, 0),
    cgst = COALESCE(cgst, 0),
    payabletaxamount = COALESCE(payabletaxamount, 0);

ALTER TABLE poinvoice
    ALTER COLUMN productdata SET DEFAULT '[]'::jsonb,
    ALTER COLUMN productdata SET NOT NULL,
    ALTER COLUMN subtotal SET DEFAULT 0,
    ALTER COLUMN subtotal SET NOT NULL,
    ALTER COLUMN discount SET DEFAULT 0,
    ALTER COLUMN discount SET NOT NULL,
    ALTER COLUMN sgst SET DEFAULT 0,
    ALTER COLUMN sgst SET NOT NULL,
    ALTER COLUMN cgst SET DEFAULT 0,
    ALTER COLUMN cgst SET NOT NULL,
    ALTER COLUMN payabletaxamount SET DEFAULT 0,
    ALTER COLUMN payabletaxamount SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poinvoice_ponumber
    ON poinvoice(ponumber);

CREATE INDEX IF NOT EXISTS idx_poinvoice_productdata_gin
    ON poinvoice USING GIN(productdata);
