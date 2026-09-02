ALTER TABLE revoinvoice
  ADD COLUMN IF NOT EXISTS paymentdata JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS paidamount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balanceamount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paymentstatus VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS lastpaymentdate BIGINT;

ALTER TABLE revoinvoice
  DROP CONSTRAINT IF EXISTS chk_revoinvoice_paymentstatus;

ALTER TABLE revoinvoice
  ADD CONSTRAINT chk_revoinvoice_paymentstatus
  CHECK (paymentstatus IN ('pending', 'partially_paid', 'paid'));

UPDATE revoinvoice
SET
  paymentdata = COALESCE(paymentdata, '[]'::jsonb),
  paidamount = COALESCE(paidamount, 0),
  balanceamount = GREATEST(COALESCE(totalorderamount, 0) - COALESCE(paidamount, 0), 0),
  paymentstatus = CASE
    WHEN COALESCE(paidamount, 0) >= COALESCE(totalorderamount, 0)
      AND COALESCE(totalorderamount, 0) > 0 THEN 'paid'
    WHEN COALESCE(paidamount, 0) > 0 THEN 'partially_paid'
    ELSE 'pending'
  END
WHERE paymentstatus IS NULL
   OR paymentstatus NOT IN ('pending', 'partially_paid', 'paid')
   OR balanceamount IS NULL
   OR paidamount IS NULL
   OR paymentdata IS NULL;

WITH invoice_amounts AS (
  SELECT
    id,
    orderid,
    COALESCE(
      totalorderamount,
      NULLIF(regexp_replace(COALESCE(invoicedata->>'payableamount', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      NULLIF(regexp_replace(COALESCE(supportingdocumentdata->>'payableamount', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      NULLIF(regexp_replace(COALESCE(summaryinvoicedata->>'totalamount', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      NULLIF(regexp_replace(COALESCE(invoicedata->>'total', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      NULLIF(regexp_replace(COALESCE(invoicedata->>'totalamount', ''), '[^0-9.-]', '', 'g'), '')::numeric,
      0
    ) AS invoiceamount
  FROM revoinvoice
),
order_refs AS (
  SELECT ia.id AS invoiceid, o.merchanttransactionid, o.paymentmethod
  FROM invoice_amounts ia
  JOIN orders o ON o.orderid = ia.orderid
  WHERE ia.orderid IS NOT NULL
  UNION
  SELECT ia.id AS invoiceid, ol.merchanttransactionid, ol.paymentmethod
  FROM invoice_amounts ia
  JOIN orderline ol ON ol.uniqueorderid = ia.orderid
  WHERE ia.orderid IS NOT NULL
  UNION
  SELECT ia.id AS invoiceid, tpo.merchanttransactionid, NULL::varchar AS paymentmethod
  FROM invoice_amounts ia
  JOIN thirdpartyorders tpo ON tpo.orderid = ia.orderid
  WHERE ia.orderid IS NOT NULL
),
latest_payments AS (
  SELECT DISTINCT ON (order_refs.invoiceid)
    order_refs.invoiceid,
    order_refs.paymentmethod,
    t.transactionid,
    t.amount,
    t.createddate,
    t.transactiondata,
    t.razorpay_payment_id,
    t.razorpay_order_id
  FROM order_refs
  JOIN transaction t ON t.merchanttransactionid = order_refs.merchanttransactionid
  WHERE order_refs.merchanttransactionid IS NOT NULL
  ORDER BY order_refs.invoiceid, t.createddate DESC NULLS LAST, t.id DESC
),
payment_summary AS (
  SELECT
    ia.id,
    ia.invoiceamount,
    LEAST(ia.invoiceamount, COALESCE(lp.amount, ia.invoiceamount)) AS paidamount,
    GREATEST(ia.invoiceamount - LEAST(ia.invoiceamount, COALESCE(lp.amount, ia.invoiceamount)), 0) AS balanceamount,
    lp.createddate AS lastpaymentdate,
    jsonb_build_array(
      jsonb_build_object(
        'id', 1,
        'paymentamount', LEAST(ia.invoiceamount, COALESCE(lp.amount, ia.invoiceamount)),
        'paymentmethod',
          CASE
            WHEN lp.transactiondata->>'provider' = 'offline_cash' THEN 'cash'
            WHEN lp.razorpay_payment_id IS NOT NULL THEN 'razorpay'
            ELSE LOWER(COALESCE(lp.paymentmethod, 'cash'))
          END,
        'paymentdate', COALESCE(lp.createddate, EXTRACT(EPOCH FROM NOW())::bigint),
        'transactionreference', COALESCE(lp.razorpay_payment_id, lp.transactionid),
        'providerpaymentid', lp.razorpay_payment_id,
        'providerorderid', lp.razorpay_order_id,
        'transactionid', lp.transactionid,
        'source', 'order_payment',
        'status', 'success',
        'comments', NULL
      )
    ) AS paymentdata
  FROM invoice_amounts ia
  JOIN latest_payments lp ON lp.invoiceid = ia.id
  WHERE ia.invoiceamount > 0
)
UPDATE revoinvoice ri
SET
  paymentdata = payment_summary.paymentdata,
  paidamount = payment_summary.paidamount,
  balanceamount = payment_summary.balanceamount,
  paymentstatus = CASE
    WHEN payment_summary.paidamount >= payment_summary.invoiceamount THEN 'paid'
    WHEN payment_summary.paidamount > 0 THEN 'partially_paid'
    ELSE 'pending'
  END,
  lastpaymentdate = payment_summary.lastpaymentdate
FROM payment_summary
WHERE ri.id = payment_summary.id
  AND CASE
    WHEN ri.paymentdata IS NULL THEN TRUE
    WHEN jsonb_typeof(ri.paymentdata) = 'array'
      THEN jsonb_array_length(ri.paymentdata) = 0
    ELSE FALSE
  END;
