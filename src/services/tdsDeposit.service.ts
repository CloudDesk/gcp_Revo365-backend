import pool, { query } from "../database/postgres.js";
import { FinanceValidationError, nowEpoch, resolveFinanceContext, toMoney } from "../utils/finance/finance.utils.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FY = /^\d{4}-\d{2}$/;
const fiscalPeriodFor = (date: string) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  const month = value.getUTCMonth() + 1;
  const year = month < 4 ? value.getUTCFullYear() - 1 : value.getUTCFullYear();
  return {
    financialYear: `${year}-${String((year + 1) % 100).padStart(2, "0")}`,
    quarter:
      month >= 4 && month <= 6
        ? "Q1"
        : month >= 7 && month <= 9
          ? "Q2"
          : month >= 10
            ? "Q3"
            : "Q4",
  };
};
const number = (value: unknown, name: string) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new FinanceValidationError(`${name} must be zero or greater.`);
  return toMoney(parsed);
};

export module tdsDepositService {
  export const list = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const from = String(request.query?.from || "1900-01-01");
    const to = String(request.query?.to || "2999-12-31");
    const status = String(request.query?.status || "").toLowerCase();
    const search = String(request.query?.search || "").trim();
    const page = Math.max(Number(request.query?.page) || 1, 1);
    const count = Math.min(Math.max(Number(request.query?.count) || 25, 1), 200);
    if (!DATE.test(from) || !DATE.test(to) || from > to) throw new FinanceValidationError("Select a valid deposit date range.");
    const params = [organizationId, from, to, status, search, `%${search}%`, (page - 1) * count, count];
    const [records, totals] = await Promise.all([
      query(`SELECT d.*, s.newcode AS sectioncode, s.natureofpayment, s.rate,
                    b.accountname AS bankaccountname
             FROM finance_tds_deposits d
             LEFT JOIN tds_sections s ON s.id=d.tdssectionid AND s.organizationid=d.organizationid
             LEFT JOIN bank_transactions t ON t.id=d.banktransactionid
             LEFT JOIN bank_cash_accounts b ON b.id=t.bankcashaccountid
             WHERE d.organizationid=$1 AND d.depositdate BETWEEN $2 AND $3
               AND ($4='' OR d.status=$4)
               AND ($5='' OR d.challannumber ILIKE $6 OR COALESCE(d.cin,'') ILIKE $6 OR COALESCE(d.paymentreference,'') ILIKE $6)
             ORDER BY d.depositdate DESC,d.id DESC OFFSET $7 LIMIT $8`, params),
      query(`SELECT COUNT(*)::int AS total,
                    COALESCE(SUM(taxamount) FILTER (WHERE status IN ('paid','reconciled')),0) AS taxamount,
                    COALESCE(SUM(interestamount) FILTER (WHERE status IN ('paid','reconciled')),0) AS interestamount,
                    COALESCE(SUM(feeamount+penaltyamount) FILTER (WHERE status IN ('paid','reconciled')),0) AS otheramount,
                    COALESCE(SUM(totalamount) FILTER (WHERE status IN ('paid','reconciled')),0) AS totalamount
             FROM finance_tds_deposits d WHERE organizationid=$1 AND depositdate BETWEEN $2 AND $3
               AND ($4='' OR status=$4)
               AND ($5='' OR challannumber ILIKE $6 OR COALESCE(cin,'') ILIKE $6 OR COALESCE(paymentreference,'') ILIKE $6)`, params.slice(0, 6)),
    ]);
    return { rows: records.rows, summary: totals.rows[0], total: Number(totals.rows[0]?.total || 0), page, count };
  };

  export const create = async (request: any) => {
    const { actor, organizationId } = resolveFinanceContext(request);
    const body = request.body || {};
    const challanNumber = String(body.challannumber || "").trim();
    const depositDate = String(body.depositdate || "").trim();
    const financialYear = String(body.financialyear || "").trim();
    const quarter = String(body.quarter || "").toUpperCase();
    const bankCashAccountId = Number(body.bankcashaccountid);
    const tdsSectionId = body.tdssectionid ? Number(body.tdssectionid) : null;
    const taxAmount = number(body.taxamount, "Tax amount");
    const interestAmount = number(body.interestamount, "Interest amount");
    const feeAmount = number(body.feeamount, "Fee amount");
    const penaltyAmount = number(body.penaltyamount, "Penalty amount");
    const totalAmount = toMoney(taxAmount + interestAmount + feeAmount + penaltyAmount);
    if (!challanNumber) throw new FinanceValidationError("Challan Number is required.");
    if (!DATE.test(depositDate)) throw new FinanceValidationError("Deposit Date is required.");
    if (!FY.test(financialYear)) throw new FinanceValidationError("Financial Year must use YYYY-YY format.");
    if (!["Q1", "Q2", "Q3", "Q4"].includes(quarter)) throw new FinanceValidationError("Quarter must be Q1, Q2, Q3 or Q4.");
    const expectedPeriod = fiscalPeriodFor(depositDate);
    if (financialYear !== expectedPeriod.financialYear || quarter !== expectedPeriod.quarter) {
      throw new FinanceValidationError(
        `Deposit Date belongs to ${expectedPeriod.financialYear} ${expectedPeriod.quarter}.`
      );
    }
    if (!Number.isSafeInteger(bankCashAccountId) || bankCashAccountId <= 0) throw new FinanceValidationError("Select a valid Bank Account.");
    if (totalAmount <= 0 || taxAmount <= 0) throw new FinanceValidationError("Tax Amount must be greater than zero.");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const epoch = nowEpoch();
      if (tdsSectionId) {
        const sectionResult = await client.query(
          `SELECT id FROM tds_sections WHERE id=$1 AND organizationid=$2 AND status='active'`,
          [tdsSectionId, organizationId]
        );
        if (!sectionResult.rows[0]) {
          throw new FinanceValidationError("Selected TDS Section is unavailable.");
        }
      }
      await client.query(`INSERT INTO finance_accounts (organizationid,accountcode,accountname,accounttype,accountsubtype,currencycode,issystem,status,createdby,modifiedby)
        VALUES ($1,'SYS-TDS-PAYABLE','TDS Payable','liability','tds_payable','INR',TRUE,'active',$2,$2),
               ($1,'SYS-TDS-INTEREST-EXPENSE','TDS Interest Expense','expense','tds_interest','INR',TRUE,'active',$2,$2),
               ($1,'SYS-TDS-LATE-FEE-EXPENSE','TDS Late Fee Expense','expense','tds_late_fee','INR',TRUE,'active',$2,$2),
               ($1,'SYS-TDS-PENALTY-EXPENSE','TDS Penalty Expense','expense','tds_penalty','INR',TRUE,'active',$2,$2)
        ON CONFLICT DO NOTHING`, [organizationId, actor]);
      const accountRows = await client.query(`SELECT id,accountcode FROM finance_accounts WHERE organizationid=$1 AND accountcode=ANY($2::text[]) AND status='active'`, [organizationId, ["SYS-TDS-PAYABLE","SYS-TDS-INTEREST-EXPENSE","SYS-TDS-LATE-FEE-EXPENSE","SYS-TDS-PENALTY-EXPENSE"]]);
      const accounts = new Map<string, number>(accountRows.rows.map((row:any): [string, number]=>[String(row.accountcode),Number(row.id)]));
      if (accounts.size !== 4) throw new FinanceValidationError("Required TDS Chart of Accounts could not be resolved.");
      const bankResult = await client.query(`SELECT * FROM bank_cash_accounts WHERE id=$1 AND organizationid=$2 AND status='active' FOR UPDATE`, [bankCashAccountId, organizationId]);
      const bank = bankResult.rows[0];
      if (!bank || String(bank.accounttype || "").toLowerCase() !== "bank") {
        throw new FinanceValidationError("Selected Bank Account is unavailable.");
      }
      const balanceAfter = toMoney(Number(bank.currentbalance)-totalAmount);
      const depositResult = await client.query(`INSERT INTO finance_tds_deposits (organizationid,challannumber,depositdate,financialyear,quarter,tdssectionid,taxamount,interestamount,feeamount,penaltyamount,bsrcode,challanserialnumber,cin,paymentreference,status,notes,createdby,updatedby)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'paid',$15,$16,$16) RETURNING *`, [organizationId,challanNumber,depositDate,financialYear,quarter,tdsSectionId,taxAmount,interestAmount,feeAmount,penaltyAmount,body.bsrcode||null,body.challanserialnumber||null,body.cin||null,body.paymentreference||null,body.notes||null,actor]);
      const deposit = depositResult.rows[0];
      const bankTxResult = await client.query(`INSERT INTO bank_transactions (organizationid,bankcashaccountid,transactiondate,partytype,partyname,counterpartyaccountid,entryside,amount,debitamount,creditamount,balanceafter,allocationmethod,sourcetype,sourceid,sourcepaymentid,remarks,postingstatus,entrymode,createdby,postedby,createddate,posteddate)
        VALUES ($1,$2,$3,'ledger','Government TDS',$4,'credit',$5,0,$5,$6,'direct_ledger','tds_government_deposit',$7::text,$8,$9,'posted','system',$10,$10,$11,$11) RETURNING *`, [organizationId,bankCashAccountId,depositDate,accounts.get("SYS-TDS-PAYABLE"),totalAmount,balanceAfter,deposit.id,challanNumber,`TDS challan ${challanNumber}`,actor,epoch]);
      const bankTx = bankTxResult.rows[0];
      const journalResult = await client.query(`INSERT INTO journal_entries (organizationid,entrydate,sourcetype,sourceid,status,description,createdby,postedby,createddate,posteddate)
        VALUES ($1,$2,'tds_government_deposit',$3,'posted',$4,$5,$5,$6,$6) RETURNING *`, [organizationId,depositDate,deposit.id,`TDS challan ${challanNumber}`,actor,epoch]);
      const journal = journalResult.rows[0];
      const rawLines:Array<[number | undefined, number, number]> = [[accounts.get("SYS-TDS-PAYABLE"),taxAmount,0],[accounts.get("SYS-TDS-INTEREST-EXPENSE"),interestAmount,0],[accounts.get("SYS-TDS-LATE-FEE-EXPENSE"),feeAmount,0],[accounts.get("SYS-TDS-PENALTY-EXPENSE"),penaltyAmount,0],[Number(bank.financeaccountid),0,totalAmount]];
      const lines = rawLines.filter((line)=>line[1]>0||line[2]>0);
      for (const [accountId,debit,credit] of lines) await client.query(`INSERT INTO journal_lines (journalentryid,financeaccountid,debitamount,creditamount,description) VALUES ($1,$2,$3,$4,$5)`, [journal.id,accountId,debit,credit,`TDS challan ${challanNumber}`]);
      await client.query(`UPDATE bank_cash_accounts SET currentbalance=$1,version=version+1,modifiedby=$2,modifieddate=$3 WHERE id=$4`, [balanceAfter,actor,epoch,bankCashAccountId]);
      await client.query(`UPDATE bank_transactions SET transactionnumber=$1,journalentryid=$2 WHERE id=$3`, [`BT-${String(bankTx.id).padStart(8,"0")}`,journal.id,bankTx.id]);
      await client.query(`UPDATE journal_entries SET journalnumber=$1 WHERE id=$2`, [`JE-${String(journal.id).padStart(8,"0")}`,journal.id]);
      await client.query(`UPDATE finance_tds_deposits SET banktransactionid=$1,journalentryid=$2 WHERE id=$3`, [bankTx.id,journal.id,deposit.id]);
      await client.query(`INSERT INTO finance_audit_events (organizationid,entitytype,entityid,action,actor,eventdata) VALUES ($1,'tds_deposit',$2,'create',$3,$4::jsonb)`, [organizationId,deposit.id,actor,JSON.stringify({challanNumber,taxAmount,interestAmount,feeAmount,penaltyAmount,bankCashAccountId,journalEntryId:journal.id})]);
      await client.query("COMMIT");
      return { ...deposit, totalamount: totalAmount, banktransactionid: bankTx.id, journalentryid: journal.id, balanceafter: balanceAfter };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  };
}
