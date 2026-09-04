CREATE TABLE IF NOT EXISTS payment_refunds (
    id BIGSERIAL PRIMARY KEY,
    orderlineid BIGINT NOT NULL REFERENCES orderline(id) ON DELETE CASCADE,
    uniqueorderid TEXT NOT NULL,
    merchanttransactionid TEXT NOT NULL,
    userid BIGINT NULL,
    productid BIGINT NULL,
    transactionid TEXT NULL,
    return_request_id BIGINT NULL REFERENCES orderline_returns(id) ON DELETE SET NULL,
    razorpay_payment_id TEXT NOT NULL,
    razorpay_refund_id TEXT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'initiated',
    gateway_status TEXT NULL,
    reason_code TEXT NULL,
    reason_text TEXT NULL,
    admin_note TEXT NULL,
    gateway_response JSONB NULL,
    gateway_error JSONB NULL,
    requested_by BIGINT NULL,
    processed_by BIGINT NULL,
    synced_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_orderlineid
    ON payment_refunds(orderlineid);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_merchanttransactionid
    ON payment_refunds(merchanttransactionid);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_razorpay_payment_id
    ON payment_refunds(razorpay_payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_razorpay_refund_id
    ON payment_refunds(razorpay_refund_id);
