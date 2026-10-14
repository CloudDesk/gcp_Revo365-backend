-- ============================================================
-- Migration: Extend existing `rating` table for product reviews
-- Safe to run multiple times (IF NOT EXISTS / idempotent).
-- ============================================================

-- 1. New text columns
ALTER TABLE rating ADD COLUMN IF NOT EXISTS title        VARCHAR(100);
ALTER TABLE rating ADD COLUMN IF NOT EXISTS reviewtext   TEXT;

-- 2. Status enum-like column (stored as VARCHAR, enforced by CHECK)
ALTER TABLE rating ADD COLUMN IF NOT EXISTS status       VARCHAR(10) NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'hidden', 'flagged'));

-- 3. Admin flags
ALTER TABLE rating ADD COLUMN IF NOT EXISTS admincreated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rating ADD COLUMN IF NOT EXISTS flagcount    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rating ADD COLUMN IF NOT EXISTS helpfulcount INTEGER NOT NULL DEFAULT 0;

-- 4. Admin reply fields
ALTER TABLE rating ADD COLUMN IF NOT EXISTS adminreply   TEXT;
ALTER TABLE rating ADD COLUMN IF NOT EXISTS adminreplyat TIMESTAMPTZ;
ALTER TABLE rating ADD COLUMN IF NOT EXISTS adminreplyby INTEGER;   -- FK → inventoryusers.id

-- 5. Hide/unhide audit fields
ALTER TABLE rating ADD COLUMN IF NOT EXISTS hiddenat     TIMESTAMPTZ;
ALTER TABLE rating ADD COLUMN IF NOT EXISTS hiddenby     INTEGER;   -- FK → inventoryusers.id

-- 6. Null-relax orderId / userId so admin-created reviews (no order, no customer) can be inserted
--    (customer reviews still enforced at app layer via verified-purchase guard)
ALTER TABLE rating ALTER COLUMN orderid  DROP NOT NULL;
ALTER TABLE rating ALTER COLUMN userid   DROP NOT NULL;

-- 7. Partial unique index: one review per (user + product + order) for customer reviews only
--    Admin-created reviews (admincreated = true) are exempt from this uniqueness rule.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_rating
    ON rating (userid, productid, orderid)
    WHERE admincreated = FALSE;

-- 8. Backfill legacy rows: any existing row with NULL orderid or NULL userid must be
--    treated as admin-created so the new CHECK constraint below doesn't reject them.
UPDATE rating
SET admincreated = TRUE
WHERE (orderid IS NULL OR userid IS NULL)
  AND admincreated IS DISTINCT FROM TRUE;

-- 9. DB-level conditional integrity — added as NOT VALID so existing (now backfilled)
--    rows are not re-scanned; only NEW inserts/updates are enforced.
--    Uses DO $$ block so it is safe to run multiple times.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_customer_review_requires_order_and_user'
      AND conrelid = 'rating'::regclass
  ) THEN
    ALTER TABLE rating
      ADD CONSTRAINT chk_customer_review_requires_order_and_user
      CHECK (
        admincreated = TRUE
        OR (orderid IS NOT NULL AND userid IS NOT NULL)
      ) NOT VALID;
  END IF;
END
$$;

-- ============================================================
-- Corrective Migration: Fix rating constraints to use orderlineid
-- instead of orderid.
--
-- Rationale:
--   An order (orders table) can have many line items (orderline table).
--   Each line item maps to one specific product. A rating belongs to
--   a specific orderline (product + order combination), NOT to the
--   parent order. Using orderid in the unique constraint was too broad
--   and also caused INSERT failures since orderid was not sent in the
--   GCP file-upload payload (only orderlineid was).
--
-- Safe to run multiple times (idempotent).
-- ============================================================

-- 1. Drop the wrong unique index (built on orderid)
DROP INDEX IF EXISTS uq_customer_rating;

-- 2. Recreate the unique index on orderlineid instead
--    One review per (user + orderline) for customer reviews only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_rating
    ON rating (userid, productid, orderlineid)
    WHERE admincreated = FALSE;

-- 3. Drop the wrong check constraint (required orderid IS NOT NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_customer_review_requires_order_and_user'
      AND conrelid = 'rating'::regclass
  ) THEN
    ALTER TABLE rating
      DROP CONSTRAINT chk_customer_review_requires_order_and_user;
  END IF;
END
$$;

-- 4. Add corrected check constraint using orderlineid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_customer_review_requires_orderline_and_user'
      AND conrelid = 'rating'::regclass
  ) THEN
    ALTER TABLE rating
      ADD CONSTRAINT chk_customer_review_requires_orderline_and_user
      CHECK (
        admincreated = TRUE
        OR (orderlineid IS NOT NULL AND userid IS NOT NULL)
      ) NOT VALID;
  END IF;
END
$$;
