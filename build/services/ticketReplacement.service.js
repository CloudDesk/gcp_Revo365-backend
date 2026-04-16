import pool, { query } from "../database/postgres.js";
import { processRentalReturn } from "./rentalReturn.service.js";
import { linkRentalPenaltyInvoice, processRentalDamageAssessment, processRentalLost, } from "./rentalIssue.service.js";
import { rentalAgreementService } from "./rentalAgreement.service.js";
import { processRentalRenewal } from "./rentalRenewal.service.js";
import { stockRevoService } from "./stockRevo.service.js";
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
const REJECTED_REPLACEMENT_STATUS = "replacement_rejected";
const COMPLETED_REPLACEMENT_STATUS = "replacement_completed";
const RETURNED_ACTION_STATUS = "returned";
const FINAL_REPLACEMENT_STATUSES = new Set([
    COMPLETED_REPLACEMENT_STATUS,
    REJECTED_REPLACEMENT_STATUS,
]);
const RENTAL_CONTRACT_STATUS_STOPPED = "stopped";
const RENTAL_CONTRACT_STATUS_COMPLETED = "completed";
const STOP_RENTAL_CLOSE_REASON = "stop_rental";
const STOP_RENTAL_HOLD_REASON = "stop_rental";
const RESOLVED_CLOSED_TICKET_STATUS = "resolved_closed";
const UNRESOLVED_CLOSED_TICKET_STATUS = "unresolved_closed";
const REJECTION_ACTIONS = new Set([
    "continue_old_asset",
    "close_ticket",
    "collect_and_stop_rental",
]);
const STOP_RENTAL_FINANCIAL_MODES = new Set([
    "no_refund",
    "prorated_refund_credit",
    "manual_finance_decision",
]);
const RENEWED_ACTION_STATUS = "renewed";
const normalizeText = (value) => value == null ? null : String(value).trim();
const normalizeComparableText = (value) => String(value ?? "").trim().toLowerCase();
const parseJsonValue = (value, fallback) => {
    if (value == null) {
        return fallback;
    }
    if (typeof value === "object") {
        return value;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
};
const toPositiveInteger = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("A valid numeric id is required.");
    }
    return Math.trunc(parsed);
};
const parseInvoiceDate = (invoiceRow) => {
    const invoiceDateValue = Number(invoiceRow?.invoicedate);
    if (Number.isFinite(invoiceDateValue) && invoiceDateValue > 0) {
        const normalizedInvoiceDate = String(Math.trunc(invoiceDateValue)).length <= 10
            ? invoiceDateValue * 1000
            : invoiceDateValue;
        return new Date(normalizedInvoiceDate);
    }
    const createdDateValue = Number(invoiceRow?.createddate);
    if (Number.isFinite(createdDateValue) && createdDateValue > 0) {
        const normalizedCreatedDate = String(Math.trunc(createdDateValue)).length <= 10
            ? createdDateValue * 1000
            : createdDateValue;
        return new Date(normalizedCreatedDate);
    }
    return null;
};
const getBillingMonthIndex = (startDate, targetDate) => {
    let monthsDiff = (targetDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
        (targetDate.getUTCMonth() - startDate.getUTCMonth());
    if (targetDate.getUTCDate() < startDate.getUTCDate()) {
        monthsDiff -= 1;
    }
    return monthsDiff + 1;
};
const buildReplacementContext = async (ticketId) => {
    const ticketResult = await query(`
      SELECT
        t.*,
        ol.id AS resolved_orderlineid,
        ol.orderid AS resolved_orderid,
        ol.uniqueorderid AS resolved_uniqueorderid,
        ol.orderlinenumber AS resolved_orderlinenumber,
        ol.productid AS resolved_productid,
        ol.productname AS resolved_productname,
        ol.orderstatus AS resolved_orderstatus,
        ol.assetnumber AS resolved_assetnumber,
        ol.agreementid AS resolved_agreementid,
        ol.rentalassetstatus AS resolved_rentalassetstatus,
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
        ol.modifieddate AS resolved_orderline_modifieddate,
        ra.id AS resolved_agreement_rowid,
        ra.agreementnumber AS resolved_agreementnumber,
        ra.agreementpdfurl AS resolved_agreementpdfurl,
        ra.documentsnapshot AS resolved_agreement_documentsnapshot
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
      LEFT JOIN rental_agreement ra
        ON ra.id = COALESCE(ol.agreementid, t.agreementid)
      WHERE t.id = $1
      LIMIT 1
    `, [ticketId]);
    if (ticketResult.rowCount === 0) {
        throw new Error("Ticket not found.");
    }
    const ticketRow = ticketResult.rows[0];
    const normalizedTicketType = normalizeComparableText(ticketRow.tickettype);
    if (normalizedTicketType !== REPAIR_RENTAL_TICKET_TYPE) {
        throw new Error("Rental action flow is available only for Repair Rental tickets.");
    }
    const linkedOrderline = ticketRow.resolved_orderlineid == null
        ? null
        : {
            id: ticketRow.resolved_orderlineid,
            orderid: ticketRow.resolved_orderid,
            uniqueorderid: ticketRow.resolved_uniqueorderid,
            orderlinenumber: ticketRow.resolved_orderlinenumber,
            productid: ticketRow.resolved_productid,
            productname: ticketRow.resolved_productname,
            orderstatus: ticketRow.resolved_orderstatus,
            assetnumber: ticketRow.resolved_assetnumber,
            agreementid: ticketRow.resolved_agreementid,
            rentalassetstatus: ticketRow.resolved_rentalassetstatus,
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
    const invoiceResult = linkedOrderline?.uniqueorderid
        ? await query(`
          SELECT id, invoicenumber, invoicedate, createddate, invoiceurl
          FROM revoinvoice
          WHERE orderid = $1
            AND invoicefor = 'rental'
          ORDER BY createddate DESC NULLS LAST, id DESC
        `, [linkedOrderline.uniqueorderid])
        : { rows: [] };
    const orderlineGeneratedMonths = Number(linkedOrderline?.generatedmonthscount ?? 0);
    const billedCycleIndices = new Set();
    const rentalStartDate = linkedOrderline?.rentstartdate
        ? new Date(linkedOrderline.rentstartdate)
        : null;
    if (rentalStartDate &&
        !Number.isNaN(rentalStartDate.getTime()) &&
        invoiceResult.rows.length > 0) {
        invoiceResult.rows.forEach((invoiceRow) => {
            const invoiceDate = parseInvoiceDate(invoiceRow);
            if (!invoiceDate || Number.isNaN(invoiceDate.getTime())) {
                return;
            }
            if (invoiceDate < rentalStartDate) {
                return;
            }
            const billingMonthIndex = getBillingMonthIndex(rentalStartDate, invoiceDate);
            if (billingMonthIndex > 0) {
                billedCycleIndices.add(billingMonthIndex);
            }
        });
    }
    const invoicedMonths = billedCycleIndices.size;
    const monthsalreadybilled = Math.max(orderlineGeneratedMonths, invoicedMonths);
    const remainingmonths = Math.max(Number(linkedOrderline?.rentalfor ?? 0) - monthsalreadybilled, 0);
    const resolvedAssetNumber = normalizeText(linkedOrderline?.assetnumber ?? ticketRow.assetnumber);
    const linkedOrderlineNumber = normalizeText(linkedOrderline?.orderlinenumber);
    const ticketOrderlineNumber = normalizeText(ticketRow.orderlinenumber);
    const stockResult = await query(`
      SELECT
        id,
        serialnumber,
        rfid,
        assetnumber,
        orderid,
        agreementid,
        rentalassetstatus,
        orderlinenumber,
        stockstatus,
        servicestatus,
        holdreason,
        holdticketid,
        location,
        lostdate,
        lostreason,
        modifieddate
      FROM stock_revo
      WHERE
        ($1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1)
        OR ($1::text IS NOT NULL AND CAST(rfid AS TEXT) = $1)
        OR ($1::text IS NOT NULL AND CAST(serialnumber AS TEXT) = $1)
        OR ($2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2)
        OR ($3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3)
        OR ($4::text IS NOT NULL AND CAST(orderid AS TEXT) = $4)
        OR ($5::int IS NOT NULL AND agreementid = $5)
      ORDER BY
        CASE
          WHEN $1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1 THEN 0
          WHEN $1::text IS NOT NULL AND CAST(rfid AS TEXT) = $1 THEN 1
          WHEN $1::text IS NOT NULL AND CAST(serialnumber AS TEXT) = $1 THEN 2
          WHEN $2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2 THEN 3
          WHEN $3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3 THEN 4
          WHEN $4::text IS NOT NULL AND CAST(orderid AS TEXT) = $4 THEN 5
          WHEN $5::int IS NOT NULL AND agreementid = $5 THEN 6
          ELSE 7
        END,
        modifieddate DESC NULLS LAST,
        id DESC
      LIMIT 1
    `, [
        resolvedAssetNumber,
        linkedOrderlineNumber,
        ticketOrderlineNumber,
        normalizeText(linkedOrderline?.uniqueorderid),
        linkedOrderline?.agreementid == null ? null : Number(linkedOrderline.agreementid),
    ]);
    const historyResult = await query(`
      SELECT *
      FROM rental_replacement_history
      WHERE ticketid = $1
      ORDER BY createddate DESC NULLS LAST, id DESC
    `, [ticketId]);
    const agreementDocument = parseJsonValue(ticketRow.resolved_agreement_documentsnapshot, {});
    const annexure3Snapshot = agreementDocument?.annexure3 ?? null;
    const signatureSnapshot = agreementDocument?.signatures ?? null;
    const linkedAgreement = ticketRow.resolved_agreement_rowid == null
        ? null
        : {
            id: Number(ticketRow.resolved_agreement_rowid),
            agreementnumber: ticketRow.resolved_agreementnumber ?? null,
            agreementpdfurl: ticketRow.resolved_agreementpdfurl ?? null,
            documentsnapshot: agreementDocument,
            lossdeclarationgenerated: Boolean(annexure3Snapshot?.declarationDate),
            lossdeclarationfinalizedat: annexure3Snapshot?.finalizedAt ?? null,
            lossdeclarationfinalizedby: annexure3Snapshot?.finalizedBy ?? null,
            lossdeclarationdetails: annexure3Snapshot
                ? {
                    declarationdate: annexure3Snapshot.declarationDate ?? null,
                    incidentdate: annexure3Snapshot.incidentDate ?? null,
                    incidenttime: annexure3Snapshot.incidentTime ?? "",
                    incidentlocation: annexure3Snapshot.incidentLocation ?? "",
                    circumstances: annexure3Snapshot.circumstances ?? "",
                    firncnumber: annexure3Snapshot.firNcNumber ?? "",
                    policestation: annexure3Snapshot.policeStation ?? "",
                    firncfilingdate: annexure3Snapshot.firNcFilingDate ?? null,
                    lesseesignatoryname: signatureSnapshot?.lesseeSignatoryName ?? "",
                    lesseesignatorydesignation: signatureSnapshot?.lesseeSignatoryDesignation ?? "",
                }
                : null,
        };
    return {
        ticket: ticketRow,
        resolutionstatus: linkedOrderline ? "resolved" : "unresolved",
        linkagesource: ticketRow.linkedorderlineid
            ? "linkedorderlineid"
            : ticketRow.assetnumber
                ? "assetnumber"
                : null,
        linkedorderline: linkedOrderline,
        linkedagreement: linkedAgreement,
        currentstock: stockResult.rows[0] ?? null,
        monthsalreadybilled,
        remainingmonths,
        invoiceprogress: {
            totalmonths: Number(linkedOrderline?.rentalfor ?? 0),
            monthsalreadybilled,
            invoicedmonths: invoicedMonths,
            orderlinegeneratedmonths: orderlineGeneratedMonths,
            invoicecount: invoiceResult.rows.length,
            invoices: invoiceResult.rows,
            lastinvoicedate: invoiceResult.rows.length > 0
                ? parseInvoiceDate(invoiceResult.rows[0])?.toISOString() ?? null
                : null,
            iscurrentcycleinvoiced: rentalStartDate && !Number.isNaN(rentalStartDate.getTime())
                ? billedCycleIndices.has(getBillingMonthIndex(rentalStartDate, new Date()))
                : false,
        },
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
const getReplacementCandidateStock = async (assetOrRfid, expectedProductId) => {
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
        -- When the same entered value exists as both an RFID and an asset number
        -- on different rows, prefer the RFID match first.
        CASE WHEN CAST(s.rfid AS TEXT) = $1 THEN 0 ELSE 1 END,
        CASE
          WHEN $2::int IS NOT NULL AND p.id = $2 THEN 0
          ELSE 1
        END,
        CASE
          WHEN LOWER(COALESCE(s.stockstatus, '')) = 'available' THEN 0
          ELSE 1
        END,
        CASE
          WHEN LOWER(COALESCE(s.stocktype, '')) = 'rental_product' THEN 0
          ELSE 1
        END,
        CASE
          WHEN COALESCE(s.ecompublish, FALSE) = FALSE THEN 0
          ELSE 1
        END,
        CASE
          WHEN COALESCE(NULLIF(TRIM(CAST(s.orderlinenumber AS TEXT)), ''), '') = '' THEN 0
          ELSE 1
        END,
        CASE WHEN CAST(s.assetnumber AS TEXT) = $1 THEN 0 ELSE 1 END,
        s.modifieddate DESC NULLS LAST,
        s.id DESC
      LIMIT 1
    `, [assetOrRfid, expectedProductId ?? null]);
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
            let stockToReceive = context.currentstock;
            if (!stockToReceive) {
                const fallbackStockResult = await client.query(`
            SELECT *
            FROM stock_revo
            WHERE
              ($1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1)
              OR ($2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2)
              OR ($3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3)
            ORDER BY
              CASE
                WHEN $1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1 THEN 0
                WHEN $2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2 THEN 1
                WHEN $3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3 THEN 2
                ELSE 3
              END,
              modifieddate DESC NULLS LAST,
              id DESC
            LIMIT 1
          `, [
                    oldassetnumber,
                    normalizeText(context.linkedorderline.orderlinenumber),
                    normalizeText(context.ticket.orderlinenumber),
                ]);
                stockToReceive = fallbackStockResult.rows[0] ?? null;
            }
            if (!stockToReceive) {
                throw new Error("Unable to find the currently assigned stock record for this rental asset.");
            }
            const linkedOrderLineNumber = normalizeText(context.linkedorderline.orderlinenumber);
            const ticketOrderLineNumber = normalizeText(context.ticket.orderlinenumber);
            const resolvedStockOrderLineNumber = normalizeText(stockToReceive.orderlinenumber);
            if (resolvedStockOrderLineNumber &&
                linkedOrderLineNumber &&
                resolvedStockOrderLineNumber !== linkedOrderLineNumber &&
                (!ticketOrderLineNumber || resolvedStockOrderLineNumber !== ticketOrderLineNumber)) {
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
                stockToReceive.id,
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
        let agreementSyncResult = null;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const newassetnumber = normalizeText(request.body?.newassetnumber);
            const remarks = normalizeText(request.body?.remarks);
            const replacementClosedAt = toEpochSeconds(new Date());
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
            if (ticketReplacementStatus === ASSIGNED_REPLACEMENT_STATUS ||
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
            assetnumber = $3
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
            assetnumber = $2,
            ticketstatus = $3,
            closeddate = $4
          WHERE id = $5
          RETURNING *
        `, [
                ASSIGNED_REPLACEMENT_STATUS,
                newassetnumber,
                RESOLVED_CLOSED_TICKET_STATUS,
                replacementClosedAt,
                ticketId,
            ]);
            agreementSyncResult =
                context.linkedorderline.agreementid != null
                    ? await rentalAgreementService.syncTechnicalReplacementAgreement({
                        executor: client,
                        agreementId: Number(context.linkedorderline.agreementid),
                        uniqueOrderId: normalizeText(context.linkedorderline.uniqueorderid),
                        orderlineId: Number(context.linkedorderline.id),
                        oldAssetNumber,
                        newAssetNumber: newassetnumber,
                        newStockId: candidateStock.id,
                        ticketId,
                        modifiedBy: request.session?.id ?? null,
                    })
                    : null;
            await client.query("COMMIT");
            transactionStarted = false;
            let agreementWarning = null;
            const agreementId = agreementSyncResult?.agreement?.id ??
                (context.linkedorderline.agreementid != null
                    ? Number(context.linkedorderline.agreementid)
                    : null);
            if (agreementId != null) {
                try {
                    await rentalAgreementService.refreshRentalAgreementPdfById(agreementId, {
                        modifiedBy: request.session?.id ?? null,
                    });
                }
                catch (agreementPdfError) {
                    console.error("Technical replacement agreement PDF refresh failed", agreementPdfError);
                    agreementWarning =
                        agreementPdfError?.message ||
                            "Replacement was assigned, but the agreement PDF could not be refreshed.";
                }
            }
            return {
                message: agreementWarning
                    ? "Technical replacement asset assigned with agreement PDF warning."
                    : "Technical replacement asset assigned successfully.",
                warning: agreementWarning,
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
    const RENTAL_CONTRACT_STATUS_ACTIVE = "active";
    const RENTAL_CONTRACT_STATUS_REPLACED = "replaced";
    const COMMERCIAL_REPLACEMENT_CLOSE_REASON = "commercial_replacement";
    const BILLING_MODES = new Set(["prorated", "next_cycle"]);
    const toOptionalPositiveBigInt = (value) => {
        if (value == null)
            return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            throw new Error("A valid non-negative effectivefrom is required.");
        }
        return Math.trunc(parsed);
    };
    const buildNewOrderLineNumber = (baseOrderLineNumber) => {
        const base = normalizeText(baseOrderLineNumber) ?? "";
        if (!base)
            return `ordline-${Date.now()}`;
        // If it ends with numeric suffix like ordline365-0000000553, append timestamp.
        return `${base}-cr-${Date.now()}`;
    };
    const toEpochDate = (value) => {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            throw new Error("A valid epoch value is required.");
        }
        const milliseconds = numericValue < 1000000000000 ? numericValue * 1000 : numericValue;
        return new Date(milliseconds);
    };
    const toEpochSeconds = (dateValue) => {
        return Math.trunc(dateValue.getTime() / 1000);
    };
    const addMonthsUtc = (dateValue, months) => {
        const result = new Date(dateValue.getTime());
        result.setUTCMonth(result.getUTCMonth() + months);
        return result;
    };
    const getCommercialCutoverDate = (billingMode, effectiveFromEpoch, anchorDateValue) => {
        const effectiveDate = toEpochDate(effectiveFromEpoch);
        if (normalizeComparableText(billingMode) !== "next_cycle") {
            return effectiveDate;
        }
        if (!anchorDateValue) {
            return effectiveDate;
        }
        const anchorDate = new Date(anchorDateValue);
        if (Number.isNaN(anchorDate.getTime())) {
            return effectiveDate;
        }
        let monthsDiff = (effectiveDate.getUTCFullYear() - anchorDate.getUTCFullYear()) * 12 +
            (effectiveDate.getUTCMonth() - anchorDate.getUTCMonth());
        let cycleStart = addMonthsUtc(anchorDate, monthsDiff);
        if (cycleStart.getTime() > effectiveDate.getTime()) {
            cycleStart = addMonthsUtc(anchorDate, monthsDiff - 1);
        }
        while (addMonthsUtc(cycleStart, 1).getTime() <= effectiveDate.getTime()) {
            cycleStart = addMonthsUtc(cycleStart, 1);
        }
        return addMonthsUtc(cycleStart, 1);
    };
    const formatTicketProductCategory = (value) => {
        const textValue = normalizeText(value);
        if (!textValue) {
            return null;
        }
        return textValue
            .replace(/_/g, " ")
            .split(" ")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    };
    const getProductSummary = async (executor, productId) => {
        const result = await executor.query(`
        SELECT id, productname, subcategory, brand, model
        FROM product_revo
        WHERE id = $1
        LIMIT 1
      `, [productId]);
        return result.rows[0] ?? null;
    };
    const findStockForContract = async (executor, options) => {
        const result = await executor.query(`
        SELECT *
        FROM stock_revo
        WHERE
          ($1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1)
          OR ($2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2)
          OR ($3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3)
          OR ($4::int IS NOT NULL AND holdticketid = $4)
        ORDER BY
          CASE
            WHEN $4::int IS NOT NULL AND holdticketid = $4 THEN 0
            WHEN $1::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $1 THEN 1
            WHEN $2::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $2 THEN 2
            WHEN $3::text IS NOT NULL AND CAST(orderlinenumber AS TEXT) = $3 THEN 3
            ELSE 4
          END,
          modifieddate DESC NULLS LAST,
          id DESC
        LIMIT 1
      `, [
            normalizeText(options.assetnumber),
            normalizeText(options.linkedorderlinenumber),
            normalizeText(options.ticketorderlinenumber),
            options.holdticketid == null ? null : Number(options.holdticketid),
        ]);
        return result.rows[0] ?? null;
    };
    const restoreOldAssetToContract = async (executor, context, activeReplacement, ticketId) => {
        const oldAssetNumber = normalizeText(activeReplacement.oldassetnumber ??
            context.linkedorderline?.assetnumber ??
            context.ticket.assetnumber);
        if (!oldAssetNumber) {
            throw new Error("Unable to resolve the original rental asset for this rejection flow.");
        }
        const stockToRestore = (context.currentstock &&
            normalizeComparableText(context.currentstock.assetnumber) ===
                normalizeComparableText(oldAssetNumber)
            ? context.currentstock
            : null) ??
            (await findStockForContract(executor, {
                assetnumber: oldAssetNumber,
                linkedorderlinenumber: context.linkedorderline?.orderlinenumber,
                ticketorderlinenumber: context.ticket?.orderlinenumber,
                holdticketid: ticketId,
            }));
        if (!stockToRestore) {
            throw new Error("Unable to find the original rental asset stock record to restore.");
        }
        const restoredStockResult = await executor.query(`
        UPDATE stock_revo
        SET
          stockstatus = $1,
          servicestatus = NULL,
          holdreason = NULL,
          holdticketid = NULL,
          orderlinenumber = $2,
          assetnumber = $3
        WHERE id = $4
        RETURNING *
      `, [
            RENTAL_SOLD_STOCK_STATUS,
            normalizeText(context.linkedorderline?.orderlinenumber),
            oldAssetNumber,
            stockToRestore.id,
        ]);
        await executor.query(`
        UPDATE orderline
        SET assetnumber = $1
        WHERE id = $2
      `, [oldAssetNumber, context.linkedorderline.id]);
        await executor.query(`
        UPDATE orders
        SET assetnumber = $1
        WHERE orderid = $2
      `, [oldAssetNumber, context.linkedorderline.uniqueorderid]);
        await executor.query(`
        UPDATE tickets
        SET
          assetnumber = $1,
          linkedorderlineid = $2,
          orderlinenumber = COALESCE($3, orderlinenumber)
        WHERE id = $4
      `, [
            oldAssetNumber,
            context.linkedorderline.id,
            normalizeText(context.linkedorderline.orderlinenumber),
            ticketId,
        ]);
        return {
            stock: restoredStockResult.rows[0],
            assetnumber: oldAssetNumber,
        };
    };
    const stopActiveRentalContract = async (executor, context, ticketId, stopEpoch, options) => {
        if (!context.linkedorderline) {
            throw new Error("Unable to resolve the active rental contract for this ticket.");
        }
        const orderlineStopResult = await executor.query(`
        UPDATE orderline
        SET
          rentalcontractstatus = $1,
          contractcloseddate = $2,
          contractclosereason = $3,
          isactivebillingline = FALSE,
          rentalfor = generatedmonthscount
        WHERE id = $4
        RETURNING *
      `, [
            RENTAL_CONTRACT_STATUS_STOPPED,
            stopEpoch,
            STOP_RENTAL_CLOSE_REASON,
            context.linkedorderline.id,
        ]);
        let updatedStock = null;
        if (options?.holdAsset !== false) {
            const contractAssetNumber = normalizeText(context.linkedorderline.assetnumber ?? context.ticket.assetnumber);
            const stockToHold = context.currentstock ??
                (await findStockForContract(executor, {
                    assetnumber: contractAssetNumber,
                    linkedorderlinenumber: context.linkedorderline.orderlinenumber,
                    ticketorderlinenumber: context.ticket.orderlinenumber,
                    holdticketid: ticketId,
                }));
            if (!stockToHold) {
                throw new Error("Unable to find the active rental stock record for stop rental.");
            }
            const stockHoldResult = await executor.query(`
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
                options?.holdReason ?? STOP_RENTAL_HOLD_REASON,
                ticketId,
                contractAssetNumber,
                stockToHold.id,
            ]);
            updatedStock = stockHoldResult.rows[0] ?? null;
        }
        return {
            orderline: orderlineStopResult.rows[0] ?? null,
            stock: updatedStock,
        };
    };
    ticketReplacementService.assignCommercialReplacement = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        let agreementSyncResult = null;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const newproductid = toPositiveInteger(request.body?.newproductid);
            const newassetnumber = normalizeText(request.body?.newassetnumber);
            const effectivefrom = toOptionalPositiveBigInt(request.body?.effectivefrom);
            const billingmode = normalizeText(request.body?.billingmode);
            const revisedremainingmonths = Number(request.body?.revisedremainingmonths);
            const newrate = request.body?.newrate;
            const remarks = normalizeText(request.body?.remarks);
            if (!newassetnumber) {
                throw new Error("New asset number is required.");
            }
            if (effectivefrom == null) {
                throw new Error("Effective from is required.");
            }
            if (!billingmode || !BILLING_MODES.has(normalizeComparableText(billingmode))) {
                throw new Error("Billing mode must be either 'prorated' or 'next_cycle'.");
            }
            if (!Number.isFinite(revisedremainingmonths) || revisedremainingmonths < 1) {
                throw new Error("Revised remaining months must be >= 1. Use stop rental if the contract should end immediately.");
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
            if (replacementType !== "commercial_replacement") {
                throw new Error("This endpoint supports only commercial replacement assignments.");
            }
            if (FINAL_REPLACEMENT_STATUSES.has(replacementStatus)) {
                throw new Error("This replacement flow is already closed and cannot assign a replacement asset.");
            }
            if (replacementStatus === ASSIGNED_REPLACEMENT_STATUS) {
                throw new Error("Replacement asset has already been assigned for this ticket.");
            }
            if (replacementStatus !== OLD_ASSET_RECEIVED_STATUS) {
                throw new Error("Receive the old asset before assigning the commercial replacement asset.");
            }
            // Carry already billed months forward.
            const monthsalreadybilled = Number(context.monthsalreadybilled ?? 0);
            const newTotalRentalFor = monthsalreadybilled + revisedremainingmonths;
            if (newTotalRentalFor < monthsalreadybilled) {
                throw new Error("Commercial replacement rental duration cannot go below already billed months.");
            }
            // Validate replacement stock.
            const oldAssetNumber = normalizeText(activeReplacement.oldassetnumber ??
                context.linkedorderline.assetnumber ??
                context.ticket.assetnumber);
            if (oldAssetNumber &&
                normalizeComparableText(newassetnumber) === normalizeComparableText(oldAssetNumber)) {
                throw new Error("Commercial replacement asset number must be different from the old asset number.");
            }
            const candidateStock = await getReplacementCandidateStock(newassetnumber, Number(newproductid));
            if (!candidateStock) {
                throw new Error("No stock record found for the provided replacement asset number or RFID.");
            }
            if (normalizeComparableText(candidateStock.stocktype) !== "rental_product") {
                throw new Error("Only rental product stock can be assigned as a commercial replacement.");
            }
            if (candidateStock.ecompublish === true) {
                throw new Error("Replacement stock must come from rental inventory only.");
            }
            if (normalizeComparableText(candidateStock.stockstatus) !== "available") {
                throw new Error("Replacement stock must be in Available status before assignment.");
            }
            if (normalizeText(candidateStock.orderlinenumber) &&
                normalizeText(candidateStock.orderlinenumber) !== normalizeText(context.linkedorderline.orderlinenumber)) {
                throw new Error("Replacement stock is already linked to another order line.");
            }
            if (candidateStock.resolved_productid != null &&
                Number(candidateStock.resolved_productid) !== Number(newproductid)) {
                throw new Error("Selected replacement product does not match the provided replacement stock.");
            }
            const productSummary = await getProductSummary(client, newproductid);
            if (!productSummary) {
                throw new Error("Selected replacement product was not found.");
            }
            // Prevent duplicate assignment if ticket/orderline are already out of sync.
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
            if (ticketReplacementStatus === ASSIGNED_REPLACEMENT_STATUS ||
                assignedAssetCandidates.length > 0) {
                if (assignedAssetCandidates.length > 1) {
                    throw new Error("Replacement asset is already assigned for this ticket, but the ticket and order line are out of sync. Please reconcile the current assigned asset before retrying.");
                }
                throw new Error("Replacement asset has already been assigned for this ticket.");
            }
            const commercialCutoverDate = getCommercialCutoverDate(billingmode, effectivefrom, context.linkedorderline.rentstartdate);
            const commercialCutoverEpoch = toEpochSeconds(commercialCutoverDate);
            const newRentEndDate = addMonthsUtc(commercialCutoverDate, revisedremainingmonths);
            const replacementClosedAt = toEpochSeconds(new Date());
            await client.query("BEGIN");
            transactionStarted = true;
            // 1) Close old billing line from the effective date and deactivate it.
            await client.query(`
          UPDATE orderline
          SET
            rentalcontractstatus = $1,
            contractcloseddate = $2,
            contractclosereason = $3,
            isactivebillingline = FALSE,
            rentalfor = $4
          WHERE id = $5
        `, [
                RENTAL_CONTRACT_STATUS_REPLACED,
                commercialCutoverEpoch,
                COMMERCIAL_REPLACEMENT_CLOSE_REASON,
                monthsalreadybilled,
                context.linkedorderline.id,
            ]);
            // 2) Create new active billing line by cloning the old one.
            const oldOrderlineId = context.linkedorderline.id;
            const newOrderlinenumber = buildNewOrderLineNumber(context.linkedorderline.orderlinenumber);
            const productAmountValue = newrate == null || newrate === ""
                ? context.linkedorderline.productamount
                : String(newrate);
            // invoicegenerated should be true if we already have billed months.
            const newInvoiceGenerated = monthsalreadybilled > 0;
            // Fetch column list dynamically so we don't depend on a specific schema.
            const colsRes = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'orderline'
            AND column_name <> 'id'
          ORDER BY ordinal_position
        `);
            const cols = colsRes.rows.map((r) => r.column_name);
            const overrides = {
                orderlinenumber: newOrderlinenumber,
                assetnumber: newassetnumber,
                productid: newproductid,
                productname: productSummary.productname ?? candidateStock.resolved_productname,
                productamount: productAmountValue,
                orderamount: productAmountValue,
                rfid: null,
                rentalfor: newTotalRentalFor,
                generatedmonthscount: monthsalreadybilled,
                invoicegenerated: newInvoiceGenerated,
                lastgeneratedinvoicedate: context.linkedorderline.lastgeneratedinvoicedate ?? null,
                isactivebillingline: true,
                rentalcontractstatus: RENTAL_CONTRACT_STATUS_ACTIVE,
                parentorderlineid: oldOrderlineId,
                contracteffectivefrom: commercialCutoverEpoch,
                contractcloseddate: null,
                contractclosereason: null,
                replacementsource: HOLD_REASON,
                rentstartdate: commercialCutoverDate.toISOString(),
                rentenddate: newRentEndDate.toISOString(),
            };
            // Build INSERT ... SELECT with overrides.
            let paramIndex = 1;
            const params = [];
            const insertColsSql = cols.map((c) => `"${c}"`).join(", ");
            const selectExprsSql = cols
                .map((c) => {
                if (Object.prototype.hasOwnProperty.call(overrides, c)) {
                    params.push(overrides[c]);
                    const placeholder = `$${paramIndex++}`;
                    return `${placeholder} AS "${c}"`;
                }
                return `"${c}"`;
            })
                .join(", ");
            const insertedNewOrderline = await client.query(`
          INSERT INTO orderline (${insertColsSql})
          SELECT ${selectExprsSql}
          FROM orderline
          WHERE id = $${paramIndex}
          RETURNING id, orderlinenumber
        `, [...params, oldOrderlineId]);
            const newOrderlineId = insertedNewOrderline.rows[0].id;
            const persistedOrderlinenumber = normalizeText(insertedNewOrderline.rows[0].orderlinenumber);
            // 3) Update ticket linkage to the new active billing line.
            await client.query(`
          UPDATE tickets
          SET
            replacementstatus = $1,
            assetnumber = $2,
            linkedorderlineid = $3,
            productid = $4,
            productcategory = COALESCE($5, productcategory),
            productbrand = COALESCE($6, productbrand),
            productmodel = COALESCE($7, productmodel),
            orderlinenumber = COALESCE($8, orderlinenumber),
            ticketstatus = $9,
            closeddate = $10
          WHERE id = $11
        `, [
                ASSIGNED_REPLACEMENT_STATUS,
                newassetnumber,
                newOrderlineId,
                newproductid,
                formatTicketProductCategory(productSummary.subcategory),
                normalizeText(productSummary.brand),
                normalizeText(productSummary.model),
                persistedOrderlinenumber,
                RESOLVED_CLOSED_TICKET_STATUS,
                replacementClosedAt,
                ticketId,
            ]);
            // 4) Assign replacement stock to the new billing line.
            const updatedStockResult = await client.query(`
          UPDATE stock_revo
          SET
            stockstatus = $1,
            servicestatus = NULL,
            holdreason = NULL,
            holdticketid = NULL,
            orderlinenumber = $2,
            assetnumber = $3
          WHERE id = $4
          RETURNING *
        `, [
                RENTAL_SOLD_STOCK_STATUS,
                persistedOrderlinenumber ?? newOrderlinenumber,
                newassetnumber,
                candidateStock.id,
            ]);
            // 5) Update orders assetnumber to match the newly assigned asset.
            await client.query(`
          UPDATE orders
          SET assetnumber = $1
          WHERE orderid = $2
        `, [newassetnumber, context.linkedorderline.uniqueorderid]);
            // 6) Update replacement history row with commercial-specific fields.
            const updatedHistoryResult = await client.query(`
          UPDATE rental_replacement_history
          SET
            replacementstatus = $1,
            newassetnumber = $2,
            newproductid = $3,
            billingmode = $4,
            effectivefrom = $5,
            revisedremainingmonths = $6,
            remarks = COALESCE($7, remarks)
          WHERE id = $8
          RETURNING *
        `, [
                ASSIGNED_REPLACEMENT_STATUS,
                newassetnumber,
                newproductid,
                normalizeComparableText(billingmode),
                effectivefrom,
                revisedremainingmonths,
                remarks,
                activeReplacement.id,
            ]);
            agreementSyncResult =
                context.linkedorderline.agreementid != null
                    ? await rentalAgreementService.syncCommercialReplacementAgreement({
                        executor: client,
                        agreementId: Number(context.linkedorderline.agreementid),
                        uniqueOrderId: normalizeText(context.linkedorderline.uniqueorderid),
                        oldOrderlineId: Number(oldOrderlineId),
                        newOrderlineId: Number(newOrderlineId),
                        oldAssetNumber,
                        newAssetNumber: newassetnumber,
                        newStockId: candidateStock.id,
                        actionEpoch: commercialCutoverEpoch,
                        ticketId,
                        modifiedBy: request.session?.id ?? null,
                    })
                    : null;
            await client.query("COMMIT");
            transactionStarted = false;
            let agreementWarning = null;
            const agreementId = agreementSyncResult?.agreement?.id ??
                (context.linkedorderline.agreementid != null
                    ? Number(context.linkedorderline.agreementid)
                    : null);
            if (agreementId != null) {
                try {
                    await rentalAgreementService.refreshRentalAgreementPdfById(agreementId, {
                        modifiedBy: request.session?.id ?? null,
                    });
                }
                catch (agreementPdfError) {
                    console.error("Commercial replacement agreement PDF refresh failed", agreementPdfError);
                    agreementWarning =
                        agreementPdfError?.message ||
                            "Replacement was assigned, but the agreement PDF could not be refreshed.";
                }
            }
            return {
                message: agreementWarning
                    ? "Commercial replacement asset assigned with agreement PDF warning."
                    : "Commercial replacement asset assigned successfully.",
                warning: agreementWarning,
                ticket: (await buildReplacementContext(ticketId)).ticket,
                replacement: updatedHistoryResult.rows[0],
                stock: updatedStockResult.rows[0],
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN assignCommercialReplacement", error);
            throw new Error(error?.message || "Failed to assign the commercial replacement asset.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.rejectReplacement = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const rejectionaction = normalizeComparableText(request.body?.rejectionaction);
            const stoprentalfinancialmode = normalizeComparableText(request.body?.stoprentalfinancialmode);
            const effectivefrom = toOptionalPositiveBigInt(request.body?.effectivefrom);
            const remarks = normalizeText(request.body?.remarks);
            if (!REJECTION_ACTIONS.has(rejectionaction)) {
                throw new Error("Rejection action must be continue_old_asset, close_ticket, or collect_and_stop_rental.");
            }
            if (rejectionaction === "collect_and_stop_rental" &&
                (!stoprentalfinancialmode || !STOP_RENTAL_FINANCIAL_MODES.has(stoprentalfinancialmode))) {
                throw new Error("A valid stop rental financial mode is required for collect_and_stop_rental.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            const activeReplacement = await getActiveReplacementRecord(client, context, ticketId);
            if (!activeReplacement) {
                throw new Error("Initiate rental replacement before rejecting the replacement flow.");
            }
            const replacementStatus = normalizeComparableText(activeReplacement.replacementstatus);
            if (FINAL_REPLACEMENT_STATUSES.has(replacementStatus)) {
                throw new Error("This replacement flow is already closed.");
            }
            if (replacementStatus === ASSIGNED_REPLACEMENT_STATUS) {
                throw new Error("Reject the replacement before a replacement asset is assigned.");
            }
            if (rejectionaction === "collect_and_stop_rental" &&
                replacementStatus !== OLD_ASSET_RECEIVED_STATUS) {
                throw new Error("Receive the old asset before using collect_and_stop_rental.");
            }
            const closureEpoch = effectivefrom ?? toEpochSeconds(new Date());
            let updatedStock = null;
            let stoppedOrderline = null;
            let restoredAssetNumber = null;
            await client.query("BEGIN");
            transactionStarted = true;
            if (rejectionaction === "continue_old_asset" || rejectionaction === "close_ticket") {
                if (replacementStatus === OLD_ASSET_RECEIVED_STATUS) {
                    const restoreResult = await restoreOldAssetToContract(client, context, activeReplacement, ticketId);
                    updatedStock = restoreResult.stock;
                    restoredAssetNumber = restoreResult.assetnumber;
                }
            }
            if (rejectionaction === "collect_and_stop_rental") {
                const stopResult = await stopActiveRentalContract(client, context, ticketId, closureEpoch, {
                    holdAsset: true,
                    holdReason: STOP_RENTAL_HOLD_REASON,
                });
                updatedStock = stopResult.stock;
                stoppedOrderline = stopResult.orderline;
            }
            const updatedHistoryResult = await client.query(`
          UPDATE rental_replacement_history
          SET
            replacementstatus = $1,
            rejectionaction = $2,
            stoprental = $3,
            stoprentalfinancialmode = $4,
            effectivefrom = COALESCE($5, effectivefrom),
            remarks = COALESCE($6, remarks)
          WHERE id = $7
          RETURNING *
        `, [
                REJECTED_REPLACEMENT_STATUS,
                rejectionaction,
                rejectionaction === "collect_and_stop_rental",
                rejectionaction === "collect_and_stop_rental" ? stoprentalfinancialmode : null,
                rejectionaction === "collect_and_stop_rental" ? closureEpoch : null,
                remarks,
                activeReplacement.id,
            ]);
            const ticketUpdateResult = await client.query(`
          UPDATE tickets
          SET
            replacementstatus = $1,
            rejectionaction = $2,
            stoprental = $3,
            assetnumber = COALESCE($4, assetnumber),
            ticketstatus = CASE WHEN $5 THEN $6 ELSE ticketstatus END,
            closeddate = CASE WHEN $5 THEN $7 ELSE closeddate END
          WHERE id = $8
          RETURNING *
        `, [
                REJECTED_REPLACEMENT_STATUS,
                rejectionaction,
                rejectionaction === "collect_and_stop_rental",
                restoredAssetNumber,
                rejectionaction === "close_ticket" || rejectionaction === "collect_and_stop_rental",
                UNRESOLVED_CLOSED_TICKET_STATUS,
                closureEpoch,
                ticketId,
            ]);
            await client.query("COMMIT");
            transactionStarted = false;
            const responseContext = await buildReplacementContext(ticketId);
            const message = rejectionaction === "continue_old_asset"
                ? "Replacement rejected and original rental asset restored successfully."
                : rejectionaction === "close_ticket"
                    ? "Replacement rejected and ticket closed successfully."
                    : "Replacement rejected and rental stopped successfully.";
            return {
                message,
                ticket: ticketUpdateResult.rows[0],
                replacement: updatedHistoryResult.rows[0],
                stock: updatedStock,
                orderline: stoppedOrderline,
                context: responseContext,
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN rejectReplacement", error);
            throw new Error(error?.message || "Failed to reject the rental replacement flow.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.returnRentalAsset = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const oldassetnumber = normalizeText(request.body?.oldassetnumber);
            const returneddate = toOptionalPositiveBigInt(request.body?.returneddate);
            const remarks = normalizeText(request.body?.remarks);
            if (!oldassetnumber) {
                throw new Error("Old asset number is required.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            if (context.ticket.stoprental === true) {
                throw new Error("This ticket already stopped the rental contract. Process post-stop returns in the next lifecycle slice.");
            }
            const activeReplacement = await getActiveReplacementRecord(client, context, ticketId);
            if (activeReplacement &&
                !FINAL_REPLACEMENT_STATUSES.has(normalizeComparableText(activeReplacement.replacementstatus))) {
                throw new Error("An active replacement flow exists for this ticket. Finish or reject the replacement before returning the asset.");
            }
            const linkedAssetStatus = normalizeComparableText(context.linkedorderline.rentalassetstatus);
            const ticketRentalActionStatus = normalizeComparableText(context.ticket.rentalactionstatus);
            if (context.linkedorderline.isactivebillingline === false ||
                linkedAssetStatus === RETURNED_ACTION_STATUS ||
                ticketRentalActionStatus === RETURNED_ACTION_STATUS ||
                normalizeComparableText(context.linkedorderline.rentalcontractstatus) ===
                    RENTAL_CONTRACT_STATUS_COMPLETED) {
                throw new Error("This rental asset has already been returned.");
            }
            const expectedOldAssetNumber = normalizeText(context.linkedorderline.assetnumber ?? context.ticket.assetnumber);
            if (expectedOldAssetNumber &&
                normalizeComparableText(oldassetnumber) !==
                    normalizeComparableText(expectedOldAssetNumber)) {
                throw new Error(`Old asset number mismatch. Expected ${expectedOldAssetNumber}.`);
            }
            const returnEpoch = returneddate ?? Math.trunc(Date.now() / 1000);
            await client.query("BEGIN");
            transactionStarted = true;
            const returnResult = await processRentalReturn({
                executor: client,
                context,
                ticketId,
                oldAssetNumber: oldassetnumber,
                returnedAt: returnEpoch,
                remarks,
                createdBy: request.session?.id ?? null,
            });
            await client.query("COMMIT");
            transactionStarted = false;
            return {
                message: "Rental asset returned successfully.",
                ticket: returnResult.ticket,
                history: returnResult.history,
                stock: returnResult.stock,
                orderline: returnResult.orderline,
                agreement: returnResult.agreement,
                agreementasset: returnResult.agreementAsset,
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN returnRentalAsset", error);
            throw new Error(error?.message || "Failed to return the rental asset.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.markRentalAssetLost = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const oldassetnumber = normalizeText(request.body?.oldassetnumber);
            const lostdate = toOptionalPositiveBigInt(request.body?.lostdate);
            const reason = normalizeText(request.body?.reason);
            const remarks = normalizeText(request.body?.remarks);
            if (!oldassetnumber) {
                throw new Error("Old asset number is required.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            if (normalizeComparableText(context.ticket?.rentalactiontype) !== "lost") {
                throw new Error("This ticket is not marked as a Lost rental request.");
            }
            const activeReplacement = await getActiveReplacementRecord(client, context, ticketId);
            if (activeReplacement &&
                !FINAL_REPLACEMENT_STATUSES.has(normalizeComparableText(activeReplacement.replacementstatus))) {
                throw new Error("An active replacement flow exists for this ticket. Finish or reject the replacement before marking the asset as lost.");
            }
            const linkedAssetStatus = normalizeComparableText(context.linkedorderline.rentalassetstatus);
            if (linkedAssetStatus === "lost" ||
                linkedAssetStatus === "returned" ||
                linkedAssetStatus === "damaged_non_returnable") {
                throw new Error("This rental asset already has a terminal lifecycle status and cannot be marked lost again.");
            }
            const expectedOldAssetNumber = normalizeText(context.linkedorderline.assetnumber ?? context.ticket.assetnumber);
            if (expectedOldAssetNumber &&
                normalizeComparableText(oldassetnumber) !==
                    normalizeComparableText(expectedOldAssetNumber)) {
                throw new Error(`Old asset number mismatch. Expected ${expectedOldAssetNumber}.`);
            }
            const lossEpoch = lostdate ?? Math.trunc(Date.now() / 1000);
            await client.query("BEGIN");
            transactionStarted = true;
            const lostResult = await processRentalLost({
                executor: client,
                context,
                ticketId,
                oldAssetNumber: oldassetnumber,
                lostAt: lossEpoch,
                reason,
                remarks,
                createdBy: request.session?.id ?? null,
            });
            await client.query("COMMIT");
            transactionStarted = false;
            const affectedPuc = normalizeText(lostResult.stock?.puc);
            if (affectedPuc) {
                try {
                    await stockRevoService.updateQuantity([affectedPuc], 0, false, true);
                }
                catch (refreshError) {
                    console.error("Rental lost quantity refresh failed after commit:", refreshError);
                }
            }
            return {
                message: "Rental asset marked as lost successfully.",
                ticket: lostResult.ticket,
                history: lostResult.history,
                stock: lostResult.stock,
                orderline: lostResult.orderline,
                agreement: lostResult.agreement,
                agreementasset: lostResult.agreementAsset,
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN markRentalAssetLost", error);
            throw new Error(error?.message || "Failed to mark the rental asset as lost.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.generateRentalLossDeclaration = async (request) => {
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            const agreementId = context.linkedorderline?.agreementid != null
                ? Number(context.linkedorderline.agreementid)
                : context.ticket?.agreementid != null
                    ? Number(context.ticket.agreementid)
                    : null;
            if (agreementId == null) {
                throw new Error("No rental agreement is linked to this lost asset.");
            }
            if (context.linkedagreement?.lossdeclarationfinalizedat) {
                throw new Error("Loss declaration has already been finalized. Regeneration is disabled.");
            }
            const linkedAssetStatus = normalizeComparableText(context.linkedorderline?.rentalassetstatus);
            const rentalActionType = normalizeComparableText(context.ticket?.rentalactiontype);
            const rentalActionStatus = normalizeComparableText(context.ticket?.rentalactionstatus);
            if (rentalActionType !== "lost" &&
                linkedAssetStatus !== "lost" &&
                rentalActionStatus !== "lost_confirmed") {
                throw new Error("Loss declaration is available only after the rental asset is marked as lost.");
            }
            await rentalAgreementService.refreshRentalAgreementPdfById(agreementId, {
                modifiedBy: request.session?.id ?? null,
                lesseeSignatoryName: normalizeText(request.body?.lesseesignatoryname),
                lesseeSignatoryDesignation: normalizeText(request.body?.lesseesignatorydesignation),
                annexure3: {
                    declarationDate: toOptionalPositiveBigInt(request.body?.declarationdate) ??
                        Math.trunc(Date.now() / 1000),
                    incidentDate: toOptionalPositiveBigInt(request.body?.incidentdate) ??
                        context.currentstock?.lostdate ??
                        null,
                    incidentTime: normalizeText(request.body?.incidenttime),
                    incidentLocation: normalizeText(request.body?.incidentlocation),
                    circumstances: normalizeText(request.body?.circumstances) ??
                        normalizeText(context.currentstock?.lostreason) ??
                        null,
                    firNcNumber: normalizeText(request.body?.firncnumber),
                    policeStation: normalizeText(request.body?.policestation),
                    firNcFilingDate: toOptionalPositiveBigInt(request.body?.firncfilingdate),
                },
            });
            return {
                message: "Rental loss declaration generated successfully.",
                agreement: await rentalAgreementService.getRentalAgreementById({
                    params: { id: agreementId },
                }),
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            console.error("Query Execution Error: IN generateRentalLossDeclaration", error);
            throw new Error(error?.message || "Failed to generate the rental loss declaration.");
        }
    };
    ticketReplacementService.finalizeRentalLossDeclaration = async (request) => {
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            const agreementId = context.linkedorderline?.agreementid != null
                ? Number(context.linkedorderline.agreementid)
                : context.ticket?.agreementid != null
                    ? Number(context.ticket.agreementid)
                    : null;
            if (agreementId == null) {
                throw new Error("No rental agreement is linked to this lost asset.");
            }
            if (!context.linkedagreement?.lossdeclarationgenerated) {
                throw new Error("Generate the loss declaration before finalizing Annexure III.");
            }
            if (context.linkedagreement?.lossdeclarationfinalizedat) {
                return {
                    message: "Rental loss declaration is already finalized.",
                    agreement: await rentalAgreementService.getRentalAgreementById({
                        params: { id: agreementId },
                    }),
                    context,
                };
            }
            await rentalAgreementService.refreshRentalAgreementPdfById(agreementId, {
                modifiedBy: request.session?.id ?? null,
                annexure3: {
                    finalizedAt: Math.trunc(Date.now() / 1000),
                    finalizedBy: normalizeText(request.session?.name) ??
                        normalizeText(request.session?.username) ??
                        normalizeText(request.session?.email) ??
                        normalizeText(request.session?.id),
                },
            });
            return {
                message: "Rental loss declaration finalized successfully.",
                agreement: await rentalAgreementService.getRentalAgreementById({
                    params: { id: agreementId },
                }),
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            console.error("Query Execution Error: IN finalizeRentalLossDeclaration", error);
            throw new Error(error?.message || "Failed to finalize the rental loss declaration.");
        }
    };
    ticketReplacementService.assessRentalDamage = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const oldassetnumber = normalizeText(request.body?.oldassetnumber);
            const damageassessment = normalizeComparableText(request.body?.damageassessment);
            const damageddate = toOptionalPositiveBigInt(request.body?.damageddate);
            const reason = normalizeText(request.body?.reason);
            const remarks = normalizeText(request.body?.remarks);
            if (!oldassetnumber) {
                throw new Error("Old asset number is required.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            if (normalizeComparableText(context.ticket?.rentalactiontype) !== "damaged") {
                throw new Error("This ticket is not marked as a Damaged rental request.");
            }
            const activeReplacement = await getActiveReplacementRecord(client, context, ticketId);
            if (activeReplacement &&
                !FINAL_REPLACEMENT_STATUSES.has(normalizeComparableText(activeReplacement.replacementstatus))) {
                throw new Error("An active replacement flow exists for this ticket. Finish or reject the replacement before assessing damage.");
            }
            const linkedAssetStatus = normalizeComparableText(context.linkedorderline.rentalassetstatus);
            if (linkedAssetStatus === "returned" ||
                linkedAssetStatus === "lost" ||
                linkedAssetStatus === "damaged_non_returnable") {
                throw new Error("This rental asset already has a terminal lifecycle status and cannot be assessed again.");
            }
            const expectedOldAssetNumber = normalizeText(context.linkedorderline.assetnumber ?? context.ticket.assetnumber);
            if (expectedOldAssetNumber &&
                normalizeComparableText(oldassetnumber) !==
                    normalizeComparableText(expectedOldAssetNumber)) {
                throw new Error(`Old asset number mismatch. Expected ${expectedOldAssetNumber}.`);
            }
            const damageEpoch = damageddate ?? Math.trunc(Date.now() / 1000);
            await client.query("BEGIN");
            transactionStarted = true;
            const damageResult = await processRentalDamageAssessment({
                executor: client,
                context,
                ticketId,
                oldAssetNumber: oldassetnumber,
                assessment: damageassessment,
                damagedAt: damageEpoch,
                reason,
                remarks,
                createdBy: request.session?.id ?? null,
            });
            await client.query("COMMIT");
            transactionStarted = false;
            return {
                message: damageassessment === "non_returnable"
                    ? "Rental asset marked as non-returnable damage successfully."
                    : "Rental asset damage assessment saved successfully.",
                ticket: damageResult.ticket,
                history: damageResult.history,
                stock: damageResult.stock,
                orderline: damageResult.orderline,
                agreement: damageResult.agreement,
                agreementasset: damageResult.agreementAsset,
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN assessRentalDamage", error);
            throw new Error(error?.message || "Failed to assess rental asset damage.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.linkPenaltyInvoice = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const penaltyinvoiceid = toPositiveInteger(request.body?.penaltyinvoiceid);
            const penaltyamount = Number(request.body?.penaltyamount);
            const penaltytype = normalizeComparableText(request.body?.penaltytype);
            const remarks = normalizeText(request.body?.remarks);
            if (!Number.isFinite(penaltyamount) || penaltyamount <= 0) {
                throw new Error("Penalty amount must be a positive number.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            await client.query("BEGIN");
            transactionStarted = true;
            const penaltyResult = await linkRentalPenaltyInvoice({
                executor: client,
                context,
                ticketId,
                penaltyInvoiceId: penaltyinvoiceid,
                penaltyAmount: penaltyamount,
                remarks,
                createdBy: request.session?.id ?? null,
                penaltyType: penaltytype || null,
            });
            await client.query("COMMIT");
            transactionStarted = false;
            return {
                message: "Penalty invoice linked successfully.",
                ticket: penaltyResult.ticket,
                history: penaltyResult.history,
                penaltylink: penaltyResult.penaltylink,
                penaltyinvoice: penaltyResult.penaltyinvoice,
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN linkPenaltyInvoice", error);
            throw new Error(error?.message || "Failed to link the penalty invoice.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.renewRentalContract = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const requestedrenewaldate = request.body?.requestedrenewaldate;
            const approvedrenewaldate = request.body?.approvedrenewaldate ?? requestedrenewaldate;
            const remarks = normalizeText(request.body?.remarks);
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            if (normalizeComparableText(context.ticket?.rentalactiontype) !== "renewal") {
                throw new Error("This ticket is not marked as a Renewal rental request.");
            }
            if (context.linkedorderline?.isactivebillingline === false) {
                throw new Error("Only active rental billing lines can be renewed.");
            }
            const linkedAssetStatus = normalizeComparableText(context.linkedorderline.rentalassetstatus);
            if (linkedAssetStatus === "returned" ||
                linkedAssetStatus === "lost" ||
                linkedAssetStatus === "damaged_non_returnable") {
                throw new Error("This rental asset already has a terminal lifecycle status and cannot be renewed.");
            }
            await client.query("BEGIN");
            transactionStarted = true;
            const renewalResult = await processRentalRenewal({
                executor: client,
                context,
                ticketId,
                requestedRenewalDate: requestedrenewaldate,
                approvedRenewalDate: approvedrenewaldate,
                remarks,
                createdBy: request.session?.id ?? null,
            });
            await client.query("COMMIT");
            transactionStarted = false;
            let agreementWarning = null;
            const agreementId = renewalResult?.agreement?.id ??
                (context.linkedorderline.agreementid != null
                    ? Number(context.linkedorderline.agreementid)
                    : null);
            if (agreementId != null) {
                try {
                    await rentalAgreementService.refreshRentalAgreementPdfById(agreementId, {
                        modifiedBy: request.session?.id ?? null,
                    });
                }
                catch (agreementPdfError) {
                    console.error("Renewal agreement PDF refresh failed", agreementPdfError);
                    agreementWarning =
                        agreementPdfError?.message ||
                            "Renewal was completed, but the agreement PDF could not be refreshed.";
                }
            }
            return {
                message: agreementWarning
                    ? "Rental contract renewed with agreement PDF warning."
                    : "Rental contract renewed successfully.",
                warning: agreementWarning,
                ticket: renewalResult.ticket,
                history: renewalResult.history,
                orderline: renewalResult.orderline,
                agreement: renewalResult.agreement,
                agreementasset: renewalResult.agreementAsset,
                rentalactionstatus: RENEWED_ACTION_STATUS,
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN renewRentalContract", error);
            throw new Error(error?.message || "Failed to renew the rental contract.");
        }
        finally {
            client.release();
        }
    };
    ticketReplacementService.stopRental = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const ticketId = toPositiveInteger(request.params.id);
            const stoprentalfinancialmode = normalizeComparableText(request.body?.stoprentalfinancialmode);
            const effectivefrom = toOptionalPositiveBigInt(request.body?.effectivefrom);
            const remarks = normalizeText(request.body?.remarks);
            if (!STOP_RENTAL_FINANCIAL_MODES.has(stoprentalfinancialmode)) {
                throw new Error("Stop rental financial mode must be no_refund, prorated_refund_credit, or manual_finance_decision.");
            }
            const context = await buildReplacementContext(ticketId);
            if (!context.linkedorderline) {
                throw new Error("Unable to resolve the active rental contract for this ticket.");
            }
            const activeReplacement = await getActiveReplacementRecord(client, context, ticketId);
            if (!activeReplacement) {
                throw new Error("Initiate rental replacement before stopping the rental contract.");
            }
            const replacementStatus = normalizeComparableText(activeReplacement.replacementstatus);
            if (FINAL_REPLACEMENT_STATUSES.has(replacementStatus)) {
                throw new Error("This replacement flow is already closed.");
            }
            if (replacementStatus !== OLD_ASSET_RECEIVED_STATUS) {
                throw new Error("Receive the old asset before stopping the rental contract.");
            }
            if (context.ticket.stoprental === true) {
                throw new Error("Rental is already stopped for this ticket.");
            }
            if (context.linkedorderline.isactivebillingline === false) {
                throw new Error("No active billing line is available to stop for this ticket.");
            }
            const stopEpoch = effectivefrom ?? toEpochSeconds(new Date());
            await client.query("BEGIN");
            transactionStarted = true;
            const stopResult = await stopActiveRentalContract(client, context, ticketId, stopEpoch, {
                holdAsset: true,
                holdReason: STOP_RENTAL_HOLD_REASON,
            });
            const updatedHistoryResult = await client.query(`
          UPDATE rental_replacement_history
          SET
            replacementstatus = $1,
            stoprental = TRUE,
            stoprentalfinancialmode = $2,
            effectivefrom = COALESCE($3, effectivefrom),
            remarks = COALESCE($4, remarks)
          WHERE id = $5
          RETURNING *
        `, [
                COMPLETED_REPLACEMENT_STATUS,
                stoprentalfinancialmode,
                stopEpoch,
                remarks,
                activeReplacement.id,
            ]);
            const updatedTicketResult = await client.query(`
          UPDATE tickets
          SET
            stoprental = TRUE,
            replacementstatus = $1,
            ticketstatus = $2,
            closeddate = $3
          WHERE id = $4
          RETURNING *
        `, [
                COMPLETED_REPLACEMENT_STATUS,
                RESOLVED_CLOSED_TICKET_STATUS,
                stopEpoch,
                ticketId,
            ]);
            await client.query("COMMIT");
            transactionStarted = false;
            return {
                message: "Rental stopped successfully.",
                ticket: updatedTicketResult.rows[0],
                replacement: updatedHistoryResult.rows[0],
                stock: stopResult.stock,
                orderline: stopResult.orderline,
                context: await buildReplacementContext(ticketId),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN stopRental", error);
            throw new Error(error?.message || "Failed to stop the rental contract.");
        }
        finally {
            client.release();
        }
    };
})(ticketReplacementService || (ticketReplacementService = {}));
//# sourceMappingURL=ticketReplacement.service.js.map