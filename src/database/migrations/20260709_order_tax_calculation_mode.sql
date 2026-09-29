-- ============================================================
-- Migration: Order Tax Calculation Mode
-- Stores whether product amounts are GST-inclusive or GST-exclusive.
--
-- Existing records are backfilled as inclusive because historical
-- InStore and invoice flows treated productamount as GST-inclusive.
-- ============================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS taxcalculationmode VARCHAR(20) DEFAULT 'inclusive';

ALTER TABLE orderline
    ADD COLUMN IF NOT EXISTS taxcalculationmode VARCHAR(20) DEFAULT 'inclusive';

UPDATE orders
SET taxcalculationmode = 'inclusive'
WHERE taxcalculationmode IS NULL
   OR TRIM(taxcalculationmode) = '';

UPDATE orderline
SET taxcalculationmode = 'inclusive'
WHERE taxcalculationmode IS NULL
   OR TRIM(taxcalculationmode) = '';
