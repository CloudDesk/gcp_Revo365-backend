ALTER TABLE orderline
    ADD COLUMN IF NOT EXISTS generatedmonthscount INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS invoicegenerated BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lastgeneratedinvoicedate DATE;
