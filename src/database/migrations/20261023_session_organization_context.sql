ALTER TABLE users
  ADD COLUMN IF NOT EXISTS organizationid INTEGER;

ALTER TABLE inventoryusers
  ADD COLUMN IF NOT EXISTS organizationid INTEGER;

UPDATE users SET organizationid = 1 WHERE organizationid IS NULL;
UPDATE inventoryusers SET organizationid = 1 WHERE organizationid IS NULL;

ALTER TABLE users ALTER COLUMN organizationid SET DEFAULT 1;
ALTER TABLE users ALTER COLUMN organizationid SET NOT NULL;
ALTER TABLE inventoryusers ALTER COLUMN organizationid SET DEFAULT 1;
ALTER TABLE inventoryusers ALTER COLUMN organizationid SET NOT NULL;
