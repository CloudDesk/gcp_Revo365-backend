ALTER TABLE consolidated_invoices
    ADD COLUMN IF NOT EXISTS billingthroughdate DATE;

ALTER TABLE consolidated_invoice_sources
    ADD COLUMN IF NOT EXISTS billingperiodstart DATE,
    ADD COLUMN IF NOT EXISTS billingperiodend DATE,
    ADD COLUMN IF NOT EXISTS billingstartdate DATE,
    ADD COLUMN IF NOT EXISTS billingthroughdate DATE,
    ADD COLUMN IF NOT EXISTS billabledays INTEGER,
    ADD COLUMN IF NOT EXISTS cycledays INTEGER,
    ADD COLUMN IF NOT EXISTS prorationfactor NUMERIC(12, 6),
    ADD COLUMN IF NOT EXISTS monthlyinvoiceamount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS proratedtaxableamount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS proratedtaxamount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS proratedtotalamount NUMERIC(14, 2);

CREATE INDEX IF NOT EXISTS idx_consolidated_invoice_sources_billing_progress
    ON consolidated_invoice_sources(revoinvoiceid, billingthroughdate);

CREATE INDEX IF NOT EXISTS idx_consolidated_invoices_billing_through
    ON consolidated_invoices(customerid, billingthroughdate, status);
