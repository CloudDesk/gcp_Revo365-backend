-- ============================================================
-- Migration: Add ecom_visible column to product_revo
-- Project: Revo365 / Teqit Backend
-- Created: 2026-03-06
--
-- PURPOSE:
--   Adds a dedicated `ecom_visible` boolean flag to product_revo
--   to control ecom listing visibility independently of:
--     - ecompublish (used to identify rental vs sale products)
--     - isdeleted   (permanent soft delete)
--     - isarchive   (archived state)
--
-- BEHAVIOR:
--   ecom_visible = TRUE  → product shows on ecom (default)
--   ecom_visible = FALSE → product hidden from ecom, cart/wishlist auto-cleared
--
-- NOTE: Does NOT affect stock quantities or orderlines.
-- ============================================================

ALTER TABLE product_revo
ADD COLUMN IF NOT EXISTS ecom_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- Index for fast ecom listing queries
CREATE INDEX IF NOT EXISTS idx_product_revo_ecom_visible ON product_revo (ecom_visible)
WHERE
    ecom_visible = TRUE;

-- Confirm
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE
    table_name = 'product_revo'
    AND column_name = 'ecom_visible';