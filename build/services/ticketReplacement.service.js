import pool, { query } from "../database/postgres.js";
const REPAIR_RENTAL_TICKET_TYPE = "repair rental";
const INITIATED_REPLACEMENT_STATUS = "replacement_requested";
const OLD_ASSET_RECEIVED_STATUS = "old_asset_received";
const ASSIGNED_REPLACEMENT_STATUS = "replacement_assigned";
const SERVICE_HOLD_STOCK_STATUS = "Service Hold";
const SERVICE_HOLD_SERVICE_STATUS = "service_hold";
const RENTAL_SOLD_STOCK_STATUS = "Rental Sold";
const HOLD_REASON = "rental_replacement";
const ALLOWED_REPLACEMENT_TYPES = new Set([
    "technical_replacement",
    "commercial_replacement",
]);
const FINAL_REPLACEMENT_STATUSES = new Set([
    "replacement_completed",
    "replacement_rejected",
]);
const normalizeText = (value) => value == null ? null : String(value).trim();
const normalizeComparableText = (value) => String(value ?? "").trim().toLowerCase();
const toPositiveInteger = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("A valid numeric id is required.");
    }
    return Math.trunc(parsed);
};
const buildReplacementContext = async (ticketId) => {
    const ticketResult = await query(`
      SELECT
        t.*,
        ol.id AS resolved_orderlineid,
        ol.uniqueorderid AS resolved_uniqueorderid,
        ol.orderlinenumber AS resolved_orderlinenumber,
        ol.productid AS resolved_productid,
        ol.productname AS resolved_productname,
        ol.orderstatus AS resolved_orderstatus,
        ol.assetnumber AS resolved_assetnumber,
        ol.rentalfor AS resolved_rentalfor,
        ol.generatedmonthscount AS resolved_generatedmonthscount,
        ol.invoicegenerated AS resolved_invoicegenerated,
        ol.lastgeneratedinvoicedate AS resolved_lastgeneratedinvoicedate,
        ol.rentstartdate AS resolved_rentstartdate,
        ol.rentenddate AS resolved_rentenddate,
        ol.rentalcontractstatus AS resolved_rentalcontractstatus,
        ol.isactivebillingline AS resolved_isactivebillingline,
        ol.parentorderlineid AS resolved_parentorderlineid,
        ol.productamount AS resolved_productamount,
        ol.orderamount AS resolved_orderamount,
        ol.userid AS resolved_userid,
        ol.modifieddate AS resolved_orderline_modifieddate
      FROM tickets t
      LEFT JOIN LATERAL (
        SELECT *
        FROM orderline ol
        WHERE
          (t.linkedorderlineid IS NOT NULL AND ol.id = t.linkedorderlineid)
          OR (
            t.linkedorderlineid IS NULL
            AND t.assetnumber IS NOT NULL
            AND CAST(ol.assetnumber AS TEXT) = CAST(t.assetnumber AS TEXT)
          )
        ORDER BY
          COALESCE(ol.isactivebillingline, TRUE) DESC,
          CASE WHEN ol.orderstatus = 'ordered' THEN 0 ELSE 1 END,
          ol.modifieddate DESC NULLS LAST,
          ol.id DESC
        LIMIT 1
      ) ol ON TRUE
      WHERE t.id = $1
      LIMIT 1
    `, [ticketId]);
    if (ticketResult.rowCount === 0) {
        throw new Error("Ticket not found.");
    }
    const ticketRow = ticketResult.rows[0];
    const normalizedTicketType = normalizeComparableText(ticketRow.tickettype);
    if (normalizedTicketType !== REPAIR_RENTAL_TICKET_TYPE) {
        throw new Error("Rental replacement flow is available only for Repair Rental tickets.");
    }
    if (!ticketRow.replacementrequest) {
        throw new Error("Rental replacement flow is available only when replacementrequest is true.");
    }
    const linkedOrderline = ticketRow.resolved_orderlineid == null
        ? null
        : {
            id: ticketRow.resolved_orderlineid,
            uniqueorderid: ticketRow.resolved_uniqueorderid,
            orderlinenumber: ticketRow.resolved_orderlinenumber,
            productid: ticketRow.resolved_productid,
            productname: ticketRow.resolved_productname,
            orderstatus: ticketRow.resolved_orderstatus,
            assetnumber: ticketRow.resolved_assetnumber,
            rentalfor: Number(ticketRow.resolved_rentalfor ?? 0),
            generatedmonthscount: Number(ticketRow.resolved_generatedmonthscount ?? 0),
            invoicegenerated: ticketRow.resolved_invoicegenerated,
            lastgeneratedinvoicedate: ticketRow.resolved_lastgeneratedinvoicedate,
            rentstartdate: ticketRow.resolved_rentstartdate,
            rentenddate: ticketRow.resolved_rentenddate,
            rentalcontractstatus: ticketRow.resolved_rentalcontractstatus,
            isactivebillingline: ticketRow.resolved_isactivebillingline,
            parentorderlineid: ticketRow.resolved_parentorderlineid,
            productamount: ticketRow.resolved_productamount,
            orderamount: ticketRow.resolved_orderamount,
            userid: ticketRow.resolved_userid,
            modifieddate: ticketRow.resolved_orderline_modifieddate,
        };
    const monthsalreadybilled = Number(linkedOrderline?.generatedmonthscount ?? 0);
    const remainingmonths = Math.max(Number(linkedOrderline?.rentalfor ?? 0) - monthsalreadybilled, 0);
    const stockResult = await query(`
      SELECT
        id,
        serialnumber,
        rfid,
        assetnumber,
        orderlinenumber,
        stockstatus,
        servicestatus,
        holdreason,
        holdticketid,
        location,
        modifieddate
      FROM stock_revo
      WHERE
        ($1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1)
        OR ($2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2)
      ORDER BY
        CASE
          WHEN $1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1 THEN 0
          ELSE 1
        END,
        modifieddate DESC NULLS LAST,
        id DESC
      LIMIT 1
    `, [
        normalizeText(linkedOrderline?.assetnumber ?? ticketRow.assetnumber),
        normalizeText(linkedOrderline?.orderlinenumber),
    ]);
    const historyResult = await query(`
      SELECT *
      FROM rental_replacement_history
      WHERE ticketid = $1
      ORDER BY createddate DESC NULLS LAST, id DESC
    `, [ticketId]);
    return {
        ticket: ticketRow,
        resolutionstatus: linkedOrderline ? "resolved" : "unresolved",
        linkagesource: ticketRow.linkedorderlineid
            ? "linkedorderlineid"
            : ticketRow.assetnumber
                ? "assetnumber"
                : null,
        linkedorderline: linkedOrderline,
        currentstock: stockResult.rows[0] ?? null,
        monthsalreadybilled,
        remainingmonths,
        replacementhistory: historyResult.rows,
    };
};
const getActiveReplacementRecord = async (executor, context, ticketId) => {
    const activeReplacementId = context.ticket.activereplacementid;
    let result;
    if (activeReplacementId) {
        result = await executor.query(`SELECT * FROM rental_replacement_history WHERE id = $1 LIMIT 1`, [activeReplacementId]);
    }
    else {
        result = await executor.query(`
        SELECT *
        FROM rental_replacement_history
        WHERE ticketid = $1
        ORDER BY createddate DESC NULLS LAST, id DESC
        LIMIT 1
      `, [ticketId]);
    }
    return result.rows[0] ?? null;
};
const getReplacementCandidateStock = async (assetOrRfid) => {
    const result = await query(`
      SELECT
        s.*,
        p.id AS resolved_productid,
        p.productname AS resolved_productname
      FROM stock_revo s
      LEFT JOIN product_revo p ON p.puc = s.puc
      WHERE
        CAST(s.assetnumber AS TEXT) = $1
        OR CAST(s.rfid AS TEXT) = $1
      ORDER BY
        CASE WHEN CAST(s.assetnumber AS TEXT) = $1 THEN 0 ELSE 1 END,
        s.modifieddate DESC NULLS LAST,
        s.id DESC
      LIMIT 1
    `, [assetOrRfid]);
    return result.rows[0] ?? null;
};
export var ticketReplacementService;
(function (ticketReplacementService) {
    ticketReplacementService.getRentalReplacementContext = async (request) => {
        try {
            const ticketId = toPositiveInteger(request.params.id);
            return await buildReplacementContext(ticketId);
        }
        catch (error) {
            console.error("Query Execution Error: IN getRentalReplacementContext", error);
            throw error;
        }
    };
    ticketReplacementService.getRentalReplacementHistory = async (request) => {
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const context = await buildReplacementContext(ticketId);
            return context.replacementhistory;
        }
        catch (error) {
            console.error("Query Execution Error: IN getRentalReplacementHistory", error);
            throw error;
        }
    };
    ticketReplacementService.initiateRentalReplacement = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const replacementtype = normalizeComparableText(request.body?.replacementtype);
            const remarks = normalizeText(request.body?.remarks);
            if (!ALLOWED_REPLACEMENT_TYPES.has(replacementtype)) {
                throw new Error("Replacement type must be technical_replacement or commercial_replacement.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            const latestReplacement = await getActiveReplacementRecord(client, context, ticketId);
            if (latestReplacement &&
                !FINAL_REPLACEMENT_STATUSES.has(normalizeComparableText(latestReplacement.replacementstatus))) {
                throw new Error("An active replacement flow already exists for this ticket.");
            }
            await client.query("BEGIN");
            transactionStarted = true;
            const historyInsertResult = await client.query(`
          INSERT INTO rental_replacement_history (
            ticketid,
            ticketnumber,
            sourceorderlineid,
            uniqueorderid,
            replacementtype,
            replacementstatus,
            oldassetnumber,
            oldproductid,
            monthsalreadybilled,
            remainingmonths,
            revisedremainingmonths,
            remarks,
            createdby
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12, $13
          )
          RETURNING *
        `, [
                ticketId,
                context.ticket.ticketnumber,
                context.linkedorderline.id,
                context.linkedorderline.uniqueorderid,
                replacementtype,
                INITIATED_REPLACEMENT_STATUS,
                normalizeText(context.linkedorderline.assetnumber ?? context.ticket.assetnumber),
                context.linkedorderline.productid,
                context.monthsalreadybilled,
                context.remainingmonths,
                context.remainingmonths,
                remarks,
                request.session?.id ?? null,
            ]);
            const activeReplacementId = historyInsertResult.rows[0].id;
            const ticketUpdateResult = await client.query(`
          UPDATE tickets
          SET
            linkedorderlineid = $1,
            replacementtype = $2,
            replacementstatus = $3,
            activereplacementid = $4,
            rejectionaction = NULL,
            stoprental = FALSE
          WHERE id = $5
          RETURNING *
        `, [
                context.linkedorderline.id,
                replacementtype,
                INITIATED_REPLACEMENT_STATUS,
                activeReplacementId,
                ticketId,
            ]);
            await client.query("COMMIT");
            transactionStarted = false;
            return {
                message: "Rental replacement initiated successfully.",
                ticket: ticketUpdateResult.rows[0],
                replacement: historyInsertResult.rows[0],
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN initiateRentalReplacement", error);
            throw new Error(error?.message || "Failed to initiate rental replacement.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.receiveOldAsset = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const oldassetnumber = normalizeText(request.body?.oldassetnumber);
            const remarks = normalizeText(request.body?.remarks);
            if (!oldassetnumber) {
                throw new Error("Old asset number is required.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            const activeReplacement = await getActiveReplacementRecord(client, context, ticketId);
            if (!activeReplacement) {
                throw new Error("Initiate rental replacement before receiving the old asset.");
            }
            const replacementStatus = normalizeComparableText(activeReplacement.replacementstatus);
            if (FINAL_REPLACEMENT_STATUSES.has(replacementStatus)) {
                throw new Error("This replacement flow is already closed and cannot receive the old asset.");
            }
            if (replacementStatus === OLD_ASSET_RECEIVED_STATUS) {
                throw new Error("Old asset has already been received for this ticket.");
            }
            if (replacementStatus !== INITIATED_REPLACEMENT_STATUS) {
                throw new Error("Old asset can be received only after replacement initiation and before further replacement actions.");
            }
            const expectedOldAssetNumber = normalizeText(activeReplacement.oldassetnumber ??
                context.linkedorderline.assetnumber ??
                context.ticket.assetnumber);
            if (expectedOldAssetNumber &&
                normalizeComparableText(oldassetnumber) !==
                    normalizeComparableText(expectedOldAssetNumber)) {
                throw new Error(`Old asset number mismatch. Expected ${expectedOldAssetNumber}.`);
            }
            if (!context.currentstock) {
                throw new Error("Unable to find the currently assigned stock record for this rental asset.");
            }
            if (normalizeText(context.currentstock.orderlinenumber) &&
                normalizeText(context.currentstock.orderlinenumber) !==
                    normalizeText(context.linkedorderline.orderlinenumber)) {
                throw new Error("The resolved stock record does not belong to the linked rental order line.");
            }
            await client.query("BEGIN");
            transactionStarted = true;
            const stockUpdateResult = await client.query(`
          UPDATE stock_revo
          SET
            stockstatus = $1,
            servicestatus = $2,
            holdreason = $3,
            holdticketid = $4,
            assetnumber = COALESCE(assetnumber, $5)
          WHERE id = $6
          RETURNING *
        `, [
                SERVICE_HOLD_STOCK_STATUS,
                SERVICE_HOLD_SERVICE_STATUS,
                HOLD_REASON,
                ticketId,
                oldassetnumber,
                context.currentstock.id,
            ]);
            const updatedHistoryResult = await client.query(`
          UPDATE rental_replacement_history
          SET
            replacementstatus = $1,
            oldassetnumber = $2,
            remarks = COALESCE($3, remarks)
          WHERE id = $4
          RETURNING *
        `, [
                OLD_ASSET_RECEIVED_STATUS,
                oldassetnumber,
                remarks,
                activeReplacement.id,
            ]);
            const updatedTicketResult = await client.query(`
          UPDATE tickets
          SET replacementstatus = $1
          WHERE id = $2
          RETURNING *
        `, [OLD_ASSET_RECEIVED_STATUS, ticketId]);
            await client.query("COMMIT");
            transactionStarted = false;
            return {
                message: "Old asset received successfully.",
                ticket: updatedTicketResult.rows[0],
                replacement: updatedHistoryResult.rows[0],
                stock: stockUpdateResult.rows[0],
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN receiveOldAsset", error);
            throw new Error(error?.message || "Failed to receive the old asset.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.assignTechnicalReplacement = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const newassetnumber = normalizeText(request.body?.newassetnumber);
            const remarks = normalizeText(request.body?.remarks);
            if (!newassetnumber) {
                throw new Error("New asset number is required.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            const activeReplacement = await getActiveReplacementRecord(client, context, ticketId);
            if (!activeReplacement) {
                throw new Error("Initiate rental replacement before assigning the replacement asset.");
            }
            const replacementType = normalizeComparableText(activeReplacement.replacementtype ?? context.ticket.replacementtype);
            const replacementStatus = normalizeComparableText(activeReplacement.replacementstatus);
            if (replacementType !== "technical_replacement") {
                throw new Error("This endpoint supports only technical replacement assignments.");
            }
            if (FINAL_REPLACEMENT_STATUSES.has(replacementStatus)) {
                throw new Error("This replacement flow is already closed and cannot assign a replacement asset.");
            }
            const oldAssetNumber = normalizeText(activeReplacement.oldassetnumber ??
                context.linkedorderline.assetnumber ??
                context.ticket.assetnumber);
            const ticketReplacementStatus = normalizeComparableText(context.ticket.replacementstatus);
            const historyAssignedAssetNumber = normalizeText(activeReplacement.newassetnumber);
            const ticketAssignedAssetNumber = ticketReplacementStatus === ASSIGNED_REPLACEMENT_STATUS
                ? normalizeText(context.ticket.assetnumber)
                : null;
            const orderlineAssignedAssetNumber = context.linkedorderline.assetnumber &&
                normalizeComparableText(context.linkedorderline.assetnumber) !==
                    normalizeComparableText(oldAssetNumber)
                ? normalizeText(context.linkedorderline.assetnumber)
                : null;
            const assignedAssetCandidates = [
                historyAssignedAssetNumber,
                ticketAssignedAssetNumber,
                orderlineAssignedAssetNumber,
            ].filter((value, index, array) => {
                if (!value) {
                    return false;
                }
                return (array.findIndex((candidate) => normalizeComparableText(candidate) ===
                    normalizeComparableText(value)) === index);
            });
            if (replacementStatus === ASSIGNED_REPLACEMENT_STATUS ||
                ticketReplacementStatus === ASSIGNED_REPLACEMENT_STATUS ||
                assignedAssetCandidates.length > 0) {
                if (assignedAssetCandidates.length > 1) {
                    throw new Error("Replacement asset is already assigned for this ticket, but the ticket and order line are out of sync. Please reconcile the current assigned asset before retrying.");
                }
                throw new Error("Replacement asset has already been assigned for this ticket.");
            }
            if (replacementStatus !== OLD_ASSET_RECEIVED_STATUS) {
                throw new Error("Receive the old asset before assigning the replacement asset.");
            }
            if (oldAssetNumber &&
                normalizeComparableText(newassetnumber) ===
                    normalizeComparableText(oldAssetNumber)) {
                throw new Error("Replacement asset number must be different from the old asset number.");
            }
            const candidateStock = await getReplacementCandidateStock(newassetnumber);
            if (!candidateStock) {
                throw new Error("No stock record found for the provided replacement asset number or RFID.");
            }
            if (normalizeComparableText(candidateStock.stocktype) !== "rental_product") {
                throw new Error("Only rental product stock can be assigned as a technical replacement.");
            }
            if (candidateStock.ecompublish === true) {
                throw new Error("Replacement stock must come from rental inventory only.");
            }
            if (normalizeComparableText(candidateStock.stockstatus) !== "available") {
                throw new Error("Replacement stock must be in Available status before assignment.");
            }
            if (normalizeText(candidateStock.orderlinenumber) &&
                normalizeText(candidateStock.orderlinenumber) !==
                    normalizeText(context.linkedorderline.orderlinenumber)) {
                throw new Error("Replacement stock is already linked to another order line.");
            }
            await client.query("BEGIN");
            transactionStarted = true;
            const updatedStockResult = await client.query(`
          UPDATE stock_revo
          SET
            stockstatus = $1,
            servicestatus = NULL,
            holdreason = NULL,
            holdticketid = NULL,
            orderlinenumber = $2,
            assetnumber = $3,
            rfid = NULL
          WHERE id = $4
          RETURNING *
        `, [
                RENTAL_SOLD_STOCK_STATUS,
                context.linkedorderline.orderlinenumber,
                newassetnumber,
                candidateStock.id,
            ]);
            await client.query(`
          UPDATE orderline
          SET assetnumber = $1
          WHERE id = $2
        `, [newassetnumber, context.linkedorderline.id]);
            await client.query(`
          UPDATE orders
          SET assetnumber = $1
          WHERE orderid = $2
        `, [newassetnumber, context.linkedorderline.uniqueorderid]);
            const updatedHistoryResult = await client.query(`
          UPDATE rental_replacement_history
          SET
            replacementstatus = $1,
            newassetnumber = $2,
            newproductid = $3,
            remarks = COALESCE($4, remarks)
          WHERE id = $5
          RETURNING *
        `, [
                ASSIGNED_REPLACEMENT_STATUS,
                newassetnumber,
                candidateStock.resolved_productid ?? null,
                remarks,
                activeReplacement.id,
            ]);
            const updatedTicketResult = await client.query(`
          UPDATE tickets
          SET
            replacementstatus = $1,
            assetnumber = $2
          WHERE id = $3
          RETURNING *
        `, [ASSIGNED_REPLACEMENT_STATUS, newassetnumber, ticketId]);
            await client.query("COMMIT");
            transactionStarted = false;
            return {
                message: "Technical replacement asset assigned successfully.",
                ticket: updatedTicketResult.rows[0],
                replacement: updatedHistoryResult.rows[0],
                stock: updatedStockResult.rows[0],
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN assignTechnicalReplacement", error);
            throw new Error(error?.message || "Failed to assign the technical replacement asset.");
        }
        finally {
            client.release();
        }
    };
})(ticketReplacementService || (ticketReplacementService = {}));
//# sourceMappingURL=ticketReplacement.service.js.map