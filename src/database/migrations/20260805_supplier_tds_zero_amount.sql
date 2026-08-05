-- Supplier Bill payments require a TDS section whenever TDS adjustment is
-- enabled, while allowing the mapped TDS Payable amount to be zero.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('20260805_supplier_tds_zero_amount'));

ALTER TABLE bank_transaction_allocations
    DROP CONSTRAINT IF EXISTS chk_bank_allocations_tds;

ALTER TABLE bank_transaction_allocations
    ADD CONSTRAINT chk_bank_allocations_tds
    CHECK (
        (
            tdsapplied = FALSE
            AND tdsamount = 0
            AND tdsaccountid IS NULL
            AND tdssectionid IS NULL
        )
        OR (
            tdsapplied = TRUE
            AND tdsamount >= 0
            AND tdsaccountid IS NOT NULL
            AND (documenttype <> 'purchase_bill' OR tdssectionid IS NOT NULL)
        )
    );

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260805_supplier_tds_zero_amount_v1',
    'Require Supplier Bill TDS section when enabled and allow zero TDS Payable amount'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
