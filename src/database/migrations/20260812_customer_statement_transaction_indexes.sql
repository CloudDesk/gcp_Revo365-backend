-- Supports independently paginated Phase 3 Customer Statement accordions.
CREATE INDEX IF NOT EXISTS idx_revoinvoice_customer_statement_page
    ON revoinvoice (customerid, invoicedate DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_customer_statement_page
    ON bank_transactions (
        organizationid,
        partyid,
        transactiondate DESC,
        posteddate DESC,
        id DESC
    )
    WHERE partytype = 'customer'
      AND postingstatus = 'posted';
