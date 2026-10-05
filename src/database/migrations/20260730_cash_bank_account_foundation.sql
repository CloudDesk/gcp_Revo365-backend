-- Cash and Bank Account accounting foundation.
--
-- Initial deployment rule:
--   Keep all initial Cash/Bank objects in this consolidated file until the
--   first environment applies it. After that point this file is immutable;
--   later changes must use a new dated migration.
--
-- The current migration runner executes every SQL file on every invocation,
-- so every statement in this baseline is intentionally idempotent.

CREATE TABLE IF NOT EXISTS finance_schema_versions (
    version VARCHAR(80) PRIMARY KEY,
    description TEXT NOT NULL,
    applieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS finance_accounts (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    accountcode VARCHAR(40) NOT NULL,
    accountname VARCHAR(255) NOT NULL,
    accounttype VARCHAR(30) NOT NULL,
    accountsubtype VARCHAR(50) NOT NULL,
    currencycode CHAR(3) NOT NULL DEFAULT 'INR',
    issystem BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    createdby VARCHAR(255),
    modifiedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_finance_accounts_type
        CHECK (accounttype IN ('asset', 'liability', 'equity', 'income', 'expense')),
    CONSTRAINT chk_finance_accounts_status
        CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_accounts_code
    ON finance_accounts (organizationid, LOWER(accountcode));

CREATE INDEX IF NOT EXISTS idx_finance_accounts_name
    ON finance_accounts (organizationid, LOWER(accountname));

CREATE INDEX IF NOT EXISTS idx_finance_accounts_lookup
    ON finance_accounts (organizationid, accounttype, accountsubtype, status);

CREATE TABLE IF NOT EXISTS bank_cash_accounts (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    financeaccountid BIGINT NOT NULL UNIQUE
        REFERENCES finance_accounts(id) ON DELETE RESTRICT,
    accounttype VARCHAR(20) NOT NULL,
    accountname VARCHAR(255) NOT NULL,
    bankname VARCHAR(255),
    accountnumberencrypted TEXT,
    accountnumberhash VARCHAR(64),
    accountnumberlast4 VARCHAR(4),
    ifsccode VARCHAR(20),
    branchname VARCHAR(255),
    openingbalance NUMERIC(18, 2) NOT NULL,
    openingbalancedate DATE NOT NULL,
    currentbalance NUMERIC(18, 2) NOT NULL,
    currencycode CHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    version INTEGER NOT NULL DEFAULT 1,
    createdby VARCHAR(255),
    modifiedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_bank_cash_accounts_type
        CHECK (accounttype IN ('bank', 'cash')),
    CONSTRAINT chk_bank_cash_accounts_status
        CHECK (status IN ('active', 'inactive')),
    CONSTRAINT chk_bank_cash_accounts_bank_fields
        CHECK (
            accounttype = 'cash'
            OR (
                NULLIF(TRIM(bankname), '') IS NOT NULL
                AND NULLIF(TRIM(accountnumberencrypted), '') IS NOT NULL
                AND NULLIF(TRIM(accountnumberhash), '') IS NOT NULL
                AND NULLIF(TRIM(ifsccode), '') IS NOT NULL
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_bank_cash_accounts_name
    ON bank_cash_accounts (organizationid, LOWER(accountname));

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_cash_accounts_number_hash
    ON bank_cash_accounts (organizationid, accountnumberhash)
    WHERE accountnumberhash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_cash_accounts_status
    ON bank_cash_accounts (organizationid, status, accounttype);

CREATE TABLE IF NOT EXISTS journal_entries (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    journalnumber VARCHAR(40) UNIQUE,
    entrydate DATE NOT NULL,
    sourcetype VARCHAR(50) NOT NULL,
    sourceid BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'posted',
    description TEXT,
    reversalofid BIGINT REFERENCES journal_entries(id) ON DELETE RESTRICT,
    createdby VARCHAR(255),
    postedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    posteddate BIGINT,
    CONSTRAINT chk_journal_entries_status
        CHECK (status IN ('draft', 'posted', 'reversed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_source
    ON journal_entries (organizationid, sourcetype, sourceid)
    WHERE status <> 'reversed';

CREATE INDEX IF NOT EXISTS idx_journal_entries_date
    ON journal_entries (organizationid, entrydate, id);

CREATE TABLE IF NOT EXISTS journal_lines (
    id BIGSERIAL PRIMARY KEY,
    journalentryid BIGINT NOT NULL
        REFERENCES journal_entries(id) ON DELETE RESTRICT,
    financeaccountid BIGINT NOT NULL
        REFERENCES finance_accounts(id) ON DELETE RESTRICT,
    partytype VARCHAR(20),
    partyid BIGINT,
    debitamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    creditamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    description TEXT,
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_journal_lines_amount
        CHECK (
            (debitamount > 0 AND creditamount = 0)
            OR (creditamount > 0 AND debitamount = 0)
        ),
    CONSTRAINT chk_journal_lines_partytype
        CHECK (partytype IS NULL OR partytype IN ('customer', 'supplier'))
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account
    ON journal_lines (financeaccountid, journalentryid);

CREATE TABLE IF NOT EXISTS bank_transactions (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    bankcashaccountid BIGINT NOT NULL
        REFERENCES bank_cash_accounts(id) ON DELETE RESTRICT,
    transactionnumber VARCHAR(40) UNIQUE,
    transactiondate DATE NOT NULL,
    partytype VARCHAR(20),
    partyid BIGINT,
    partyname VARCHAR(255),
    counterpartyaccountid BIGINT
        REFERENCES finance_accounts(id) ON DELETE RESTRICT,
    entryside VARCHAR(10) NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    debitamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    creditamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    balanceafter NUMERIC(18, 2) NOT NULL,
    allocationmethod VARCHAR(30) NOT NULL DEFAULT 'direct_ledger',
    sourcetype VARCHAR(50) NOT NULL DEFAULT 'manual',
    sourceid VARCHAR(255),
    sourcepaymentid VARCHAR(255),
    merchanttransactionid VARCHAR(255),
    remarks TEXT,
    postingstatus VARCHAR(20) NOT NULL DEFAULT 'posted',
    entrymode VARCHAR(20) NOT NULL DEFAULT 'manual',
    reversalofid BIGINT REFERENCES bank_transactions(id) ON DELETE RESTRICT,
    journalentryid BIGINT REFERENCES journal_entries(id) ON DELETE RESTRICT,
    createdby VARCHAR(255),
    postedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    posteddate BIGINT,
    CONSTRAINT chk_bank_transactions_partytype
        CHECK (partytype IS NULL OR partytype IN ('customer', 'supplier', 'ledger')),
    CONSTRAINT chk_bank_transactions_side
        CHECK (entryside IN ('debit', 'credit')),
    CONSTRAINT chk_bank_transactions_amount
        CHECK (amount > 0),
    CONSTRAINT chk_bank_transactions_debit_credit
        CHECK (
            (entryside = 'debit' AND debitamount = amount AND creditamount = 0)
            OR (entryside = 'credit' AND creditamount = amount AND debitamount = 0)
        ),
    CONSTRAINT chk_bank_transactions_allocation
        CHECK (allocationmethod IN ('against_document', 'advance', 'on_account', 'direct_ledger')),
    CONSTRAINT chk_bank_transactions_status
        CHECK (postingstatus IN ('draft', 'posted', 'reversed')),
    CONSTRAINT chk_bank_transactions_mode
        CHECK (entrymode IN ('manual', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date
    ON bank_transactions (bankcashaccountid, transactiondate, posteddate, id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_party
    ON bank_transactions (organizationid, partytype, partyid);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_transactions_source_payment
    ON bank_transactions (organizationid, sourcetype, sourcepaymentid)
    WHERE sourcepaymentid IS NOT NULL AND postingstatus <> 'reversed';

CREATE TABLE IF NOT EXISTS party_unapplied_amounts (
    id BIGSERIAL PRIMARY KEY,
    banktransactionid BIGINT NOT NULL
        REFERENCES bank_transactions(id) ON DELETE RESTRICT,
    partytype VARCHAR(20) NOT NULL,
    partyid BIGINT NOT NULL,
    originalamount NUMERIC(18, 2) NOT NULL,
    appliedamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    remainingamount NUMERIC(18, 2) NOT NULL,
    unappliedtype VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    createdby VARCHAR(255),
    modifiedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_party_unapplied_party
        CHECK (partytype IN ('customer', 'supplier')),
    CONSTRAINT chk_party_unapplied_type
        CHECK (unappliedtype IN ('advance', 'on_account')),
    CONSTRAINT chk_party_unapplied_amounts
        CHECK (
            originalamount > 0
            AND appliedamount >= 0
            AND remainingamount >= 0
            AND originalamount = appliedamount + remainingamount
        ),
    CONSTRAINT chk_party_unapplied_status
        CHECK (status IN ('open', 'fully_applied', 'reversed'))
);

CREATE INDEX IF NOT EXISTS idx_party_unapplied_lookup
    ON party_unapplied_amounts (partytype, partyid, status);

CREATE TABLE IF NOT EXISTS payment_account_mappings (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    provider VARCHAR(50) NOT NULL,
    paymentmethod VARCHAR(50) NOT NULL DEFAULT '*',
    bankcashaccountid BIGINT NOT NULL
        REFERENCES bank_cash_accounts(id) ON DELETE RESTRICT,
    effectivefrom DATE NOT NULL,
    effectiveto DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    createdby VARCHAR(255),
    modifiedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_payment_account_mapping_dates
        CHECK (effectiveto IS NULL OR effectiveto >= effectivefrom),
    CONSTRAINT chk_payment_account_mapping_status
        CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_account_mapping_version
    ON payment_account_mappings (
        organizationid,
        LOWER(provider),
        LOWER(paymentmethod),
        effectivefrom
    );

CREATE TABLE IF NOT EXISTS tds_sections (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    newcode VARCHAR(20) NOT NULL,
    natureofpayment VARCHAR(500) NOT NULL,
    rate VARCHAR(50) NOT NULL,
    createdby VARCHAR(255),
    modifiedby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT uq_tds_sections_code UNIQUE (organizationid, newcode)
);

INSERT INTO tds_sections (
    organizationid,
    newcode,
    natureofpayment,
    rate,
    createdby,
    modifiedby
)
VALUES
    (1, '1002', 'SALARY', '-', 'migration', 'migration'),
    (1, '1006', 'Commission or Brokerage - others', '2%', 'migration', 'migration'),
    (1, '1008', 'Rent on machinery etc.- specified person', '2%', 'migration', 'migration'),
    (1, '1009', 'RENT ON BUILDING', '10%', 'migration', 'migration'),
    (1, '1022', 'Any income being interest other than interest on securities', '10%', 'migration', 'migration'),
    (1, '1023', 'CONTRACT IN CASE OF INDIVIDUAL & HUF', '1% FOR IND & HUF', 'migration', 'migration'),
    (1, '1024', 'CONTRACT IN CASE OF OTHER THAN INDIVIDUAL & HUF', '2% FOR OTHERS', 'migration', 'migration'),
    (1, '1026', 'TECHNICAL SERVICES', '2%', 'migration', 'migration'),
    (1, '1027', 'PROFESSIONAL SERVICES', '10%', 'migration', 'migration'),
    (1, '1028', 'DIRECTORS FEES OR REMUNERATION', '10%', 'migration', 'migration'),
    (1, '1031', 'PURCHASE OF GOODS', '0.1%', 'migration', 'migration'),
    (1, '1067', 'PARTNERS REMUNERATION', '10%', 'migration', 'migration')
ON CONFLICT (organizationid, newcode)
DO UPDATE SET
    natureofpayment = EXCLUDED.natureofpayment,
    rate = EXCLUDED.rate,
    modifiedby = 'migration',
    modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT;

CREATE TABLE IF NOT EXISTS bank_transaction_allocations (
    id BIGSERIAL PRIMARY KEY,
    banktransactionid BIGINT NOT NULL
        REFERENCES bank_transactions(id) ON DELETE RESTRICT,
    documenttype VARCHAR(30) NOT NULL,
    documentid BIGINT NOT NULL,
    documentnumber VARCHAR(255),
    allocationamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    tdsapplied BOOLEAN NOT NULL DEFAULT FALSE,
    tdssectionid BIGINT REFERENCES tds_sections(id) ON DELETE RESTRICT,
    tdsaccountid BIGINT REFERENCES finance_accounts(id) ON DELETE RESTRICT,
    tdsamount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    totalsettledamount NUMERIC(18, 2) NOT NULL,
    statutorysnapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'applied',
    createdby VARCHAR(255),
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    CONSTRAINT chk_bank_allocations_document
        CHECK (documenttype IN ('sales_invoice', 'purchase_bill')),
    CONSTRAINT chk_bank_allocations_amounts
        CHECK (
            allocationamount >= 0
            AND tdsamount >= 0
            AND totalsettledamount = allocationamount + tdsamount
        ),
    CONSTRAINT chk_bank_allocations_tds
        CHECK (
            (tdsapplied = FALSE AND tdsamount = 0 AND tdsaccountid IS NULL AND tdssectionid IS NULL)
            OR (
                tdsapplied = TRUE
                AND tdsamount >= 0
                AND tdsaccountid IS NOT NULL
                AND (documenttype <> 'purchase_bill' OR tdssectionid IS NOT NULL)
            )
        ),
    CONSTRAINT chk_bank_allocations_status
        CHECK (status IN ('applied', 'reversed'))
);

CREATE INDEX IF NOT EXISTS idx_bank_allocations_transaction
    ON bank_transaction_allocations (banktransactionid);

CREATE INDEX IF NOT EXISTS idx_bank_allocations_document
    ON bank_transaction_allocations (documenttype, documentid, status);

CREATE TABLE IF NOT EXISTS finance_audit_events (
    id BIGSERIAL PRIMARY KEY,
    organizationid BIGINT NOT NULL DEFAULT 1,
    entitytype VARCHAR(50) NOT NULL,
    entityid BIGINT NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor VARCHAR(255),
    eventdata JSONB NOT NULL DEFAULT '{}'::jsonb,
    createddate BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_finance_audit_entity
    ON finance_audit_events (organizationid, entitytype, entityid, createddate DESC);

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20260730_cash_bank_account_foundation_v1',
    'Cash and Bank Account foundation schema'
)
ON CONFLICT (version) DO NOTHING;

-- Minimal system ledgers for the accounting foundation. Finance can configure
-- display names and additional ledgers later; stable account codes are used by
-- posting services.
INSERT INTO finance_accounts (
    organizationid,
    accountcode,
    accountname,
    accounttype,
    accountsubtype,
    currencycode,
    issystem,
    status,
    createdby,
    modifiedby
)
VALUES
    (1, 'SYS-OPENING-BALANCE', 'Opening Balance Equity', 'equity', 'opening_balance', 'INR', TRUE, 'active', 'migration', 'migration'),
    (1, 'SYS-AR', 'Accounts Receivable', 'asset', 'accounts_receivable', 'INR', TRUE, 'active', 'migration', 'migration'),
    (1, 'SYS-AP', 'Accounts Payable', 'liability', 'accounts_payable', 'INR', TRUE, 'active', 'migration', 'migration'),
    (1, 'SYS-CUSTOMER-ADVANCE', 'Customer Advances', 'liability', 'customer_advance', 'INR', TRUE, 'active', 'migration', 'migration'),
    (1, 'SYS-SUPPLIER-ADVANCE', 'Supplier Advances', 'asset', 'supplier_advance', 'INR', TRUE, 'active', 'migration', 'migration'),
    (1, 'SYS-TDS-RECEIVABLE', 'TDS Receivable', 'asset', 'tds_receivable', 'INR', TRUE, 'active', 'migration', 'migration'),
    (1, 'SYS-TDS-PAYABLE', 'TDS Payable', 'liability', 'tds_payable', 'INR', TRUE, 'active', 'migration', 'migration')
ON CONFLICT DO NOTHING;

-- Add configurable Cash/Bank access to every existing internal role.
UPDATE permissions
SET permissionset = COALESCE(permissionset, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
        'object',
        'Cash and Bank Account',
        'objectAPI',
        'cash_bank_account',
        'permissions',
        jsonb_build_object(
            'read',
                LOWER(role) IN ('accountant', 'admin'),
            'create_account',
                LOWER(role) IN ('accountant', 'admin'),
            'edit_account',
                LOWER(role) IN ('accountant', 'admin'),
            'post_transaction',
                LOWER(role) IN ('accountant', 'admin'),
            'manage_tds',
                LOWER(role) IN ('accountant', 'admin')
        )
    )
)
WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(permissions.permissionset, '[]'::jsonb))
        AS permission_item
    WHERE permission_item->>'objectAPI' = 'cash_bank_account'
);
