CREATE TABLE IF NOT EXISTS inventory_reservations (
  id BIGSERIAL PRIMARY KEY,
  merchanttransactionid VARCHAR(255) NOT NULL,
  productid INTEGER NOT NULL,
  location VARCHAR(255),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reservation_type VARCHAR(32) NOT NULL DEFAULT 'product',
  status VARCHAR(32) NOT NULL DEFAULT 'held',
  ordertype VARCHAR(64),
  ordername VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  committed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  release_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_merchanttransactionid
  ON inventory_reservations (merchanttransactionid);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_product_status_expires
  ON inventory_reservations (productid, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_status
  ON inventory_reservations (status);

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservation_active_hold
    ON inventory_reservations (
      merchanttransactionid,
      productid,
      COALESCE(location, ''),
      reservation_type
    )
    WHERE status = 'held';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping uq_inventory_reservation_active_hold: %', SQLERRM;
END $$;
