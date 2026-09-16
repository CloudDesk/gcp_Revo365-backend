CREATE TABLE IF NOT EXISTS order_return_reasons (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT NULL,
    isactive BOOLEAN NOT NULL DEFAULT TRUE,
    sortorder INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO order_return_reasons (code, label, description, sortorder)
VALUES
    ('damaged', 'Damaged product', 'Product arrived damaged or became unusable on first use.', 10),
    ('defective', 'Defective product', 'Product is not working as expected.', 20),
    ('wrong_item', 'Wrong item delivered', 'Delivered item does not match the purchased item.', 30),
    ('missing_accessories', 'Missing accessories', 'Important accessories or box contents are missing.', 40),
    ('not_as_described', 'Not as described', 'Product condition or specifications do not match the listing.', 50),
    ('delivery_issue', 'Delivery issue', 'Package condition or delivery handling caused a problem.', 60),
    ('changed_mind', 'Changed my mind', 'Customer no longer wants the product.', 70),
    ('other', 'Other', 'Any other return reason.', 80)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS orderline_returns (
    id BIGSERIAL PRIMARY KEY,
    orderlineid INTEGER NOT NULL REFERENCES orderline(id) ON DELETE CASCADE,
    uniqueorderid TEXT NOT NULL,
    merchanttransactionid TEXT NULL,
    userid INTEGER NULL,
    productid INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    request_source TEXT NOT NULL DEFAULT 'customer',
    reason_id BIGINT NULL REFERENCES order_return_reasons(id) ON DELETE SET NULL,
    reason_code TEXT NULL,
    reason_label TEXT NULL,
    reason_text TEXT NULL,
    customer_comment TEXT NULL,
    admin_comment TEXT NULL,
    pickup_provider TEXT NULL,
    pickup_reference TEXT NULL,
    refund_status TEXT NOT NULL DEFAULT 'not_requested',
    refund_reference TEXT NULL,
    restock_disposition TEXT NOT NULL DEFAULT 'available',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ NULL,
    rejected_at TIMESTAMPTZ NULL,
    received_at TIMESTAMPTZ NULL,
    finalized_at TIMESTAMPTZ NULL,
    resolved_at TIMESTAMPTZ NULL,
    approved_by INTEGER NULL,
    rejected_by INTEGER NULL,
    received_by INTEGER NULL,
    finalized_by INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT orderline_returns_status_chk CHECK (
        status IN ('requested', 'approved', 'rejected', 'received', 'finalized', 'closed')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS orderline_returns_open_idx
ON orderline_returns (orderlineid)
WHERE status IN ('requested', 'approved', 'received');
