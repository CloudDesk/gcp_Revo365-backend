-- Store the generated device-list XLSX separately from the retired supporting PDF.
-- Existing supporting-document values are intentionally preserved for historical records.
ALTER TABLE consolidated_invoices
    ADD COLUMN IF NOT EXISTS supportingexcelnumber VARCHAR(500),
    ADD COLUMN IF NOT EXISTS supportingexcelurl TEXT;

CREATE INDEX IF NOT EXISTS idx_consolidated_invoices_supporting_excel
    ON consolidated_invoices (supportingexcelnumber)
    WHERE supportingexcelnumber IS NOT NULL;
