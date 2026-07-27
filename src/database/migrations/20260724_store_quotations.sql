CREATE TABLE IF NOT EXISTS store_quotations (
    id SERIAL PRIMARY KEY,
    quotationnumber VARCHAR(80) UNIQUE,
    customerid INTEGER,
    customername VARCHAR(500),
    customermobilenumber VARCHAR(80),
    quotationtype VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    source VARCHAR(80) NOT NULL DEFAULT 'instore',
    storelocation VARCHAR(255),
    finalversionid INTEGER,
    convertedorderid VARCHAR(255),
    convertedinvoiceid INTEGER,
    converteddate BIGINT,
    createdby VARCHAR(255),
    modifiedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    isarchive BOOLEAN NOT NULL DEFAULT FALSE,
    isdeleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_store_quotations_type
        CHECK (quotationtype IN ('sale', 'rental')),
    CONSTRAINT chk_store_quotations_status
        CHECK (status IN ('draft', 'sent', 'revised', 'accepted', 'rejected', 'expired', 'converted'))
);

CREATE TABLE IF NOT EXISTS store_quotation_versions (
    id SERIAL PRIMARY KEY,
    quotationid INTEGER NOT NULL REFERENCES store_quotations(id) ON DELETE CASCADE,
    versionnumber INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    subtotalamount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    discountamount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    taxableamount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    cgst NUMERIC(8, 2) NOT NULL DEFAULT 0,
    sgst NUMERIC(8, 2) NOT NULL DEFAULT 0,
    igst NUMERIC(8, 2) NOT NULL DEFAULT 0,
    taxamount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    roundoffamount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    totalamount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    validitydate BIGINT,
    itemdata JSONB NOT NULL DEFAULT '[]'::jsonb,
    quotationdata JSONB NOT NULL DEFAULT '{}'::jsonb,
    billingaddresssnapshot JSONB,
    shippingaddresssnapshot JSONB,
    termsconditions TEXT,
    notes TEXT,
    quoteurl TEXT,
    createdby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT uq_store_quotation_version UNIQUE (quotationid, versionnumber),
    CONSTRAINT chk_store_quotation_versions_status
        CHECK (status IN ('draft', 'sent', 'revised', 'accepted', 'rejected', 'expired'))
);

ALTER TABLE store_quotation_versions
    DROP CONSTRAINT IF EXISTS chk_store_quotation_versions_status;

ALTER TABLE store_quotation_versions
    ADD CONSTRAINT chk_store_quotation_versions_status
    CHECK (status IN ('draft', 'sent', 'revised', 'accepted', 'rejected', 'expired'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'store_quotations'
          AND constraint_name = 'fk_store_quotations_finalversion'
    ) THEN
        ALTER TABLE store_quotations
            ADD CONSTRAINT fk_store_quotations_finalversion
            FOREIGN KEY (finalversionid)
            REFERENCES store_quotation_versions(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_quotations_customer
    ON store_quotations(customerid, status, modifieddate DESC);

CREATE INDEX IF NOT EXISTS idx_store_quotations_type_status
    ON store_quotations(quotationtype, status, modifieddate DESC);

CREATE INDEX IF NOT EXISTS idx_store_quotation_versions_quote
    ON store_quotation_versions(quotationid, versionnumber DESC);

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS quotationid INTEGER,
    ADD COLUMN IF NOT EXISTS quotationversionid INTEGER,
    ADD COLUMN IF NOT EXISTS quotationnumber VARCHAR(80);

ALTER TABLE orderline
    ADD COLUMN IF NOT EXISTS quotationid INTEGER,
    ADD COLUMN IF NOT EXISTS quotationversionid INTEGER,
    ADD COLUMN IF NOT EXISTS quotationnumber VARCHAR(80);

ALTER TABLE revoinvoice
    ADD COLUMN IF NOT EXISTS quotationid INTEGER,
    ADD COLUMN IF NOT EXISTS quotationversionid INTEGER,
    ADD COLUMN IF NOT EXISTS quotationnumber VARCHAR(80);
