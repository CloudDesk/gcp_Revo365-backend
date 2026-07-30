import pool, { query } from "../database/postgres.js";
import dataTypeCheck from "../utils/Datatype/checkDatatype.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js";
import { sendTransactionalMail } from "../Gmail/gmail.js";
import emailTemplates from "../utils/emailtemplates/emailtemplate.js";
import { productrevoService } from "./productrevo.service.js";
import { canRestoreApprovedServiceStock, getServiceEstimationStockPersistencePlan, } from "./serviceEstimationStockPolicy.js";
import { getServiceEstimationAssetAllocationPlan, isSingleAssetServiceEstimationUnit, SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES, } from "./serviceEstimationStockEligibility.js";
import { getServiceEstimationTaxContext, resolveServiceEstimationCustomerState, SERVICE_ESTIMATION_GST_RATE, } from "./serviceEstimationTaxPolicy.js";
const GST_RATE = SERVICE_ESTIMATION_GST_RATE;
const AVAILABLE_STOCK_STATUS = "Available";
const SERVICE_HOLD_STOCK_STATUS = "Service Hold";
const SOLD_STOCK_STATUS = "Sold";
const COST_ESTIMATION_HOLD_REASON = "cost_estimation";
const ESTIMATION_FIELDS = new Set([
    "ticketnumber",
    "estimationurl",
    "estimationstatus",
    "approvalcomments",
    "productdata",
    "productcgst",
    "productsgst",
    "productigst",
    "producttaxamount",
    "producttotal",
    "servicedata",
    "servicecgst",
    "servicesgst",
    "serviceigst",
    "servicetds",
    "servicetype",
    "servicetaxamount",
    "servicetotal",
    "totalpayableamount",
    "customerstate",
    "taxtype",
]);
const ESTIMATION_FILTER_FIELDS = new Set([
    ...ESTIMATION_FIELDS,
    "id",
    "createddate",
    "modifieddate",
]);
const ESTIMATION_SORT_FIELDS = new Set([
    "id",
    "createddate",
    "modifieddate",
    "ticketnumber",
    "totalpayableamount",
    "estimationstatus",
]);
const validationError = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const asNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const asStoredNumber = (value, fallback = 0) => value === null || value === undefined || value === ""
    ? fallback
    : asNumber(value, fallback);
const asTaxRate = (value, fallback, fieldLabel) => {
    if (value === null || value === undefined || value === "")
        return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > GST_RATE) {
        throw validationError(`${fieldLabel} must be between 0 and ${GST_RATE}`);
    }
    return parsed;
};
const asNonNegativeAmount = (value, fallback, fieldLabel) => {
    if (value === null || value === undefined || value === "")
        return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw validationError(`${fieldLabel} cannot be negative`);
    }
    return roundMoney(parsed);
};
const asPositiveInteger = (value, fieldLabel) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw validationError(`${fieldLabel} must be a whole number greater than zero`);
    }
    return parsed;
};
const parseCollection = (value) => {
    if (Array.isArray(value))
        return value;
    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            throw validationError("Product or service rows contain invalid JSON");
        }
    }
    return [];
};
const isTruthyDatabaseFlag = (value) => value === true || value === 1 || value === "1" || value === "true";
const getTicketContext = async (ticketnumber) => {
    const result = await query(`SELECT
            t.id,
            t.ticketnumber,
            t.walkintickets,
            t.proceedwithvalueservice,
            t.servicetype,
            t.addressid,
            t.location,
            ticket_address.state AS ticketaddressstate,
            latest_customer_address.state AS latestcustomeraddressstate
         FROM tickets t
         LEFT JOIN address ticket_address ON ticket_address.id = t.addressid
         LEFT JOIN LATERAL (
            SELECT customer_address.state
            FROM address customer_address
            WHERE customer_address.userid = t.userid
            ORDER BY
                customer_address.modifieddate DESC NULLS LAST,
                customer_address.id DESC
            LIMIT 1
         ) latest_customer_address ON TRUE
         WHERE t.ticketnumber = $1
         LIMIT 1`, [ticketnumber]);
    if (!result.rows[0]) {
        throw validationError(`Ticket ${ticketnumber} was not found`);
    }
    const ticketContext = result.rows[0];
    return {
        ...ticketContext,
        customerstate: resolveServiceEstimationCustomerState(ticketContext.ticketaddressstate, ticketContext.latestcustomeraddressstate),
    };
};
const getExistingEstimation = async (id) => {
    if (!id)
        return null;
    const result = await query("SELECT * FROM servicecostestimation WHERE id = $1 LIMIT 1", [id]);
    if (!result.rows[0]) {
        throw validationError(`Cost estimation ${id} was not found`);
    }
    return result.rows[0];
};
const getProductsByIds = async (productIds) => {
    if (productIds.length === 0)
        return new Map();
    const result = await query(`SELECT
            product.id,
            product.puc,
            product.productname,
            product.hsncode,
            product.price,
            COUNT(stock.id)::int AS availablequantity
         FROM product_revo product
         LEFT JOIN stock_revo stock
           ON stock.puc = product.puc
          AND stock.stockstatus = $2
          AND stock.stocktype = ANY($3::text[])
          AND NULLIF(
                BTRIM(COALESCE(stock.rfid::text, stock.assetnumber::text)),
                ''
          ) IS NOT NULL
          AND (stock.isdeleted = FALSE OR stock.isdeleted IS NULL)
          AND (stock.isarchive = FALSE OR stock.isarchive IS NULL)
          AND (
                stock.removefromrecyclebin = FALSE
                OR stock.removefromrecyclebin IS NULL
          )
          AND (stock.ewaste = FALSE OR stock.ewaste IS NULL)
         WHERE product.id = ANY($1::int[])
           AND (product.isarchive = FALSE OR product.isarchive IS NULL)
           AND (product.isdeleted = FALSE OR product.isdeleted IS NULL)
           AND (
                product.removefromrecyclebin = FALSE
                OR product.removefromrecyclebin IS NULL
           )
         GROUP BY
            product.id,
            product.puc,
            product.productname,
            product.hsncode,
            product.price`, [
        productIds,
        AVAILABLE_STOCK_STATUS,
        [...SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES],
    ]);
    return new Map(result.rows.map((product) => [Number(product.id), product]));
};
const getEligibleAssetsByIds = async (stockIds) => {
    if (stockIds.length === 0)
        return new Map();
    const result = await query(`SELECT
            id,
            puc,
            BTRIM(COALESCE(rfid::text, assetnumber::text)) AS assetnumber
         FROM stock_revo
         WHERE id = ANY($1::int[])
           AND stockstatus = $2
           AND stocktype = ANY($3::text[])
           AND NULLIF(
                BTRIM(COALESCE(rfid::text, assetnumber::text)),
                ''
           ) IS NOT NULL
           AND (isdeleted = FALSE OR isdeleted IS NULL)
           AND (isarchive = FALSE OR isarchive IS NULL)
           AND (
                removefromrecyclebin = FALSE
                OR removefromrecyclebin IS NULL
           )
           AND (ewaste = FALSE OR ewaste IS NULL)`, [
        stockIds,
        AVAILABLE_STOCK_STATUS,
        [...SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES],
    ]);
    return new Map(result.rows.map((stock) => [Number(stock.id), stock]));
};
const prepareProductRows = async (rows, requireSelectedProduct) => {
    const activeRows = rows.filter((row) => Boolean(row?.productid ||
        String(row?.productname ?? "").trim() ||
        String(row?.description ?? "").trim() ||
        asNumber(row?.unitprice) > 0));
    const productIds = activeRows
        .map((row) => Number(row?.productid))
        .filter((id) => Number.isInteger(id) && id > 0);
    const productMap = requireSelectedProduct
        ? await getProductsByIds([...new Set(productIds)])
        : new Map();
    const selectedAssetStockIds = activeRows
        .map((row) => Number(row?.assetstockid))
        .filter((id) => Number.isInteger(id) && id > 0);
    const selectedAssetMap = requireSelectedProduct
        ? await getEligibleAssetsByIds([...new Set(selectedAssetStockIds)])
        : new Map();
    const usedAssetStockIds = new Set();
    const preparedRows = activeRows.map((row, index) => {
        const productId = Number(row?.productid);
        const product = productMap.get(productId);
        const incomingAssetStockId = Number(row?.assetstockid);
        const hasSelectedAsset = Number.isInteger(incomingAssetStockId) && incomingAssetStockId > 0;
        const selectedAsset = hasSelectedAsset
            ? selectedAssetMap.get(incomingAssetStockId)
            : null;
        if (requireSelectedProduct && !product) {
            throw validationError(`Select a valid product in product row ${index + 1}`);
        }
        if (requireSelectedProduct && productId && !product) {
            throw validationError(`The selected product in row ${index + 1} is unavailable`);
        }
        if (requireSelectedProduct && !hasSelectedAsset) {
            throw validationError(`Select a valid available asset number in product row ${index + 1}`);
        }
        if (requireSelectedProduct &&
            hasSelectedAsset &&
            (!selectedAsset ||
                String(selectedAsset.puc) !== String(product?.puc))) {
            throw validationError(`Select a valid available asset number in product row ${index + 1}`);
        }
        if (hasSelectedAsset && usedAssetStockIds.has(incomingAssetStockId)) {
            throw validationError(`The same asset number cannot be selected more than once`);
        }
        if (hasSelectedAsset) {
            usedAssetStockIds.add(incomingAssetStockId);
        }
        const quantity = requireSelectedProduct
            ? asNumber(row?.quantity)
            : asPositiveInteger(row?.quantity ?? 1, `Product row ${index + 1} quantity`);
        if (requireSelectedProduct &&
            !isSingleAssetServiceEstimationUnit(quantity, incomingAssetStockId)) {
            throw validationError(`Product row ${index + 1} quantity must be 1 for the selected asset number`);
        }
        const availableQuantity = product
            ? Math.max(0, Math.floor(asNumber(product.availablequantity)))
            : Math.max(0, Math.floor(asNumber(row?.availablequantity, quantity)));
        if (requireSelectedProduct && product && quantity > availableQuantity) {
            throw validationError(`${product.productname} has only ${availableQuantity} available; requested ${quantity}`);
        }
        const unitPrice = asNumber(row?.unitprice, product ? asNumber(product.price) : 0);
        if (unitPrice < 0) {
            throw validationError(`Product row ${index + 1} unit price cannot be negative`);
        }
        const hsnCode = String(product?.hsncode ?? row?.hsncode ?? "").trim();
        if (requireSelectedProduct && !hsnCode) {
            throw validationError(`${product?.productname || `Product row ${index + 1}`} does not have an HSN code`);
        }
        return {
            id: index + 1,
            productid: product ? Number(product.id) : productId || null,
            puc: product?.puc ?? row?.puc ?? null,
            productname: product?.productname ?? row?.productname ?? "",
            description: String(row?.description ?? "").trim(),
            assetstockid: selectedAsset
                ? Number(selectedAsset.id)
                : hasSelectedAsset
                    ? incomingAssetStockId
                    : null,
            assetnumber: selectedAsset?.assetnumber ?? "",
            availablequantity: availableQuantity,
            quantity,
            hsncode: hsnCode,
            unitprice: roundMoney(unitPrice),
            totalamount: roundMoney(quantity * unitPrice),
        };
    });
    if (requireSelectedProduct) {
        const requestedByProduct = new Map();
        for (const row of preparedRows) {
            if (!row.productid)
                continue;
            requestedByProduct.set(row.productid, (requestedByProduct.get(row.productid) || 0) + row.quantity);
        }
        for (const [productId, requestedQuantity] of requestedByProduct.entries()) {
            const product = productMap.get(productId);
            const availableQuantity = Math.max(0, Math.floor(asNumber(product?.availablequantity)));
            if (product && requestedQuantity > availableQuantity) {
                throw validationError(`${product.productname} has only ${availableQuantity} available across all rows; requested ${requestedQuantity}`);
            }
        }
    }
    return preparedRows;
};
const prepareServiceRows = (rows, requireSacCode) => {
    const activeRows = rows.filter((row) => Boolean(String(row?.description ?? "").trim() ||
        String(row?.saccode ?? "").trim() ||
        asNumber(row?.unitprice) > 0));
    return activeRows.map((row, index) => {
        const description = String(row?.description ?? "").trim();
        const sacCode = String(row?.saccode ?? "").trim();
        const unitPrice = asNumber(row?.unitprice);
        if (!description) {
            throw validationError(`Service row ${index + 1} description is required`);
        }
        if (requireSacCode && !sacCode) {
            throw validationError(`Service row ${index + 1} SAC code is required`);
        }
        if (requireSacCode && !/^\d{6}$/.test(sacCode)) {
            throw validationError(`Service row ${index + 1} SAC code must be exactly 6 numeric digits`);
        }
        if (unitPrice < 0) {
            throw validationError(`Service row ${index + 1} unit price cannot be negative`);
        }
        return {
            id: index + 1,
            description,
            saccode: sacCode,
            unitprice: roundMoney(unitPrice),
            totalamount: roundMoney(unitPrice),
        };
    });
};
const prepareCostEstimation = async (rawInput) => {
    const incoming = Array.isArray(rawInput) ? rawInput[0] : rawInput;
    if (!incoming || typeof incoming !== "object") {
        throw validationError("Cost estimation payload is required");
    }
    const existing = await getExistingEstimation(incoming.id);
    const merged = { ...(existing || {}), ...incoming };
    const ticketnumber = String(merged.ticketnumber ?? "").trim();
    if (!ticketnumber) {
        throw validationError("Ticket number is required");
    }
    const ticketContext = await getTicketContext(ticketnumber);
    const isNew = !incoming.id;
    const customerState = String(isNew
        ? ticketContext.customerstate || "Tamil Nadu"
        : merged.customerstate || ticketContext.customerstate || "Tamil Nadu").trim();
    const taxContext = getServiceEstimationTaxContext(customerState);
    const incomingProductRows = parseCollection(merged.productdata);
    const incomingServiceRows = parseCollection(merged.servicedata);
    const productRows = isNew
        ? await prepareProductRows(incomingProductRows, true)
        : incomingProductRows;
    const serviceRows = isNew
        ? prepareServiceRows(incomingServiceRows, true)
        : incomingServiceRows;
    if (productRows.length === 0 && serviceRows.length === 0) {
        throw validationError("Add at least one product or service item");
    }
    const productSubtotal = roundMoney(productRows.reduce((sum, row) => sum +
        asStoredNumber(row?.totalamount, asStoredNumber(row?.quantity, 1) * asStoredNumber(row?.unitprice)), 0));
    const serviceSubtotal = roundMoney(serviceRows.reduce((sum, row) => sum + asStoredNumber(row?.totalamount, asStoredNumber(row?.unitprice)), 0));
    const productCgst = isNew
        ? taxContext.taxtype === "intra_state"
            ? asTaxRate(merged.productcgst, taxContext.cgst, "Product CGST")
            : 0
        : asStoredNumber(merged.productcgst, taxContext.cgst);
    const productSgst = isNew
        ? taxContext.taxtype === "intra_state"
            ? asTaxRate(merged.productsgst, taxContext.sgst, "Product SGST")
            : 0
        : asStoredNumber(merged.productsgst, taxContext.sgst);
    const productIgst = isNew
        ? taxContext.taxtype === "inter_state"
            ? asTaxRate(merged.productigst, taxContext.igst, "Product IGST")
            : 0
        : asStoredNumber(merged.productigst, 0);
    const serviceCgst = isNew
        ? taxContext.taxtype === "intra_state"
            ? asTaxRate(merged.servicecgst, taxContext.cgst, "Service CGST")
            : 0
        : asStoredNumber(merged.servicecgst, taxContext.cgst);
    const serviceSgst = isNew
        ? taxContext.taxtype === "intra_state"
            ? asTaxRate(merged.servicesgst, taxContext.sgst, "Service SGST")
            : 0
        : asStoredNumber(merged.servicesgst, taxContext.sgst);
    const serviceIgst = isNew
        ? taxContext.taxtype === "inter_state"
            ? asTaxRate(merged.serviceigst, taxContext.igst, "Service IGST")
            : 0
        : asStoredNumber(merged.serviceigst, 0);
    const productTaxRate = productCgst + productSgst + productIgst;
    const serviceTaxRate = serviceCgst + serviceSgst + serviceIgst;
    const calculatedProductTax = roundMoney(productSubtotal * productTaxRate / 100);
    const calculatedServiceTax = roundMoney(serviceSubtotal * serviceTaxRate / 100);
    const productTaxAmount = isNew
        ? asNonNegativeAmount(merged.producttaxamount, calculatedProductTax, "Product tax amount")
        : asStoredNumber(merged.producttaxamount, calculatedProductTax);
    const serviceTaxAmount = isNew
        ? asNonNegativeAmount(merged.servicetaxamount, calculatedServiceTax, "Service tax amount")
        : asStoredNumber(merged.servicetaxamount, calculatedServiceTax);
    const productTotal = isNew
        ? asNonNegativeAmount(merged.producttotal, roundMoney(productSubtotal + productTaxAmount), "Product total")
        : asStoredNumber(merged.producttotal, roundMoney(productSubtotal + productTaxAmount));
    const serviceTotal = isNew
        ? asNonNegativeAmount(merged.servicetotal, roundMoney(serviceSubtotal + serviceTaxAmount), "Service total")
        : asStoredNumber(merged.servicetotal, roundMoney(serviceSubtotal + serviceTaxAmount));
    const totalPayableAmount = isNew
        ? roundMoney(productTotal + serviceTotal)
        : asStoredNumber(merged.totalpayableamount, roundMoney(productTotal + serviceTotal));
    const storedHasIgst = productIgst > 0 || serviceIgst > 0;
    const storedHasSplitGst = productCgst > 0 ||
        productSgst > 0 ||
        serviceCgst > 0 ||
        serviceSgst > 0;
    const resolvedTaxType = isNew
        ? taxContext.taxtype
        : String(merged.taxtype ||
            (storedHasIgst
                ? "inter_state"
                : storedHasSplitGst
                    ? "intra_state"
                    : taxContext.taxtype));
    let estimationStatus = String(incoming.estimationstatus || existing?.estimationstatus || "").trim();
    if (isNew) {
        const autoApprove = isTruthyDatabaseFlag(ticketContext.walkintickets) ||
            (isTruthyDatabaseFlag(ticketContext.proceedwithvalueservice) &&
                totalPayableAmount <= 1500);
        estimationStatus = autoApprove ? "approved" : "waiting_for_approval";
    }
    if (!["waiting_for_approval", "approved", "rejected", "re_quote"].includes(estimationStatus)) {
        throw validationError(`Invalid estimation status: ${estimationStatus || "empty"}`);
    }
    const prepared = {
        ticketnumber,
        productdata: productRows,
        productcgst: productCgst,
        productsgst: productSgst,
        productigst: productIgst,
        producttaxamount: productTaxAmount,
        producttotal: productTotal,
        servicedata: serviceRows,
        servicecgst: serviceCgst,
        servicesgst: serviceSgst,
        serviceigst: serviceIgst,
        servicetype: merged.servicetype ?? ticketContext.servicetype ?? null,
        servicetaxamount: serviceTaxAmount,
        servicetotal: serviceTotal,
        totalpayableamount: totalPayableAmount,
        customerstate: taxContext.customerstate,
        taxtype: resolvedTaxType,
        estimationstatus: estimationStatus,
    };
    if (merged.estimationurl)
        prepared.estimationurl = merged.estimationurl;
    if (merged.servicetds !== undefined) {
        prepared.servicetds = merged.servicetds;
    }
    if (incoming.approvalcomments !== undefined) {
        prepared.approvalcomments = incoming.approvalcomments;
    }
    else if (existing?.approvalcomments !== undefined) {
        prepared.approvalcomments = existing.approvalcomments;
    }
    return {
        id: incoming.id ? Number(incoming.id) : null,
        prepared,
        documentData: {
            ...prepared,
            taxlabel: taxContext.taxlabel,
            servicetype: ticketContext.servicetype ?? 0,
            estimationdate: new Date().toLocaleDateString("en-IN"),
        },
    };
};
const ticketTransitionForStatus = (status, estimationId) => {
    if (status === "waiting_for_approval") {
        return { ticketstatus: "waiting_for_cost_estimation_approval" };
    }
    if (status === "rejected") {
        return { ticketstatus: "unresolved_closed" };
    }
    if (status === "re_quote") {
        return { ticketstatus: "open" };
    }
    return {
        ticketstatus: "service_in_progress",
        approvedcostestimationid: estimationId,
    };
};
const getRequestedProducts = (productRows) => {
    const products = new Map();
    for (const row of productRows || []) {
        const productId = Number(row?.productid);
        const quantity = Number(row?.quantity);
        if (!Number.isInteger(productId) ||
            productId <= 0 ||
            !Number.isInteger(quantity) ||
            quantity <= 0) {
            continue;
        }
        const productRequest = products.get(productId) || {
            quantity: 0,
            selectedStockIds: [],
        };
        productRequest.quantity += quantity;
        const assetStockId = Number(row?.assetstockid);
        if (Number.isInteger(assetStockId) && assetStockId > 0) {
            productRequest.selectedStockIds.push(assetStockId);
        }
        products.set(productId, productRequest);
    }
    return products;
};
const refreshCatalogueQuantities = async (client, affectedPucs) => {
    for (const puc of affectedPucs) {
        await productrevoService.updateCatalogueQuantities(puc, client);
        await client.query(`UPDATE product_revo
             SET soldquantity = (
                 SELECT COUNT(*)::int
                 FROM stock_revo
                 WHERE puc = $1
                   AND ecompublish = TRUE
                   AND stockstatus = $2
                   AND COALESCE(stocktype, '') <> 'third_party_product'
                   AND (isdeleted = FALSE OR isdeleted IS NULL)
                   AND (isarchive = FALSE OR isarchive IS NULL)
                   AND (removefromrecyclebin = FALSE OR removefromrecyclebin IS NULL)
                   AND (ewaste = FALSE OR ewaste IS NULL)
             )
             WHERE puc = $1`, [puc, SOLD_STOCK_STATUS]);
    }
};
const allocateStockForEstimation = async (client, estimationId, ticket, productRows, actorId, affectedPucs) => {
    const requestedProducts = getRequestedProducts(productRows);
    for (const [productId, request] of requestedProducts.entries()) {
        const allocationPlan = getServiceEstimationAssetAllocationPlan(request.quantity, request.selectedStockIds);
        const productResult = await client.query(`SELECT id, puc, productname
             FROM product_revo
             WHERE id = $1
             LIMIT 1`, [productId]);
        const product = productResult.rows[0];
        if (!product?.puc) {
            throw validationError(`Product ${productId} is unavailable`);
        }
        let selectedStockRows = [];
        if (allocationPlan.selectedStockIds.length > 0) {
            const selectedStockResult = await client.query(`SELECT s.id, s.puc, s.assetnumber
                 FROM stock_revo s
                 WHERE s.id = ANY($1::int[])
                   AND s.puc = $2
                   AND s.stockstatus = $3
                   AND s.stocktype = ANY($4::text[])
                   AND NULLIF(
                        BTRIM(COALESCE(s.rfid::text, s.assetnumber::text)),
                        ''
                   ) IS NOT NULL
                   AND (s.isdeleted = FALSE OR s.isdeleted IS NULL)
                   AND (s.isarchive = FALSE OR s.isarchive IS NULL)
                   AND (
                        s.removefromrecyclebin = FALSE
                        OR s.removefromrecyclebin IS NULL
                   )
                   AND (s.ewaste = FALSE OR s.ewaste IS NULL)
                 ORDER BY COALESCE(s.modifieddate, 0), s.id
                 FOR UPDATE`, [
                allocationPlan.selectedStockIds,
                product.puc,
                AVAILABLE_STOCK_STATUS,
                [...SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES],
            ]);
            selectedStockRows = selectedStockResult.rows;
            if (selectedStockRows.length !==
                allocationPlan.selectedStockIds.length) {
                throw validationError(`${product.productname} selected asset is no longer available`);
            }
        }
        let automaticStockRows = [];
        if (allocationPlan.remainingQuantity > 0) {
            const stockResult = await client.query(`SELECT s.id, s.puc, s.assetnumber
                 FROM stock_revo s
                 WHERE s.puc = $1
                   AND s.stockstatus = $2
                   AND s.stocktype = ANY($3::text[])
                   AND NOT (s.id = ANY($4::int[]))
                   AND (s.isdeleted = FALSE OR s.isdeleted IS NULL)
                   AND (s.isarchive = FALSE OR s.isarchive IS NULL)
                   AND (
                        s.removefromrecyclebin = FALSE
                        OR s.removefromrecyclebin IS NULL
                   )
                   AND (s.ewaste = FALSE OR s.ewaste IS NULL)
                 ORDER BY
                   CASE
                     WHEN COALESCE(s.location, '') = COALESCE($5, '') THEN 0
                     ELSE 1
                   END,
                   COALESCE(s.modifieddate, 0),
                   s.id
                 LIMIT $6
                 FOR UPDATE SKIP LOCKED`, [
                product.puc,
                AVAILABLE_STOCK_STATUS,
                [...SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES],
                allocationPlan.selectedStockIds,
                ticket.location ?? null,
                allocationPlan.remainingQuantity,
            ]);
            automaticStockRows = stockResult.rows;
            if (automaticStockRows.length !== allocationPlan.remainingQuantity) {
                throw validationError(`${product.productname} has only ${selectedStockRows.length + automaticStockRows.length} allocatable stock available; requested ${request.quantity}`);
            }
        }
        const stockIds = [...selectedStockRows, ...automaticStockRows].map((row) => Number(row.id));
        const updateResult = await client.query(`UPDATE stock_revo
             SET stockstatus = $1,
                 holdreason = $2,
                 holdticketid = $3,
                 modifiedby = COALESCE($4, modifiedby),
                 modifieddate = EXTRACT(EPOCH FROM NOW())::bigint
             WHERE id = ANY($5::int[])
               AND stockstatus = $6
             RETURNING id, puc`, [
            SERVICE_HOLD_STOCK_STATUS,
            COST_ESTIMATION_HOLD_REASON,
            ticket.id,
            actorId,
            stockIds,
            AVAILABLE_STOCK_STATUS,
        ]);
        if (updateResult.rows.length !== request.quantity) {
            throw validationError(`${product.productname} stock changed while the estimation was being created`);
        }
        await client.query(`INSERT INTO service_estimation_stock_allocations (
                servicecostestimationid,
                ticketid,
                ticketnumber,
                productid,
                stockid,
                quantity,
                allocationstatus,
                createdby,
                modifiedby
             )
             SELECT
                $1,
                $2,
                $3,
                $4,
                allocated.stockid,
                1,
                'held',
                $5,
                $5
             FROM UNNEST($6::int[]) AS allocated(stockid)`, [
            estimationId,
            ticket.id,
            ticket.ticketnumber,
            productId,
            actorId,
            stockIds,
        ]);
        affectedPucs.add(String(product.puc));
    }
};
const sellHeldStockForEstimation = async (client, estimationId, ticketId, actorId, affectedPucs) => {
    const allocationResult = await client.query(`SELECT
            allocation.id AS allocationid,
            allocation.stockid,
            stock.puc,
            stock.stockstatus,
            stock.holdreason,
            stock.holdticketid
         FROM service_estimation_stock_allocations allocation
         JOIN stock_revo stock ON stock.id = allocation.stockid
         WHERE allocation.servicecostestimationid = $1
           AND allocation.allocationstatus = 'held'
         ORDER BY allocation.id
         FOR UPDATE OF allocation, stock`, [estimationId]);
    if (allocationResult.rows.length === 0)
        return;
    const invalidStock = allocationResult.rows.find((row) => row.stockstatus !== SERVICE_HOLD_STOCK_STATUS ||
        row.holdreason !== COST_ESTIMATION_HOLD_REASON ||
        Number(row.holdticketid) !== Number(ticketId));
    if (invalidStock) {
        throw validationError("One or more estimation stocks are no longer on the expected Service Hold");
    }
    const stockIds = allocationResult.rows.map((row) => Number(row.stockid));
    const allocationIds = allocationResult.rows.map((row) => Number(row.allocationid));
    const stockUpdateResult = await client.query(`UPDATE stock_revo
         SET stockstatus = $1,
             holdreason = NULL,
             holdticketid = NULL,
             lastticketid = $2,
             modifiedby = COALESCE($3, modifiedby),
             modifieddate = EXTRACT(EPOCH FROM NOW())::bigint
         WHERE id = ANY($4::int[])
           AND stockstatus = $5
         RETURNING id, puc`, [
        SOLD_STOCK_STATUS,
        ticketId,
        actorId,
        stockIds,
        SERVICE_HOLD_STOCK_STATUS,
    ]);
    if (stockUpdateResult.rows.length !== stockIds.length) {
        throw validationError("Unable to mark every held estimation stock as Sold");
    }
    await client.query(`UPDATE service_estimation_stock_allocations
         SET allocationstatus = 'sold',
             soldat = NOW(),
             modifiedby = COALESCE($1, modifiedby),
             modifiedat = NOW()
         WHERE id = ANY($2::bigint[])
           AND allocationstatus = 'held'`, [actorId, allocationIds]);
    for (const row of stockUpdateResult.rows) {
        if (row.puc)
            affectedPucs.add(String(row.puc));
    }
};
const restoreHeldStockForEstimation = async (client, estimationId, ticketId, restorationReason, actorId, affectedPucs) => {
    const allocationResult = await client.query(`SELECT
            allocation.id AS allocationid,
            allocation.stockid,
            stock.puc,
            stock.stockstatus,
            stock.holdreason,
            stock.holdticketid
         FROM service_estimation_stock_allocations allocation
         JOIN stock_revo stock ON stock.id = allocation.stockid
         WHERE allocation.servicecostestimationid = $1
           AND allocation.allocationstatus = 'held'
         ORDER BY allocation.id
         FOR UPDATE OF allocation, stock`, [estimationId]);
    if (allocationResult.rows.length === 0)
        return;
    const invalidStock = allocationResult.rows.find((row) => row.stockstatus !== SERVICE_HOLD_STOCK_STATUS ||
        row.holdreason !== COST_ESTIMATION_HOLD_REASON ||
        Number(row.holdticketid) !== Number(ticketId));
    if (invalidStock) {
        throw validationError("One or more estimation stocks are no longer on the expected Service Hold");
    }
    const stockIds = allocationResult.rows.map((row) => Number(row.stockid));
    const allocationIds = allocationResult.rows.map((row) => Number(row.allocationid));
    const stockUpdateResult = await client.query(`UPDATE stock_revo
         SET stockstatus = $1,
             holdreason = NULL,
             holdticketid = NULL,
             lastticketid = $2,
             modifiedby = COALESCE($3, modifiedby),
             modifieddate = EXTRACT(EPOCH FROM NOW())::bigint
         WHERE id = ANY($4::int[])
           AND stockstatus = $5
         RETURNING id, puc`, [
        AVAILABLE_STOCK_STATUS,
        ticketId,
        actorId,
        stockIds,
        SERVICE_HOLD_STOCK_STATUS,
    ]);
    if (stockUpdateResult.rows.length !== stockIds.length) {
        throw validationError("Unable to restore every held estimation stock to Available");
    }
    await client.query(`UPDATE service_estimation_stock_allocations
         SET allocationstatus = 'restored',
             restoredat = NOW(),
             restorationreason = $1,
             modifiedby = COALESCE($2, modifiedby),
             modifiedat = NOW()
         WHERE id = ANY($3::bigint[])
           AND allocationstatus = 'held'`, [restorationReason, actorId, allocationIds]);
    for (const row of stockUpdateResult.rows) {
        if (row.puc)
            affectedPucs.add(String(row.puc));
    }
};
const restoreSoldStockForEstimation = async (client, estimationId, ticketId, restorationReason, actorId, affectedPucs) => {
    const allocationResult = await client.query(`SELECT
            allocation.id AS allocationid,
            allocation.stockid,
            stock.puc,
            stock.stockstatus
         FROM service_estimation_stock_allocations allocation
         JOIN stock_revo stock ON stock.id = allocation.stockid
         WHERE allocation.servicecostestimationid = $1
           AND allocation.allocationstatus = 'sold'
         ORDER BY allocation.id
         FOR UPDATE OF allocation, stock`, [estimationId]);
    if (allocationResult.rows.length === 0)
        return 0;
    const invalidStock = allocationResult.rows.find((row) => row.stockstatus !== SOLD_STOCK_STATUS);
    if (invalidStock) {
        throw validationError("One or more estimation stocks are no longer in Sold status");
    }
    const stockIds = allocationResult.rows.map((row) => Number(row.stockid));
    const allocationIds = allocationResult.rows.map((row) => Number(row.allocationid));
    const stockUpdateResult = await client.query(`UPDATE stock_revo
         SET stockstatus = $1,
             holdreason = NULL,
             holdticketid = NULL,
             lastticketid = $2,
             modifiedby = COALESCE($3, modifiedby),
             modifieddate = EXTRACT(EPOCH FROM NOW())::bigint
         WHERE id = ANY($4::int[])
           AND stockstatus = $5
         RETURNING id, puc`, [
        AVAILABLE_STOCK_STATUS,
        ticketId,
        actorId,
        stockIds,
        SOLD_STOCK_STATUS,
    ]);
    if (stockUpdateResult.rows.length !== stockIds.length) {
        throw validationError("Unable to restore every sold estimation stock to Available");
    }
    await client.query(`UPDATE service_estimation_stock_allocations
         SET allocationstatus = 'restored',
             restoredat = NOW(),
             restorationreason = $1,
             modifiedby = COALESCE($2, modifiedby),
             modifiedat = NOW()
         WHERE id = ANY($3::bigint[])
           AND allocationstatus = 'sold'`, [restorationReason, actorId, allocationIds]);
    for (const row of stockUpdateResult.rows) {
        if (row.puc)
            affectedPucs.add(String(row.puc));
    }
    return stockUpdateResult.rows.length;
};
const persistCostEstimation = async (id, prepared, actorId) => {
    const filteredEntries = Object.entries(prepared).filter(([field, value]) => ESTIMATION_FIELDS.has(field) && value !== undefined);
    const fieldNames = filteredEntries.map(([field]) => field);
    const fieldValues = filteredEntries.map(([field, value]) => field === "productdata" || field === "servicedata"
        ? JSON.stringify(value)
        : value);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let previousEstimation = null;
        if (id) {
            const previousResult = await client.query(`SELECT *
                 FROM servicecostestimation
                 WHERE id = $1
                 FOR UPDATE`, [id]);
            previousEstimation = previousResult.rows[0] ?? null;
            if (!previousEstimation) {
                throw validationError(`Cost estimation ${id} was not found`);
            }
        }
        let result;
        if (id) {
            const updateQuery = `UPDATE servicecostestimation
                SET ${fieldNames.map((field, index) => `${field} = $${index + 1}`).join(", ")}
                WHERE id = $${fieldNames.length + 1}
                RETURNING *`;
            result = await client.query(updateQuery, [...fieldValues, id]);
        }
        else {
            const insertQuery = `INSERT INTO servicecostestimation (${fieldNames.join(", ")})
                VALUES (${fieldNames.map((_, index) => `$${index + 1}`).join(", ")})
                RETURNING *`;
            result = await client.query(insertQuery, fieldValues);
        }
        if (!result.rows[0]) {
            throw validationError("Cost estimation could not be saved");
        }
        const saved = result.rows[0];
        const ticketResult = await client.query(`SELECT id, ticketnumber, ticketstatus, location
             FROM tickets
             WHERE ticketnumber = $1
             FOR UPDATE`, [saved.ticketnumber]);
        const ticket = ticketResult.rows[0];
        if (!ticket) {
            throw validationError(`Ticket ${saved.ticketnumber} was not found`);
        }
        const affectedPucs = new Set();
        const productRows = parseCollection(saved.productdata);
        const allocationCountResult = await client.query(`SELECT
                COUNT(*)::int AS count,
                COUNT(*) FILTER (
                    WHERE allocationstatus = 'sold'
                )::int AS soldcount,
                COUNT(*) FILTER (
                    WHERE allocationstatus = 'restored'
                )::int AS restoredcount
             FROM service_estimation_stock_allocations
             WHERE servicecostestimationid = $1`, [saved.id]);
        const allocationCount = Number(allocationCountResult.rows[0]?.count ?? 0);
        const soldAllocationCount = Number(allocationCountResult.rows[0]?.soldcount ?? 0);
        const restoredAllocationCount = Number(allocationCountResult.rows[0]?.restoredcount ?? 0);
        const stockPlan = getServiceEstimationStockPersistencePlan({
            isNew: !id,
            previousStatus: previousEstimation?.estimationstatus ??
                null,
            nextStatus: saved.estimationstatus,
            allocations: {
                total: allocationCount,
                sold: soldAllocationCount,
                restored: restoredAllocationCount,
            },
        });
        if (stockPlan.allocate) {
            await allocateStockForEstimation(client, Number(saved.id), ticket, productRows, actorId, affectedPucs);
        }
        if (stockPlan.sellHeld) {
            await sellHeldStockForEstimation(client, Number(saved.id), Number(ticket.id), actorId, affectedPucs);
        }
        else if (stockPlan.restoreHeld) {
            await restoreHeldStockForEstimation(client, Number(saved.id), Number(ticket.id), stockPlan.heldRestorationReason, actorId, affectedPucs);
        }
        const transition = ticketTransitionForStatus(saved.estimationstatus, Number(saved.id));
        if ("approvedcostestimationid" in transition) {
            await client.query(`UPDATE tickets
                 SET ticketstatus = $1, approvedcostestimationid = $2
                 WHERE ticketnumber = $3`, [
                transition.ticketstatus,
                transition.approvedcostestimationid,
                saved.ticketnumber,
            ]);
        }
        else {
            await client.query("UPDATE tickets SET ticketstatus = $1 WHERE ticketnumber = $2", [transition.ticketstatus, saved.ticketnumber]);
        }
        await refreshCatalogueQuantities(client, affectedPucs);
        await client.query("COMMIT");
        result.affectedPucs = Array.from(affectedPucs);
        return result;
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
const getTicketUserInfo = async (ticketnumber) => {
    const result = await query(`SELECT u.useremail, u.firstname, t.productname, t.tickettype
         FROM tickets t
         JOIN users u ON t.userid = u.id
         WHERE t.ticketnumber = $1
         LIMIT 1`, [ticketnumber]);
    return result.rows[0] ?? null;
};
const fireEstimationEmail = async (estimationstatus, ticketnumber, estimationurl, totalpayableamount) => {
    try {
        const userInfo = await getTicketUserInfo(ticketnumber);
        if (!userInfo)
            return;
        const templates = emailTemplates.tickets;
        let subject;
        let text;
        if (estimationstatus === "waiting_for_approval") {
            subject = templates.waiting_for_cost_estimation_approval.subject;
            text = templates.waiting_for_cost_estimation_approval.text
                .replace("{ticketNumber}", ticketnumber)
                .replace("{productName}", userInfo.productname || "your product")
                .replace("{totalPayable}", totalpayableamount != null ? `₹${totalpayableamount}` : "N/A")
                .replace("{estimationUrl}", estimationurl || "N/A");
        }
        else if (estimationstatus === "approved") {
            subject = templates.service_in_progress.subject;
            text = templates.service_in_progress.text
                .replace("{ticketNumber}", ticketnumber)
                .replace("{productName}", userInfo.productname || "your product");
        }
        else if (estimationstatus === "rejected") {
            subject = templates.unresolved_closed.subject;
            text = templates.unresolved_closed.text.replace("{ticketNumber}", ticketnumber);
        }
        else {
            subject = templates.re_quote.subject;
            text = templates.re_quote.text.replace("{ticketNumber}", ticketnumber);
        }
        await sendTransactionalMail({ to: userInfo.useremail, subject, text });
    }
    catch (mailError) {
        console.error(`[costEstimation] Email failed for estimationstatus "${estimationstatus}":`, mailError?.message || mailError);
    }
};
const saveAndNotify = async (id, prepared, actorId) => {
    const result = await persistCostEstimation(id, prepared, actorId);
    const saved = result.rows[0];
    await fireEstimationEmail(saved.estimationstatus, saved.ticketnumber, saved.estimationurl ?? null, saved.totalpayableamount ?? null);
    return result;
};
export var costEstimationService;
(function (costEstimationService) {
    costEstimationService.getEstimationProducts = async (request) => {
        const search = String(request.query?.search ?? "").trim();
        const ticketnumber = String(request.query?.ticketnumber ?? "").trim();
        const requestedLimit = Number(request.query?.limit ?? 5);
        const limit = Math.min(5, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 5));
        const likeSearch = `%${search}%`;
        const productsResult = await query(`SELECT
                product.id,
                product.puc,
                product.productname,
                product.hsncode,
                COUNT(stock.id)::int AS availablequantity,
                COALESCE(product.price, 0) AS price
             FROM product_revo product
             JOIN stock_revo stock
              ON stock.puc = product.puc
              AND stock.stockstatus = $1
              AND stock.stocktype = ANY($2::text[])
              AND NULLIF(
                    BTRIM(
                        COALESCE(stock.rfid::text, stock.assetnumber::text)
                    ),
                    ''
              ) IS NOT NULL
              AND (stock.isdeleted = FALSE OR stock.isdeleted IS NULL)
              AND (stock.isarchive = FALSE OR stock.isarchive IS NULL)
              AND (
                    stock.removefromrecyclebin = FALSE
                    OR stock.removefromrecyclebin IS NULL
              )
              AND (stock.ewaste = FALSE OR stock.ewaste IS NULL)
             WHERE (product.isarchive = FALSE OR product.isarchive IS NULL)
               AND (product.isdeleted = FALSE OR product.isdeleted IS NULL)
               AND (
                    product.removefromrecyclebin = FALSE
                    OR product.removefromrecyclebin IS NULL
               )
               AND (
                    $3 = ''
                    OR product.productname ILIKE $4
                    OR COALESCE(product.puc, '') ILIKE $4
                    OR COALESCE(product.model, '') ILIKE $4
               )
             GROUP BY
                product.id,
                product.puc,
                product.productname,
                product.hsncode,
                product.price,
                product.modifieddate
             ORDER BY product.modifieddate DESC NULLS LAST, product.id DESC
             LIMIT $5`, [
            AVAILABLE_STOCK_STATUS,
            [...SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES],
            search,
            likeSearch,
            limit,
        ]);
        let customerState = "Tamil Nadu";
        if (ticketnumber) {
            const ticketContext = await getTicketContext(ticketnumber);
            customerState = String(ticketContext.customerstate || customerState);
        }
        const taxContext = getServiceEstimationTaxContext(customerState);
        return {
            products: await dataTypeCheck(productsResult),
            customerstate: taxContext.customerstate,
            taxtype: taxContext.taxtype,
            taxlabel: taxContext.taxlabel,
            rates: {
                cgst: taxContext.cgst,
                sgst: taxContext.sgst,
                igst: taxContext.igst,
            },
        };
    };
    costEstimationService.getEstimationProductAssets = async (request) => {
        const productId = Number(request.query?.productid);
        if (!Number.isInteger(productId) || productId <= 0) {
            throw validationError("A valid product id is required");
        }
        const search = String(request.query?.search ?? "").trim();
        const requestedLimit = Number(request.query?.limit ?? 5);
        const limit = Math.min(5, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 5));
        const likeSearch = `%${search}%`;
        const assetsResult = await query(`SELECT
                stock.id AS stockid,
                BTRIM(
                    COALESCE(stock.rfid::text, stock.assetnumber::text)
                ) AS assetnumber
             FROM stock_revo stock
             JOIN product_revo product ON product.puc = stock.puc
             WHERE product.id = $1
               AND stock.stockstatus = $2
               AND stock.stocktype = ANY($3::text[])
               AND NULLIF(
                    BTRIM(
                        COALESCE(stock.rfid::text, stock.assetnumber::text)
                    ),
                    ''
               ) IS NOT NULL
               AND (stock.isdeleted = FALSE OR stock.isdeleted IS NULL)
               AND (stock.isarchive = FALSE OR stock.isarchive IS NULL)
               AND (
                    stock.removefromrecyclebin = FALSE
                    OR stock.removefromrecyclebin IS NULL
               )
               AND (stock.ewaste = FALSE OR stock.ewaste IS NULL)
               AND (
                    $4 = ''
                    OR COALESCE(
                        stock.rfid::text,
                        stock.assetnumber::text
                    ) ILIKE $5
               )
             ORDER BY COALESCE(stock.modifieddate, 0), stock.id
             LIMIT $6`, [
            productId,
            AVAILABLE_STOCK_STATUS,
            [...SERVICE_ESTIMATION_CATALOGUE_STOCK_TYPES],
            search,
            likeSearch,
            limit,
        ]);
        return {
            assets: await dataTypeCheck(assetsResult),
        };
    };
    costEstimationService.getCostEstimationData = async (request) => {
        const pageNumber = Math.max(1, parseInt(request.query.page) || 1);
        const recordCount = Math.max(1, parseInt(request.query.count) || 5000);
        const whereClauses = [];
        const queryParams = [];
        let parameterIndex = 1;
        let orderByField = "modifieddate";
        let orderByDirection = "DESC";
        for (const [key, rawValue] of Object.entries(request.query)) {
            const values = Array.isArray(rawValue) ? rawValue : [rawValue];
            if (key === "sortby") {
                const [requestedField, requestedDirection] = String(values[0]).split("-");
                if (ESTIMATION_SORT_FIELDS.has(requestedField)) {
                    orderByField = requestedField;
                }
                orderByDirection =
                    requestedDirection?.toUpperCase() === "ASC" ? "ASC" : "DESC";
                continue;
            }
            if (key === "page" || key === "count")
                continue;
            if (!ESTIMATION_FILTER_FIELDS.has(key)) {
                throw validationError(`Unsupported estimation filter: ${key}`);
            }
            const clauses = values.map((value) => {
                if (String(value).startsWith("NOT ")) {
                    queryParams.push(String(value).slice(4));
                    return `s.${key} != $${parameterIndex++}`;
                }
                queryParams.push(value);
                return `s.${key} = $${parameterIndex++}`;
            });
            whereClauses.push(`(${clauses.join(" OR ")})`);
        }
        const offset = (pageNumber - 1) * recordCount;
        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
        const queryText = `
            SELECT s.*, ri.invoiceurl AS invoiceurl
            FROM servicecostestimation s
            LEFT JOIN revoinvoice ri ON s.ticketnumber = ri.ticketnumber
            ${whereClause}
            ORDER BY ${orderByField} ${orderByDirection}
            OFFSET $${parameterIndex} LIMIT $${parameterIndex + 1}`;
        queryParams.push(offset, recordCount);
        const result = await query(queryText, queryParams);
        return await dataTypeCheck(result);
    };
    costEstimationService.getStockRestorationStatus = async (request) => {
        const estimationId = Number(request.params?.id);
        if (!Number.isInteger(estimationId) || estimationId <= 0) {
            throw validationError("A valid cost estimation id is required");
        }
        const result = await query(`SELECT
                estimation.id,
                estimation.estimationstatus,
                estimation.ticketnumber,
                ticket.ticketstatus,
                EXISTS (
                    SELECT 1
                    FROM revoinvoice invoice
                    WHERE invoice.ticketnumber = estimation.ticketnumber
                ) AS invoicegenerated,
                (
                    SELECT COUNT(*)::int
                    FROM service_estimation_stock_allocations allocation
                    JOIN stock_revo stock ON stock.id = allocation.stockid
                    WHERE allocation.servicecostestimationid = estimation.id
                      AND allocation.allocationstatus = 'sold'
                      AND stock.stockstatus = $2
                ) AS restorablequantity
             FROM servicecostestimation estimation
             JOIN tickets ticket
               ON ticket.ticketnumber = estimation.ticketnumber
             WHERE estimation.id = $1
             LIMIT 1`, [estimationId, SOLD_STOCK_STATUS]);
        const record = result.rows[0];
        if (!record) {
            throw validationError(`Cost estimation ${estimationId} was not found`);
        }
        const restorableQuantity = Number(record.restorablequantity ?? 0);
        const canRestore = canRestoreApprovedServiceStock({
            estimationStatus: record.estimationstatus,
            ticketStatus: record.ticketstatus,
            invoiceGenerated: record.invoicegenerated === true,
            restorableQuantity,
        });
        return {
            canrestore: canRestore,
            restorablequantity: restorableQuantity,
            estimationstatus: record.estimationstatus,
            ticketstatus: record.ticketstatus,
            invoicegenerated: record.invoicegenerated === true,
        };
    };
    costEstimationService.restoreApprovedEstimationStock = async (request) => {
        const estimationId = Number(request.params?.id);
        if (!Number.isInteger(estimationId) || estimationId <= 0) {
            throw validationError("A valid cost estimation id is required");
        }
        const sessionActorId = Number(request.session?.id);
        const actorId = Number.isInteger(sessionActorId)
            ? sessionActorId
            : null;
        const restorationReason = String(request.body?.reason ?? "").trim() ||
            "customer_cancelled_after_approval";
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const estimationResult = await client.query(`SELECT
                    estimation.id,
                    estimation.estimationstatus,
                    estimation.ticketnumber,
                    ticket.id AS ticketid,
                    ticket.ticketstatus
                 FROM servicecostestimation estimation
                 JOIN tickets ticket
                   ON ticket.ticketnumber = estimation.ticketnumber
                 WHERE estimation.id = $1
                 FOR UPDATE OF estimation, ticket`, [estimationId]);
            const estimation = estimationResult.rows[0];
            if (!estimation) {
                throw validationError(`Cost estimation ${estimationId} was not found`);
            }
            if (estimation.estimationstatus !== "approved" ||
                estimation.ticketstatus !== "service_in_progress") {
                throw validationError("Stock restoration is allowed only for an approved service in progress");
            }
            const invoiceResult = await client.query(`SELECT id
                 FROM revoinvoice
                 WHERE ticketnumber = $1
                 LIMIT 1`, [estimation.ticketnumber]);
            if (invoiceResult.rows.length > 0) {
                throw validationError("Stock cannot be restored after the final invoice has been generated");
            }
            const affectedPucs = new Set();
            const restoredQuantity = await restoreSoldStockForEstimation(client, estimationId, Number(estimation.ticketid), restorationReason, actorId, affectedPucs);
            if (restoredQuantity === 0) {
                throw validationError("No sold estimation stock is available to restore");
            }
            await client.query(`UPDATE tickets
                 SET ticketstatus = 'unresolved_closed',
                     approvedcostestimationid = NULL
                 WHERE ticketnumber = $1`, [estimation.ticketnumber]);
            await refreshCatalogueQuantities(client, affectedPucs);
            await client.query("COMMIT");
            return {
                estimationid: estimationId,
                ticketnumber: estimation.ticketnumber,
                ticketstatus: "unresolved_closed",
                restoredquantity: restoredQuantity,
                affectedpucs: Array.from(affectedPucs),
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
    costEstimationService.upsertCostEstimation = async (request, input) => {
        const preparedResult = await prepareCostEstimation(input);
        const sessionActorId = Number(request.session?.id);
        const actorId = Number.isInteger(sessionActorId)
            ? sessionActorId
            : null;
        if (!preparedResult.id) {
            const documentResult = await GenerateDocx(request, [preparedResult.documentData], "costestimation/costestimation.docx");
            if (!documentResult?.fileurl) {
                throw validationError(typeof documentResult === "string"
                    ? documentResult
                    : "Cost estimation document could not be generated");
            }
            preparedResult.prepared.estimationurl = documentResult.fileurl;
        }
        return await saveAndNotify(preparedResult.id, preparedResult.prepared, actorId);
    };
    costEstimationService.upsertGcpCostEstimation = async (request, input) => {
        const preparedResult = await prepareCostEstimation(input);
        const sessionActorId = Number(request.session?.id);
        const actorId = Number.isInteger(sessionActorId)
            ? sessionActorId
            : null;
        return await saveAndNotify(preparedResult.id, preparedResult.prepared, actorId);
    };
})(costEstimationService || (costEstimationService = {}));
//# sourceMappingURL=costestimation.service.js.map