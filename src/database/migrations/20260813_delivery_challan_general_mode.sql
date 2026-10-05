-- Extends Phase 3 Delivery Challans with a non-financial Manual/General mode
-- and optional read-only Invoice amount snapshots.
ALTER TABLE delivery_challans
    ADD COLUMN IF NOT EXISTS challanmode VARCHAR(20) NOT NULL DEFAULT 'invoice',
    ADD COLUMN IF NOT EXISTS showamounts BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS referencenumber VARCHAR(255),
    ADD COLUMN IF NOT EXISTS purpose VARCHAR(500),
    ADD COLUMN IF NOT EXISTS recipientname VARCHAR(255),
    ADD COLUMN IF NOT EXISTS recipientphone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS recipientaddress TEXT;

ALTER TABLE delivery_challans
    ALTER COLUMN customerid DROP NOT NULL,
    ALTER COLUMN invoiceid DROP NOT NULL,
    ALTER COLUMN invoicenumber DROP NOT NULL;

ALTER TABLE delivery_challans
    DROP CONSTRAINT IF EXISTS chk_delivery_challans_mode;

ALTER TABLE delivery_challans
    ADD CONSTRAINT chk_delivery_challans_mode CHECK (
      (challanmode = 'invoice' AND customerid IS NOT NULL AND invoiceid IS NOT NULL)
      OR
      (challanmode = 'manual' AND invoiceid IS NULL AND invoicenumber IS NULL
       AND (customerid IS NOT NULL OR NULLIF(TRIM(recipientname), '') IS NOT NULL))
    );

ALTER TABLE delivery_challan_lines
    ADD COLUMN IF NOT EXISTS linesource VARCHAR(20) NOT NULL DEFAULT 'invoice',
    ADD COLUMN IF NOT EXISTS unit VARCHAR(30) NOT NULL DEFAULT 'Nos',
    ADD COLUMN IF NOT EXISTS assetreference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS unitrate NUMERIC(18, 2),
    ADD COLUMN IF NOT EXISTS lineamount NUMERIC(18, 2);

ALTER TABLE delivery_challan_lines
    ALTER COLUMN invoicelinekey DROP NOT NULL,
    ALTER COLUMN invoicequantity DROP NOT NULL;

ALTER TABLE delivery_challan_lines
    DROP CONSTRAINT IF EXISTS chk_delivery_challan_line_source;

ALTER TABLE delivery_challan_lines
    ADD CONSTRAINT chk_delivery_challan_line_source CHECK (
      (linesource = 'invoice' AND invoicelinekey IS NOT NULL AND invoicequantity IS NOT NULL)
      OR
      (linesource IN ('product', 'custom') AND invoicelinekey IS NULL AND invoicequantity IS NULL)
    );

CREATE INDEX IF NOT EXISTS idx_delivery_challans_org_page
    ON delivery_challans (organizationid, challandate DESC, id DESC);

-- Dedicated permission entry. Admin and Accountant receive current create/read
-- access; other roles receive an explicit denied entry for permission UI use.
UPDATE permissions p
SET permissionset = COALESCE(p.permissionset, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'object', 'Delivery Challans',
    'objectAPI', 'delivery_challan',
    'permissions', jsonb_build_object(
      'read', LOWER(p.role) IN ('admin', 'accountant'),
      'create', LOWER(p.role) IN ('admin', 'accountant'),
      'edit', FALSE,
      'delete', FALSE
    )
  )
)
WHERE NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
  WHERE item->>'objectAPI' = 'delivery_challan'
);

