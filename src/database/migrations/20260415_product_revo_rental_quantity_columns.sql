-- Add rental tracking quantity columns used by catalogue refresh/update paths.
-- Safe to run multiple times.

ALTER TABLE product_revo
    ADD COLUMN IF NOT EXISTS reservedforrentalquantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS serviceholdquantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS damagedquantity INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lostquantity INTEGER NOT NULL DEFAULT 0;

UPDATE product_revo
SET
    reservedforrentalquantity = COALESCE(reservedforrentalquantity, 0),
    serviceholdquantity = COALESCE(serviceholdquantity, 0),
    damagedquantity = COALESCE(damagedquantity, 0),
    lostquantity = COALESCE(lostquantity, 0)
WHERE
    reservedforrentalquantity IS NULL
    OR serviceholdquantity IS NULL
    OR damagedquantity IS NULL
    OR lostquantity IS NULL;
