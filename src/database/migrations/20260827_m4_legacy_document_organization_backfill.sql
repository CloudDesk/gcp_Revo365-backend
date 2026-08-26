-- M4 legacy operational-document tenant backfill.
--
-- Historical revoinvoice and poinvoice rows pre-date organization scoping.
-- Assigning them without checking the tenant topology could expose one
-- organization's documents to another, so this migration only proceeds when
-- finance_accounts proves this is a single-organization database for org 1.

DO $$
DECLARE
    finance_org_count INTEGER;
    finance_org_id BIGINT;
BEGIN
    SELECT COUNT(DISTINCT organizationid), MIN(organizationid)
      INTO finance_org_count, finance_org_id
      FROM finance_accounts;

    IF finance_org_count <> 1 OR finance_org_id <> 1 THEN
        RAISE EXCEPTION
            'M4 legacy document backfill requires exactly finance organization 1; found % organization(s), minimum id %',
            finance_org_count,
            finance_org_id;
    END IF;

    UPDATE revoinvoice
       SET organizationid = finance_org_id
     WHERE organizationid IS NULL;

    UPDATE poinvoice
       SET organizationid = finance_org_id
     WHERE organizationid IS NULL;
END
$$;

-- Keep the column nullable for compatibility with legacy document creation
-- paths. M4's integrity gate will continue to block dry runs if a future path
-- creates an unscoped document; tenant enforcement can be added separately
-- after every legacy writer has been made organization-aware.
ALTER TABLE revoinvoice
    ALTER COLUMN organizationid DROP DEFAULT;

ALTER TABLE poinvoice
    ALTER COLUMN organizationid DROP DEFAULT;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260827_m4_legacy_document_organization_backfill_v1',
    'Safely assigned legacy invoices and bills to the sole finance organization'
)
ON CONFLICT (version) DO NOTHING;
