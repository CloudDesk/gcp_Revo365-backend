

-- Asynchronous printable Delivery Challan document lifecycle.
ALTER TABLE delivery_challans
    ADD COLUMN IF NOT EXISTS documentstatus VARCHAR(20) NOT NULL DEFAULT 'not_generated',
    ADD COLUMN IF NOT EXISTS documenturl TEXT,
    ADD COLUMN IF NOT EXISTS documenterror VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS documentattempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS documentstarteddate BIGINT,
    ADD COLUMN IF NOT EXISTS documentgenerateddate BIGINT,
    ADD COLUMN IF NOT EXISTS documentversion INTEGER NOT NULL DEFAULT 1;

ALTER TABLE delivery_challans
    DROP CONSTRAINT IF EXISTS chk_delivery_challan_document_status;

ALTER TABLE delivery_challans
    ADD CONSTRAINT chk_delivery_challan_document_status CHECK (
      documentstatus IN ('not_generated', 'pending', 'processing', 'ready', 'failed')
    );

CREATE INDEX IF NOT EXISTS idx_delivery_challans_document_queue
    ON delivery_challans (documentstatus, createddate)
    WHERE documentstatus IN ('pending', 'processing');