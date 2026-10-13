-- In-store sales: user-selected invoice date (epoch milliseconds, same unit as
-- revoinvoice.invoicedate). NULL means "use the invoice generation date".
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS invoicedate BIGINT;
