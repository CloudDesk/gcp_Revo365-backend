ALTER TABLE consolidated_invoices
  ADD COLUMN IF NOT EXISTS versionnumber INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS iscurrent BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS supersedesid INTEGER,
  ADD COLUMN IF NOT EXISTS revisionreason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_consolidated_invoices_supersedes'
  ) THEN
    ALTER TABLE consolidated_invoices
      ADD CONSTRAINT fk_consolidated_invoices_supersedes
      FOREIGN KEY (supersedesid)
      REFERENCES consolidated_invoices(id)
      ON DELETE SET NULL;
  END IF;
END $$;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY customerid, periodstart, periodend, invoiceforkey
      ORDER BY createddate ASC NULLS FIRST, id ASC
    ) AS computed_version,
    ROW_NUMBER() OVER (
      PARTITION BY customerid, periodstart, periodend, invoiceforkey
      ORDER BY createddate DESC NULLS LAST, id DESC
    ) AS latest_rank
  FROM consolidated_invoices
  WHERE status = 'generated'
)
UPDATE consolidated_invoices ci
SET
  versionnumber = ranked.computed_version,
  iscurrent = ranked.latest_rank = 1,
  modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
FROM ranked
WHERE ci.id = ranked.id;

UPDATE consolidated_invoices
SET
  versionnumber = COALESCE(NULLIF(versionnumber, 0), 1),
  iscurrent = COALESCE(iscurrent, FALSE),
  modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT
WHERE versionnumber IS NULL
   OR versionnumber < 1
   OR iscurrent IS NULL;

CREATE INDEX IF NOT EXISTS idx_consolidated_invoices_current
  ON consolidated_invoices(customerid, periodstart, periodend, invoiceforkey, iscurrent)
  WHERE status = 'generated';

CREATE UNIQUE INDEX IF NOT EXISTS idx_consolidated_invoices_one_current
  ON consolidated_invoices(customerid, periodstart, periodend, invoiceforkey)
  WHERE status = 'generated' AND iscurrent = TRUE;
