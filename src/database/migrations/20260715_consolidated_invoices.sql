CREATE TABLE IF NOT EXISTS consolidated_invoices (
    id SERIAL PRIMARY KEY,
    customerid INTEGER NOT NULL,
    periodstart DATE NOT NULL,
    periodend DATE NOT NULL,
    periodlabel VARCHAR(64) NOT NULL,
    includedinvoicefor JSONB NOT NULL DEFAULT '[]'::jsonb,
    invoiceforkey VARCHAR(255) NOT NULL,
    sourceinvoiceids JSONB NOT NULL DEFAULT '[]'::jsonb,
    sourceinvoicekey TEXT NOT NULL,
    documentnumber VARCHAR(120),
    documenturl TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'generated',
    subtotal NUMERIC(14, 2) DEFAULT 0,
    taxamount NUMERIC(14, 2) DEFAULT 0,
    totalamount NUMERIC(14, 2) DEFAULT 0,
    generatedby INTEGER,
    metadatajson JSONB,
    createddate BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS consolidated_invoice_sources (
    id SERIAL PRIMARY KEY,
    consolidatedinvoiceid INTEGER NOT NULL REFERENCES consolidated_invoices(id) ON DELETE CASCADE,
    revoinvoiceid INTEGER NOT NULL,
    invoicefor VARCHAR(100),
    invoicenumber VARCHAR(500),
    invoiceamount NUMERIC(14, 2) DEFAULT 0,
    billingperiodlabel VARCHAR(64),
    createddate BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_consolidated_invoices_customer_period
    ON consolidated_invoices(customerid, periodstart, periodend, status);

CREATE INDEX IF NOT EXISTS idx_consolidated_invoices_exact_source
    ON consolidated_invoices(customerid, periodstart, periodend, invoiceforkey, sourceinvoicekey)
    WHERE status = 'generated';

CREATE INDEX IF NOT EXISTS idx_consolidated_invoice_sources_invoice
    ON consolidated_invoice_sources(revoinvoiceid);
