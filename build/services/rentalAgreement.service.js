import pool, { query } from "../database/postgres.js";
import { rentalAgreementPdfService } from "./rentalAgreementPdf.service.js";
const ACTIVE_RENTAL_ORDER_NAME = "rental";
const DEFAULT_BILLING_FREQUENCY = "monthly";
const DEFAULT_AGREEMENT_STATUS = "active";
const AGREEMENT_TEMPLATE_VERSION = "v4_native_pdf_history_layout";
const NON_TERMINAL_AGREEMENT_STATUSES = new Set([
    "draft",
    "active",
    "renewed",
    "stopped",
]);
const normalizeText = (value) => value == null ? null : String(value).trim();
const normalizeComparableText = (value) => String(value ?? "").trim().toLowerCase();
const rootExecutor = { query };
const toPositiveInteger = (value, fieldName = "id") => {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        throw new Error(`A valid ${fieldName} is required.`);
    }
    return Math.trunc(parsedValue);
};
const toOptionalEpoch = (value) => {
    if (value == null || value === "") {
        return null;
    }
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
        return String(Math.trunc(numericValue)).length <= 10
            ? Math.trunc(numericValue)
            : Math.trunc(numericValue / 1000);
    }
    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
        return Math.floor(parsedDate.getTime() / 1000);
    }
    throw new Error("A valid epoch or date value is required.");
};
const getCurrentEpochSeconds = () => Math.floor(Date.now() / 1000);
const toNumericValue = (value) => {
    const cleanedValue = String(value ?? "")
        .replace(/[^\d.-]/g, "")
        .trim();
    const numericValue = Number(cleanedValue);
    return Number.isFinite(numericValue) ? numericValue : 0;
};
const formatAgreementNumber = (agreementId) => {
    const currentDate = new Date();
    const year = currentDate.getUTCFullYear();
    const month = String(currentDate.getUTCMonth() + 1).padStart(2, "0");
    return `RAG-${year}${month}-${String(agreementId).padStart(6, "0")}`;
};
const parseDateLikeToEpoch = (value) => {
    try {
        return toOptionalEpoch(value);
    }
    catch {
        return null;
    }
};
const buildPricingSnapshot = (contractRows) => {
    const items = contractRows.map((row) => ({
        orderlineid: row.orderlineid,
        orderlinenumber: row.orderlinenumber,
        productid: row.productid,
        productname: row.productname,
        assetnumber: row.assetnumber,
        rentalfor: Number(row.rentalfor ?? 0),
        monthlyamount: toNumericValue(row.productamount),
        totalamount: toNumericValue(row.productamount) * Math.max(Number(row.rentalfor ?? 1), 1),
    }));
    const monthlyamount = items.reduce((total, item) => total + Number(item.monthlyamount ?? 0), 0);
    const totalcontractvalue = items.reduce((total, item) => total + Number(item.totalamount ?? 0), 0);
    return {
        monthlyamount,
        totalcontractvalue,
        currency: "INR",
        items,
    };
};
const buildPenaltySnapshot = (notes) => ({
    mode: "manual_penalty_invoice",
    invoicefor: "penalty",
    notes: normalizeText(notes) ||
        "Penalty invoice generation is manual and uses the existing product invoice template.",
});
const getAgreementAssetStatus = (row) => normalizeText(row.rentalassetstatus) ||
    (normalizeComparableText(row.rentalcontractstatus) === "active"
        ? "allocated"
        : normalizeText(row.rentalcontractstatus) || "allocated");
const getStockIdentifier = (row) => row.stockid != null ? Number(row.stockid) : null;
const getAgreementContextRows = async (executor, filters) => {
    const whereClauses = [
        `LOWER(COALESCE(ol.ordername, '')) = $1`,
        `COALESCE(ol.isactivebillingline, TRUE) = TRUE`,
        `ol.uniqueorderid IS NOT NULL`,
    ];
    const params = [ACTIVE_RENTAL_ORDER_NAME];
    if (filters.customerId != null) {
        params.push(filters.customerId);
        whereClauses.push(`ol.userid = $${params.length}`);
    }
    if (filters.uniqueOrderId) {
        params.push(filters.uniqueOrderId);
        whereClauses.push(`CAST(ol.uniqueorderid AS TEXT) = $${params.length}`);
    }
    const result = await executor.query(`
      SELECT
        ol.id AS orderlineid,
        ol.orderlinenumber,
        ol.uniqueorderid,
        ol.userid AS customerid,
        ol.productid,
        ol.productname,
        ol.assetnumber,
        ol.rentalfor,
        ol.rentstartdate,
        ol.rentenddate,
        ol.productamount,
        ol.orderamount,
        ol.rentalcontractstatus,
        ol.rentalassetstatus,
        ol.location,
        ol.vendorname,
        ol.empid,
        ol.brand,
        ol.modifieddate AS orderline_modifieddate,
        sr.id AS stockid,
        sr.stockstatus,
        sr.rentalassetstatus AS stock_rentalassetstatus,
        u.firstname,
        u.lastname,
        u.useremail,
        u.usermobilenumber,
        existing_agreement.id AS existingagreementid,
        existing_agreement.agreementnumber AS existingagreementnumber,
        existing_agreement.agreementstatus AS existingagreementstatus
      FROM orderline ol
      LEFT JOIN stock_revo sr
        ON CAST(sr.assetnumber AS TEXT) = CAST(ol.assetnumber AS TEXT)
      LEFT JOIN users u
        ON u.id = ol.userid
      LEFT JOIN LATERAL (
        SELECT ra.id, ra.agreementnumber, ra.agreementstatus
        FROM rental_agreement ra
        WHERE CAST(ra.uniqueorderid AS TEXT) = CAST(ol.uniqueorderid AS TEXT)
        ORDER BY ra.id DESC
        LIMIT 1
      ) existing_agreement ON TRUE
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY ol.uniqueorderid DESC, ol.id ASC
    `, params);
    return result.rows;
};
const groupAgreementContextRows = (rows) => {
    const groupedContracts = new Map();
    rows.forEach((row) => {
        const uniqueOrderId = normalizeText(row.uniqueorderid);
        if (!uniqueOrderId) {
            return;
        }
        const contractGroup = groupedContracts.get(uniqueOrderId) ?? {
            uniqueorderid: uniqueOrderId,
            customerid: row.customerid,
            firstname: row.firstname,
            lastname: row.lastname,
            useremail: row.useremail,
            usermobilenumber: row.usermobilenumber,
            primaryorderlineid: row.orderlineid,
            agreementstartdate: null,
            agreementenddate: null,
            rentalmonths: 0,
            monthlyamount: 0,
            totalcontractvalue: 0,
            assetcount: 0,
            assets: [],
            existingagreementid: row.existingagreementid ?? null,
            existingagreementnumber: row.existingagreementnumber ?? null,
            existingagreementstatus: row.existingagreementstatus ?? null,
        };
        const assetStartEpoch = parseDateLikeToEpoch(row.rentstartdate);
        const assetEndEpoch = parseDateLikeToEpoch(row.rentenddate);
        const rentalMonths = Number(row.rentalfor ?? 0);
        const monthlyAmount = toNumericValue(row.productamount);
        contractGroup.agreementstartdate =
            contractGroup.agreementstartdate == null
                ? assetStartEpoch
                : Math.min(contractGroup.agreementstartdate, assetStartEpoch ?? contractGroup.agreementstartdate);
        contractGroup.agreementenddate =
            contractGroup.agreementenddate == null
                ? assetEndEpoch
                : Math.max(contractGroup.agreementenddate, assetEndEpoch ?? contractGroup.agreementenddate);
        contractGroup.rentalmonths = Math.max(contractGroup.rentalmonths, rentalMonths);
        contractGroup.monthlyamount += monthlyAmount;
        contractGroup.totalcontractvalue += monthlyAmount * Math.max(rentalMonths, 1);
        contractGroup.assetcount += 1;
        contractGroup.assets.push({
            orderlineid: row.orderlineid,
            orderlinenumber: row.orderlinenumber,
            productid: row.productid,
            productname: row.productname,
            assetnumber: row.assetnumber,
            rentalfor: rentalMonths,
            rentstartdate: row.rentstartdate,
            rentenddate: row.rentenddate,
            productamount: row.productamount,
            location: row.location,
            vendorname: row.vendorname,
            empid: row.empid,
            brand: row.brand,
            stockid: row.stockid,
            stockstatus: row.stockstatus,
            assetstatus: getAgreementAssetStatus(row),
        });
        groupedContracts.set(uniqueOrderId, contractGroup);
    });
    return Array.from(groupedContracts.values()).sort((left, right) => {
        return Number(right.agreementstartdate ?? 0) - Number(left.agreementstartdate ?? 0);
    });
};
const getAgreementList = async (customerId, uniqueOrderId) => {
    const result = await query(`
      SELECT
        ra.*,
        u.firstname,
        u.lastname,
        u.useremail,
        u.usermobilenumber
      FROM rental_agreement ra
      LEFT JOIN users u
        ON u.id = ra.customerid
      WHERE ($1::int IS NULL OR ra.customerid = $1)
        AND ($2::text IS NULL OR CAST(ra.uniqueorderid AS TEXT) = $2)
      ORDER BY ra.modifieddate DESC NULLS LAST, ra.id DESC
    `, [customerId ?? null, uniqueOrderId ?? null]);
    const agreementIds = result.rows.map((row) => row.id);
    let assetRows = [];
    if (agreementIds.length > 0) {
        const assetResult = await query(`
        SELECT
          raa.*,
          ol.orderlinenumber,
          ol.productname,
          ol.productamount,
          ol.rentstartdate,
          ol.rentenddate
        FROM rental_agreement_asset raa
        LEFT JOIN orderline ol
          ON ol.id = raa.orderlineid
        WHERE raa.agreementid = ANY($1)
        ORDER BY raa.agreementid DESC, raa.id ASC
      `, [agreementIds]);
        assetRows = assetResult.rows;
    }
    return result.rows.map((agreement) => ({
        ...agreement,
        assets: assetRows.filter((assetRow) => Number(assetRow.agreementid) === Number(agreement.id)),
    }));
};
const getAgreementDetailById = async (agreementId) => {
    const agreements = await getAgreementList(null, null);
    const agreement = agreements.find((agreementRow) => Number(agreementRow.id) === Number(agreementId));
    if (!agreement) {
        throw new Error("Rental agreement not found.");
    }
    return agreement;
};
const syncAgreementLinks = async (client, agreementId, uniqueOrderId, orderlineIds, assetNumbers) => {
    await client.query(`
      UPDATE orderline
      SET agreementid = $1
      WHERE CAST(uniqueorderid AS TEXT) = $2
    `, [agreementId, uniqueOrderId]);
    if (assetNumbers.length > 0) {
        await client.query(`
        UPDATE stock_revo
        SET
          agreementid = $1,
          rentalassetstatus = COALESCE(rentalassetstatus, 'allocated')
        WHERE CAST(assetnumber AS TEXT) = ANY($2)
      `, [agreementId, assetNumbers]);
    }
    if (orderlineIds.length > 0) {
        await client.query(`
        UPDATE tickets
        SET agreementid = $1
        WHERE linkedorderlineid = ANY($2)
      `, [agreementId, orderlineIds]);
    }
};
const refreshAgreementContractSnapshot = async (client, agreementId, uniqueOrderId, modifiedBy = null) => {
    const existingAgreementResult = await client.query(`
      SELECT *
      FROM rental_agreement
      WHERE id = $1
      LIMIT 1
    `, [agreementId]);
    const existingAgreement = existingAgreementResult.rows[0] ?? null;
    if (!existingAgreement) {
        return {
            agreement: null,
            contractRows: [],
        };
    }
    const contractRows = await getAgreementContextRows(client, {
        customerId: null,
        uniqueOrderId,
    });
    if (contractRows.length === 0) {
        return {
            agreement: existingAgreement,
            contractRows: [],
        };
    }
    const groupedContract = groupAgreementContextRows(contractRows)[0];
    const pricingSnapshot = buildPricingSnapshot(contractRows);
    const updatedAgreementResult = await client.query(`
      UPDATE rental_agreement
      SET
        primaryorderlineid = $1,
        agreementstartdate = COALESCE(agreementstartdate, $2),
        agreementenddate = COALESCE($3, agreementenddate),
        billingfrequency = COALESCE($4, billingfrequency),
        pricingtermssnapshot = $5::jsonb,
        modifiedby = COALESCE($6, modifiedby)
      WHERE id = $7
      RETURNING *
    `, [
        groupedContract.primaryorderlineid ?? existingAgreement.primaryorderlineid,
        groupedContract.agreementstartdate ?? existingAgreement.agreementstartdate,
        groupedContract.agreementenddate ?? existingAgreement.agreementenddate,
        normalizeComparableText(existingAgreement.billingfrequency) ||
            DEFAULT_BILLING_FREQUENCY,
        JSON.stringify(pricingSnapshot),
        modifiedBy,
        agreementId,
    ]);
    await syncAgreementLinks(client, agreementId, uniqueOrderId, contractRows.map((row) => Number(row.orderlineid)), contractRows
        .map((row) => normalizeText(row.assetnumber))
        .filter(Boolean));
    return {
        agreement: updatedAgreementResult.rows[0] ?? existingAgreement,
        contractRows,
    };
};
const attachAgreementPdf = async (agreementId, options = {}) => {
    const agreementDetail = await getAgreementDetailById(agreementId);
    const pdfResult = await rentalAgreementPdfService.generateAgreementPdf(agreementDetail, agreementDetail.assets ?? [], { logoUrl: options.logoUrl });
    const updateResult = await query(`
      UPDATE rental_agreement
      SET
        agreementpdfurl = $1,
        agreementtemplateversion = $2,
        modifiedby = COALESCE($3, modifiedby)
      WHERE id = $4
      RETURNING *
    `, [
        pdfResult.url,
        AGREEMENT_TEMPLATE_VERSION,
        options.modifiedBy ?? null,
        agreementId,
    ]);
    return {
        agreement: updateResult.rows[0],
        pdf: pdfResult,
    };
};
export var rentalAgreementService;
(function (rentalAgreementService) {
    rentalAgreementService.getRentalAgreementCreateContext = async (request) => {
        const customerId = toPositiveInteger(request.query?.customerid, "customer id");
        const contextRows = await getAgreementContextRows(rootExecutor, {
            customerId,
            uniqueOrderId: null,
        });
        return groupAgreementContextRows(contextRows);
    };
    rentalAgreementService.getRentalAgreements = async (request) => {
        const customerIdRaw = request.query?.customerid;
        const customerId = customerIdRaw == null || customerIdRaw === ""
            ? null
            : toPositiveInteger(customerIdRaw, "customer id");
        const uniqueOrderId = normalizeText(request.query?.uniqueorderid);
        return getAgreementList(customerId, uniqueOrderId);
    };
    rentalAgreementService.getRentalAgreementById = async (request) => {
        const agreementId = toPositiveInteger(request.params?.id, "agreement id");
        return getAgreementDetailById(agreementId);
    };
    rentalAgreementService.createRentalAgreement = async (request) => {
        const client = await pool.connect();
        let transactionStarted = false;
        try {
            const uniqueOrderId = normalizeText(request.body?.uniqueorderid);
            const requestedPrimaryOrderLineId = request.body?.primaryorderlineid == null
                ? null
                : toPositiveInteger(request.body.primaryorderlineid, "primary order line id");
            if (!uniqueOrderId) {
                throw new Error("Unique order id is mandatory.");
            }
            const agreementStatus = normalizeComparableText(request.body?.agreementstatus) ||
                DEFAULT_AGREEMENT_STATUS;
            const billingFrequency = normalizeComparableText(request.body?.billingfrequency) ||
                DEFAULT_BILLING_FREQUENCY;
            const contractRows = await getAgreementContextRows(client, {
                customerId: null,
                uniqueOrderId,
            });
            if (contractRows.length === 0) {
                throw new Error("No active rental contract was found for the selected order.");
            }
            const existingAgreementResult = await client.query(`
          SELECT *
          FROM rental_agreement
          WHERE CAST(uniqueorderid AS TEXT) = $1
          ORDER BY id DESC
          LIMIT 1
        `, [uniqueOrderId]);
            if (existingAgreementResult.rows[0] &&
                NON_TERMINAL_AGREEMENT_STATUSES.has(normalizeComparableText(existingAgreementResult.rows[0].agreementstatus))) {
                throw new Error(`Agreement ${existingAgreementResult.rows[0].agreementnumber} already exists for this rental contract.`);
            }
            const groupedContract = groupAgreementContextRows(contractRows)[0];
            const primaryOrderLineId = requestedPrimaryOrderLineId ?? groupedContract.primaryorderlineid;
            const agreementStartDate = toOptionalEpoch(request.body?.agreementstartdate) ??
                groupedContract.agreementstartdate;
            const agreementEndDate = toOptionalEpoch(request.body?.agreementenddate) ??
                groupedContract.agreementenddate;
            if (!agreementStartDate || !agreementEndDate) {
                throw new Error("Agreement start date and agreement end date are required.");
            }
            if (agreementEndDate < agreementStartDate) {
                throw new Error("Agreement end date cannot be earlier than the agreement start date.");
            }
            const pricingSnapshot = buildPricingSnapshot(contractRows);
            const penaltySnapshot = buildPenaltySnapshot(request.body?.penaltytermsnotes);
            const creatorId = request.session?.id ?? null;
            const activationDate = getCurrentEpochSeconds();
            await client.query("BEGIN");
            transactionStarted = true;
            const insertAgreementResult = await client.query(`
          INSERT INTO rental_agreement (
            customerid,
            uniqueorderid,
            primaryorderlineid,
            agreementstatus,
            agreementstartdate,
            agreementenddate,
            originalagreementenddate,
            billingfrequency,
            pricingtermssnapshot,
            penaltytermssnapshot,
            agreementtemplateversion,
            createdby,
            modifiedby,
            activateddate
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14
          )
          RETURNING *
        `, [
                groupedContract.customerid,
                uniqueOrderId,
                primaryOrderLineId,
                agreementStatus,
                agreementStartDate,
                agreementEndDate,
                agreementEndDate,
                billingFrequency,
                JSON.stringify(pricingSnapshot),
                JSON.stringify(penaltySnapshot),
                AGREEMENT_TEMPLATE_VERSION,
                creatorId,
                creatorId,
                agreementStatus === "active" ? activationDate : null,
            ]);
            const insertedAgreement = insertAgreementResult.rows[0];
            const agreementNumber = formatAgreementNumber(insertedAgreement.id);
            const updatedAgreementNumberResult = await client.query(`
          UPDATE rental_agreement
          SET agreementnumber = $1
          WHERE id = $2
          RETURNING *
        `, [agreementNumber, insertedAgreement.id]);
            const persistedAgreement = updatedAgreementNumberResult.rows[0];
            const agreementAssets = contractRows.map((row) => ({
                agreementid: persistedAgreement.id,
                orderlineid: row.orderlineid,
                assetnumber: normalizeText(row.assetnumber),
                stockid: getStockIdentifier(row),
                assetstatus: getAgreementAssetStatus(row),
                iscurrentasset: true,
                allocatedfrom: parseDateLikeToEpoch(row.rentstartdate),
                allocatedto: parseDateLikeToEpoch(row.rentenddate),
                linkedticketid: null,
                createdby: creatorId,
            }));
            for (const agreementAsset of agreementAssets) {
                await client.query(`
            INSERT INTO rental_agreement_asset (
              agreementid,
              orderlineid,
              assetnumber,
              stockid,
              assetstatus,
              iscurrentasset,
              allocatedfrom,
              allocatedto,
              linkedticketid,
              createdby
            )
            VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10
            )
          `, [
                    agreementAsset.agreementid,
                    agreementAsset.orderlineid,
                    agreementAsset.assetnumber,
                    agreementAsset.stockid,
                    agreementAsset.assetstatus,
                    agreementAsset.iscurrentasset,
                    agreementAsset.allocatedfrom,
                    agreementAsset.allocatedto,
                    agreementAsset.linkedticketid,
                    agreementAsset.createdby,
                ]);
            }
            await syncAgreementLinks(client, persistedAgreement.id, uniqueOrderId, contractRows.map((row) => Number(row.orderlineid)), contractRows
                .map((row) => normalizeText(row.assetnumber))
                .filter(Boolean));
            await client.query("COMMIT");
            transactionStarted = false;
            let pdfWarning = null;
            try {
                await attachAgreementPdf(persistedAgreement.id, {
                    logoUrl: normalizeText(request.body?.logoUrl),
                    modifiedBy: creatorId,
                });
            }
            catch (pdfError) {
                console.error("Agreement PDF generation failed", pdfError);
                pdfWarning =
                    pdfError?.message ||
                        "Agreement was created, but the PDF could not be generated.";
            }
            return {
                message: pdfWarning
                    ? "Rental agreement created with PDF warning."
                    : "Rental agreement created successfully.",
                warning: pdfWarning,
                agreement: await getAgreementDetailById(persistedAgreement.id),
            };
        }
        catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK");
            }
            console.error("Query Execution Error: IN createRentalAgreement", error);
            throw new Error(error?.message || "Failed to create rental agreement.");
        }
        finally {
            client.release();
        }
    };
    rentalAgreementService.regenerateRentalAgreementPdf = async (request) => {
        const agreementId = toPositiveInteger(request.params?.id, "agreement id");
        const result = await attachAgreementPdf(agreementId, {
            logoUrl: normalizeText(request.body?.logoUrl),
            modifiedBy: request.session?.id ?? null,
        });
        return {
            message: "Rental agreement PDF generated successfully.",
            agreement: await getAgreementDetailById(Number(result.agreement.id)),
            pdf: result.pdf,
        };
    };
    rentalAgreementService.refreshRentalAgreementPdfById = async (agreementId, options = {}) => attachAgreementPdf(agreementId, options);
    rentalAgreementService.syncTechnicalReplacementAgreement = async ({ executor, agreementId, uniqueOrderId, orderlineId, oldAssetNumber = null, newAssetNumber, newStockId = null, ticketId, modifiedBy = null, }) => {
        if (agreementId == null || orderlineId == null || !normalizeText(uniqueOrderId)) {
            return {
                agreement: null,
                agreementAsset: null,
                contractRows: [],
            };
        }
        const normalizedOldAssetNumber = normalizeText(oldAssetNumber);
        const normalizedNewAssetNumber = normalizeText(newAssetNumber);
        const agreementAssetUpdateResult = await executor.query(`
        WITH target_asset AS (
          SELECT id
          FROM rental_agreement_asset
          WHERE agreementid = $1
            AND orderlineid = $2
            AND COALESCE(iscurrentasset, TRUE) = TRUE
            AND (
              $3::text IS NULL
              OR CAST(assetnumber AS TEXT) = $3
            )
          ORDER BY
            CASE
              WHEN $3::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $3 THEN 0
              ELSE 1
            END,
            id DESC
          LIMIT 1
        )
        UPDATE rental_agreement_asset
        SET
          assetnumber = COALESCE($4, assetnumber),
          stockid = COALESCE($5, stockid),
          assetstatus = 'allocated',
          iscurrentasset = TRUE,
          linkedticketid = $6
        WHERE id IN (SELECT id FROM target_asset)
        RETURNING *
      `, [
            agreementId,
            orderlineId,
            normalizedOldAssetNumber,
            normalizedNewAssetNumber,
            newStockId,
            ticketId,
        ]);
        const agreementAsset = agreementAssetUpdateResult.rows[0] ??
            (await executor.query(`
            INSERT INTO rental_agreement_asset (
              agreementid,
              orderlineid,
              assetnumber,
              stockid,
              assetstatus,
              iscurrentasset,
              linkedticketid,
              createdby
            )
            VALUES ($1, $2, $3, $4, 'allocated', TRUE, $5, $6)
            RETURNING *
          `, [
                agreementId,
                orderlineId,
                normalizedNewAssetNumber,
                newStockId,
                ticketId,
                modifiedBy,
            ])).rows[0] ?? null;
        const snapshotResult = await refreshAgreementContractSnapshot(executor, agreementId, normalizeText(uniqueOrderId), modifiedBy);
        return {
            agreement: snapshotResult.agreement,
            agreementAsset,
            contractRows: snapshotResult.contractRows,
        };
    };
    rentalAgreementService.syncCommercialReplacementAgreement = async ({ executor, agreementId, uniqueOrderId, oldOrderlineId, newOrderlineId, oldAssetNumber = null, newAssetNumber, newStockId = null, actionEpoch, ticketId, modifiedBy = null, }) => {
        if (agreementId == null ||
            oldOrderlineId == null ||
            newOrderlineId == null ||
            !normalizeText(uniqueOrderId)) {
            return {
                agreement: null,
                previousAgreementAsset: null,
                currentAgreementAsset: null,
                contractRows: [],
            };
        }
        const normalizedOldAssetNumber = normalizeText(oldAssetNumber);
        const normalizedNewAssetNumber = normalizeText(newAssetNumber);
        const previousAgreementAssetResult = await executor.query(`
        WITH target_asset AS (
          SELECT id
          FROM rental_agreement_asset
          WHERE agreementid = $1
            AND orderlineid = $2
            AND COALESCE(iscurrentasset, TRUE) = TRUE
            AND (
              $3::text IS NULL
              OR CAST(assetnumber AS TEXT) = $3
            )
          ORDER BY
            CASE
              WHEN $3::text IS NOT NULL AND CAST(assetnumber AS TEXT) = $3 THEN 0
              ELSE 1
            END,
            id DESC
          LIMIT 1
        )
        UPDATE rental_agreement_asset
        SET
          assetstatus = 'replaced',
          iscurrentasset = FALSE,
          allocatedto = COALESCE($4, allocatedto),
          linkedticketid = $5
        WHERE id IN (SELECT id FROM target_asset)
        RETURNING *
      `, [
            agreementId,
            oldOrderlineId,
            normalizedOldAssetNumber,
            actionEpoch,
            ticketId,
        ]);
        const existingCurrentAssetResult = await executor.query(`
        SELECT *
        FROM rental_agreement_asset
        WHERE agreementid = $1
          AND orderlineid = $2
          AND CAST(assetnumber AS TEXT) = $3
        ORDER BY id DESC
        LIMIT 1
      `, [agreementId, newOrderlineId, normalizedNewAssetNumber]);
        let currentAgreementAsset = existingCurrentAssetResult.rows[0] ?? null;
        if (currentAgreementAsset) {
            const updatedCurrentAssetResult = await executor.query(`
          UPDATE rental_agreement_asset
          SET
            stockid = COALESCE($1, stockid),
            assetstatus = 'allocated',
            iscurrentasset = TRUE,
            allocatedfrom = COALESCE($2, allocatedfrom),
            linkedticketid = $3
          WHERE id = $4
          RETURNING *
        `, [newStockId, actionEpoch, ticketId, currentAgreementAsset.id]);
            currentAgreementAsset = updatedCurrentAssetResult.rows[0] ?? currentAgreementAsset;
        }
        else {
            const insertedAgreementAssetResult = await executor.query(`
          INSERT INTO rental_agreement_asset (
            agreementid,
            orderlineid,
            assetnumber,
            stockid,
            assetstatus,
            iscurrentasset,
            allocatedfrom,
            linkedticketid,
            createdby
          )
          VALUES ($1, $2, $3, $4, 'allocated', TRUE, $5, $6, $7)
          RETURNING *
        `, [
                agreementId,
                newOrderlineId,
                normalizedNewAssetNumber,
                newStockId,
                actionEpoch,
                ticketId,
                modifiedBy,
            ]);
            currentAgreementAsset = insertedAgreementAssetResult.rows[0] ?? null;
        }
        const snapshotResult = await refreshAgreementContractSnapshot(executor, agreementId, normalizeText(uniqueOrderId), modifiedBy);
        return {
            agreement: snapshotResult.agreement,
            previousAgreementAsset: previousAgreementAssetResult.rows[0] ?? null,
            currentAgreementAsset,
            contractRows: snapshotResult.contractRows,
        };
    };
})(rentalAgreementService || (rentalAgreementService = {}));
//# sourceMappingURL=rentalAgreement.service.js.map