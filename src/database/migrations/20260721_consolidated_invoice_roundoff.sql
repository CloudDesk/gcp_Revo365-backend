ALTER TABLE consolidated_invoices
    ADD COLUMN IF NOT EXISTS totalbeforeroundoff NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS roundoffamount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS payableamount NUMERIC(14, 2);

UPDATE consolidated_invoices
SET
    totalbeforeroundoff = COALESCE(totalbeforeroundoff, totalamount, 0),
    roundoffamount = COALESCE(
        roundoffamount,
        ROUND(COALESCE(totalamount, 0)) - COALESCE(totalamount, 0),
        0
    ),
    payableamount = COALESCE(payableamount, ROUND(COALESCE(totalamount, 0)), 0)
WHERE totalbeforeroundoff IS NULL
   OR roundoffamount IS NULL
   OR payableamount IS NULL;

ALTER TABLE consolidated_invoices
    ALTER COLUMN totalbeforeroundoff SET DEFAULT 0,
    ALTER COLUMN roundoffamount SET DEFAULT 0,
    ALTER COLUMN payableamount SET DEFAULT 0;
