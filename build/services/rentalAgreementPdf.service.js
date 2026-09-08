import { admin } from "../firebase/firebaseAdmin.js";
import { getRentalAgreementTemplate } from "../utils/rentalAgreementHandlebars.js";
const RENTAL_AGREEMENT_BUCKET = "rental-agreeements";
const RENTAL_AGREEMENT_FOLDER = "rental-agreements";
const DOCUMENT_VERSION = "v1";
const LESSOR_DETAILS = {
    companyName: "TEQIT",
    address: "1/54, Old Mahabalipuram Road, Seevaram, Perungudi Rajiv Gandhi Salai, Chennai - 600096",
    gstin: "33AAMCR5393J1ZV",
    noticeEmailOrAddress: "rentals@teqit.in",
};
const sanitizeFileName = (value) => String(value ?? "rental-agreement")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "rental-agreement";
const normalizeText = (value) => {
    const text = String(value ?? "").trim();
    return text || null;
};
const normaliseEpoch = (value) => {
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
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }
    return Math.floor(parsedDate.getTime() / 1000);
};
const toNum = (value) => {
    const numericValue = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numericValue) ? numericValue : 0;
};
const toOptionalNumber = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
};
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
const buildAddressText = (source) => {
    const parts = [
        source?.address_doornumber,
        source?.address_address,
        source?.address_landmark,
        source?.address_city,
        source?.address_state,
        source?.address_pincode,
    ]
        .map((part) => normalizeText(part))
        .filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
};
const coalesceText = (...values) => {
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized) {
            return normalized;
        }
    }
    return null;
};
const coalesceEpoch = (...values) => {
    for (const value of values) {
        const normalized = normaliseEpoch(value);
        if (normalized) {
            return normalized;
        }
    }
    return null;
};
const formatEpochTime = (value) => {
    const epoch = normaliseEpoch(value);
    if (!epoch) {
        return null;
    }
    const parsedDate = new Date(epoch * 1000);
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }
    return parsedDate.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
};
const getAccessoriesText = (asset) => coalesceText(asset?.accessories, asset?.laptopaccessories, asset?.mobileaccessories, asset?.accessoriesincluded);
const deriveSecurityDepositMonths = (securityDepositAmount, totalMonthlyRentalExclGst) => {
    if (securityDepositAmount == null ||
        securityDepositAmount <= 0 ||
        totalMonthlyRentalExclGst <= 0) {
        return null;
    }
    const derivedValue = securityDepositAmount / totalMonthlyRentalExclGst;
    const roundedValue = Math.round(derivedValue);
    return Math.abs(derivedValue - roundedValue) < 0.01 ? roundedValue : null;
};
const indexRowsByAssetNumber = (rows, assetKey) => new Map((Array.isArray(rows) ? rows : [])
    .filter((row) => normalizeText(row?.[assetKey]))
    .map((row) => [String(row[assetKey]).trim(), row]));
const normalizeOverrideRows = (rows, assetKey) => Array.isArray(rows)
    ? rows
        .map((row) => ({
        ...row,
        [assetKey]: normalizeText(row?.[assetKey]),
    }))
        .filter((row) => row[assetKey])
    : [];
const buildAgreementDocument = (agreement, assets, options = {}) => {
    const previousDocument = parseJsonValue(agreement.documentsnapshot, {});
    const pricingSnapshot = parseJsonValue(agreement.pricingtermssnapshot, {});
    const customerPersonName = [agreement.firstname, agreement.lastname]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(" ");
    const registeredAddress = coalesceText(options.lesseeAddress, previousDocument?.lessee?.registeredAddress, buildAddressText(agreement), buildAddressText(assets[0]), assets[0]?.location) || "";
    const deliveryAddress = coalesceText(options.deliveryAddress, previousDocument?.annexure1?.deliveryAddress, previousDocument?.annexure2?.deliveryAddress, buildAddressText(agreement), buildAddressText(assets[0]), assets[0]?.location, registeredAddress) || "";
    const customerCompanyName = coalesceText(options.lesseeCompanyName, previousDocument?.lessee?.customerCompanyName, agreement.companyname) ||
        customerPersonName ||
        "Customer";
    const agreementDate = coalesceEpoch(agreement.agreementstartdate, previousDocument?.agreementDate, Date.now()) ?? Math.floor(Date.now() / 1000);
    const totalMonthlyRentalExclGst = toNum(pricingSnapshot?.monthlyamount) ||
        assets.reduce((sum, asset) => sum + toNum(asset?.productamount), 0);
    const securityDepositAmount = toOptionalNumber(options.securityDepositAmount) ??
        toOptionalNumber(previousDocument?.annexure1?.securityDepositAmount) ??
        null;
    const securityDepositMonths = toOptionalNumber(options.securityDepositMonths) ??
        toOptionalNumber(previousDocument?.commercial?.securityDepositMonths) ??
        deriveSecurityDepositMonths(securityDepositAmount, totalMonthlyRentalExclGst);
    const minimumLockInMonths = toOptionalNumber(options.minimumLockInMonths) ??
        toOptionalNumber(previousDocument?.commercial?.minimumLockInMonths) ??
        Math.max(...assets.map((asset) => Number(asset?.rentalfor ?? 0)), 0);
    const commercialCity = coalesceText(previousDocument?.commercial?.city, agreement.address_city, assets[0]?.address_city, options.arbitrationCity, options.jurisdictionCity, "Chennai") || "Chennai";
    const annexure1RowIndex = indexRowsByAssetNumber(previousDocument?.annexure1?.equipmentRows, "assetNo");
    const annexure1OverrideIndex = indexRowsByAssetNumber(normalizeOverrideRows(options.annexure1EquipmentRows, "assetNo"), "assetNo");
    const annexure2RowIndex = indexRowsByAssetNumber(previousDocument?.annexure2?.deliveryRows, "assetNo");
    const annexure2OverrideIndex = indexRowsByAssetNumber(normalizeOverrideRows(options.annexure2DeliveryRows, "assetNo"), "assetNo");
    const equipmentRows = assets.map((asset, index) => {
        const previousRow = annexure1RowIndex.get(String(asset.assetnumber ?? "").trim());
        const overrideRow = annexure1OverrideIndex.get(String(asset.assetnumber ?? "").trim());
        return {
            sno: index + 1,
            assetNo: coalesceText(asset.assetnumber, previousRow?.assetNo, "-") || "-",
            dateOfDelivery: coalesceEpoch(asset.rentstartdate, asset.deliverydate, previousRow?.dateOfDelivery, agreement.agreementstartdate) ?? agreementDate,
            makeModel: coalesceText(asset.productname, [asset.brand, asset.model].filter(Boolean).join(" "), previousRow?.makeModel, "-") || "-",
            serialNo: coalesceText(asset.serialnumber, previousRow?.serialNo, asset.assetnumber, "-") ||
                "-",
            accessories: coalesceText(overrideRow?.accessories, getAccessoriesText(asset), previousRow?.accessories) || "",
            monthlyRentalExclGst: toOptionalNumber(asset.productamount) ??
                toOptionalNumber(previousRow?.monthlyRentalExclGst) ??
                0,
            remarks: coalesceText(overrideRow?.remarks, asset.remarks, previousRow?.remarks) || "",
        };
    });
    const deliveryRows = assets.map((asset, index) => {
        const previousRow = annexure2RowIndex.get(String(asset.assetnumber ?? "").trim());
        const overrideRow = annexure2OverrideIndex.get(String(asset.assetnumber ?? "").trim());
        return {
            sno: index + 1,
            assetNo: coalesceText(asset.assetnumber, previousRow?.assetNo, "-") || "-",
            model: coalesceText(asset.productname, [asset.brand, asset.model].filter(Boolean).join(" "), previousRow?.model, "-") || "-",
            serialNo: coalesceText(asset.serialnumber, previousRow?.serialNo, asset.assetnumber, "-") ||
                "-",
            conditionOnDelivery: coalesceText(overrideRow?.conditionOnDelivery, previousRow?.conditionOnDelivery, asset.conditionondelivery, asset.damageassessment, "Good") || "Good",
            preExistingDamageNotes: coalesceText(overrideRow?.preExistingDamageNotes, previousRow?.preExistingDamageNotes, asset.preexistingdamagenotes, asset.lostreason) || "",
        };
    });
    const affectedAssetNos = equipmentRows
        .map((row) => row.assetNo)
        .filter((value) => value && value !== "-");
    const affectedSerialNos = equipmentRows
        .map((row) => row.serialNo)
        .filter((value) => value && value !== "-");
    const annexure3Options = options.annexure3 ?? {};
    const lostIncidentEpoch = coalesceEpoch(annexure3Options?.incidentDate, previousDocument?.annexure3?.incidentDate, assets.find((asset) => asset?.lostdate)?.lostdate) ?? null;
    return {
        agreementDate,
        agreementNumber: coalesceText(agreement.agreementnumber, previousDocument?.agreementNumber, "-"),
        lessor: {
            companyName: LESSOR_DETAILS.companyName,
            address: LESSOR_DETAILS.address,
            gstin: LESSOR_DETAILS.gstin,
            noticeEmailOrAddress: LESSOR_DETAILS.noticeEmailOrAddress,
        },
        lessee: {
            customerCompanyName: customerCompanyName,
            registeredAddress: registeredAddress,
            gstin: coalesceText(options.lesseeGstin, previousDocument?.lessee?.gstin, agreement.gstnumber, assets[0]?.gstnumber) || "",
        },
        commercial: {
            minimumLockInMonths: minimumLockInMonths ?? 0,
            securityDepositMonths,
            city: commercialCity,
        },
        annexure1: {
            date: agreementDate,
            securityDepositAmount,
            chequeTransferRef: coalesceText(options.securityDepositRef, previousDocument?.annexure1?.chequeTransferRef) || "",
            minimumLockInPeriodMonths: minimumLockInMonths ?? 0,
            deliveryAddress,
            totalMonthlyRentalExclGst,
            equipmentRows,
        },
        annexure2: {
            customerName: coalesceText(previousDocument?.annexure2?.customerName, customerCompanyName) ||
                customerCompanyName,
            deliveryDate: coalesceEpoch(assets[0]?.rentstartdate, assets[0]?.deliverydate, previousDocument?.annexure2?.deliveryDate, agreement.agreementstartdate) ?? agreementDate,
            deliveryAddress,
            deliveryRows,
        },
        annexure3: {
            declarationDate: coalesceEpoch(annexure3Options?.declarationDate, previousDocument?.annexure3?.declarationDate) ?? null,
            letterheadAddress: coalesceText(annexure3Options?.letterheadAddress, previousDocument?.annexure3?.letterheadAddress, registeredAddress) ||
                "",
            incidentDate: lostIncidentEpoch,
            incidentTime: coalesceText(annexure3Options?.incidentTime, previousDocument?.annexure3?.incidentTime, formatEpochTime(lostIncidentEpoch)) || "",
            incidentLocation: coalesceText(annexure3Options?.incidentLocation, previousDocument?.annexure3?.incidentLocation) || "",
            affectedAssetNos,
            affectedSerialNos,
            circumstances: coalesceText(annexure3Options?.circumstances, previousDocument?.annexure3?.circumstances, assets.find((asset) => asset?.lostreason)?.lostreason) || "",
            firNcNumber: coalesceText(annexure3Options?.firNcNumber, previousDocument?.annexure3?.firNcNumber) || "",
            policeStation: coalesceText(annexure3Options?.policeStation, previousDocument?.annexure3?.policeStation) || "",
            firNcFilingDate: coalesceEpoch(annexure3Options?.firNcFilingDate, previousDocument?.annexure3?.firNcFilingDate) ?? null,
            finalizedAt: coalesceEpoch(annexure3Options?.finalizedAt, previousDocument?.annexure3?.finalizedAt) ?? null,
            finalizedBy: coalesceText(annexure3Options?.finalizedBy, previousDocument?.annexure3?.finalizedBy) || "",
        },
        signatures: {
            lesseeSignatoryName: coalesceText(options.lesseeSignatoryName, previousDocument?.signatures?.lesseeSignatoryName, customerPersonName) || "",
            lesseeSignatoryDesignation: coalesceText(options.lesseeSignatoryDesignation, previousDocument?.signatures?.lesseeSignatoryDesignation) || "",
            witness1Name: coalesceText(options.witness1Name, previousDocument?.signatures?.witness1Name) || "",
            witness2Name: coalesceText(options.witness2Name, previousDocument?.signatures?.witness2Name) || "",
        },
    };
};
const generatePdfBuffer = async (html) => {
    let browser;
    try {
        const puppeteer = await import("puppeteer-core");
        let executablePath;
        try {
            const chromium = await import("@sparticuz/chromium");
            executablePath = await chromium.default.executablePath();
            browser = await puppeteer.default.launch({
                args: chromium.default.args,
                defaultViewport: { width: 1280, height: 800 },
                executablePath,
                headless: true,
            });
        }
        catch {
            const possiblePaths = [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
                "/usr/bin/google-chrome",
                "/usr/bin/google-chrome-stable",
                "/usr/bin/chromium-browser",
                "/usr/bin/chromium",
                "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            ];
            const fs = await import("fs");
            executablePath =
                possiblePaths.find((pathValue) => fs.default.existsSync(pathValue)) ?? "";
            if (!executablePath) {
                throw new Error("No Chrome/Chromium executable found. Install @sparticuz/chromium or Google Chrome.");
            }
            browser = await puppeteer.default.launch({
                executablePath,
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
        }
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
        });
        await browser.close();
        return Buffer.from(pdf);
    }
    catch (error) {
        if (browser) {
            try {
                await browser.close();
            }
            catch {
                // ignore browser cleanup failures
            }
        }
        throw error;
    }
};
export var rentalAgreementPdfService;
(function (rentalAgreementPdfService) {
    rentalAgreementPdfService.generateAgreementPdf = async (agreement, assets, options = {}) => {
        const document = buildAgreementDocument(agreement, assets, options);
        const template = getRentalAgreementTemplate();
        const html = template(document);
        const pdfBuffer = await generatePdfBuffer(html);
        const safeAgreementNumber = sanitizeFileName(agreement.agreementnumber ?? agreement.id);
        const generatedAt = Date.now();
        const destination = `${RENTAL_AGREEMENT_FOLDER}/${safeAgreementNumber}.pdf`;
        const bucket = admin.storage().bucket(RENTAL_AGREEMENT_BUCKET);
        const uploadedFile = bucket.file(destination);
        try {
            await uploadedFile.save(pdfBuffer, {
                contentType: "application/pdf",
                resumable: false,
                metadata: {
                    cacheControl: "no-store, max-age=0",
                    contentDisposition: `inline; filename="${safeAgreementNumber}.pdf"`,
                },
            });
        }
        catch (error) {
            const message = String(error?.message ?? "");
            if (message.includes("invalid_grant") ||
                message.includes("Invalid JWT Signature")) {
                throw new Error("GCP authentication failed for bucket upload. Use Application Default Credentials locally or the assigned Cloud Run identity.");
            }
            throw error;
        }
        return {
            bucket: RENTAL_AGREEMENT_BUCKET,
            folder: RENTAL_AGREEMENT_FOLDER,
            destination,
            url: `https://storage.googleapis.com/${RENTAL_AGREEMENT_BUCKET}/${destination}?v=${generatedAt}`,
            document,
            documentVersion: DOCUMENT_VERSION,
        };
    };
})(rentalAgreementPdfService || (rentalAgreementPdfService = {}));
//# sourceMappingURL=rentalAgreementPdf.service.js.map