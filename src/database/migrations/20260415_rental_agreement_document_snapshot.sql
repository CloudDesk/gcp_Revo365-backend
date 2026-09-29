ALTER TABLE rental_agreement
    ADD COLUMN IF NOT EXISTS documentsnapshot JSONB,
    ADD COLUMN IF NOT EXISTS documentversion VARCHAR(32) DEFAULT 'v1';
