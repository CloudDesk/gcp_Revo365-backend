-- ============================================================
-- Migration: Order Tax Breakup
-- Adds IGST support and customer tax-location snapshots for
-- order headers and order lines.
--
-- Safe to run multiple times.
-- ============================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS igst NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taxmode VARCHAR(20) DEFAULT 'cgst_sgst',
    ADD COLUMN IF NOT EXISTS customertaxstate VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customertaxpincode VARCHAR(20);

ALTER TABLE orderline
    ADD COLUMN IF NOT EXISTS igst NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taxmode VARCHAR(20) DEFAULT 'cgst_sgst',
    ADD COLUMN IF NOT EXISTS customertaxstate VARCHAR(100),
    ADD COLUMN IF NOT EXISTS customertaxpincode VARCHAR(20);

UPDATE orders
SET
    igst = COALESCE(igst, 0),
    taxmode = COALESCE(NULLIF(TRIM(taxmode), ''), 'cgst_sgst')
WHERE
    igst IS NULL
    OR taxmode IS NULL
    OR TRIM(taxmode) = '';

UPDATE orderline
SET
    igst = COALESCE(igst, 0),
    taxmode = COALESCE(NULLIF(TRIM(taxmode), ''), 'cgst_sgst')
WHERE
    igst IS NULL
    OR taxmode IS NULL
    OR TRIM(taxmode) = '';
