-- Manual in-store customer receipts capture TDS Receivable amount directly.
-- A statutory TDS section is not required for this debit receipt workflow.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('20260803_cash_bank_optional_tds_section'));

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
    '20260803_cash_bank_optional_tds_section_v1',
    'Allow manual receipt TDS Receivable without a statutory TDS section'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
