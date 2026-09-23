-- Persist the final invoice round-off amount passed by service and sales flows.
-- Existing invoices predate this field and therefore have no round-off adjustment.
ALTER TABLE revoinvoice
    ADD COLUMN IF NOT EXISTS roundoffamount NUMERIC(14, 2) NOT NULL DEFAULT 0;
