-- M4 AR/AP control-account reconciliation foundation.
-- Additive only: analysis is read-only and corrective postings require approval.

-- Do not guess tenant ownership for legacy operational documents. New writes
-- always provide organizationid; existing rows remain NULL until an explicit,
-- reviewed tenant backfill has mapped them.
ALTER TABLE revoinvoice ADD COLUMN IF NOT EXISTS organizationid BIGINT;
ALTER TABLE poinvoice ADD COLUMN IF NOT EXISTS organizationid BIGINT;
ALTER TABLE revoinvoice ALTER COLUMN organizationid DROP DEFAULT, ALTER COLUMN organizationid DROP NOT NULL;
ALTER TABLE poinvoice ALTER COLUMN organizationid DROP DEFAULT, ALTER COLUMN organizationid DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revoinvoice_m4_org_date
    ON revoinvoice (organizationid, invoicedate, id);
CREATE INDEX IF NOT EXISTS idx_poinvoice_m4_org_date
    ON poinvoice (organizationid, invoicedate, id);

CREATE TABLE IF NOT EXISTS finance_m4_reconciliation_runs (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL,
    asofdate DATE NOT NULL,
    cutoverdate DATE NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'dry_run',
    documentsreceivable NUMERIC(18,2) NOT NULL,
    ledgerreceivable NUMERIC(18,2) NOT NULL,
    receivablevariance NUMERIC(18,2) NOT NULL,
    documentspayable NUMERIC(18,2) NOT NULL,
    ledgerpayable NUMERIC(18,2) NOT NULL,
    payablevariance NUMERIC(18,2) NOT NULL,
    arcounterpartaccountid BIGINT REFERENCES finance_accounts(id),
    apcounterpartaccountid BIGINT REFERENCES finance_accounts(id),
    approvalnote TEXT,
    createdby VARCHAR(255) NOT NULL,
    createddate BIGINT NOT NULL,
    approvedby VARCHAR(255),
    approveddate BIGINT,
    postedby VARCHAR(255),
    posteddate BIGINT,
    CONSTRAINT chk_finance_m4_run_status CHECK (status IN ('dry_run','approved','posted','superseded')),
    CONSTRAINT uq_finance_m4_run_fingerprint UNIQUE (organizationid, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_finance_m4_runs_org_date
    ON finance_m4_reconciliation_runs (organizationid, asofdate DESC, id DESC);

CREATE TABLE IF NOT EXISTS finance_m4_correction_journals (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL,
    runid BIGINT NOT NULL REFERENCES finance_m4_reconciliation_runs(id) ON DELETE RESTRICT,
    controltype VARCHAR(2) NOT NULL,
    journalentryid BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
    amount NUMERIC(18,2) NOT NULL,
    createddate BIGINT NOT NULL,
    CONSTRAINT chk_finance_m4_controltype CHECK (controltype IN ('ar','ap')),
    CONSTRAINT chk_finance_m4_amount CHECK (amount > 0),
    CONSTRAINT uq_finance_m4_run_control UNIQUE (organizationid, runid, controltype),
    CONSTRAINT uq_finance_m4_journal UNIQUE (journalentryid)
);

INSERT INTO finance_schema_versions (version, description)
VALUES ('20260826_m4_reconciliation_foundation_v1',
        'Organization-scoped M4 dry runs, approvals and idempotent corrective journal links')
ON CONFLICT (version) DO NOTHING;
