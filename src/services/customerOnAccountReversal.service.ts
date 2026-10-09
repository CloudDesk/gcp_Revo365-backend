import { FinanceValidationError, nowEpoch } from "../utils/finance/finance.utils.js";

type QueryClient = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const removeAllocationFromPaymentData = (
  rawPaymentData: unknown,
  allocationId: number,
  bankPortion: number,
  tdsAmount: number,
  totalSettlement: number
) => {
  let parsed: any[] = [];
  try {
    parsed = Array.isArray(rawPaymentData)
      ? rawPaymentData
      : typeof rawPaymentData === "string"
        ? JSON.parse(rawPaymentData)
        : [];
  } catch {
    throw new FinanceValidationError(
      "An affected Invoice has invalid payment history and needs Finance review.",
      409,
      "TRANSFER_REPLACEMENT_UNSAFE_PAYMENT_HISTORY"
    );
  }
  let matched = false;
  const updated = parsed.filter(Boolean).flatMap((sourceEntry: any) => {
    const entry = { ...sourceEntry };
    const ids = Array.isArray(entry.onaccountallocationids)
      ? entry.onaccountallocationids.map(Number)
      : [];
    if (!ids.includes(allocationId)) return [entry];
    matched = true;
    entry.onaccountallocationids = ids.filter((id: number) => id !== allocationId);
    entry.paymentamount = money(Math.max(0, Number(entry.paymentamount || 0) - bankPortion));
    entry.tdsamount = money(Math.max(0, Number(entry.tdsamount || 0) - tdsAmount));
    entry.settlementamount = money(Math.max(0, Number(entry.settlementamount ?? entry.amount ?? 0) - totalSettlement));
    entry.amount = entry.settlementamount;
    return entry.onaccountallocationids.length > 0 || entry.settlementamount > 0 ? [entry] : [];
  });
  if (!matched) {
    throw new FinanceValidationError(
      "An affected Invoice no longer contains the linked On Account settlement. No changes were saved.",
      409,
      "TRANSFER_REPLACEMENT_ALLOCATION_LINK_MISSING"
    );
  }
  return updated;
};

export const reverseTransferredCustomerAllocations = async (
  client: QueryClient,
  organizationId: number,
  referenceId: number,
  reversalJournalId: number,
  actor: string,
  idempotencyKey: string
) => {
  const result = await client.query(
    `SELECT a.id AS allocationid, a.onaccountmovementid, a.bankportion,
            a.tdsamount, a.totalsettlement, a.documentid,
            i.paymentdata, i.totalorderamount AS invoiceamount,
            i.id AS invoiceid, i.invoicenumber
       FROM on_account_document_allocations a
       JOIN revoinvoice i ON i.id = a.documentid
       WHERE a.organizationid = $1
         AND a.onaccountreferenceid = $2
         AND a.documenttype = 'sales_invoice'
         AND a.status = 'applied'
       ORDER BY a.id
       FOR UPDATE OF a, i`,
    [organizationId, referenceId]
  );
  const epoch = nowEpoch();
  let restoredAmount = 0;
  const reversedAllocationIds: number[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const allocation = result.rows[index];
    const bankPortion = money(allocation.bankportion);
    const tdsAmount = money(allocation.tdsamount);
    const totalSettlement = money(allocation.totalsettlement);
    const paymentData = removeAllocationFromPaymentData(
      allocation.paymentdata,
      Number(allocation.allocationid),
      bankPortion,
      tdsAmount,
      totalSettlement
    );
    const paidAmount = money(paymentData.reduce((sum, entry) => {
      if (String(entry.status || "success").toLowerCase() === "failed") return sum;
      return sum + Number(entry.settlementamount ?? entry.amount ?? entry.paymentamount ?? 0);
    }, 0));
    const balanceAmount = money(Math.max(Number(allocation.invoiceamount) - paidAmount, 0));
    const paymentStatus = balanceAmount === 0 ? "paid" : paidAmount > 0 ? "partially_paid" : "pending";
    await client.query(
      `UPDATE revoinvoice
       SET paymentdata = $1::jsonb, paidamount = $2, balanceamount = $3,
           paymentstatus = $4, modifieddate = $5
       WHERE id = $6`,
      [JSON.stringify(paymentData), paidAmount, balanceAmount, paymentStatus, epoch, allocation.invoiceid]
    );
    await client.query(
      `UPDATE on_account_document_allocations
       SET status = 'reversed', modifiedby = $1, modifieddate = $2
       WHERE id = $3 AND organizationid = $4`,
      [actor, epoch, allocation.allocationid, organizationId]
    );
    await client.query(
      `INSERT INTO on_account_movements (
         organizationid, onaccountreferenceid, movementtype, direction, amount,
         journalentryid, relatedmovementid, idempotencykey, idempotencysequence,
         description, createdby, createddate
       ) VALUES ($1, $2, 'reversal', 'increase', $3, $4, $5, $6, $7, $8, $9, $10)`,
      [organizationId, referenceId, bankPortion, reversalJournalId,
       allocation.onaccountmovementid, `${idempotencyKey}-allocation`, index + 1,
       `Reversed transferred settlement for Invoice ${allocation.invoicenumber}.`, actor, epoch]
    );
    restoredAmount = money(restoredAmount + bankPortion);
    reversedAllocationIds.push(Number(allocation.allocationid));
  }
  if (restoredAmount > 0) {
    await client.query(
      `UPDATE on_account_references
       SET usedamount = usedamount - $1, availableamount = availableamount + $1,
           status = CASE
             WHEN usedamount - $1 = 0 THEN 'open'
             WHEN availableamount + $1 = 0 THEN 'fully_applied'
             ELSE 'partially_applied' END,
           version = version + 1, modifiedby = $2, modifieddate = $3
       WHERE id = $4 AND organizationid = $5`,
      [restoredAmount, actor, epoch, referenceId, organizationId]
    );
  }
  return { restoredAmount, reversedAllocationIds };
};
