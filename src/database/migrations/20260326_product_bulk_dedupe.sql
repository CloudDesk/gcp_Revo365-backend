-- Product bulk upload idempotency and dedupe ledger.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS product_bulk_import_jobs (
  id BIGSERIAL PRIMARY KEY,
  payload_hash VARCHAR(64) NOT NULL,
  uploaded_by BIGINT,
  mode VARCHAR(32) NOT NULL DEFAULT 'strict',
  status VARCHAR(32) NOT NULL DEFAULT 'processing',
  total_rows INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  duplicate_row_count INTEGER NOT NULL DEFAULT 0,
  response_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_product_bulk_import_jobs_created_at
  ON product_bulk_import_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_bulk_import_jobs_status
  ON product_bulk_import_jobs (status);

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_product_bulk_import_jobs_payload_hash
    ON product_bulk_import_jobs (payload_hash);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping uq_product_bulk_import_jobs_payload_hash: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS product_bulk_row_dedupe (
  id BIGSERIAL PRIMARY KEY,
  row_hash VARCHAR(64) NOT NULL,
  product_id BIGINT,
  source_job_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_bulk_row_dedupe_created_at
  ON product_bulk_row_dedupe (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_bulk_row_dedupe_source_job_id
  ON product_bulk_row_dedupe (source_job_id);

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_product_bulk_row_dedupe_row_hash
    ON product_bulk_row_dedupe (row_hash);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping uq_product_bulk_row_dedupe_row_hash: %', SQLERRM;
END $$;

