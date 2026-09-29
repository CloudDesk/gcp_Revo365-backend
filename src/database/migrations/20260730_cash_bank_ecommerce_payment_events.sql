-- Durable inbox for automatic e-commerce payment posting.
--
-- A successful online product payment is recorded here before finance posting.
-- Missing payment-account configuration leaves the event pending without
-- failing the customer checkout. Retrying is idempotent.

CREATE TABLE IF NOT EXISTS ecommerce_payment_finance_events (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    provider VARCHAR(50) NOT NULL,
    paymentmethod VARCHAR(50) NOT NULL DEFAULT '*',
    sourcepaymentid VARCHAR(255) NOT NULL,
    providerorderid VARCHAR(255),
    merchanttransactionid VARCHAR(255) NOT NULL,
    paymenttransactionid VARCHAR(255),
    primaryorderid VARCHAR(255),
    customerid BIGINT NOT NULL,
    customername VARCHAR(255) NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    currencycode CHAR(3) NOT NULL DEFAULT 'INR',
    paymentdate DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attemptcount INTEGER NOT NULL DEFAULT 0,
    failurecode VARCHAR(80),
    failuremessage TEXT,
    banktransactionid BIGINT
        REFERENCES bank_transactions(id) ON DELETE RESTRICT,
    createdby VARCHAR(255),
    modifiedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    processeddate BIGINT,
    CONSTRAINT uq_ecommerce_payment_finance_event
        UNIQUE (organizationid, provider, sourcepaymentid),
    CONSTRAINT chk_ecommerce_payment_finance_amount
        CHECK (amount > 0),
    CONSTRAINT chk_ecommerce_payment_finance_status
        CHECK (status IN ('pending', 'posted', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_payment_finance_pending
    ON ecommerce_payment_finance_events (
        organizationid,
        status,
        paymentdate,
        id
    );

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260730_cash_bank_ecommerce_payments_v1',
    'Durable e-commerce payment events for automatic Cash and Bank posting'
)
ON CONFLICT (version) DO NOTHING;
