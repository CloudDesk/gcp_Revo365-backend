ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS billingaddresssnapshot JSONB,
  ADD COLUMN IF NOT EXISTS shippingaddresssnapshot JSONB;

ALTER TABLE orderline
  ADD COLUMN IF NOT EXISTS billingaddresssnapshot JSONB,
  ADD COLUMN IF NOT EXISTS shippingaddresssnapshot JSONB;

ALTER TABLE revoinvoice
  ADD COLUMN IF NOT EXISTS billingaddresssnapshot JSONB,
  ADD COLUMN IF NOT EXISTS shippingaddresssnapshot JSONB;
