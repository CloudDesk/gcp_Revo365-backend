-- ============================================================
-- Migration: Add status_audit column to product_revo
-- Project: Revo365 / Teqit Backend
-- Created: 2026-03-13
--
-- PURPOSE:
--   Stores lightweight audit information for product lifecycle
--   status changes driven by the ecom visibility toggle.
--
-- SHAPE:
--   {
--     "current": {
--       "ecom_visible": true,
--       "changed_at": "2026-03-13T10:00:00.000Z",
--       "changed_by": {
--         "id": 1,
--         "name": "Admin User",
--         "email": "admin@example.com",
--         "role": "admin"
--       },
--       "source": "product.ecom_visibility.toggle"
--     },
--     "history": []
--   }
-- ============================================================

ALTER TABLE product_revo
ADD COLUMN IF NOT EXISTS status_audit JSONB NOT NULL DEFAULT '{"current": null, "history": []}'::jsonb;

SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE
    table_name = 'product_revo'
    AND column_name = 'status_audit';
