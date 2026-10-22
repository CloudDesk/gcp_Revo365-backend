-- Delivery Challan module enhancements requested for the dedicated module and PDF.
ALTER TABLE delivery_challans
    ADD COLUMN IF NOT EXISTS recipientemail VARCHAR(255),
    ADD COLUMN IF NOT EXISTS billingaddress TEXT;

ALTER TABLE delivery_challan_lines
    ADD COLUMN IF NOT EXISTS hsnsaccode VARCHAR(64),
    ADD COLUMN IF NOT EXISTS taxableamount NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS gstrate NUMERIC(9, 4),
    ADD COLUMN IF NOT EXISTS gstamount NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS totalamount NUMERIC(18, 2);

