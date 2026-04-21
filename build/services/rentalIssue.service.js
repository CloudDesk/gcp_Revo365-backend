import { updateAgreementAssetLifecycleState } from "./rentalAgreementLifecycle.service.js";
const SERVICE_HOLD_STOCK_STATUS = "Service Hold";
const DAMAGED_NON_RETURNABLE_STOCK_STATUS = "Damaged";
const LOST_STOCK_STATUS = "Lost";
const SERVICE_HOLD_SERVICE_STATUS = "service_hold";
const TICKET_LOST_ACTION_TYPE = "lost";
const TICKET_DAMAGED_ACTION_TYPE = "damaged";
const HISTORY_LOST_ACTION_TYPE = "lost";
const HISTORY_DAMAGED_ACTION_TYPE = "damaged";
const HISTORY_PENALTY_ACTION_TYPE = "penalty_generated";
const LOST_ACTION_STATUS = "lost_confirmed";
const DAMAGED_ACTION_STATUS = "damaged_confirmed";
const PENALTY_ACTION_STATUS = "penalty_generated";
const LOST_ORDERLINE_ASSET_STATUS = "lost";
const DAMAGED_NON_RETURNABLE_ORDERLINE_ASSET_STATUS = "damaged_non_returnable";
const LOST_HOLD_REASON = "lost";
const DAMAGED_NON_RETURNABLE_HOLD_REASON = "damaged_non_returnable";
const CLOSED_TICKET_STATUS = "resolved_closed";
const RENTAL_CONTRACT_STATUS_TERMINATED = "terminated";
const CONTRACT_CLOSE_REASON_LOST = "lost";
const CONTRACT_CLOSE_REASON_DAMAGED_NON_RETURNABLE = "damaged_non_returnable";
const NON_RETURNABLE_DAMAGE_ASSESSMENT = "non_returnable";
const RETURNABLE_DAMAGE_ASSESSMENT = "returnable";
const GENERATED_PENALTY_STATUS = "generated";
const normalizeText = (value) => value == null ? null : String(value).trim();
const normalizeComparableText = (value) => String(value ?? "").trim().toLowerCase();
const buildLifecycleRemarks = (reason, remarks) => {
    const normalizedReason = normalizeText(reason);
    const normalizedRemarks = normalizeText(remarks);
    if (normalizedReason && normalizedRemarks) {
        if (normalizeComparableText(normalizedReason) ===
            normalizeComparableText(normalizedRemarks)) {
            return normalizedReason;
        }
        return `Reason: ${normalizedReason}\nRemarks: ${normalizedRemarks}`;
    }
    return normalizedRemarks || normalizedReason;
};
const resolveAgreementId = (context) => context?.linkedorderline?.agreementid ?? context?.ticket?.agreementid ?? null;
const resolveCustomerId = (context) => context?.linkedorderline?.userid ?? context?.ticket?.userid ?? null;
const findStockForRentalIssue = async (executor, context, ticketId, assetNumber) => {
    const result = await executor.query(`
      SELECT *
      FROM stock_revo
      WHERE
        ($1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1)
        OR ($1::text IS NOT NULL AND CAST(rfid AS TEXT) = $1)
        OR ($1::text IS NOT NULL AND CAST(serialnumber AS TEXT) = $1)
        OR ($2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2)
        OR ($3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3)
        OR ($4::int IS NOT NULL AND lastticketid = $4)
        OR ($5::int IS NOT NULL AND holdticketid = $5)
        OR ($6::text IS NOT NULL AND CAST(orderid AS TEXT) = $6)
        OR ($7::int IS NOT NULL AND agreementid = $7)
      ORDER BY
        CASE
          WHEN $1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1 THEN 0
          WHEN $1::text IS NOT NULL AND CAST(rfid AS TEXT) = $1 THEN 1
          WHEN $1::text IS NOT NULL AND CAST(serialnumber AS TEXT) = $1 THEN 2
          WHEN $2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2 THEN 3
          WHEN $3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3 THEN 4
          WHEN $4::int IS NOT NULL AND lastticketid = $4 THEN 5
          WHEN $5::int IS NOT NULL AND holdticketid = $5 THEN 6
          WHEN $6::text IS NOT NULL AND CAST(orderid AS TEXT) = $6 THEN 7
          WHEN $7::int IS NOT NULL AND agreementid = $7 THEN 8
          ELSE 9
        END,
        modifieddate DESC NULLS LAST,
        id DESC
      LIMIT 1
    `, [
        normalizeText(assetNumber),
        normalizeText(context?.linkedorderline?.orderlinenumber),
        normalizeText(context?.ticket?.orderlinenumber),
        Number.isFinite(Number(ticketId)) ? Number(ticketId) : null,
        Number.isFinite(Number(ticketId)) ? Number(ticketId) : null,
        normalizeText(context?.linkedorderline?.uniqueorderid),
        context?.linkedorderline?.agreementid == null
            ? null
            : Number(context.linkedorderline.agreementid),
    ]);
    return result.rows[0] ?? null;
};
const ensureStockBelongsToContract = (stockRow, context, assetNumber) => {
    if (!stockRow) {
        throw new Error("Unable to find the current stock record linked to this rental asset.");
    }
    const linkedOrderLineNumber = normalizeText(context?.linkedorderline?.orderlinenumber);
    const ticketOrderLineNumber = normalizeText(context?.ticket?.orderlinenumber);
    const resolvedStockOrderLineNumber = normalizeText(stockRow?.orderlinenumber);
    const resolvedStockAssetNumber = normalizeText(stockRow?.assetnumber);
    const resolvedStockRfid = normalizeText(stockRow?.rfid);
    const resolvedStockSerialNumber = normalizeText(stockRow?.serialnumber);
    const matchedIdentifier = [
        resolvedStockAssetNumber,
        resolvedStockRfid,
        resolvedStockSerialNumber,
    ].some((value) => value &&
        assetNumber &&
        normalizeComparableText(value) === normalizeComparableText(assetNumber));
    if (resolvedStockOrderLineNumber &&
        linkedOrderLineNumber &&
        resolvedStockOrderLineNumber !== linkedOrderLineNumber &&
        (!ticketOrderLineNumber || resolvedStockOrderLineNumber !== ticketOrderLineNumber)) {
        throw new Error("The resolved stock record does not belong to the linked rental order line.");
    }
    if (assetNumber &&
        !matchedIdentifier &&
        !resolvedStockOrderLineNumber) {
        throw new Error("The resolved stock record does not match the asset linked to this ticket.");
    }
};
const findLatestRentalInvoiceId = async (executor, uniqueOrderId) => {
    if (!normalizeText(uniqueOrderId)) {
        return null;
    }
    const result = await executor.query(`
      SELECT id
      FROM revoinvoice
      WHERE orderid = $1
        AND invoicefor = 'rental'
      ORDER BY createddate DESC NULLS LAST, id DESC
      LIMIT 1
    `, [normalizeText(uniqueOrderId)]);
    return result.rows[0]?.id ?? null;
};
const ensurePenaltyInvoiceEligibility = (context, requestedPenaltyType) => {
    const linkedAssetStatus = normalizeComparableText(context?.linkedorderline?.rentalassetstatus);
    const ticketActionType = normalizeComparableText(context?.ticket?.rentalactiontype);
    const ticketActionStatus = normalizeComparableText(context?.ticket?.rentalactionstatus);
    const ticketDamageAssessment = normalizeComparableText(context?.ticket?.damageassessment);
    const inferredPenaltyType = ticketActionType === TICKET_LOST_ACTION_TYPE ||
        linkedAssetStatus === LOST_ORDERLINE_ASSET_STATUS ||
        ticketActionStatus === LOST_ACTION_STATUS
        ? LOST_ORDERLINE_ASSET_STATUS
        : ticketActionType === TICKET_DAMAGED_ACTION_TYPE &&
            (ticketDamageAssessment === NON_RETURNABLE_DAMAGE_ASSESSMENT ||
                linkedAssetStatus === DAMAGED_NON_RETURNABLE_ORDERLINE_ASSET_STATUS)
            ? DAMAGED_NON_RETURNABLE_ORDERLINE_ASSET_STATUS
            : null;
    if (!inferredPenaltyType) {
        throw new Error("Penalty invoices are allowed only for lost or non-returnable damaged rental assets.");
    }
    const normalizedRequestedPenaltyType = normalizeComparableText(requestedPenaltyType);
    if (normalizedRequestedPenaltyType &&
        normalizedRequestedPenaltyType !== inferredPenaltyType) {
        throw new Error("Penalty type does not match the current rental asset lifecycle state.");
    }
    return inferredPenaltyType;
};
export const processRentalLost = async ({ executor, context, ticketId, oldAssetNumber, lostAt, reason = null, remarks = null, createdBy = null, }) => {
    const linkedOrderline = context?.linkedorderline;
    if (!linkedOrderline) {
        throw new Error("Unable to resolve the active rental contract for this ticket.");
    }
    const agreementId = resolveAgreementId(context);
    const customerId = resolveCustomerId(context);
    const normalizedAssetNumber = normalizeText(oldAssetNumber);
    const normalizedReason = normalizeText(reason);
    const normalizedRemarks = normalizeText(remarks);
    const historyRemarks = buildLifecycleRemarks(normalizedReason, normalizedRemarks);
    const stockToMarkLost = context?.currentstock &&
        normalizeComparableText(context.currentstock?.assetnumber) ===
            normalizeComparableText(normalizedAssetNumber)
        ? context.currentstock
        : await findStockForRentalIssue(executor, context, ticketId, normalizedAssetNumber || "");
    ensureStockBelongsToContract(stockToMarkLost, context, normalizedAssetNumber || "");
    const historyInsertResult = await executor.query(`
      INSERT INTO rental_replacement_history (
        ticketid,
        ticketnumber,
        sourceorderlineid,
        uniqueorderid,
        agreementid,
        customerid,
        oldassetnumber,
        assetnumber,
        oldproductid,
        actiontype,
        actionstatus,
        remarks,
        createdby,
        metadatajson
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14::jsonb
      )
      RETURNING *
    `, [
        ticketId,
        context?.ticket?.ticketnumber ?? null,
        linkedOrderline.id,
        linkedOrderline.uniqueorderid,
        agreementId,
        customerId,
        normalizedAssetNumber,
        normalizedAssetNumber,
        linkedOrderline.productid ?? null,
        HISTORY_LOST_ACTION_TYPE,
        LOST_ACTION_STATUS,
        historyRemarks,
        createdBy,
        JSON.stringify({
            lostAt,
            reason: normalizedReason,
            remarks: normalizedRemarks,
        }),
    ]);
    const historyRecord = historyInsertResult.rows[0];
    const orderlineUpdateResult = await executor.query(`
      UPDATE orderline
      SET
        rentalcontractstatus = $1,
        contractcloseddate = $2,
        contractclosereason = $3,
        isactivebillingline = FALSE,
        rentalfor = generatedmonthscount,
        rentalassetstatus = $4,
        lostdate = $5,
        lostticketid = $6,
        lastlifecycleeventid = $7
      WHERE id = $8
      RETURNING *
    `, [
        RENTAL_CONTRACT_STATUS_TERMINATED,
        lostAt,
        CONTRACT_CLOSE_REASON_LOST,
        LOST_ORDERLINE_ASSET_STATUS,
        lostAt,
        ticketId,
        historyRecord?.id ?? null,
        linkedOrderline.id,
    ]);
    const stockUpdateResult = await executor.query(`
      UPDATE stock_revo
      SET
        stockstatus = $1,
        servicestatus = NULL,
        holdreason = $2,
        holdticketid = $3,
        rentalassetstatus = $4,
        lastticketid = $5,
        assetnumber = COALESCE(assetnumber, $6),
        agreementid = COALESCE(agreementid, $7),
        orderlinenumber = COALESCE(orderlinenumber, $8),
        lostdate = $9,
        lostreason = COALESCE($10, lostreason),
        nonreturnable = TRUE
      WHERE id = $11
      RETURNING *
    `, [
        LOST_STOCK_STATUS,
        LOST_HOLD_REASON,
        ticketId,
        LOST_ORDERLINE_ASSET_STATUS,
        ticketId,
        normalizedAssetNumber,
        agreementId,
        normalizeText(linkedOrderline.orderlinenumber),
        lostAt,
        normalizedReason || normalizedRemarks,
        stockToMarkLost.id,
    ]);
    const ticketUpdateResult = await executor.query(`
      UPDATE tickets
      SET
        agreementid = COALESCE($1, agreementid),
        linkedorderlineid = COALESCE($2, linkedorderlineid),
        rentalactiontype = $3,
        rentalactionstatus = $4,
        rentalactionreason = COALESCE($5, rentalactionreason),
        assetnumber = COALESCE($6, assetnumber),
        resolvedassetdate = COALESCE($7, resolvedassetdate),
        ticketstatus = $8,
        closeddate = $9
      WHERE id = $10
      RETURNING *
    `, [
        agreementId,
        linkedOrderline.id,
        TICKET_LOST_ACTION_TYPE,
        LOST_ACTION_STATUS,
        normalizedReason || normalizedRemarks,
        normalizedAssetNumber,
        lostAt,
        CLOSED_TICKET_STATUS,
        lostAt,
        ticketId,
    ]);
    const agreementState = await updateAgreementAssetLifecycleState({
        executor,
        agreementId: agreementId == null ? null : Number(agreementId),
        orderlineId: Number(linkedOrderline.id),
        assetNumber: normalizedAssetNumber,
        assetStatus: LOST_ORDERLINE_ASSET_STATUS,
        actionEpoch: lostAt,
        ticketId,
        modifiedBy: createdBy,
        deactivateAsset: true,
    });
    return {
        history: historyRecord,
        ticket: ticketUpdateResult.rows[0] ?? null,
        orderline: orderlineUpdateResult.rows[0] ?? null,
        stock: stockUpdateResult.rows[0] ?? null,
        agreementAsset: agreementState.agreementAsset,
        agreement: agreementState.agreement,
    };
};
export const processRentalDamageAssessment = async ({ executor, context, ticketId, oldAssetNumber, assessment, damagedAt, reason = null, remarks = null, createdBy = null, }) => {
    const linkedOrderline = context?.linkedorderline;
    if (!linkedOrderline) {
        throw new Error("Unable to resolve the active rental contract for this ticket.");
    }
    const normalizedAssessment = normalizeComparableText(assessment);
    if (normalizedAssessment !== RETURNABLE_DAMAGE_ASSESSMENT &&
        normalizedAssessment !== NON_RETURNABLE_DAMAGE_ASSESSMENT) {
        throw new Error("Damage assessment must be returnable or non_returnable.");
    }
    const agreementId = resolveAgreementId(context);
    const customerId = resolveCustomerId(context);
    const normalizedAssetNumber = normalizeText(oldAssetNumber);
    const normalizedReason = normalizeText(reason);
    const normalizedRemarks = normalizeText(remarks);
    const historyRemarks = buildLifecycleRemarks(normalizedReason, normalizedRemarks);
    const stockToAssess = context?.currentstock &&
        normalizeComparableText(context.currentstock?.assetnumber) ===
            normalizeComparableText(normalizedAssetNumber)
        ? context.currentstock
        : await findStockForRentalIssue(executor, context, ticketId, normalizedAssetNumber || "");
    ensureStockBelongsToContract(stockToAssess, context, normalizedAssetNumber || "");
    const historyInsertResult = await executor.query(`
      INSERT INTO rental_replacement_history (
        ticketid,
        ticketnumber,
        sourceorderlineid,
        uniqueorderid,
        agreementid,
        customerid,
        oldassetnumber,
        assetnumber,
        oldproductid,
        actiontype,
        actionstatus,
        remarks,
        createdby,
        metadatajson
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14::jsonb
      )
      RETURNING *
    `, [
        ticketId,
        context?.ticket?.ticketnumber ?? null,
        linkedOrderline.id,
        linkedOrderline.uniqueorderid,
        agreementId,
        customerId,
        normalizedAssetNumber,
        normalizedAssetNumber,
        linkedOrderline.productid ?? null,
        HISTORY_DAMAGED_ACTION_TYPE,
        DAMAGED_ACTION_STATUS,
        historyRemarks,
        createdBy,
        JSON.stringify({
            damagedAt,
            reason: normalizedReason,
            remarks: normalizedRemarks,
            damageassessment: normalizedAssessment,
        }),
    ]);
    const historyRecord = historyInsertResult.rows[0];
    const isNonReturnable = normalizedAssessment === NON_RETURNABLE_DAMAGE_ASSESSMENT;
    const orderlineUpdateResult = isNonReturnable
        ? await executor.query(`
      UPDATE orderline
      SET
        rentalcontractstatus = $1,
        contractcloseddate = $2,
        contractclosereason = $3,
        isactivebillingline = FALSE,
        rentalfor = generatedmonthscount,
        rentalassetstatus = $4,
        lastlifecycleeventid = $5
      WHERE id = $6
      RETURNING *
    `, [
            RENTAL_CONTRACT_STATUS_TERMINATED,
            damagedAt,
            CONTRACT_CLOSE_REASON_DAMAGED_NON_RETURNABLE,
            DAMAGED_NON_RETURNABLE_ORDERLINE_ASSET_STATUS,
            historyRecord?.id ?? null,
            linkedOrderline.id,
        ])
        : {
            rows: [linkedOrderline],
        };
    const stockUpdateResult = await executor.query(`
      UPDATE stock_revo
      SET
        stockstatus = CASE
          WHEN $1::boolean THEN $2
          ELSE $12
        END,
        servicestatus = CASE
          WHEN $1::boolean THEN NULL
          ELSE $13
        END,
        holdreason = CASE
          WHEN $1::boolean THEN $3
          ELSE $14
        END,
        holdticketid = $4,
        rentalassetstatus = CASE
          WHEN $1::boolean THEN $5
          ELSE rentalassetstatus
        END,
        lastticketid = $4,
        assetnumber = COALESCE(assetnumber, $6),
        agreementid = COALESCE(agreementid, $7),
        orderlinenumber = COALESCE(orderlinenumber, $8),
        damageassessment = $9,
        damageddate = $10,
        nonreturnable = CASE
          WHEN $1::boolean THEN TRUE
          ELSE COALESCE(nonreturnable, FALSE)
        END
      WHERE id = $11
      RETURNING *
    `, [
        isNonReturnable, // $1
        DAMAGED_NON_RETURNABLE_STOCK_STATUS, // $2  non-returnable: 'Damaged'
        DAMAGED_NON_RETURNABLE_HOLD_REASON, // $3  non-returnable: 'damaged_non_returnable'
        ticketId, // $4  holdticketid (always set)
        DAMAGED_NON_RETURNABLE_ORDERLINE_ASSET_STATUS, // $5  non-returnable: 'damaged_non_returnable'
        normalizedAssetNumber, // $6
        agreementId, // $7
        normalizeText(linkedOrderline.orderlinenumber), // $8
        normalizedAssessment, // $9
        damagedAt, // $10
        stockToAssess.id, // $11
        SERVICE_HOLD_STOCK_STATUS, // $12 returnable: 'Service Hold'
        SERVICE_HOLD_SERVICE_STATUS, // $13 returnable: 'service_hold'
        "damaged_returnable", // $14 returnable: hold reason
    ]);
    const ticketUpdateResult = await executor.query(`
      UPDATE tickets
      SET
        agreementid = COALESCE($1, agreementid),
        linkedorderlineid = COALESCE($2, linkedorderlineid),
        rentalactiontype = $3,
        rentalactionstatus = $4,
        rentalactionreason = COALESCE($5, rentalactionreason),
        assetnumber = COALESCE($6, assetnumber),
        damageassessment = $7,
        resolvedassetdate = COALESCE($8, resolvedassetdate),
        ticketstatus = $9,
        closeddate = $10
      WHERE id = $11
      RETURNING *
    `, [
        agreementId,
        linkedOrderline.id,
        TICKET_DAMAGED_ACTION_TYPE,
        DAMAGED_ACTION_STATUS,
        normalizedReason || normalizedRemarks,
        normalizedAssetNumber,
        normalizedAssessment,
        damagedAt,
        CLOSED_TICKET_STATUS,
        damagedAt,
        ticketId,
    ]);
    const agreementState = isNonReturnable
        ? await updateAgreementAssetLifecycleState({
            executor,
            agreementId: agreementId == null ? null : Number(agreementId),
            orderlineId: Number(linkedOrderline.id),
            assetNumber: normalizedAssetNumber,
            assetStatus: DAMAGED_NON_RETURNABLE_ORDERLINE_ASSET_STATUS,
            actionEpoch: damagedAt,
            ticketId,
            modifiedBy: createdBy,
            deactivateAsset: true,
        })
        : {
            agreementAsset: null,
            agreement: null,
        };
    return {
        history: historyRecord,
        ticket: ticketUpdateResult.rows[0] ?? null,
        orderline: orderlineUpdateResult.rows[0] ?? null,
        stock: stockUpdateResult.rows[0] ?? null,
        agreementAsset: agreementState.agreementAsset,
        agreement: agreementState.agreement,
    };
};
export const linkRentalPenaltyInvoice = async ({ executor, context, ticketId, penaltyInvoiceId, penaltyAmount, remarks = null, createdBy = null, penaltyType = null, }) => {
    const linkedOrderline = context?.linkedorderline;
    if (!linkedOrderline) {
        throw new Error("Unable to resolve the active rental contract for this ticket.");
    }
    if (context?.ticket?.penaltyinvoiceid) {
        throw new Error("A penalty invoice is already linked to this rental ticket.");
    }
    const normalizedPenaltyType = ensurePenaltyInvoiceEligibility(context, penaltyType);
    const penaltyInvoiceResult = await executor.query(`
      SELECT *
      FROM revoinvoice
      WHERE id = $1
      LIMIT 1
    `, [penaltyInvoiceId]);
    const penaltyInvoiceRecord = penaltyInvoiceResult.rows[0] ?? null;
    if (!penaltyInvoiceRecord) {
        throw new Error("Penalty invoice record was not found.");
    }
    if (normalizeComparableText(penaltyInvoiceRecord.invoicefor) !== "penalty") {
        throw new Error("The selected invoice is not a penalty invoice.");
    }
    const existingPenaltyLinkResult = await executor.query(`
      SELECT id
      FROM rental_penalty_invoice_link
      WHERE ticketid = $1
         OR penaltyinvoiceid = $2
      LIMIT 1
    `, [ticketId, penaltyInvoiceId]);
    if (existingPenaltyLinkResult.rowCount > 0) {
        throw new Error("This penalty invoice is already linked to a rental lifecycle record.");
    }
    const agreementId = resolveAgreementId(context);
    const sourceInvoiceId = await findLatestRentalInvoiceId(executor, normalizeText(linkedOrderline.uniqueorderid));
    const penaltyLinkInsertResult = await executor.query(`
      INSERT INTO rental_penalty_invoice_link (
        ticketid,
        agreementid,
        orderlineid,
        assetnumber,
        penaltytype,
        sourceinvoiceid,
        penaltyinvoiceid,
        penaltyamount,
        penaltystatus,
        remarks,
        createdby
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11
      )
      RETURNING *
    `, [
        ticketId,
        agreementId,
        linkedOrderline.id,
        normalizeText(linkedOrderline.assetnumber ?? context?.ticket?.assetnumber),
        normalizedPenaltyType,
        sourceInvoiceId,
        penaltyInvoiceId,
        penaltyAmount,
        GENERATED_PENALTY_STATUS,
        normalizeText(remarks),
        createdBy,
    ]);
    const historyInsertResult = await executor.query(`
      INSERT INTO rental_replacement_history (
        ticketid,
        ticketnumber,
        sourceorderlineid,
        uniqueorderid,
        agreementid,
        customerid,
        assetnumber,
        oldproductid,
        actiontype,
        actionstatus,
        penaltyinvoiceid,
        remarks,
        createdby,
        metadatajson
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14::jsonb
      )
      RETURNING *
    `, [
        ticketId,
        context?.ticket?.ticketnumber ?? null,
        linkedOrderline.id,
        linkedOrderline.uniqueorderid,
        agreementId,
        resolveCustomerId(context),
        normalizeText(linkedOrderline.assetnumber ?? context?.ticket?.assetnumber),
        linkedOrderline.productid ?? null,
        HISTORY_PENALTY_ACTION_TYPE,
        PENALTY_ACTION_STATUS,
        penaltyInvoiceId,
        normalizeText(remarks),
        createdBy,
        JSON.stringify({
            penaltytype: normalizedPenaltyType,
            penaltyamount: penaltyAmount,
            sourceinvoiceid: sourceInvoiceId,
        }),
    ]);
    const historyRecord = historyInsertResult.rows[0] ?? null;
    const ticketUpdateResult = await executor.query(`
      UPDATE tickets
      SET penaltyinvoiceid = $1
      WHERE id = $2
      RETURNING *
    `, [penaltyInvoiceId, ticketId]);
    await executor.query(`
      UPDATE orderline
      SET lastlifecycleeventid = $1
      WHERE id = $2
    `, [historyRecord?.id ?? null, linkedOrderline.id]);
    return {
        penaltylink: penaltyLinkInsertResult.rows[0] ?? null,
        penaltyinvoice: penaltyInvoiceRecord,
        history: historyRecord,
        ticket: ticketUpdateResult.rows[0] ?? null,
    };
};
//# sourceMappingURL=rentalIssue.service.js.map