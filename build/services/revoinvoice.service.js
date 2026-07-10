import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js";
import { sendTransactionalMail } from "../Gmail/gmail.js";
import emailTemplates from "../utils/emailtemplates/emailtemplate.js";
import { accessScopeService } from "./accessScope.service.js";
// ─── Email Helpers (Internal) ───────────────────────────────────────────────
const fireInvoiceReadyEmail = async (ticketnumber, invoiceurl) => {
    try {
        const result = await query(`
            SELECT u.useremail 
            FROM tickets t
            JOIN users u ON t.userid = u.id
            WHERE t.ticketnumber = $1
            LIMIT 1
        `, [ticketnumber]);
        if (result.rows.length > 0 && result.rows[0].useremail) {
            const customer = result.rows[0];
            const t = emailTemplates.tickets.invoice_ready;
            await sendTransactionalMail({
                to: customer.useremail,
                subject: t.subject.replace('{ticketNumber}', ticketnumber),
                text: t.text
                    .replace('{ticketNumber}', ticketnumber)
                    .replace('{invoiceUrl}', invoiceurl || 'N/A')
            });
        }
    }
    catch (e) {
        console.error('[fireInvoiceReadyEmail] Error:', e?.message || e);
    }
};
const normalizeText = (value) => String(value ?? "")
    .trim()
    .toLowerCase();
const normalizeInvoiceItemName = (value) => normalizeText(value)
    .replace(/\.\.\.$/, "")
    .trim();
const normalizeInvoiceData = (invoiceData) => {
    if (!invoiceData || typeof invoiceData === "object") {
        return invoiceData;
    }
    try {
        return JSON.parse(invoiceData);
    }
    catch {
        return invoiceData;
    }
};
const shouldEnrichRentalAssets = (invoiceForQuery) => {
    const invoiceForValues = Array.isArray(invoiceForQuery)
        ? invoiceForQuery
        : invoiceForQuery != null
            ? [invoiceForQuery]
            : [];
    return invoiceForValues.some((value) => {
        const normalized = normalizeText(value);
        return normalized === "rental" || normalized === "product rental";
    });
};
const enrichRentalInvoiceAssets = async (invoiceRows) => {
    if (!Array.isArray(invoiceRows) || invoiceRows.length === 0) {
        return invoiceRows;
    }
    const orderIds = Array.from(new Set(invoiceRows
        .map((invoice) => invoice?.orderid)
        .filter((orderId) => orderId != null && String(orderId).trim() !== "")
        .map((orderId) => String(orderId))));
    if (orderIds.length === 0) {
        return invoiceRows;
    }
    const orderlineResult = await query(`
        SELECT
            uniqueorderid,
            id AS orderlineid,
            orderlinenumber,
            productid,
            productname,
            assetnumber
        FROM orderline
        WHERE uniqueorderid = ANY($1::text[])
          AND LOWER(COALESCE(ordername, '')) = 'rental'
        ORDER BY uniqueorderid, id
        `, [orderIds]);
    const assetsByOrderId = new Map();
    orderlineResult.rows.forEach((row) => {
        const key = String(row.uniqueorderid);
        const rows = assetsByOrderId.get(key) || [];
        rows.push(row);
        assetsByOrderId.set(key, rows);
    });
    return invoiceRows.map((invoice) => {
        const rentalAssets = assetsByOrderId.get(String(invoice?.orderid)) || [];
        const assetNumbers = Array.from(new Set(rentalAssets
            .map((asset) => asset.assetnumber)
            .filter((assetNumber) => assetNumber != null && String(assetNumber).trim() !== "")));
        const normalizedInvoiceData = normalizeInvoiceData(invoice?.invoicedata);
        const invoiceData = normalizedInvoiceData && typeof normalizedInvoiceData === "object"
            ? { ...normalizedInvoiceData }
            : normalizedInvoiceData;
        if (invoiceData && Array.isArray(invoiceData.items)) {
            const usedAssetIndexes = new Set();
            invoiceData.items = invoiceData.items.map((item, itemIndex) => {
                const itemName = normalizeInvoiceItemName(item?.name || item?.productname);
                let matchedAssetIndex = rentalAssets.findIndex((asset, assetIndex) => {
                    if (usedAssetIndexes.has(assetIndex))
                        return false;
                    const assetProductName = normalizeInvoiceItemName(asset.productname);
                    return (itemName &&
                        assetProductName &&
                        (itemName === assetProductName ||
                            itemName.startsWith(assetProductName) ||
                            assetProductName.startsWith(itemName)));
                });
                if (matchedAssetIndex === -1 && rentalAssets.length === invoiceData.items.length) {
                    matchedAssetIndex = itemIndex;
                }
                const matchedAsset = matchedAssetIndex >= 0 ? rentalAssets[matchedAssetIndex] : null;
                if (matchedAssetIndex >= 0) {
                    usedAssetIndexes.add(matchedAssetIndex);
                }
                return {
                    ...item,
                    assetnumber: item?.assetnumber ?? matchedAsset?.assetnumber ?? null,
                    orderlineid: item?.orderlineid ?? matchedAsset?.orderlineid ?? null,
                    orderlinenumber: item?.orderlinenumber ?? matchedAsset?.orderlinenumber ?? null,
                };
            });
        }
        return {
            ...invoice,
            assetnumber: invoice?.assetnumber ?? (assetNumbers.join(", ") || null),
            assetnumbers: assetNumbers,
            orderlineassets: rentalAssets,
            invoicedata: invoiceData,
        };
    });
};
export var revoinvoiceservice;
(function (revoinvoiceservice) {
    revoinvoiceservice.getRentalAssetCountsByCustomerIds = async (customerIds, options = {}) => {
        const normalizedCustomerIds = Array.from(new Set(customerIds
            .map((customerId) => Number(customerId))
            .filter((customerId) => Number.isFinite(customerId) && customerId > 0)
            .map((customerId) => Math.trunc(customerId))));
        if (normalizedCustomerIds.length === 0) {
            return {};
        }
        const invoiceForValues = options.invoiceForValues && options.invoiceForValues.length > 0
            ? options.invoiceForValues.map((value) => normalizeText(value)).filter(Boolean)
            : ["rental"];
        const invoiceResult = await query(`
            SELECT *
            FROM revoinvoice
            WHERE customerid = ANY($1::int[])
              AND LOWER(COALESCE(invoicefor, '')) = ANY($2::text[])
            ORDER BY customerid, modifieddate DESC NULLS LAST, id DESC
            `, [normalizedCustomerIds, invoiceForValues]);
        const enrichedInvoices = await enrichRentalInvoiceAssets(invoiceResult.rows);
        const assetKeysByCustomer = new Map();
        const sequenceByCustomer = new Map();
        enrichedInvoices.forEach((invoice) => {
            const customerId = Number(invoice?.customerid);
            if (!Number.isFinite(customerId)) {
                return;
            }
            if (!assetKeysByCustomer.has(customerId)) {
                assetKeysByCustomer.set(customerId, new Set());
                sequenceByCustomer.set(customerId, 0);
            }
            const invoiceData = normalizeInvoiceData(invoice?.invoicedata);
            const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
            const invoiceAssetNumbers = Array.isArray(invoice?.assetnumbers) ? invoice.assetnumbers : [];
            items.forEach((item) => {
                const nextSequence = (sequenceByCustomer.get(customerId) || 0) + 1;
                sequenceByCustomer.set(customerId, nextSequence);
                const rawStatus = item?.status ||
                    invoice?.orderstatus ||
                    invoice?.status ||
                    invoice?.rentalassetstatus ||
                    invoice?.invoicefor;
                const normalizedStatus = normalizeText(rawStatus);
                const statusForCount = !normalizedStatus ||
                    normalizedStatus === "rental" ||
                    normalizedStatus === "product rental"
                    ? "active"
                    : normalizedStatus;
                if (options.activeOnly && !statusForCount.includes("active")) {
                    return;
                }
                const assetNumber = item?.assetnumber ||
                    item?.assetNumber ||
                    (items.length === 1 ? invoice?.assetnumber : "") ||
                    (invoiceAssetNumbers.length === 1 ? invoiceAssetNumbers[0] : "") ||
                    "";
                const productName = item?.name || item?.productname || `Item #${nextSequence}`;
                const assetKey = assetNumber ||
                    item?.orderlineid ||
                    item?.orderlinenumber ||
                    `${invoice?.orderid || "order"}-${normalizeText(productName)}-${nextSequence}`;
                assetKeysByCustomer.get(customerId)?.add(String(assetKey));
            });
        });
        return Object.fromEntries(normalizedCustomerIds.map((customerId) => [
            customerId,
            assetKeysByCustomer.get(customerId)?.size || 0,
        ]));
    };
    revoinvoiceservice.getRevoInvoiceData = async (request) => {
        try {
            const pageNumber = parseInt(request.query.page) || 1;
            const recordCount = parseInt(request.query.count) || 5000;
            const keys = Object.keys(request.query);
            const values = Object.values(request.query);
            let whereClauses = [];
            let parameterIndex = 1;
            const queryParams = [];
            let orderByField = "modifieddate";
            let orderByDirection = "DESC";
            keys.forEach((key, index) => {
                const paramValues = Array.isArray(values[index]) ? values[index] : [values[index]];
                if (key === "sortby") {
                    const [fieldName, direction] = paramValues[0].split("-");
                    orderByField = fieldName;
                    orderByDirection = direction.toUpperCase() === "ASC" ? "ASC" : "DESC";
                }
                else if (paramValues[0].startsWith("NOT ")) {
                    const cleanValue = paramValues[0].slice(4);
                    whereClauses.push(`(${key} != $${parameterIndex})`);
                    queryParams.push(cleanValue);
                    parameterIndex++;
                }
                else if (key !== "page" && key !== "count") {
                    const clauses = paramValues.map((_, idx) => `${key} = $${parameterIndex + idx}`);
                    whereClauses.push(`(${clauses.join(" OR ")})`);
                    queryParams.push(...paramValues);
                    parameterIndex += paramValues.length;
                }
            });
            parameterIndex = await accessScopeService.appendVendorCustomerColumnScope(request, whereClauses, queryParams, parameterIndex, { tableAlias: "revoinvoice", customerColumn: "customerid" });
            const offset = (pageNumber - 1) * recordCount;
            const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : '';
            const orderByClause = `ORDER BY ${orderByField} ${orderByDirection}`;
            let queryText = `SELECT * FROM revoinvoice ${whereClause} ${orderByClause}`;
            if (pageNumber && recordCount) {
                queryText += ` OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
                queryParams.push(offset, recordCount);
            }
            const result = await query(queryText, queryParams);
            let datatypeCheckResult = await dataTypeCheck(result);
            if (shouldEnrichRentalAssets(request.query.invoicefor)) {
                datatypeCheckResult = await enrichRentalInvoiceAssets(datatypeCheckResult);
            }
            return datatypeCheckResult;
        }
        catch (error) {
            console.error("Query Execution Error: IN getRevoInvoiceData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    revoinvoiceservice.generaterevoinvoice = async (request, invoicedata, reply) => {
        try {
            let invoicefor = invoicedata[0].invoicefor;
            let template = '';
            if (invoicefor === 'product' || invoicefor === 'penalty') {
                template = "invoice/revoinvoiceproduct.docx";
            }
            else if (invoicefor === 'service') {
                template = "invoice/revoinvoiceservice.docx";
            }
            else {
                return 'Without Invoice Type you cannot create Invoice';
            }
            let result = await GenerateDocx(request, invoicedata, template);
            result.invoiceUrl = result.fileurl;
            delete result.fileurl;
            let data = {
                id: result.id,
                invoiceurl: result.invoiceUrl
            };
            let insertFileinvoice = await revoinvoiceservice.upsertRevoInvoice(data);
            if (insertFileinvoice.command === "UPDATE" || insertFileinvoice.command === "INSERT") {
                reply.send(result.invoiceUrl);
            }
            else {
                reply.status(404).send("File not inserted.So Please Contact Admin");
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN generaterevoinvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    revoinvoiceservice.upsertRevoInvoice = async (invoicedata) => {
        try {
            console.log('In upsertRevoInvoice with data:', invoicedata);
            console.log('Stop');
            let querydata;
            let params;
            const { id, product, ...upsertFields } = invoicedata;
            if (product) {
                upsertFields.product = JSON.stringify(product);
            }
            const fieldNames = Object.keys(upsertFields);
            const fieldValues = Object.values(upsertFields);
            console.log('-->', fieldNames);
            console.log('-->', fieldValues);
            console.log('Wait');
            if (id) {
                console.log('inside if');
                querydata = `UPDATE revoinvoice SET ${fieldNames
                    .map((field, index) => `${field} = $${index + 1}`)
                    .join(", ")} WHERE id = $${fieldNames.length + 1} RETURNING *`;
                params = [...fieldValues, id];
            }
            else {
                console.log('inside else');
                querydata = `INSERT INTO revoinvoice (${fieldNames.join(", ")}) VALUES (${fieldNames
                    .map((_, index) => `$${index + 1}`)
                    .join(", ")}) RETURNING *`;
                params = fieldValues;
            }
            const result = await query(querydata, params);
            console.log(result, "result in upsertRevoInvoice");
            if (result && result.rows.length > 0) {
                const row = result.rows[0];
                if (row.invoicefor === 'service' && row.ticketnumber && row.invoiceurl) {
                    await fireInvoiceReadyEmail(row.ticketnumber, row.invoiceurl);
                }
            }
            return result;
        }
        catch (error) {
            console.error("Query Execution Error: IN upsertRevoInvoice", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(revoinvoiceservice || (revoinvoiceservice = {}));
//# sourceMappingURL=revoinvoice.service.js.map