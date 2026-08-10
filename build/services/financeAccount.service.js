import { randomUUID } from "crypto";
import pool, { query } from "../database/postgres.js";
import { FINANCE_ENCRYPTION_KEY } from "../config/config.js";
import { FinanceValidationError, calculateAvailableBalance, calculateLedgerBalance, maskAccountNumber, normalizeAccountType, normalizeEntrySide, nowEpoch, protectAccountNumber, requireIsoDate, requirePositiveMoney, resolveFinanceContext, toFinanceDateOnly, toMoney, } from "../utils/finance/finance.utils.js";
import { FINANCE_SOURCE_TYPES, getRetailReceiptSourceTypes, } from "../utils/finance/financeSource.utils.js";
import { getRetailInvoicesOutstandingTotal } from "../utils/finance/retailReceipt.utils.js";
import { getBillGstSummary, getInvoiceGstSummary, } from "../utils/finance/gstSummary.utils.js";
const CHART_ACCOUNT_CATEGORIES = new Set([
    "asset",
    "liability",
    "equity",
    "income",
    "expense",
]);
const normalizeText = (value, fieldName, required = false, maxLength = 255) => {
    const normalized = value == null ? "" : String(value).trim();
    if (required && !normalized) {
        throw new FinanceValidationError(`${fieldName} is required.`);
    }
    if (normalized.length > maxLength) {
        throw new FinanceValidationError(`${fieldName} must not exceed ${maxLength} characters.`);
    }
    return normalized || null;
};
const normalizeCurrency = (value) => {
    const currency = String(value || "INR").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        throw new FinanceValidationError("currencycode must contain three letters.");
    }
    return currency;
};
const sanitizeAccount = (row) => {
    if (!row)
        return row;
    const { accountnumberencrypted: _encrypted, accountnumberhash: _hash, ...safe } = row;
    return {
        ...safe,
        openingbalancedate: toFinanceDateOnly(row.openingbalancedate) ?? row.openingbalancedate,
        maskedaccountnumber: maskAccountNumber(row.accountnumberlast4),
    };
};
const insertAuditEvent = async (client, organizationId, entityType, entityId, action, actor, eventData) => {
    await client.query(`
    INSERT INTO finance_audit_events (
      organizationid, entitytype, entityid, action, actor, eventdata
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `, [
        organizationId,
        entityType,
        entityId,
        action,
        actor,
        JSON.stringify(eventData),
    ]);
};
const ensureSystemAccounts = async (client, organizationId, actor) => {
    await client.query(`
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
      ($1, 'SYS-OPENING-BALANCE', 'Opening Balance Equity', 'equity', 'opening_balance', 'INR', TRUE, 'active', $2, $2),
      ($1, 'SYS-AR', 'Accounts Receivable', 'asset', 'accounts_receivable', 'INR', TRUE, 'active', $2, $2),
      ($1, 'SYS-AP', 'Accounts Payable', 'liability', 'accounts_payable', 'INR', TRUE, 'active', $2, $2),
      ($1, 'SYS-CUSTOMER-ADVANCE', 'Customer Advances', 'liability', 'customer_advance', 'INR', TRUE, 'active', $2, $2),
      ($1, 'SYS-SUPPLIER-ADVANCE', 'Supplier Advances', 'asset', 'supplier_advance', 'INR', TRUE, 'active', $2, $2),
      ($1, 'SYS-TDS-RECEIVABLE', 'TDS Receivable', 'asset', 'tds_receivable', 'INR', TRUE, 'active', $2, $2),
      ($1, 'SYS-TDS-PAYABLE', 'TDS Payable', 'liability', 'tds_payable', 'INR', TRUE, 'active', $2, $2)
    ON CONFLICT DO NOTHING
    `, [organizationId, actor]);
};
const getSystemAccount = async (client, organizationId, accountCode) => {
    const result = await client.query(`
    SELECT *
    FROM finance_accounts
    WHERE organizationid = $1
      AND LOWER(accountcode) = LOWER($2)
      AND status = 'active'
    LIMIT 1
    `, [organizationId, accountCode]);
    if (!result.rows[0]) {
        throw new FinanceValidationError(`Required system account ${accountCode} is not configured.`, 500, "FINANCE_SYSTEM_ACCOUNT_MISSING");
    }
    return result.rows[0];
};
const postOpeningBalance = async ({ client, organizationId, bankCashAccount, bankLedger, openingBalance, openingBalanceDate, actor, }) => {
    if (openingBalance === 0)
        return null;
    const offsetAccount = await getSystemAccount(client, organizationId, "SYS-OPENING-BALANCE");
    const epoch = nowEpoch();
    const entryResult = await client.query(`
    INSERT INTO journal_entries (
      organizationid,
      entrydate,
      sourcetype,
      sourceid,
      status,
      description,
      createdby,
      postedby,
      posteddate
    )
    VALUES ($1, $2, 'bank_account_opening', $3, 'posted', $4, $5, $5, $6)
    RETURNING *
    `, [
        organizationId,
        openingBalanceDate,
        bankCashAccount.id,
        `Opening balance for ${bankCashAccount.accountname}`,
        actor,
        epoch,
    ]);
    const journalEntry = entryResult.rows[0];
    const journalNumber = `JE-${String(journalEntry.id).padStart(8, "0")}`;
    await client.query(`UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`, [journalNumber, journalEntry.id]);
    const absoluteAmount = Math.abs(openingBalance);
    const bankDebit = openingBalance > 0 ? absoluteAmount : 0;
    const bankCredit = openingBalance < 0 ? absoluteAmount : 0;
    const offsetDebit = openingBalance < 0 ? absoluteAmount : 0;
    const offsetCredit = openingBalance > 0 ? absoluteAmount : 0;
    await client.query(`
    INSERT INTO journal_lines (
      journalentryid,
      financeaccountid,
      debitamount,
      creditamount,
      description
    )
    VALUES
      ($1, $2, $3, $4, $5),
      ($1, $6, $7, $8, $5)
    `, [
        journalEntry.id,
        bankLedger.id,
        bankDebit,
        bankCredit,
        `Opening balance for ${bankCashAccount.accountname}`,
        offsetAccount.id,
        offsetDebit,
        offsetCredit,
    ]);
    return { ...journalEntry, journalnumber: journalNumber };
};
export var financeAccountService;
(function (financeAccountService) {
    financeAccountService.listChartAccountTypes = async () => {
        const result = await query(`
      SELECT
        typecode AS value,
        typename AS label,
        accountcategory AS category,
        categorylabel,
        displayorder
      FROM finance_account_types
      WHERE status = 'active'
      ORDER BY displayorder ASC, id ASC
      `);
        const types = result.rows;
        const groups = Array.from(types.reduce((grouped, accountType) => {
            const existing = grouped.get(accountType.categorylabel) || [];
            existing.push(accountType);
            grouped.set(accountType.categorylabel, existing);
            return grouped;
        }, new Map())).map(([label, groupTypes]) => ({ label, types: groupTypes }));
        return {
            types,
            groups,
        };
    };
    financeAccountService.createChartAccount = async (request) => {
        const { actor, organizationId } = resolveFinanceContext(request);
        const data = request.body || {};
        const accountTypeCode = String(data.accounttype || "").trim().toLowerCase();
        const accountName = normalizeText(data.accountname, "Account Name", true, 255);
        const accountCode = normalizeText(data.accountcode, "Account Code", true, 40);
        const description = normalizeText(data.description, "Description", false, 2000);
        const normalizedName = accountName.toLocaleLowerCase("en-US");
        const normalizedCode = accountCode.toLocaleLowerCase("en-US");
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await ensureSystemAccounts(client, organizationId, actor);
            const accountTypeResult = await client.query(`
        SELECT
          typecode AS value,
          typename AS label,
          accountcategory AS category,
          categorylabel
        FROM finance_account_types
        WHERE typecode = $1
          AND status = 'active'
        LIMIT 1
        `, [accountTypeCode]);
            const selectedType = accountTypeResult.rows[0];
            if (!selectedType) {
                throw new FinanceValidationError("Select a valid Account Type.", 400, "CHART_ACCOUNT_TYPE_INVALID");
            }
            // Serialize matching names/codes so service validation remains reliable
            // even when two create requests arrive concurrently.
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)),
                pg_advisory_xact_lock(hashtext($2))`, [
                `chart-account-name:${organizationId}:${normalizedName}`,
                `chart-account-code:${organizationId}:${normalizedCode}`,
            ]);
            const duplicateResult = await client.query(`
        SELECT
          BOOL_OR(LOWER(TRIM(accountname)) = $2) AS duplicatename,
          BOOL_OR(LOWER(TRIM(accountcode)) = $3) AS duplicatecode
        FROM finance_accounts
        WHERE organizationid = $1
          AND (
            LOWER(TRIM(accountname)) = $2
            OR LOWER(TRIM(accountcode)) = $3
          )
        `, [organizationId, normalizedName, normalizedCode]);
            if (duplicateResult.rows[0]?.duplicatename === true) {
                throw new FinanceValidationError("An account with this Account Name already exists.", 409, "CHART_ACCOUNT_NAME_DUPLICATE");
            }
            if (duplicateResult.rows[0]?.duplicatecode === true) {
                throw new FinanceValidationError("An account with this Account Code already exists.", 409, "CHART_ACCOUNT_CODE_DUPLICATE");
            }
            const epoch = nowEpoch();
            const result = await client.query(`
        INSERT INTO finance_accounts (
          organizationid,
          accountcode,
          accountname,
          accounttype,
          accountsubtype,
          description,
          isusercreatedchartaccount,
          currencycode,
          issystem,
          status,
          createdby,
          modifiedby,
          createddate,
          modifieddate
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'INR', FALSE, 'active', $7, $7, $8, $8)
        RETURNING *
        `, [
                organizationId,
                accountCode,
                accountName,
                selectedType.category,
                selectedType.value,
                description,
                actor,
                epoch,
            ]);
            const account = result.rows[0];
            await insertAuditEvent(client, organizationId, "finance_account", account.id, "created", actor, {
                accountcode: accountCode,
                accountname: accountName,
                accounttype: selectedType.category,
                accountsubtype: selectedType.value,
            });
            await client.query("COMMIT");
            return {
                ...account,
                accounttypelabel: selectedType.label,
                categorylabel: selectedType.categorylabel,
            };
        }
        catch (error) {
            await client.query("ROLLBACK");
            if (error?.code === "23505" &&
                error?.constraint === "uq_finance_chart_accounts_name_normalized") {
                throw new FinanceValidationError("An account with this Account Name already exists.", 409, "CHART_ACCOUNT_NAME_DUPLICATE");
            }
            if (error?.code === "23505" &&
                error?.constraint === "uq_finance_accounts_code_normalized") {
                throw new FinanceValidationError("An account with this Account Code already exists.", 409, "CHART_ACCOUNT_CODE_DUPLICATE");
            }
            throw error;
        }
        finally {
            client.release();
        }
    };
    financeAccountService.listChartAccounts = async (request) => {
        const { organizationId } = resolveFinanceContext(request);
        const queryData = request.query || {};
        const params = [organizationId];
        const conditions = [
            "f.organizationid = $1",
            "f.isusercreatedchartaccount = TRUE",
        ];
        if (queryData.search) {
            params.push(`%${String(queryData.search).trim().toLowerCase()}%`);
            conditions.push(`(
        LOWER(f.accountname) LIKE $${params.length}
        OR LOWER(f.accountcode) LIKE $${params.length}
      )`);
        }
        if (queryData.category) {
            const category = String(queryData.category).trim().toLowerCase();
            if (!CHART_ACCOUNT_CATEGORIES.has(category)) {
                throw new FinanceValidationError("Select a valid account category.");
            }
            params.push(category);
            conditions.push(`f.accounttype = $${params.length}`);
        }
        if (queryData.accounttype) {
            const accountTypeCode = String(queryData.accounttype).trim().toLowerCase();
            const accountTypeResult = await query(`SELECT typecode
         FROM finance_account_types
         WHERE typecode = $1 AND status = 'active'
         LIMIT 1`, [accountTypeCode]);
            if (!accountTypeResult.rows[0]) {
                throw new FinanceValidationError("Select a valid Account Type.");
            }
            params.push(accountTypeCode);
            conditions.push(`f.accountsubtype = $${params.length}`);
        }
        if (queryData.status) {
            const status = String(queryData.status).trim().toLowerCase();
            if (!['active', 'inactive'].includes(status)) {
                throw new FinanceValidationError("status must be active or inactive.");
            }
            params.push(status);
            conditions.push(`f.status = $${params.length}`);
        }
        const page = Math.max(Number(queryData.page) || 1, 1);
        const count = Math.min(Math.max(Number(queryData.count) || 10, 1), 200);
        const offset = (page - 1) * count;
        const whereClause = conditions.join(" AND ");
        const filterParams = [...params];
        const [countResult, summaryResult, receivableInvoiceResult, billResult] = await Promise.all([
            query(`SELECT COUNT(*)::INTEGER AS total
         FROM finance_accounts f
         WHERE ${whereClause}`, filterParams),
            query(`
        SELECT
          COUNT(*)::INTEGER AS total,
          COUNT(*) FILTER (WHERE accounttype = 'asset')::INTEGER AS asset,
          COUNT(*) FILTER (WHERE accounttype = 'liability')::INTEGER AS liability,
          COUNT(*) FILTER (WHERE accounttype = 'equity')::INTEGER AS equity,
          COUNT(*) FILTER (WHERE accounttype = 'income')::INTEGER AS income,
          COUNT(*) FILTER (WHERE accounttype = 'expense')::INTEGER AS expense,
          COALESCE((
            SELECT SUM(
              GREATEST(
                COALESCE(bill.balanceamount, bill.invoiceamount, 0),
                0
              )
            )
            FROM poinvoice bill
            WHERE LOWER(COALESCE(bill.invoicestatus, 'in_progress')) <> 'cancelled'
          ), 0) AS accountspayable
        FROM finance_accounts
        WHERE organizationid = $1
          AND isusercreatedchartaccount = TRUE
        `, [organizationId]),
            query(`SELECT *
         FROM revoinvoice
         WHERE LOWER(COALESCE(paymentstatus, 'pending')) <> 'cancelled'`),
            query(`SELECT invoiceamount, balanceamount, payabletaxamount, cgst, sgst
         FROM poinvoice
         WHERE LOWER(COALESCE(invoicestatus, 'in_progress')) <> 'cancelled'`),
        ]);
        params.push(offset, count);
        const result = await query(`
      SELECT
        f.id,
        f.accountcode,
        f.accountname,
        f.accounttype,
        f.accountsubtype,
        f.description,
        f.isusercreatedchartaccount,
        f.currencycode,
        f.issystem,
        f.status,
        f.createdby,
        f.modifiedby,
        f.createddate,
        f.modifieddate,
        fat.typename AS accounttypelabel,
        fat.categorylabel,
        COALESCE(ledger_totals.totaldebit, 0) AS totaldebit,
        COALESCE(ledger_totals.totalcredit, 0) AS totalcredit
      FROM finance_accounts f
      LEFT JOIN finance_account_types fat
        ON fat.typecode = f.accountsubtype
      LEFT JOIN LATERAL (
        SELECT
          SUM(jl.debitamount) AS totaldebit,
          SUM(jl.creditamount) AS totalcredit
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journalentryid
        WHERE jl.financeaccountid = f.id
          AND je.organizationid = f.organizationid
          AND je.status = 'posted'
      ) ledger_totals ON TRUE
      WHERE ${whereClause}
      ORDER BY f.modifieddate DESC, f.id DESC
      OFFSET $${params.length - 1} LIMIT $${params.length}
      `, params);
        const records = result.rows.map((account) => ({
            ...account,
            currentledgerbalance: calculateLedgerBalance(account.accounttype, account.totaldebit, account.totalcredit),
            accounttypelabel: account.accounttypelabel ||
                String(account.accountsubtype || "")
                    .split("_")
                    .filter(Boolean)
                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                    .join(" "),
            categorylabel: account.categorylabel ||
                String(account.accounttype || "").replace(/^./, (value) => value.toUpperCase()),
        }));
        const summary = summaryResult.rows[0] || {};
        return {
            records,
            total: Number(countResult.rows[0]?.total || 0),
            page,
            count,
            summary: {
                total: Number(summary.total || 0),
                asset: Number(summary.asset || 0),
                liability: Number(summary.liability || 0),
                equity: Number(summary.equity || 0),
                income: Number(summary.income || 0),
                expense: Number(summary.expense || 0),
                accountsreceivable: getRetailInvoicesOutstandingTotal(receivableInvoiceResult.rows),
                accountspayable: Number(summary.accountspayable || 0),
                invoicegst: getInvoiceGstSummary(receivableInvoiceResult.rows),
                billgst: getBillGstSummary(billResult.rows),
            },
        };
    };
    financeAccountService.getChartAccount = async (request) => {
        const { organizationId } = resolveFinanceContext(request);
        const accountId = Number(request.params?.accountId);
        if (!Number.isSafeInteger(accountId) || accountId <= 0) {
            throw new FinanceValidationError("A valid accountId is required.");
        }
        const result = await query(`
      SELECT
        f.id,
        f.accountcode,
        f.accountname,
        f.accounttype,
        f.accountsubtype,
        f.description,
        f.isusercreatedchartaccount,
        f.currencycode,
        f.issystem,
        f.status,
        f.createdby,
        f.modifiedby,
        f.createddate,
        f.modifieddate,
        fat.typename AS accounttypelabel,
        fat.categorylabel,
        COALESCE(ledger_totals.totaldebit, 0) AS totaldebit,
        COALESCE(ledger_totals.totalcredit, 0) AS totalcredit
      FROM finance_accounts f
      LEFT JOIN finance_account_types fat
        ON fat.typecode = f.accountsubtype
      LEFT JOIN LATERAL (
        SELECT
          SUM(jl.debitamount) AS totaldebit,
          SUM(jl.creditamount) AS totalcredit
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journalentryid
        WHERE jl.financeaccountid = f.id
          AND je.organizationid = f.organizationid
          AND je.status = 'posted'
      ) ledger_totals ON TRUE
      WHERE f.id = $1
        AND f.organizationid = $2
        AND f.isusercreatedchartaccount = TRUE
      LIMIT 1
      `, [accountId, organizationId]);
        const account = result.rows[0];
        if (!account) {
            throw new FinanceValidationError("Chart account was not found.", 404, "CHART_ACCOUNT_NOT_FOUND");
        }
        return {
            ...account,
            currentledgerbalance: calculateLedgerBalance(account.accounttype, account.totaldebit, account.totalcredit),
            accounttypelabel: account.accounttypelabel ||
                String(account.accountsubtype || "")
                    .split("_")
                    .filter(Boolean)
                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                    .join(" "),
            categorylabel: account.categorylabel ||
                String(account.accounttype || "").replace(/^./, (value) => value.toUpperCase()),
        };
    };
    financeAccountService.listChartAccountEntries = async (request) => {
        const { organizationId } = resolveFinanceContext(request);
        const accountId = Number(request.params?.accountId);
        if (!Number.isSafeInteger(accountId) || accountId <= 0) {
            throw new FinanceValidationError("A valid accountId is required.");
        }
        const accountResult = await query(`SELECT id, accounttype
       FROM finance_accounts
       WHERE id = $1
         AND organizationid = $2
         AND isusercreatedchartaccount = TRUE
       LIMIT 1`, [accountId, organizationId]);
        const account = accountResult.rows[0];
        if (!account) {
            throw new FinanceValidationError("Chart account was not found.", 404, "CHART_ACCOUNT_NOT_FOUND");
        }
        const page = Math.max(Number(request.query?.page) || 1, 1);
        const count = Math.min(Math.max(Number(request.query?.count) || 10, 1), 200);
        const offset = (page - 1) * count;
        const summaryResult = await query(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COALESCE(SUM(jl.debitamount), 0) AS totaldebit,
        COALESCE(SUM(jl.creditamount), 0) AS totalcredit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journalentryid
      WHERE jl.financeaccountid = $1
        AND je.organizationid = $2
        AND je.status = 'posted'
      `, [accountId, organizationId]);
        const entriesResult = await query(`
      SELECT
        jl.id,
        jl.journalentryid,
        je.entrydate AS transactiondate,
        COALESCE(bt.entryname, jl.description, je.description) AS entryname,
        jl.description,
        jl.debitamount,
        jl.creditamount,
        je.journalnumber,
        bt.transactionnumber,
        CASE
          WHEN bt.allocationmethod = 'direct_ledger' THEN 'direct_ledger'
          ELSE je.sourcetype
        END AS sourcetype,
        bt.allocationmethod,
        bt.remarks,
        bca.id AS bankcashaccountid,
        bca.accountname AS bankcashaccountname,
        je.createdby,
        je.postedby,
        je.createddate,
        je.posteddate,
        je.status AS postingstatus
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journalentryid
      LEFT JOIN bank_transactions bt
        ON je.sourcetype = 'bank_transaction'
       AND bt.id = je.sourceid
       AND bt.organizationid = je.organizationid
      LEFT JOIN bank_cash_accounts bca
        ON bca.id = bt.bankcashaccountid
       AND bca.organizationid = je.organizationid
      WHERE jl.financeaccountid = $1
        AND je.organizationid = $2
        AND je.status = 'posted'
      ORDER BY je.entrydate DESC, je.posteddate DESC NULLS LAST, jl.id DESC
      OFFSET $3 LIMIT $4
      `, [accountId, organizationId, offset, count]);
        const summary = summaryResult.rows[0] || {};
        const totalDebit = Number(summary.totaldebit || 0);
        const totalCredit = Number(summary.totalcredit || 0);
        return {
            records: entriesResult.rows.map((entry) => ({
                ...entry,
                transactiondate: toFinanceDateOnly(entry.transactiondate) ?? entry.transactiondate,
            })),
            total: Number(summary.total || 0),
            page,
            count,
            summary: {
                totaldebit: totalDebit,
                totalcredit: totalCredit,
                currentledgerbalance: calculateLedgerBalance(account.accounttype, totalDebit, totalCredit),
            },
        };
    };
    financeAccountService.createBankCashAccount = async (request) => {
        const { actor, organizationId } = resolveFinanceContext(request);
        const data = request.body || {};
        const accountType = normalizeAccountType(data.accounttype);
        const accountName = normalizeText(data.accountname, "accountname", true);
        const openingBalance = toMoney(data.openingbalance, "openingbalance");
        const openingBalanceDate = requireIsoDate(data.openingbalancedate, "openingbalancedate");
        const currencyCode = normalizeCurrency(data.currencycode);
        const status = String(data.status || "active").toLowerCase() === "inactive"
            ? "inactive"
            : "active";
        const isEcommerceDefault = data.isecommercedefault === true;
        if (isEcommerceDefault && accountType !== "bank") {
            throw new FinanceValidationError("Only a Bank account can be the e-commerce default.");
        }
        if (isEcommerceDefault && status !== "active") {
            throw new FinanceValidationError("The e-commerce default account must be active.");
        }
        const bankName = accountType === "bank"
            ? normalizeText(data.bankname, "bankname", true)
            : null;
        const ifscCode = accountType === "bank"
            ? normalizeText(data.ifsccode, "ifsccode", true, 20)?.toUpperCase()
            : null;
        const branchName = normalizeText(data.branchname, "branchname");
        const protectedAccountNumber = accountType === "bank"
            ? protectAccountNumber(normalizeText(data.accountnumber, "accountnumber", true), FINANCE_ENCRYPTION_KEY)
            : null;
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await ensureSystemAccounts(client, organizationId, actor);
            const epoch = nowEpoch();
            if (isEcommerceDefault) {
                const currentDefaultResult = await client.query(`
          SELECT id, accountname
          FROM bank_cash_accounts
          WHERE organizationid = $1
            AND isecommercedefault = TRUE
          LIMIT 1
          FOR UPDATE
          `, [organizationId]);
                const currentDefault = currentDefaultResult.rows[0];
                if (currentDefault && data.confirmdefaultreplacement !== true) {
                    throw new FinanceValidationError(`${currentDefault.accountname} is currently the e-commerce default account. Confirm before replacing it.`, 409, "ECOMMERCE_DEFAULT_REPLACEMENT_CONFIRMATION_REQUIRED");
                }
                await client.query(`
          UPDATE bank_cash_accounts
          SET isecommercedefault = FALSE,
              version = version + 1,
              modifiedby = $1,
              modifieddate = $2
          WHERE organizationid = $3
            AND isecommercedefault = TRUE
          `, [actor, epoch, organizationId]);
            }
            const accountCode = `${accountType === "bank" ? "BANK" : "CASH"}-${randomUUID()
                .replace(/-/g, "")
                .slice(0, 12)
                .toUpperCase()}`;
            const ledgerResult = await client.query(`
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
          modifiedby,
          createddate,
          modifieddate
        )
        VALUES ($1, $2, $3, 'asset', $4, $5, FALSE, $6, $7, $7, $8, $8)
        RETURNING *
        `, [
                organizationId,
                accountCode,
                accountName,
                accountType,
                currencyCode,
                status,
                actor,
                epoch,
            ]);
            const bankLedger = ledgerResult.rows[0];
            const accountResult = await client.query(`
        INSERT INTO bank_cash_accounts (
          organizationid,
          financeaccountid,
          accounttype,
          accountname,
          bankname,
          accountnumberencrypted,
          accountnumberhash,
          accountnumberlast4,
          ifsccode,
          branchname,
          openingbalance,
          openingbalancedate,
          currentbalance,
          currencycode,
          status,
          isecommercedefault,
          createdby,
          modifiedby,
          createddate,
          modifieddate
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $11, $13, $14, $15, $16, $16, $17, $17
        )
        RETURNING *
        `, [
                organizationId,
                bankLedger.id,
                accountType,
                accountName,
                bankName,
                protectedAccountNumber?.encrypted ?? null,
                protectedAccountNumber?.hash ?? null,
                protectedAccountNumber?.last4 ?? null,
                ifscCode,
                branchName,
                openingBalance,
                openingBalanceDate,
                currencyCode,
                status,
                isEcommerceDefault,
                actor,
                epoch,
            ]);
            const bankCashAccount = accountResult.rows[0];
            const openingJournal = await postOpeningBalance({
                client,
                organizationId,
                bankCashAccount,
                bankLedger,
                openingBalance,
                openingBalanceDate,
                actor,
            });
            await insertAuditEvent(client, organizationId, "bank_cash_account", bankCashAccount.id, "created", actor, {
                accounttype: accountType,
                accountname: accountName,
                openingbalance: openingBalance,
                openingbalancedate: openingBalanceDate,
                openingjournalid: openingJournal?.id ?? null,
                isecommercedefault: isEcommerceDefault,
            });
            await client.query("COMMIT");
            return sanitizeAccount(bankCashAccount);
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    };
    financeAccountService.listBankCashAccounts = async (request) => {
        const { organizationId } = resolveFinanceContext(request);
        const queryData = request.query || {};
        const params = [organizationId];
        const conditions = ["b.organizationid = $1"];
        if (queryData.accounttype) {
            params.push(normalizeAccountType(queryData.accounttype));
            conditions.push(`b.accounttype = $${params.length}`);
        }
        if (queryData.status) {
            const status = String(queryData.status).trim().toLowerCase();
            if (!["active", "inactive"].includes(status)) {
                throw new FinanceValidationError("status must be active or inactive.");
            }
            params.push(status);
            conditions.push(`b.status = $${params.length}`);
        }
        if (queryData.search) {
            params.push(`%${String(queryData.search).trim().toLowerCase()}%`);
            conditions.push(`(
        LOWER(b.accountname) LIKE $${params.length}
        OR LOWER(COALESCE(b.bankname, '')) LIKE $${params.length}
        OR LOWER(COALESCE(b.accountnumberlast4, '')) LIKE $${params.length}
      )`);
        }
        const page = Math.max(Number(queryData.page) || 1, 1);
        const count = Math.min(Math.max(Number(queryData.count) || 100, 1), 500);
        const offset = (page - 1) * count;
        const filterParams = [...params];
        const countResult = await query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM bank_cash_accounts b
      WHERE ${conditions.join(" AND ")}
      `, filterParams);
        const summaryResult = await query(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COUNT(*) FILTER (WHERE accounttype = 'bank')::INTEGER AS bank,
        COUNT(*) FILTER (WHERE accounttype = 'cash')::INTEGER AS cash,
        COALESCE(SUM(currentbalance), 0) AS available
      FROM bank_cash_accounts
      WHERE organizationid = $1
      `, [organizationId]);
        params.push(offset, count);
        const result = await query(`
      SELECT
        b.*,
        f.accountcode,
        f.accountsubtype
      FROM bank_cash_accounts b
      JOIN finance_accounts f ON f.id = b.financeaccountid
      WHERE ${conditions.join(" AND ")}
      ORDER BY b.modifieddate DESC, b.id DESC
      OFFSET $${params.length - 1} LIMIT $${params.length}
      `, params);
        return {
            records: result.rows.map(sanitizeAccount),
            total: Number(countResult.rows[0]?.total || 0),
            page,
            count,
            summary: {
                total: Number(summaryResult.rows[0]?.total || 0),
                bank: Number(summaryResult.rows[0]?.bank || 0),
                cash: Number(summaryResult.rows[0]?.cash || 0),
                available: Number(summaryResult.rows[0]?.available || 0),
            },
        };
    };
    financeAccountService.getBankCashAccount = async (request) => {
        const { organizationId } = resolveFinanceContext(request);
        const accountId = Number(request.params?.accountId);
        if (!Number.isSafeInteger(accountId) || accountId <= 0) {
            throw new FinanceValidationError("A valid accountId is required.");
        }
        const result = await query(`
      SELECT
        b.*,
        f.accountcode,
        f.accounttype AS ledgeraccounttype,
        f.accountsubtype
      FROM bank_cash_accounts b
      JOIN finance_accounts f ON f.id = b.financeaccountid
      WHERE b.id = $1 AND b.organizationid = $2
      LIMIT 1
      `, [accountId, organizationId]);
        if (!result.rows[0]) {
            throw new FinanceValidationError("Bank/Cash account was not found.", 404, "BANK_CASH_ACCOUNT_NOT_FOUND");
        }
        return sanitizeAccount(result.rows[0]);
    };
    financeAccountService.updateBankCashAccount = async (request) => {
        const { actor, organizationId } = resolveFinanceContext(request);
        const accountId = Number(request.params?.accountId);
        if (!Number.isSafeInteger(accountId) || accountId <= 0) {
            throw new FinanceValidationError("A valid accountId is required.");
        }
        const data = request.body || {};
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const existingResult = await client.query(`
        SELECT *
        FROM bank_cash_accounts
        WHERE id = $1 AND organizationid = $2
        FOR UPDATE
        `, [accountId, organizationId]);
            const existing = existingResult.rows[0];
            if (!existing) {
                throw new FinanceValidationError("Bank/Cash account was not found.", 404, "BANK_CASH_ACCOUNT_NOT_FOUND");
            }
            if (data.version != null && Number(data.version) !== Number(existing.version)) {
                throw new FinanceValidationError("This account was updated by another user. Refresh and try again.", 409, "FINANCE_VERSION_CONFLICT");
            }
            const accountName = data.accountname !== undefined
                ? normalizeText(data.accountname, "accountname", true)
                : existing.accountname;
            const status = data.status !== undefined
                ? String(data.status).trim().toLowerCase()
                : existing.status;
            if (!["active", "inactive"].includes(status)) {
                throw new FinanceValidationError("status must be active or inactive.");
            }
            const isEcommerceDefault = data.isecommercedefault !== undefined
                ? data.isecommercedefault === true
                : existing.isecommercedefault === true;
            if (isEcommerceDefault && existing.accounttype !== "bank") {
                throw new FinanceValidationError("Only a Bank account can be the e-commerce default.");
            }
            if (isEcommerceDefault && status !== "active") {
                throw new FinanceValidationError("The e-commerce default account must be active.");
            }
            const bankName = existing.accounttype === "bank" && data.bankname !== undefined
                ? normalizeText(data.bankname, "bankname", true)
                : existing.bankname;
            const ifscCode = existing.accounttype === "bank" && data.ifsccode !== undefined
                ? normalizeText(data.ifsccode, "ifsccode", true, 20)?.toUpperCase()
                : existing.ifsccode;
            const branchName = data.branchname !== undefined
                ? normalizeText(data.branchname, "branchname")
                : existing.branchname;
            const protectedAccountNumber = existing.accounttype === "bank" && data.accountnumber
                ? protectAccountNumber(data.accountnumber, FINANCE_ENCRYPTION_KEY)
                : null;
            const epoch = nowEpoch();
            if (isEcommerceDefault) {
                const currentDefaultResult = await client.query(`
          SELECT id, accountname
          FROM bank_cash_accounts
          WHERE organizationid = $1
            AND id <> $2
            AND isecommercedefault = TRUE
          LIMIT 1
          FOR UPDATE
          `, [organizationId, accountId]);
                const currentDefault = currentDefaultResult.rows[0];
                if (currentDefault && data.confirmdefaultreplacement !== true) {
                    throw new FinanceValidationError(`${currentDefault.accountname} is currently the e-commerce default account. Confirm before replacing it.`, 409, "ECOMMERCE_DEFAULT_REPLACEMENT_CONFIRMATION_REQUIRED");
                }
                await client.query(`
          UPDATE bank_cash_accounts
          SET isecommercedefault = FALSE,
              version = version + 1,
              modifiedby = $1,
              modifieddate = $2
          WHERE organizationid = $3
            AND id <> $4
            AND isecommercedefault = TRUE
          `, [actor, epoch, organizationId, accountId]);
            }
            const updatedResult = await client.query(`
        UPDATE bank_cash_accounts
        SET accountname = $1,
            bankname = $2,
            accountnumberencrypted = COALESCE($3, accountnumberencrypted),
            accountnumberhash = COALESCE($4, accountnumberhash),
            accountnumberlast4 = COALESCE($5, accountnumberlast4),
            ifsccode = $6,
            branchname = $7,
            status = $8,
            isecommercedefault = $9,
            version = version + 1,
            modifiedby = $10,
            modifieddate = $11
        WHERE id = $12
        RETURNING *
        `, [
                accountName,
                bankName,
                protectedAccountNumber?.encrypted ?? null,
                protectedAccountNumber?.hash ?? null,
                protectedAccountNumber?.last4 ?? null,
                ifscCode,
                branchName,
                status,
                isEcommerceDefault,
                actor,
                epoch,
                accountId,
            ]);
            await client.query(`
        UPDATE finance_accounts
        SET accountname = $1,
            status = $2,
            modifiedby = $3,
            modifieddate = $4
        WHERE id = $5
        `, [accountName, status, actor, epoch, existing.financeaccountid]);
            await insertAuditEvent(client, organizationId, "bank_cash_account", accountId, "updated", actor, {
                previousversion: existing.version,
                newversion: Number(existing.version) + 1,
                status,
                accountnumberchanged: Boolean(protectedAccountNumber),
                isecommercedefault: isEcommerceDefault,
            });
            await client.query("COMMIT");
            return sanitizeAccount(updatedResult.rows[0]);
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    };
    financeAccountService.listFinanceAccounts = async (request) => {
        const { organizationId } = resolveFinanceContext(request);
        const search = String(request.query?.search || "").trim().toLowerCase();
        const params = [organizationId];
        let searchClause = "";
        if (search) {
            params.push(`%${search}%`);
            searchClause = `AND (
        LOWER(accountcode) LIKE $2 OR LOWER(accountname) LIKE $2
      )`;
        }
        const result = await query(`
      SELECT
        id,
        accountcode,
        accountname,
        accounttype,
        accountsubtype,
        currencycode,
        issystem,
        status
      FROM finance_accounts
      WHERE organizationid = $1
        AND status = 'active'
        AND isusercreatedchartaccount = TRUE
        AND accountsubtype NOT IN ('bank', 'cash')
        ${searchClause}
      ORDER BY accountname ASC
      LIMIT 200
      `, params);
        return result.rows;
    };
    financeAccountService.postDirectLedgerTransaction = async (request) => {
        const { actor, organizationId } = resolveFinanceContext(request);
        const bankCashAccountId = Number(request.params?.accountId);
        const counterpartyAccountId = Number(request.body?.counterpartyaccountid);
        if (!Number.isSafeInteger(bankCashAccountId) || bankCashAccountId <= 0) {
            throw new FinanceValidationError("A valid accountId is required.");
        }
        if (!Number.isSafeInteger(counterpartyAccountId) || counterpartyAccountId <= 0) {
            throw new FinanceValidationError("A valid counterpartyaccountid is required.");
        }
        const transactionDate = requireIsoDate(request.body?.transactiondate, "transactiondate");
        const entrySide = normalizeEntrySide(request.body?.entryside);
        const amount = requirePositiveMoney(request.body?.amount);
        const entryName = normalizeText(request.body?.entryname, "Entry Name", true, 255);
        const remarks = normalizeText(request.body?.remarks, "remarks", false, 2000);
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const accountResult = await client.query(`
        SELECT b.*, f.id AS ledgerid
        FROM bank_cash_accounts b
        JOIN finance_accounts f ON f.id = b.financeaccountid
        WHERE b.id = $1 AND b.organizationid = $2
        FOR UPDATE OF b
        `, [bankCashAccountId, organizationId]);
            const bankCashAccount = accountResult.rows[0];
            if (!bankCashAccount) {
                throw new FinanceValidationError("Bank/Cash account was not found.", 404, "BANK_CASH_ACCOUNT_NOT_FOUND");
            }
            if (bankCashAccount.status !== "active") {
                throw new FinanceValidationError("The selected Bank/Cash account is inactive.");
            }
            const counterpartyResult = await client.query(`
        SELECT *
        FROM finance_accounts
        WHERE id = $1
          AND organizationid = $2
          AND status = 'active'
          AND isusercreatedchartaccount = TRUE
        LIMIT 1
        `, [counterpartyAccountId, organizationId]);
            const counterparty = counterpartyResult.rows[0];
            if (!counterparty) {
                throw new FinanceValidationError("The selected counterparty ledger was not found.");
            }
            if (Number(counterparty.id) === Number(bankCashAccount.financeaccountid)) {
                throw new FinanceValidationError("The counterparty ledger must differ from the selected Bank/Cash account.");
            }
            if (["bank", "cash"].includes(counterparty.accountsubtype)) {
                throw new FinanceValidationError("Bank-to-bank and cash transfers require the transfer workflow.");
            }
            const latestResult = await client.query(`
        SELECT transactiondate
        FROM bank_transactions
        WHERE bankcashaccountid = $1 AND postingstatus = 'posted'
        ORDER BY transactiondate DESC, posteddate DESC, id DESC
        LIMIT 1
        `, [bankCashAccountId]);
            if (latestResult.rows[0]?.transactiondate &&
                transactionDate <
                    (toFinanceDateOnly(latestResult.rows[0].transactiondate) || "")) {
                throw new FinanceValidationError("Backdated transactions are not enabled in the foundation release.");
            }
            const balanceAfter = calculateAvailableBalance(bankCashAccount.currentbalance, entrySide, amount);
            const debitAmount = entrySide === "debit" ? amount : 0;
            const creditAmount = entrySide === "credit" ? amount : 0;
            const epoch = nowEpoch();
            const transactionResult = await client.query(`
        INSERT INTO bank_transactions (
          organizationid,
          bankcashaccountid,
          transactiondate,
          partytype,
          partyid,
          partyname,
          counterpartyaccountid,
          entryside,
          amount,
          debitamount,
          creditamount,
          balanceafter,
          allocationmethod,
          sourcetype,
          remarks,
          entryname,
          postingstatus,
          entrymode,
          createdby,
          postedby,
          createddate,
          posteddate
        )
        VALUES (
          $1, $2, $3, 'ledger', $4, $5, $4, $6, $7, $8, $9,
          $10, 'direct_ledger', 'manual', $11, $12, 'posted', 'manual',
          $13, $13, $14, $14
        )
        RETURNING *
        `, [
                organizationId,
                bankCashAccountId,
                transactionDate,
                counterparty.id,
                counterparty.accountname,
                entrySide,
                amount,
                debitAmount,
                creditAmount,
                balanceAfter,
                remarks,
                entryName,
                actor,
                epoch,
            ]);
            const bankTransaction = transactionResult.rows[0];
            const transactionNumber = `BT-${String(bankTransaction.id).padStart(8, "0")}`;
            const journalResult = await client.query(`
        INSERT INTO journal_entries (
          organizationid,
          entrydate,
          sourcetype,
          sourceid,
          status,
          description,
          createdby,
          postedby,
          createddate,
          posteddate
        )
        VALUES (
          $1, $2, 'bank_transaction', $3, 'posted', $4, $5, $5, $6, $6
        )
        RETURNING *
        `, [
                organizationId,
                transactionDate,
                bankTransaction.id,
                entryName,
                actor,
                epoch,
            ]);
            const journalEntry = journalResult.rows[0];
            const journalNumber = `JE-${String(journalEntry.id).padStart(8, "0")}`;
            const bankDebit = entrySide === "debit" ? amount : 0;
            const bankCredit = entrySide === "credit" ? amount : 0;
            const counterpartyDebit = entrySide === "credit" ? amount : 0;
            const counterpartyCredit = entrySide === "debit" ? amount : 0;
            await client.query(`
        INSERT INTO journal_lines (
          journalentryid,
          financeaccountid,
          debitamount,
          creditamount,
          description
        )
        VALUES
          ($1, $2, $3, $4, $5),
          ($1, $6, $7, $8, $5)
        `, [
                journalEntry.id,
                bankCashAccount.financeaccountid,
                bankDebit,
                bankCredit,
                entryName,
                counterparty.id,
                counterpartyDebit,
                counterpartyCredit,
            ]);
            await client.query(`
        UPDATE journal_entries
        SET journalnumber = $1
        WHERE id = $2
        `, [journalNumber, journalEntry.id]);
            await client.query(`
        UPDATE bank_transactions
        SET transactionnumber = $1,
            journalentryid = $2
        WHERE id = $3
        `, [transactionNumber, journalEntry.id, bankTransaction.id]);
            await client.query(`
        UPDATE bank_cash_accounts
        SET currentbalance = $1,
            version = version + 1,
            modifiedby = $2,
            modifieddate = $3
        WHERE id = $4
        `, [balanceAfter, actor, epoch, bankCashAccountId]);
            await insertAuditEvent(client, organizationId, "bank_transaction", bankTransaction.id, "posted", actor, {
                transactionnumber: transactionNumber,
                entryside: entrySide,
                amount,
                entryname: entryName,
                previousbalance: toMoney(bankCashAccount.currentbalance),
                balanceafter: balanceAfter,
                allocationmethod: "direct_ledger",
                journalentryid: journalEntry.id,
            });
            await client.query("COMMIT");
            return {
                ...bankTransaction,
                transactiondate: toFinanceDateOnly(bankTransaction.transactiondate) ??
                    bankTransaction.transactiondate,
                transactionnumber: transactionNumber,
                journalentryid: journalEntry.id,
                journalnumber: journalNumber,
            };
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    };
    financeAccountService.listBankTransactions = async (request) => {
        const { organizationId } = resolveFinanceContext(request);
        const accountIdParam = request.params?.accountId;
        const queryData = request.query || {};
        const params = [organizationId];
        const conditions = ["t.organizationid = $1"];
        if (accountIdParam != null) {
            const bankCashAccountId = Number(accountIdParam);
            if (!Number.isSafeInteger(bankCashAccountId) || bankCashAccountId <= 0) {
                throw new FinanceValidationError("A valid accountId is required.");
            }
            params.push(bankCashAccountId);
            conditions.push(`t.bankcashaccountid = $${params.length}`);
        }
        if (queryData.bankcashaccountid) {
            const bankCashAccountId = Number(queryData.bankcashaccountid);
            if (!Number.isSafeInteger(bankCashAccountId) || bankCashAccountId <= 0) {
                throw new FinanceValidationError("A valid bankcashaccountid is required.");
            }
            params.push(bankCashAccountId);
            conditions.push(`t.bankcashaccountid = $${params.length}`);
        }
        if (queryData.fromdate) {
            params.push(requireIsoDate(queryData.fromdate, "fromdate"));
            conditions.push(`t.transactiondate >= $${params.length}`);
        }
        if (queryData.todate) {
            params.push(requireIsoDate(queryData.todate, "todate"));
            conditions.push(`t.transactiondate <= $${params.length}`);
        }
        if (queryData.entryside) {
            params.push(normalizeEntrySide(queryData.entryside));
            conditions.push(`t.entryside = $${params.length}`);
        }
        if (queryData.sourcetype) {
            const sourceType = String(queryData.sourcetype).trim().toLowerCase();
            if (sourceType === FINANCE_SOURCE_TYPES.retailReceipt) {
                params.push(getRetailReceiptSourceTypes());
                conditions.push(`LOWER(t.sourcetype) = ANY($${params.length}::text[])`);
            }
            else {
                params.push(sourceType);
                conditions.push(`LOWER(t.sourcetype) = $${params.length}`);
            }
        }
        if (queryData.transactiontype) {
            const transactionType = String(queryData.transactiontype)
                .trim()
                .toLowerCase();
            if (transactionType === "customer_receipt") {
                params.push([
                    FINANCE_SOURCE_TYPES.ecommerceOrder,
                    ...getRetailReceiptSourceTypes(),
                    FINANCE_SOURCE_TYPES.serviceRequestReceipt,
                    FINANCE_SOURCE_TYPES.rentalReceipt,
                ]);
                conditions.push(`LOWER(t.sourcetype) = ANY($${params.length}::text[])`);
            }
            else if (transactionType === "supplier_payment") {
                params.push(FINANCE_SOURCE_TYPES.supplierBillPayment);
                conditions.push(`LOWER(t.sourcetype) = $${params.length}`);
            }
            else if (transactionType === "direct_ledger") {
                conditions.push("t.allocationmethod = 'direct_ledger'");
            }
            else {
                throw new FinanceValidationError("transactiontype must be customer_receipt, supplier_payment, or direct_ledger.");
            }
        }
        if (queryData.search) {
            params.push(`%${String(queryData.search).trim().toLowerCase()}%`);
            conditions.push(`(
        LOWER(COALESCE(t.transactionnumber, '')) LIKE $${params.length}
        OR LOWER(COALESCE(t.partyname, '')) LIKE $${params.length}
        OR LOWER(COALESCE(t.remarks, '')) LIKE $${params.length}
        OR LOWER(COALESCE(b.accountname, '')) LIKE $${params.length}
        OR LOWER(COALESCE(b.bankname, '')) LIKE $${params.length}
      )`);
        }
        const page = Math.max(Number(queryData.page) || 1, 1);
        const count = Math.min(Math.max(Number(queryData.count) || 100, 1), 500);
        const offset = (page - 1) * count;
        const filterParams = [...params];
        const summaryResult = await query(`
      SELECT
        COUNT(*)::INTEGER AS total,
        COALESCE(SUM(t.debitamount), 0) AS debit,
        COALESCE(SUM(t.creditamount), 0) AS credit
      FROM bank_transactions t
      JOIN bank_cash_accounts b
        ON b.id = t.bankcashaccountid
       AND b.organizationid = t.organizationid
      WHERE ${conditions.join(" AND ")}
      `, filterParams);
        params.push(offset, count);
        const result = await query(`
      SELECT
        t.*,
        b.accountname AS bankcashaccountname,
        b.bankname AS bankname,
        b.accounttype AS bankcashaccounttype,
        b.currencycode AS bankcashcurrencycode,
        b.status AS bankcashaccountstatus,
        j.journalnumber,
        f.accountname AS counterpartyaccountname,
        f.accountcode AS counterpartyaccountcode,
        COALESCE(
          NULLIF(
            TRIM(
              CONCAT_WS(
                ' ',
                NULLIF(creator.firstname, ''),
                NULLIF(creator.lastname, '')
              )
            ),
            ''
          ),
          creator.useremail,
          t.createdby
        ) AS creatorname,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'documenttype', a.documenttype,
                'documentid', a.documentid,
                'documentnumber', a.documentnumber,
                'invoiceid', a.documentid,
                'billid', CASE
                  WHEN a.documenttype = 'purchase_bill' THEN a.documentid
                  ELSE NULL
                END,
                'invoicenumber', a.documentnumber,
                'invoiceurl', COALESCE(r.invoiceurl, bill.invoiceurl),
                'allocationamount', a.allocationamount,
                'tdsapplied', a.tdsapplied,
                'tdssectionid', a.tdssectionid,
                'tdssection', CASE
                  WHEN a.tdssectionid IS NOT NULL THEN a.statutorysnapshot
                  ELSE NULL
                END,
                'adjustmenttype', a.statutorysnapshot->>'adjustmenttype',
                'tdsamount', a.tdsamount,
                'totalsettledamount', a.totalsettledamount,
                'status', a.status
              )
              ORDER BY a.id
            )
            FROM bank_transaction_allocations a
            LEFT JOIN revoinvoice r
              ON r.id = a.documentid
             AND a.documenttype = 'sales_invoice'
            LEFT JOIN poinvoice bill
              ON bill.id = a.documentid
             AND a.documenttype = 'purchase_bill'
            WHERE a.banktransactionid = t.id
              AND a.status = 'applied'
          ),
          '[]'::jsonb
        ) AS allocations
      FROM bank_transactions t
      JOIN bank_cash_accounts b
        ON b.id = t.bankcashaccountid
       AND b.organizationid = t.organizationid
      LEFT JOIN journal_entries j ON j.id = t.journalentryid
      LEFT JOIN finance_accounts f ON f.id = t.counterpartyaccountid
      LEFT JOIN LATERAL (
        SELECT
          iu.firstname,
          iu.lastname,
          iu.useremail
        FROM inventoryusers iu
        WHERE iu.id::TEXT = t.createdby
           OR LOWER(iu.useremail) = LOWER(t.createdby)
        ORDER BY CASE WHEN iu.id::TEXT = t.createdby THEN 0 ELSE 1 END
        LIMIT 1
      ) creator ON TRUE
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.transactiondate DESC, t.posteddate DESC, t.id DESC
      OFFSET $${params.length - 1} LIMIT $${params.length}
      `, params);
        return {
            records: result.rows.map((row) => ({
                ...row,
                transactiondate: toFinanceDateOnly(row.transactiondate) ?? row.transactiondate,
            })),
            total: Number(summaryResult.rows[0]?.total || 0),
            page,
            count,
            summary: {
                debit: Number(summaryResult.rows[0]?.debit || 0),
                credit: Number(summaryResult.rows[0]?.credit || 0),
            },
        };
    };
})(financeAccountService || (financeAccountService = {}));
//# sourceMappingURL=financeAccount.service.js.map