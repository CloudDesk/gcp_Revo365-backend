-- Payment webhook event ledger for durable idempotency and auditability.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(64) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_name VARCHAR(255),
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'received',
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_received_at
  ON payment_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_status
  ON payment_webhook_events (status);

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_webhook_events_provider_event
    ON payment_webhook_events (provider, event_id);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping unique webhook-event index creation: %', SQLERRM;
END $$;

-- Defensive uniqueness for Razorpay identifiers.
-- These blocks are best-effort and intentionally non-fatal for existing installs with legacy duplicates.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_razorpay_payment_id
    ON transaction (razorpay_payment_id)
    WHERE razorpay_payment_id IS NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping uq_transaction_razorpay_payment_id: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_razorpay_order_id
    ON transaction (razorpay_order_id)
    WHERE razorpay_order_id IS NOT NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping uq_transaction_razorpay_order_id: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_merchanttransactionid
    ON transaction (merchanttransactionid)
    WHERE merchanttransactionid IS NOT NULL AND merchanttransactionid <> '';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping uq_transaction_merchanttransactionid: %', SQLERRM;
END $$;
