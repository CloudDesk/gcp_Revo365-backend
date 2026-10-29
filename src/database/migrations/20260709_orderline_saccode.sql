-- ============================================================
-- Migration: Orderline SAC Code
-- Stores SAC separately from HSN for rental/service order lines.
--
-- Safe to run multiple times.
-- ============================================================

ALTER TABLE orderline
    ADD COLUMN IF NOT EXISTS saccode VARCHAR(50);
