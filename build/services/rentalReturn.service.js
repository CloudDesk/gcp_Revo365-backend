import { updateAgreementAssetLifecycleState } from "./rentalAgreementLifecycle.service.js";
const AVAILABLE_STOCK_STATUS = "Available";
const RETURNED_ORDERLINE_ASSET_STATUS = "returned";
const AVAILABLE_STOCK_ASSET_STATUS = "available";
const RENTAL_CONTRACT_STATUS_COMPLETED = "completed";
const CONTRACT_CLOSE_REASON_RETURNED = "returned";
const CLOSED_TICKET_STATUS = "resolved_closed";
const TICKET_RETURN_ACTION_TYPE = "return";
const HISTORY_RETURN_ACTION_TYPE = "returned";
const RETURNED_ACTION_STATUS = "returned";
const TERMINAL_AGREEMENT_ASSET_STATUSES = new Set([
    "returned",
    "lost",
    "damaged_non_returnable",
]);
const normalizeText = (value) => value == null ? null : String(value).trim();
const normalizeComparableText = (value) => String(value ?? "").trim().toLowerCase();
const resolveAgreementId = (context) => context?.linkedorderline?.agreementid ??
    context?.ticket?.agreementid ??
    null;
const findStockForReturn = async (executor, context, ticketId, assetNumber) => {
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
        OR ($5::text IS NOT NULL AND CAST(orderid AS TEXT) = $5)
        OR ($6::int IS NOT NULL AND agreementid = $6)
      ORDER BY
        CASE
          WHEN $1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1 THEN 0
          WHEN $1::text IS NOT NULL AND CAST(rfid AS TEXT) = $1 THEN 1
          WHEN $1::text IS NOT NULL AND CAST(serialnumber AS TEXT) = $1 THEN 2
          WHEN $2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2 THEN 3
          WHEN $3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3 THEN 4
          WHEN $4::int IS NOT NULL AND lastticketid = $4 THEN 5
          WHEN $5::text IS NOT NULL AND CAST(orderid AS TEXT) = $5 THEN 6
          WHEN $6::int IS NOT NULL AND agreementid = $6 THEN 7
          ELSE 8
        END,
        modifieddate DESC NULLS LAST,
        id DESC
      LIMIT 1
    `, [
        normalizeText(assetNumber),
        normalizeText(context?.linkedorderline?.orderlinenumber),
        normalizeText(context?.ticket?.orderlinenumber),
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
        throw new Error("Unable to find the currently assigned stock record for this rental asset.");
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
export const processRentalReturn = async ({ executor, context, ticketId, oldAssetNumber, returnedAt, remarks = null, createdBy = null, }) => {
    const linkedOrderline = context?.linkedorderline;
    if (!linkedOrderline) {
        throw new Error("Unable to resolve the active rental contract for this ticket.");
    }
    const agreementId = resolveAgreementId(context);
    const customerId = linkedOrderline?.userid ?? context?.ticket?.userid ?? null;
    const normalizedAssetNumber = normalizeText(oldAssetNumber);
    const stockToReturn = context?.currentstock &&
        normalizeComparableText(context.currentstock?.assetnumber) ===
            normalizeComparableText(normalizedAssetNumber)
        ? context.currentstock
        : await findStockForReturn(executor, context, ticketId, normalizedAssetNumber || "");
    ensureStockBelongsToContract(stockToReturn, context, normalizedAssetNumber || "");
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
        HISTORY_RETURN_ACTION_TYPE,
        RETURNED_ACTION_STATUS,
        remarks,
        createdBy,
        JSON.stringify({
            returnedAt,
            contractCloseReason: CONTRACT_CLOSE_REASON_RETURNED,
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
        returneddate = $5,
        returnedticketid = $6,
        lastlifecycleeventid = $7
      WHERE id = $8
      RETURNING *
    `, [
        RENTAL_CONTRACT_STATUS_COMPLETED,
        returnedAt,
        CONTRACT_CLOSE_REASON_RETURNED,
        RETURNED_ORDERLINE_ASSET_STATUS,
        returnedAt,
        ticketId,
        historyRecord?.id ?? null,
        linkedOrderline.id,
    ]);
    const stockUpdateResult = await executor.query(`
      UPDATE stock_revo
      SET
        stockstatus = $1,
        servicestatus = NULL,
        holdreason = NULL,
        holdticketid = NULL,
        orderlinenumber = NULL,
        rentalassetstatus = $2,
        agreementid = NULL,
        lastticketid = $3,
        assetnumber = COALESCE(assetnumber, $4)
      WHERE id = $5
      RETURNING *
    `, [
        AVAILABLE_STOCK_STATUS,
        AVAILABLE_STOCK_ASSET_STATUS,
        ticketId,
        normalizedAssetNumber,
        stockToReturn.id,
    ]);
    const ticketUpdateResult = await executor.query(`
      UPDATE tickets
      SET
        agreementid = COALESCE($1, agreementid),
        rentalactiontype = $2,
        rentalactionstatus = $3,
        rentalactionreason = COALESCE($4, rentalactionreason),
        receivedassetdate = COALESCE($5, receivedassetdate),
        resolvedassetdate = COALESCE($5, resolvedassetdate),
        assetnumber = COALESCE($6, assetnumber),
        ticketstatus = $7,
        closeddate = $8
      WHERE id = $9
      RETURNING *
    `, [
        agreementId,
        TICKET_RETURN_ACTION_TYPE,
        RETURNED_ACTION_STATUS,
        remarks,
        returnedAt,
        normalizedAssetNumber,
        CLOSED_TICKET_STATUS,
        returnedAt,
        ticketId,
    ]);
    const agreementState = agreementId != null
        ? await updateAgreementAssetLifecycleState({
            executor,
            agreementId: Number(agreementId),
            orderlineId: Number(linkedOrderline.id),
            assetNumber: normalizedAssetNumber || "",
            assetStatus: RETURNED_ORDERLINE_ASSET_STATUS,
            actionEpoch: returnedAt,
            ticketId,
            modifiedBy: createdBy ?? null,
            deactivateAsset: true,
        })
        : { agreementAsset: null, agreement: null };
    return {
        history: historyRecord,
        ticket: ticketUpdateResult.rows[0] ?? null,
        orderline: orderlineUpdateResult.rows[0] ?? null,
        stock: stockUpdateResult.rows[0] ?? null,
        agreementAsset: agreementState.agreementAsset,
        agreement: agreementState.agreement,
    };
};
//# sourceMappingURL=rentalReturn.service.js.map