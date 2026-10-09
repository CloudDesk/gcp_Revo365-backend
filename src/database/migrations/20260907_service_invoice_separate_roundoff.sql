-- Store product and service round-off adjustments independently for service invoices.
ALTER TABLE servicecostestimation
    ADD COLUMN IF NOT EXISTS productroundoffamount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS serviceroundoffamount NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE revoinvoice
    ADD COLUMN IF NOT EXISTS productroundoffamount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS serviceroundoffamount NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Existing estimates already retain each section's pre-round total, so both
-- adjustments can be reconstructed without changing product/service amounts.
UPDATE servicecostestimation
SET
    productroundoffamount = ROUND(COALESCE(producttotal, 0)) - COALESCE(producttotal, 0),
    serviceroundoffamount = ROUND(COALESCE(servicetotal, 0)) - COALESCE(servicetotal, 0),
    roundoffamount = (ROUND(COALESCE(producttotal, 0)) - COALESCE(producttotal, 0))
        + (ROUND(COALESCE(servicetotal, 0)) - COALESCE(servicetotal, 0)),
    totalpayableamount = ROUND(COALESCE(producttotal, 0))
        + ROUND(COALESCE(servicetotal, 0))
WHERE (producttotal IS NOT NULL OR servicetotal IS NOT NULL)
  AND (
      productroundoffamount IS DISTINCT FROM
          ROUND(COALESCE(producttotal, 0)) - COALESCE(producttotal, 0)
      OR serviceroundoffamount IS DISTINCT FROM
          ROUND(COALESCE(servicetotal, 0)) - COALESCE(servicetotal, 0)
      OR roundoffamount IS DISTINCT FROM
          (ROUND(COALESCE(producttotal, 0)) - COALESCE(producttotal, 0))
          + (ROUND(COALESCE(servicetotal, 0)) - COALESCE(servicetotal, 0))
      OR totalpayableamount IS DISTINCT FROM
          ROUND(COALESCE(producttotal, 0)) + ROUND(COALESCE(servicetotal, 0))
  );

-- Backfill service-invoice rows from their latest stored estimation without
-- changing historical invoice totals, payments, URLs, or document state.
UPDATE revoinvoice AS invoice
SET
    productroundoffamount = estimation.productroundoffamount,
    serviceroundoffamount = estimation.serviceroundoffamount
FROM (
    SELECT DISTINCT ON (ticketnumber)
        ticketnumber,
        productroundoffamount,
        serviceroundoffamount
    FROM servicecostestimation
    WHERE ticketnumber IS NOT NULL
    ORDER BY ticketnumber, id DESC
) AS estimation
WHERE LOWER(COALESCE(invoice.invoicefor, '')) = 'service'
  AND invoice.ticketnumber = estimation.ticketnumber
  AND (
      invoice.productroundoffamount IS DISTINCT FROM estimation.productroundoffamount
      OR invoice.serviceroundoffamount IS DISTINCT FROM estimation.serviceroundoffamount
  );
