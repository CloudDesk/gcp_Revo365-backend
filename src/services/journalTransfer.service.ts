import pool from "../database/postgres.js";
import { FinanceValidationError, nowEpoch, requireIsoDate, resolveFinanceContext, toFinanceDateOnly } from "../utils/finance/finance.utils.js";
import { lockAndValidateSourceReference, createDestinationTransferReference, executeTransferOutbound, executeTransferInbound } from "./onAccountTransfer.service.js";
import { formatJournalNumber } from "../utils/finance/journal.utils.js";

/**
 * Orchestrates a Customer-to-Customer on-account transfer atomically.
 */
export const executeCustomerTransferOrchestration = async (request: any) => {
  const { organizationId, actor } = resolveFinanceContext(request);
  const payload = request.body;
  const sourceCustomerId = Number(payload.sourcecustomerid);
  const sourceReferenceId = Number(payload.sourcereferenceid);
  const destCustomerId = Number(payload.destinationcustomerid);
  const amount = Number(payload.amount);
  const entrydate = requireIsoDate(payload.entrydate, "entrydate");
  const description = String(payload.description || "").trim();
  const idempotencyKey = String(payload.idempotencykey || "").trim();

  if (sourceCustomerId === destCustomerId) {
    throw new FinanceValidationError("Cannot transfer to the same customer.");
  }
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // 1. Lock and validate source reference
    const sourceRef = await lockAndValidateSourceReference(
      client, 
      organizationId, 
      sourceReferenceId, 
      sourceCustomerId, 
      'INR', // Assuming INR for now, could be passed or fetched from reference
      amount
    );
    
    const currencyCode = sourceRef.currencycode;

    // 2. Fetch the 'customer_advance' control account
    const controlAccountResult = await client.query(
      `SELECT id FROM finance_accounts 
       WHERE organizationid = $1 AND accountsubtype = 'customer_advance' AND issystem = TRUE 
       LIMIT 1`,
      [organizationId]
    );
    if (!controlAccountResult.rows[0]) {
      throw new FinanceValidationError("System control account for Customer Advances not found.");
    }
    const customerAdvanceAccountId = Number(controlAccountResult.rows[0].id);

    // 3. Insert the Journal Entry
    const epoch = nowEpoch();
    const journalResult = await client.query(
      `INSERT INTO journal_entries (
         organizationid, entrydate, sourcetype, status, description, 
         journalpurpose, createdby, createddate, modifiedby, modifieddate, version
       ) VALUES ($1, $2, 'on_account_transfer', 'posted', $3, 'reclassification', $4, $5, $4, $5, 1)
       RETURNING id`,
      [organizationId, entrydate, description, actor, epoch]
    );
    const journalId = Number(journalResult.rows[0].id);
    const journalNumber = formatJournalNumber(journalId);
    await client.query(`UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`, [journalNumber, journalId]);

    // 4. Insert balanced Journal Lines (Net effect 0 on GL)
    await client.query(
      `INSERT INTO journal_lines (journalentryid, financeaccountid, partytype, partyid, debitamount, creditamount, description, lineorder)
       VALUES 
       ($1, $2, 'customer', $3, $4, 0, $5, 1),
       ($1, $2, 'customer', $6, 0, $4, $5, 2)`,
      [journalId, customerAdvanceAccountId, sourceCustomerId, amount, description, destCustomerId]
    );

    // 5. Execute On-Account Transfers
    const outboundResult = await executeTransferOutbound(
      client, organizationId, actor, sourceReferenceId, amount, journalId, idempotencyKey, description
    );
    
    const destReferenceId = await createDestinationTransferReference(
      client, organizationId, actor, destCustomerId, currencyCode, amount, sourceReferenceId, journalId
    );

    const inboundMovementId = await executeTransferInbound(
      client, organizationId, actor, destReferenceId, amount, journalId, outboundResult.sourceMovementId, idempotencyKey, description
    );

    // 6. Record Audit Event
    await client.query(
      `INSERT INTO finance_audit_events (organizationid, entitytype, entityid, action, actor, eventdata)
       VALUES ($1, 'journal_entry', $2, 'transfer_posted', $3, $4::jsonb)`,
      [
        organizationId, journalId, actor, 
        JSON.stringify({
          sourceReferenceId, destReferenceId, amount, destCustomerId,
          outboundMovementId: outboundResult.sourceMovementId, inboundMovementId
        })
      ]
    );

    await client.query("COMMIT");
    return {
      journalId,
      journalNumber,
      sourceReferenceId,
      destinationReferenceId: destReferenceId
    };
  } catch (err: any) {
    await client.query("ROLLBACK");
    // Standardize error propagation
    if (err instanceof FinanceValidationError || err.code === '23505') {
      throw err;
    }
    throw new FinanceValidationError("Transfer failed: " + err.message, 500, "TRANSFER_FAILED");
  } finally {
    client.release();
  }
};

/**
 * Replaces a customer transfer with a later bank-origin reference,
 * safely unwinding only the affected invoice allocations.
 */
export const replaceCustomerOnAccountTransfer = async (request: any) => {
  const { organizationId, actor } = resolveFinanceContext(request);
  const journalId = Number(request.params?.journalId);
  const payload = request.body;
  const version = Number(payload.version);
  const replacementReferenceId = Number(payload.replacementreferenceid);
  const reason = String(payload.reason || "").trim() || "Replacement of transfer";
  
  if (!journalId || !version || !replacementReferenceId) {
    throw new FinanceValidationError("Missing required parameters.");
  }
  
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // 1. Lock and Verify Journal
    const journalResult = await client.query(
      `SELECT * FROM journal_entries WHERE id = $1 AND organizationid = $2 FOR UPDATE`,
      [journalId, organizationId]
    );
    const journal = journalResult.rows[0];
    if (!journal) throw new FinanceValidationError("Journal not found.");
    if (journal.sourcetype !== 'on_account_transfer' || journal.status !== 'posted') {
      throw new FinanceValidationError("Only a posted transfer Journal can be replaced.");
    }
    if (Number(journal.version) !== version) {
      throw new FinanceValidationError("The Journal changed after you opened it. Refresh and try again.");
    }
    const existingReversal = await client.query(`SELECT id FROM journal_entries WHERE reversalofid = $1 LIMIT 1`, [journalId]);
    if (existingReversal.rows.length > 0) {
      throw new FinanceValidationError("This Journal has already been reversed.");
    }

    // 2. Locate References
    const destRefResult = await client.query(
      `SELECT * FROM on_account_references WHERE sourcejournalentryid = $1 AND sourcetype = 'on_account_transfer' FOR UPDATE`,
      [journalId]
    );
    const destRef = destRefResult.rows[0];
    if (!destRef) throw new FinanceValidationError("Destination reference not found.");
    const sourceReferenceId = Number(destRef.transferredfromreferenceid);
    const destReferenceId = Number(destRef.id);
    const transferAmount = Number(destRef.originalamount);

    const sourceRefResult = await client.query(
      `SELECT * FROM on_account_references WHERE id = $1 FOR UPDATE`,
      [sourceReferenceId]
    );
    const sourceRef = sourceRefResult.rows[0];
    if (!sourceRef) throw new FinanceValidationError("Source reference not found.");

    // 3. Verify Replacement Reference
    const replacementRefResult = await client.query(
      `SELECT * FROM on_account_references WHERE id = $1 FOR UPDATE`,
      [replacementReferenceId]
    );
    const replacementRef = replacementRefResult.rows[0];
    if (!replacementRef) throw new FinanceValidationError("Replacement reference not found.");
    if (replacementRef.partytype !== 'customer' || Number(replacementRef.partyid) !== Number(destRef.partyid)) {
      throw new FinanceValidationError("Replacement reference must belong to the destination customer.");
    }
    if (['on_account_transfer', 'on_account_transfer_reversal'].includes(replacementRef.sourcetype)) {
      throw new FinanceValidationError("Replacement reference cannot be another transfer.");
    }
    if (Number(replacementRef.availableamount) < transferAmount) {
      throw new FinanceValidationError(`Replacement reference does not have enough available balance to cover ${transferAmount}.`);
    }
    if (['reversed'].includes(replacementRef.status)) {
      throw new FinanceValidationError("Replacement reference is reversed.");
    }

    // 4. Reverse Allocations
    const allocations = await client.query(`
      SELECT a.id as allocationid, a.bankportion, a.tdsamount, a.totalsettlement, a.documentid,
             i.paymentdata, i.invoiceamount, i.id as revoinvoiceid, i.invoicenumber
      FROM on_account_document_allocations a
      JOIN revoinvoice i ON i.id = a.documentid
      WHERE a.onaccountreferenceid = $1 AND a.status = 'applied'
      FOR UPDATE
    `, [destReferenceId]);
    
    const epoch = nowEpoch();

    for (const alloc of allocations.rows) {
      const paymentdata = (Array.isArray(alloc.paymentdata) ? alloc.paymentdata : (typeof alloc.paymentdata === 'string' ? JSON.parse(alloc.paymentdata) : [])).filter(Boolean);
      
      let updatedPaymentData = [];
      for (const entry of paymentdata) {
        if (entry.onaccountallocationids && entry.onaccountallocationids.includes(alloc.allocationid)) {
          // Found the entry. Deduct the allocation's amounts.
          entry.paymentamount = Number(entry.paymentamount || 0) - Number(alloc.bankportion);
          entry.tdsamount = Number(entry.tdsamount || 0) - Number(alloc.tdsamount);
          entry.amount = Number(entry.amount || 0) - Number(alloc.totalsettlement);
          entry.onaccountallocationids = entry.onaccountallocationids.filter((id: number) => id !== alloc.allocationid);
          
          if (entry.onaccountallocationids.length > 0) {
            updatedPaymentData.push(entry);
          }
        } else {
          updatedPaymentData.push(entry);
        }
      }
      
      // Calculate new paidamount
      let newPaidAmount = 0;
      for (const entry of updatedPaymentData) {
         if (String(entry.status || "success").toLowerCase() !== "failed") {
            newPaidAmount += Number(entry.settlementamount ?? entry.paymentamount ?? entry.amount ?? 0);
         }
      }
      const newBalanceAmount = Math.max(Number(alloc.invoiceamount) - newPaidAmount, 0);
      const newPaymentStatus = newBalanceAmount === 0 ? "paid" : newPaidAmount > 0 ? "partially_paid" : "pending";
      
      await client.query(`
        UPDATE revoinvoice 
        SET paymentdata = $1::jsonb, paidamount = $2, balanceamount = $3, paymentstatus = $4, modifieddate = $5
        WHERE id = $6
      `, [JSON.stringify(updatedPaymentData), newPaidAmount, newBalanceAmount, newPaymentStatus, epoch, alloc.revoinvoiceid]);
      
      await client.query(`
        UPDATE on_account_document_allocations
        SET status = 'reversed', modifiedby = $1, modifieddate = $2
        WHERE id = $3
      `, [actor, epoch, alloc.allocationid]);
    }

    // 5. Opposite Journal Entry
    const reversalResult = await client.query(
      `INSERT INTO journal_entries (
         organizationid, entrydate, sourcetype, status, description, 
         journalpurpose, reversalofid, createdby, createddate, modifiedby, modifieddate, version
       ) VALUES ($1, $2, 'on_account_transfer_reversal', 'posted', $3, 'reclassification', $4, $5, $6, $5, $6, 1)
       RETURNING id`,
      [organizationId, toFinanceDateOnly(epoch), `Reversal of \${journal.journalnumber}: \${reason}`, journalId, actor, epoch]
    );
    const reversalId = Number(reversalResult.rows[0].id);
    const reversalNumber = formatJournalNumber(reversalId);
    await client.query(`UPDATE journal_entries SET journalnumber = $1 WHERE id = $2`, [reversalNumber, reversalId]);

    // Reverse lines (swap debit and credit)
    const linesResult = await client.query(`SELECT * FROM journal_lines WHERE journalentryid = $1`, [journalId]);
    for (const line of linesResult.rows) {
       await client.query(
          `INSERT INTO journal_lines (journalentryid, financeaccountid, partytype, partyid, debitamount, creditamount, description, lineorder)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [reversalId, line.financeaccountid, line.partytype, line.partyid, line.creditamount, line.debitamount, line.description, line.lineorder]
       );
    }

    // 6. Restore Source Reference and mark Dest Reference as reversed
    await client.query(
      `UPDATE on_account_references
       SET usedamount = usedamount - $1, availableamount = availableamount + $1, status = CASE WHEN availableamount + $1 = originalamount THEN 'open' ELSE 'partially_applied' END, version = version + 1, modifiedby = $2, modifieddate = $3
       WHERE id = $4`,
      [transferAmount, actor, epoch, sourceReferenceId]
    );
    
    await client.query(
      `UPDATE on_account_references
       SET status = 'reversed', replacementreferenceid = $1, reversaljournalentryid = $2, version = version + 1, modifiedby = $3, modifieddate = $4
       WHERE id = $5`,
      [replacementReferenceId, reversalId, actor, epoch, destReferenceId]
    );

    // Create opposite movements
    await client.query(
      `INSERT INTO on_account_movements (
         organizationid, onaccountreferenceid, movementtype, direction,
         amount, journalentryid, description, createdby, createddate
       ) VALUES ($1, $2, 'journal_transfer_reversal', 'increase', $3, $4, $5, $6, $7)`,
      [organizationId, sourceReferenceId, transferAmount, reversalId, `Transfer Reversal`, actor, epoch]
    );
    
    // Original journal update
    await client.query(`UPDATE journal_entries SET version = version + 1, modifiedby = $1, modifieddate = $2 WHERE id = $3`, [actor, epoch, journalId]);

    // 7. Audit Events
    await client.query(
      `INSERT INTO finance_audit_events (organizationid, entitytype, entityid, action, actor, eventdata)
       VALUES ($1, 'journal_entry', $2, 'reversal_posted', $3, $4::jsonb),
              ($1, 'journal_entry', $5, 'reversed', $3, $6::jsonb),
              ($1, 'on_account_reference', $7, 'replaced_with_payment', $3, $8::jsonb)`,
      [
        organizationId, reversalId, actor, JSON.stringify({ originaljournalid: journalId, reason }),
        journalId, JSON.stringify({ reversaljournalid: reversalId, reason }),
        destReferenceId, JSON.stringify({ replacementReferenceId, reason })
      ]
    );

    await client.query("COMMIT");
    return { success: true, reversaljournalid: reversalId };
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err instanceof FinanceValidationError) throw err;
    throw new FinanceValidationError("Replacement failed: " + err.message, 500, "REPLACEMENT_FAILED");
  } finally {
    client.release();
  }
};

