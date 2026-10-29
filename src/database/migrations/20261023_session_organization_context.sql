-- Current deployment is single-tenant: TEQIT is organization 1.
-- The default keeps users created through existing application flows in that
-- organization until an organization selector is introduced.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organizationid BIGINT;

ALTER TABLE inventoryusers
  ADD COLUMN IF NOT EXISTS organizationid BIGINT;

-- Keep this migration compatible with an environment where an earlier draft
-- created these columns as INTEGER.
ALTER TABLE users
  ALTER COLUMN organizationid TYPE BIGINT USING organizationid::BIGINT;

ALTER TABLE inventoryusers
  ALTER COLUMN organizationid TYPE BIGINT USING organizationid::BIGINT;

-- Do not silently overwrite another tenant if this single-tenant migration is
-- accidentally used after multi-tenant data has been introduced.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE organizationid IS NOT NULL AND organizationid <> 1
  ) OR EXISTS (
    SELECT 1 FROM inventoryusers
    WHERE organizationid IS NOT NULL AND organizationid <> 1
  ) THEN
    RAISE EXCEPTION
      'Non-TEQIT organization values already exist; review them before applying the single-tenant organization migration.';
  END IF;
END
$$;

UPDATE users
SET organizationid = 1
WHERE organizationid IS NULL;

UPDATE inventoryusers
SET organizationid = 1
WHERE organizationid IS NULL;

ALTER TABLE users
  ALTER COLUMN organizationid SET DEFAULT 1,
  ALTER COLUMN organizationid SET NOT NULL;

ALTER TABLE inventoryusers
  ALTER COLUMN organizationid SET DEFAULT 1,
  ALTER COLUMN organizationid SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_organizationid_positive_chk'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_organizationid_positive_chk
      CHECK (organizationid > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventoryusers_organizationid_positive_chk'
      AND conrelid = 'inventoryusers'::regclass
  ) THEN
    ALTER TABLE inventoryusers
      ADD CONSTRAINT inventoryusers_organizationid_positive_chk
      CHECK (organizationid > 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_organizationid
  ON users (organizationid);

CREATE INDEX IF NOT EXISTS idx_inventoryusers_organizationid
  ON inventoryusers (organizationid);
