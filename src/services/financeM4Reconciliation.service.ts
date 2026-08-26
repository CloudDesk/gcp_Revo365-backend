import { createHash } from "crypto";
import pool, { query } from "../database/postgres.js";
import { getRetailInvoicePaymentState } from "../utils/finance/retailReceipt.utils.js";
import { getSupplierBillPaymentState } from "../utils/finance/supplierBill.utils.js";
import {
  FinanceValidationError, nowEpoch, requireIsoDate, resolveFinanceContext, toMoney,
} from "../utils/finance/finance.utils.js";
import { classifyM4Document, requiredM4Movement } from "../utils/finance/m4Reconciliation.utils.js";

type Db = (sql: string, values?: any[]) => Promise<any>;
const money = (value: unknown) => toMoney(Number(value) || 0);
const invoiceDateSql = (alias: string) => `CASE WHEN COALESCE(${alias}.invoicedate,${alias}.createddate) >= 100000000000 THEN FLOOR(COALESCE(${alias}.invoicedate,${alias}.createddate)/1000.0) ELSE COALESCE(${alias}.invoicedate,${alias}.createddate) END`;
const epochToDate = (value: unknown) => new Date(Number(value || 0) * 1000).toISOString().slice(0, 10);
const isAdmin = (request: any) => String(request?.session?.role || "").trim().toLowerCase() === "admin";
const requireAdmin = (request: any) => { if (!isAdmin(request)) throw new FinanceValidationError("Only an Admin can approve or post M4 corrections.", 403, "M4_ADMIN_REQUIRED"); };

const analyze = async (organizationId: number, asOfDate: string, cutoverDate: string, db: Db = query) => {
  const toEpoch = Math.floor(new Date(`${asOfDate}T23:59:59.999Z`).getTime()/1000);
  const [invoiceResult,billResult,lineResult,otherLineResult,unscopedInvoiceResult,unscopedBillResult] = await Promise.all([
    db(`SELECT r.* FROM revoinvoice r WHERE r.organizationid=$1 AND ${invoiceDateSql("r")} <= $2 AND LOWER(COALESCE(r.paymentstatus,'pending')) NOT IN ('cancelled','void') ORDER BY ${invoiceDateSql("r")},r.id`,[organizationId,toEpoch]),
    db(`SELECT b.* FROM poinvoice b WHERE b.organizationid=$1 AND ${invoiceDateSql("b")} <= $2 AND LOWER(COALESCE(b.invoicestatus,'in_progress')) NOT IN ('cancelled','void') ORDER BY ${invoiceDateSql("b")},b.id`,[organizationId,toEpoch]),
    db(`SELECT je.id AS journalid,je.entrydate,je.journalnumber,je.sourcetype,je.sourceid,je.status,je.reversalofid,
               jl.id AS lineid,jl.financeaccountid,jl.debitamount,jl.creditamount,fa.accountsubtype,
               a.documenttype,a.documentid,a.totalsettledamount,
               EXISTS(SELECT 1 FROM journal_entries rev WHERE rev.reversalofid=je.id) AS hasreversal
        FROM journal_entries je JOIN journal_lines jl ON jl.journalentryid=je.id
        JOIN finance_accounts fa ON fa.id=jl.financeaccountid AND fa.organizationid=je.organizationid
        LEFT JOIN bank_transactions bt ON je.sourcetype='bank_transaction' AND bt.id=je.sourceid AND bt.organizationid=je.organizationid
        LEFT JOIN bank_transaction_allocations a ON a.banktransactionid=bt.id AND a.status='applied'
        WHERE je.organizationid=$1 AND je.entrydate <= $2 AND je.status IN ('posted','reversed')
          AND fa.accountsubtype IN ('accounts_receivable','accounts_payable')
        ORDER BY je.entrydate,je.id,jl.id`,[organizationId,asOfDate]),
    db(`SELECT je.id AS journalid,je.sourcetype,je.sourceid,fa.accounttype,fa.accountsubtype
        FROM journal_entries je JOIN journal_lines jl ON jl.journalentryid=je.id
        JOIN finance_accounts fa ON fa.id=jl.financeaccountid AND fa.organizationid=je.organizationid
        WHERE je.organizationid=$1 AND je.entrydate <= $2 AND je.status='posted'
          AND (je.sourcetype IN ('sales_invoice','retail_invoice','purchase_bill','supplier_bill'))`,[organizationId,asOfDate]),
    db(`SELECT COUNT(*)::int AS count FROM revoinvoice WHERE organizationid IS NULL`),
    db(`SELECT COUNT(*)::int AS count FROM poinvoice WHERE organizationid IS NULL`),
  ]);
  const controlLines = lineResult.rows.map((line:any)=>({ ...line, lineid:Number(line.lineid), journalid:Number(line.journalid), sourceid:Number(line.sourceid), documentid:line.documentid==null?null:Number(line.documentid), debit:money(line.debitamount), credit:money(line.creditamount), allocatedAmount:line.totalsettledamount==null?null:money(line.totalsettledamount) }));
  const uniqueControlLines=[...new Map(controlLines.map((line:any)=>[line.lineid,line])).values()] as any[];
  const otherSources = otherLineResult.rows;
  const directTypes:any = { receivable:new Set(["sales_invoice","retail_invoice"]), payable:new Set(["purchase_bill","supplier_bill"]) };
  const buildRows = (kind:"receivable"|"payable", documents:any[]) => documents.map((document:any)=>{
    const id=Number(document.id); const date=epochToDate(Number(document.invoicedate||document.createddate) >= 100000000000 ? Number(document.invoicedate||document.createddate)/1000 : document.invoicedate||document.createddate);
    const expected=money(kind==="receivable"?getRetailInvoicePaymentState(document).outstandingAmount:getSupplierBillPaymentState(document).outstandingAmount);
    const documentType=kind==="receivable"?"sales_invoice":"purchase_bill";
    const related=controlLines.filter((line:any)=>(line.documenttype===documentType&&line.documentid===id)||(directTypes[kind].has(String(line.sourcetype))&&line.sourceid===id));
    const directJournalIds=new Set(related.filter((line:any)=>directTypes[kind].has(String(line.sourcetype))).map((line:any)=>line.journalid));
    const actual=money(related.reduce((sum:number,line:any)=>{const raw=kind==="receivable"?line.debit-line.credit:line.credit-line.debit;if(line.documentid!=null&&line.allocatedAmount!=null)return sum+(raw<0?-line.allocatedAmount:line.allocatedAmount);return sum+raw;},0));
    const difference=money(actual-expected);
    const hasOtherSource=otherSources.some((line:any)=>directTypes[kind].has(String(line.sourcetype))&&Number(line.sourceid)===id);
    const reversed=related.some((line:any)=>line.status==="reversed"||line.hasreversal);
    const classification=classifyM4Document({difference,directJournalCount:directJournalIds.size,hasRelatedControlLine:related.length>0,hasOtherSource,reversed});
    return { kind,documentId:id,documentNumber:document.invoicenumber||`${kind==="receivable"?"INV":"BILL"}-${id}`,date,period:date<cutoverDate?"pre_cutover":"post_cutover",expectedLedgerBalance:expected,matchedLedgerBalance:actual,difference,classification,journalIds:[...new Set(related.map((line:any)=>line.journalid))] };
  });
  const rows=[...buildRows("receivable",invoiceResult.rows),...buildRows("payable",billResult.rows)];
  const documentsReceivable=money(invoiceResult.rows.reduce((s:number,r:any)=>s+getRetailInvoicePaymentState(r).outstandingAmount,0));
  const documentsPayable=money(billResult.rows.reduce((s:number,r:any)=>s+getSupplierBillPaymentState(r).outstandingAmount,0));
  const ledgerReceivable=money(uniqueControlLines.filter((l:any)=>l.accountsubtype==="accounts_receivable"&&l.status==="posted").reduce((s:number,l:any)=>s+l.debit-l.credit,0));
  const ledgerPayable=money(uniqueControlLines.filter((l:any)=>l.accountsubtype==="accounts_payable"&&l.status==="posted").reduce((s:number,l:any)=>s+l.credit-l.debit,0));
  const summary={ documentsReceivable,ledgerReceivable,receivableVariance:money(ledgerReceivable-documentsReceivable),documentsPayable,ledgerPayable,payableVariance:money(ledgerPayable-documentsPayable) };
  const unmatchedControlLines=controlLines.filter((line:any)=>!line.documentid&&!directTypes.receivable.has(String(line.sourcetype))&&!directTypes.payable.has(String(line.sourcetype))).map((line:any)=>({ journalId:line.journalid,journalNumber:line.journalnumber,date:String(line.entrydate).slice(0,10),sourceType:line.sourcetype,sourceId:line.sourceid,controlType:line.accountsubtype,amount:money(line.accountsubtype==="accounts_receivable"?line.debit-line.credit:line.credit-line.debit),classification:"unmatched_ledger" }));
  const fingerprint=createHash("sha256").update(JSON.stringify({organizationId,asOfDate,cutoverDate,summary,rows:rows.map((r:any)=>[r.kind,r.documentId,r.expectedLedgerBalance,r.matchedLedgerBalance,r.classification]),unmatchedControlLines})).digest("hex");
  const counts=rows.reduce((result:any,row:any)=>{result[row.classification]=(result[row.classification]||0)+1;return result;},{});
  const unscopedInvoices=Number(unscopedInvoiceResult.rows[0]?.count||0);
  const unscopedBills=Number(unscopedBillResult.rows[0]?.count||0);
  const dataIntegrity={unscopedInvoices,unscopedBills,reconciliationReady:unscopedInvoices===0&&unscopedBills===0};
  return { meta:{organizationId,asOfDate,cutoverDate,fingerprint,readOnly:true},summary,counts,rows,unmatchedControlLines,dataIntegrity };
};

const dates = (request:any) => {
  const asOfDate=requireIsoDate(request.query?.asOfDate||request.query?.to||new Date().toISOString().slice(0,10),"asOfDate");
  const cutoverDate=requireIsoDate(request.query?.cutoverDate||request.body?.cutoverDate||asOfDate,"cutoverDate");
  if(cutoverDate>asOfDate) throw new FinanceValidationError("cutoverDate cannot be after asOfDate.");
  return {asOfDate,cutoverDate};
};

export module financeM4ReconciliationService {
  export const getAnalysis = async (request:any) => { const {organizationId}=resolveFinanceContext(request); const {asOfDate,cutoverDate}=dates(request); return analyze(organizationId,asOfDate,cutoverDate); };

  export const createDryRun = async (request:any) => {
    const {organizationId,actor}=resolveFinanceContext(request); const {asOfDate,cutoverDate}=dates(request);
    const report=await analyze(organizationId,asOfDate,cutoverDate); const s=report.summary;
    if(!report.dataIntegrity.reconciliationReady) throw new FinanceValidationError(`M4 is blocked until tenant ownership is assigned for ${report.dataIntegrity.unscopedInvoices} invoice(s) and ${report.dataIntegrity.unscopedBills} bill(s).`,409,"M4_UNSCOPED_DOCUMENTS");
    const result=await query(`INSERT INTO finance_m4_reconciliation_runs (organizationid,asofdate,cutoverdate,fingerprint,status,documentsreceivable,ledgerreceivable,receivablevariance,documentspayable,ledgerpayable,payablevariance,createdby,createddate)
      VALUES ($1,$2,$3,$4,'dry_run',$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (organizationid,fingerprint) DO UPDATE SET fingerprint=EXCLUDED.fingerprint RETURNING *`,[organizationId,asOfDate,cutoverDate,report.meta.fingerprint,s.documentsReceivable,s.ledgerReceivable,s.receivableVariance,s.documentsPayable,s.ledgerPayable,s.payableVariance,actor,nowEpoch()]);
    await query(`INSERT INTO finance_audit_events (organizationid,entitytype,entityid,action,actor,eventdata,createddate) VALUES ($1,'m4_reconciliation_run',$2,'dry_run_created',$3,$4::jsonb,$5)`,[organizationId,result.rows[0].id,actor,JSON.stringify({fingerprint:report.meta.fingerprint,asOfDate,cutoverDate,summary:s}),nowEpoch()]);
    return {run:result.rows[0],report};
  };

  export const approve = async (request:any) => {
    requireAdmin(request); const {organizationId,actor}=resolveFinanceContext(request); const runId=Number(request.params?.runId);
    const ar=Number(request.body?.arCounterpartAccountId), ap=Number(request.body?.apCounterpartAccountId); const note=String(request.body?.approvalNote||"").trim();
    if(!Number.isSafeInteger(runId)||runId<=0||!Number.isSafeInteger(ar)||!Number.isSafeInteger(ap)||!note) throw new FinanceValidationError("Run, both counterpart accounts, and an approval note are required.");
    const accounts=await query(`SELECT id,accountsubtype FROM finance_accounts WHERE organizationid=$1 AND status='active' AND id=ANY($2::bigint[])`,[organizationId,[ar,ap]]);
    if(accounts.rows.length!==new Set([ar,ap]).size||accounts.rows.some((a:any)=>["accounts_receivable","accounts_payable"].includes(String(a.accountsubtype)))) throw new FinanceValidationError("Counterpart accounts must be active non-control accounts in this organization.");
    const result=await query(`UPDATE finance_m4_reconciliation_runs SET status='approved',arcounterpartaccountid=$1,apcounterpartaccountid=$2,approvalnote=$3,approvedby=$4,approveddate=$5 WHERE id=$6 AND organizationid=$7 AND status IN ('dry_run','approved') RETURNING *`,[ar,ap,note,actor,nowEpoch(),runId,organizationId]);
    if(!result.rows[0]) throw new FinanceValidationError("M4 dry run was not found or is no longer approvable.",409,"M4_RUN_NOT_APPROVABLE");
    await query(`INSERT INTO finance_audit_events (organizationid,entitytype,entityid,action,actor,eventdata,createddate) VALUES ($1,'m4_reconciliation_run',$2,'approved',$3,$4::jsonb,$5)`,[organizationId,runId,actor,JSON.stringify({arCounterpartAccountId:ar,apCounterpartAccountId:ap,approvalNote:note}),nowEpoch()]); return result.rows[0];
  };

  export const postApproved = async (request:any) => {
    requireAdmin(request); const {organizationId,actor}=resolveFinanceContext(request); const runId=Number(request.params?.runId); if(!Number.isSafeInteger(runId)||runId<=0) throw new FinanceValidationError("runId is invalid.");
    const client=await pool.connect(); const db:Db=(sql,values=[])=>client.query(sql,values);
    try{
      await client.query("BEGIN");
      const runResult=await client.query(`SELECT * FROM finance_m4_reconciliation_runs WHERE id=$1 AND organizationid=$2 FOR UPDATE`,[runId,organizationId]); const run=runResult.rows[0];
      if(!run) throw new FinanceValidationError("M4 run not found.",404,"M4_RUN_NOT_FOUND"); if(run.status==="posted"){await client.query("COMMIT");return {run,idempotent:true};} if(run.status!=="approved") throw new FinanceValidationError("M4 run must be approved before posting.",409,"M4_APPROVAL_REQUIRED");
      const current=await analyze(organizationId,String(run.asofdate).slice(0,10),String(run.cutoverdate).slice(0,10),db); if(current.meta.fingerprint!==run.fingerprint) throw new FinanceValidationError("The reconciliation changed after approval. Create and approve a new dry run.",409,"M4_RUN_STALE");
      const controls=await client.query(`SELECT id,accountcode FROM finance_accounts WHERE organizationid=$1 AND status='active' AND accountcode IN ('SYS-AR','SYS-AP')`,[organizationId]);
      const byCode=new Map(controls.rows.map((a:any)=>[String(a.accountcode),Number(a.id)]));
      const counterpartIds=[Number(run.arcounterpartaccountid),Number(run.apcounterpartaccountid)];
      const counterparts=await client.query(`SELECT id FROM finance_accounts WHERE organizationid=$1 AND status='active' AND id=ANY($2::bigint[]) AND accountsubtype NOT IN ('accounts_receivable','accounts_payable')`,[organizationId,counterpartIds]);
      if(counterparts.rows.length!==new Set(counterpartIds).size) throw new FinanceValidationError("One or more approved counterpart accounts are no longer eligible.",409,"M4_COUNTERPART_INELIGIBLE");
      const epoch=nowEpoch();
      for(const correction of [{type:"ar",variance:current.summary.receivableVariance,controlId:byCode.get("SYS-AR"),counterpartId:Number(run.arcounterpartaccountid),source:"m4_ar_correction"},{type:"ap",variance:current.summary.payableVariance,controlId:byCode.get("SYS-AP"),counterpartId:Number(run.apcounterpartaccountid),source:"m4_ap_correction"}]){
        if(Math.abs(correction.variance)<=0.01) continue; if(!correction.controlId) throw new FinanceValidationError(`Required ${correction.type.toUpperCase()} control account is missing.`);
        const movement=requiredM4Movement(correction.type as "ar"|"ap",correction.variance); const amount=money(movement.amount); const controlDebit=movement.side==="debit"; const jr=await client.query(`INSERT INTO journal_entries (organizationid,entrydate,sourcetype,sourceid,status,reference,description,createdby,postedby,createddate,posteddate) VALUES ($1,$2,$3,$4,'posted',$5,$6,$7,$7,$8,$8) ON CONFLICT (organizationid,sourcetype,sourceid) WHERE status <> 'reversed' DO NOTHING RETURNING id`,[organizationId,run.asofdate,correction.source,runId,`M4-${correction.type.toUpperCase()}-${runId}`,`Approved M4 ${correction.type.toUpperCase()} control reconciliation: ${run.approvalnote}`,actor,epoch]);
        let journalId=Number(jr.rows[0]?.id); if(!journalId){const existing=await client.query(`SELECT id FROM journal_entries WHERE organizationid=$1 AND sourcetype=$2 AND sourceid=$3 AND status<>'reversed'`,[organizationId,correction.source,runId]);journalId=Number(existing.rows[0]?.id);} else {
          await client.query(`UPDATE journal_entries SET journalnumber=$1 WHERE id=$2`,[`JE-${String(journalId).padStart(8,"0")}`,journalId]);
          await client.query(`INSERT INTO journal_lines (journalentryid,financeaccountid,debitamount,creditamount,description,lineorder) VALUES ($1,$2,$3,$4,$5,1),($1,$6,$4,$3,$5,2)`,[journalId,correction.controlId,controlDebit?amount:0,controlDebit?0:amount,`M4 ${correction.type.toUpperCase()} reconciliation`,correction.counterpartId]);
        }
        await client.query(`INSERT INTO finance_m4_correction_journals (organizationid,runid,controltype,journalentryid,amount,createddate) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (organizationid,runid,controltype) DO NOTHING`,[organizationId,runId,correction.type,journalId,amount,epoch]);
      }
      const verified=await analyze(organizationId,String(run.asofdate).slice(0,10),String(run.cutoverdate).slice(0,10),db); if(Math.abs(verified.summary.receivableVariance)>0.01||Math.abs(verified.summary.payableVariance)>0.01) throw new FinanceValidationError("Corrective journals did not reconcile both control accounts; nothing was posted.",409,"M4_VERIFICATION_FAILED");
      await client.query(`UPDATE finance_m4_reconciliation_runs SET status='posted',postedby=$1,posteddate=$2 WHERE id=$3`,[actor,epoch,runId]);
      await client.query(`INSERT INTO finance_audit_events (organizationid,entitytype,entityid,action,actor,eventdata,createddate) VALUES ($1,'m4_reconciliation_run',$2,'corrections_posted',$3,$4::jsonb,$5)`,[organizationId,runId,actor,JSON.stringify({verification:verified.summary}),epoch]);
      await client.query("COMMIT"); return {runId,status:"posted",idempotent:false,verification:verified.summary};
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  };

  export const listRuns = async (request:any) => { const {organizationId}=resolveFinanceContext(request); const result=await query(`SELECT * FROM finance_m4_reconciliation_runs WHERE organizationid=$1 ORDER BY id DESC LIMIT 50`,[organizationId]); return result.rows; };
}
