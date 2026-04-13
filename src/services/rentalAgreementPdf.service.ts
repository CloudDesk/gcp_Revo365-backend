import { admin } from "../firebase/firebaseAdmin.js";
import { getRentalAgreementTemplate } from "../utils/rentalAgreementHandlebars.js";

const RENTAL_AGREEMENT_BUCKET = "rental-agreeements";
const RENTAL_AGREEMENT_FOLDER = "rental-agreements";

// ── Sanitise filename ────────────────────────────────────────────────────────
const sanitizeFileName = (value: any) =>
  String(value ?? "rental-agreement")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "rental-agreement";

// ── Epoch normaliser ─────────────────────────────────────────────────────────
const normaliseEpoch = (value: any): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.trunc(n)).length <= 10 ? n : Math.trunc(n / 1000);
};

// ── Currency formatter ───────────────────────────────────────────────────────
const toNum = (v: any): number => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ── Build the template data object ───────────────────────────────────────────
const buildAgreementData = (
  agreement: any,
  assets: any[],
  options: Record<string, any> = {}
) => {
  const customerName = [agreement.firstname, agreement.lastname]
    .filter(Boolean)
    .join(" ")
    .trim();

  const equipmentItems = assets.map((asset: any, idx: number) => ({
    sNo: idx + 1,
    assetNumber: asset.assetnumber ?? asset.orderlinenumber ?? "-",
    deliveryDate:
      normaliseEpoch(asset.rentstartdate) ??
      normaliseEpoch(agreement.agreementstartdate),
    makeModel: asset.productname ?? "-",
    serialNumber: asset.serialnumber ?? asset.assetnumber ?? "-",
    accessories: asset.accessories ?? "Laptop Bag, Power Adapter",
    monthlyRentalExclGST: toNum(asset.productamount),
    remarks: asset.remarks ?? "",
  }));

  const totalMonthly = equipmentItems.reduce(
    (sum, item) => sum + item.monthlyRentalExclGST,
    0
  );

  const conditionReport = assets.map((asset: any) => ({
    assetNumber: asset.assetnumber ?? "-",
    model: asset.productname ?? "-",
    serialNumber: asset.serialnumber ?? asset.assetnumber ?? "-",
    conditionOnDelivery: asset.conditionOnDelivery ?? "Good",
    preExistingDamageNotes: asset.preExistingDamageNotes ?? "",
  }));

  return {
    agreementDate:
      normaliseEpoch(agreement.agreementstartdate) ??
      Math.floor(Date.now() / 1000),
    agreementNumber: agreement.agreementnumber ?? `TEQIT/RA/-`,

    lessor: {
      name: "TEQIT",
      address:
        "1/54, Old Mahabalipuram Road, Seevaram, Perungudi Rajiv Gandhi Salai, Chennai - 600096",
      gstin: "33AAMCR5393J1ZV",
      email: options.lessorEmail ?? "rentals@teqit.in",
      logoUrl: options.logoUrl ?? null,
    },

    lessee: {
      companyName:
        (options.lesseeCompanyName ?? customerName) || "Customer",
      address: options.lesseeAddress ?? assets[0]?.location ?? "",
      gstin: options.lesseeGstin ?? null,
      contactPersonName: customerName || null,
      contactPhone: agreement.usermobilenumber ?? null,
      contactEmail: agreement.useremail ?? null,
      authorizedSignatoryName:
        options.lesseeSignatoryName ?? customerName ?? null,
      authorizedSignatoryDesignation:
        options.lesseeSignatoryDesignation ?? null,
    },

    rentalTerms: {
      minimumLockInMonths:
        options.minimumLockInMonths ??
        Math.max(...assets.map((a: any) => Number(a.rentalfor ?? 0)), 12),
      deliveryDate:
        normaliseEpoch(assets[0]?.rentstartdate) ??
        normaliseEpoch(agreement.agreementstartdate),
      rentalEndDate: normaliseEpoch(agreement.agreementenddate),
      autoRenewalEnabled: options.autoRenewalEnabled ?? true,
      earlyTerminationNoticeDays: options.earlyTerminationNoticeDays ?? 30,
      maintenanceSLADays: options.maintenanceSLADays ?? 3,
      arbitrationCity: options.arbitrationCity ?? "Chennai",
      jurisdictionCity: options.jurisdictionCity ?? "Chennai",
      customTermsClause: options.customTermsClause ?? null,
    },

    paymentTerms: {
      monthlyRentalExclGST:
        toNum(agreement.pricingtermssnapshot?.monthlyamount) || totalMonthly,
      gstType: options.gstType ?? "CGST+SGST",
      cgstPercentage: options.cgstPercentage ?? 9,
      sgstPercentage: options.sgstPercentage ?? 9,
      igstPercentage: options.igstPercentage ?? 18,
      paymentDueDay: options.paymentDueDay ?? 5,
      latePaymentPenaltyPct: options.latePaymentPenaltyPct ?? 2,
      latePaymentGraceDays: options.latePaymentGraceDays ?? 15,
      firstMonthProRata: options.firstMonthProRata ?? true,
      acceptedPaymentModes: options.acceptedPaymentModes ?? [
        "NEFT",
        "RTGS",
        "UPI",
        "Cheque",
      ],
      paymentFavourOf: "TEQIT",
    },

    securityDeposit: {
      amount: toNum(options.securityDepositAmount),
      chequeTransferRef: options.securityDepositRef ?? null,
      refundTimingDays: options.refundTimingDays ?? 15,
      adjustableAgainstRent: false,
    },

    logistics: {
      deliveryAddress:
        options.deliveryAddress ??
        assets[0]?.location ??
        "",
      logisticsChargesBorneBy: options.logisticsChargesBorneBy ?? "Lessee",
      relocationConsentRequired: true,
    },

    equipment: {
      items: equipmentItems,
      totalMonthlyRentalExclGST: totalMonthly,
    },

    deliveryAcknowledgement: {
      customerName: customerName,
      deliveryDate:
        normaliseEpoch(assets[0]?.rentstartdate) ??
        normaliseEpoch(agreement.agreementstartdate),
      deliveryAddress:
        options.deliveryAddress ?? assets[0]?.location ?? "",
      conditionReport,
      lessorDeliveryRepName: options.lessorDeliveryRepName ?? "",
      lesseeRecipientName:
        options.lesseeRecipientName ?? customerName ?? "",
      lesseeRecipientDate:
        normaliseEpoch(assets[0]?.rentstartdate) ??
        normaliseEpoch(agreement.agreementstartdate),
    },

    theftLossDeclaration: {
      declarationDate: null,
      incidentDate: null,
      incidentTime: null,
      incidentLocation: null,
      affectedAssetNumbers: assets.map((a: any) => a.assetnumber ?? "-"),
      affectedSerialNumbers: assets.map((a: any) => a.assetnumber ?? "-"),
      circumstancesOfLoss: null,
      incidentType: "stolen / lost",
      firNcNumber: null,
      policeStation: null,
      firFilingDate: null,
      signatoryName: options.lesseeSignatoryName ?? customerName ?? "",
      signatoryDesignation: options.lesseeSignatoryDesignation ?? "",
    },

    signatures: {
      lessorSignatoryName:
        options.lessorSignatoryName ?? "Authorized Representative",
      lessorSignatoryDesignation: options.lessorSignatoryDesignation ?? "Director",
      lessorSignatureDate: Math.floor(Date.now() / 1000),
      lesseeSignatoryName:
        options.lesseeSignatoryName ?? customerName ?? "",
      lesseeSignatoryDesignation: options.lesseeSignatoryDesignation ?? "",
      lesseeSignatureDate: null,
      witness1Name: options.witness1Name ?? null,
      witness1SignatureDate: null,
      witness2Name: options.witness2Name ?? null,
      witness2SignatureDate: null,
    },
  };
};

// ── Puppeteer PDF generator ──────────────────────────────────────────────────
const generatePdfBuffer = async (html: string): Promise<Buffer> => {
  // Dynamic import so the service still loads even if puppeteer isn't installed yet
  let browser: any;
  try {
    const puppeteer = await import("puppeteer-core");
    let executablePath: string;

    // Try @sparticuz/chromium first (GCP/Cloud Run compatible)
    try {
      const chromium = await import("@sparticuz/chromium");
      executablePath = await chromium.default.executablePath();
      browser = await puppeteer.default.launch({
        args: chromium.default.args,
        defaultViewport: { width: 1280, height: 800 },
        executablePath,
        headless: true,
      });
    } catch {
      // Fallback: try local Chrome/Chromium
      const possiblePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
      ];
      const fs = await import("fs");
      executablePath =
        possiblePaths.find((p) => fs.default.existsSync(p)) ?? "";
      if (!executablePath) {
        throw new Error(
          "No Chrome/Chromium executable found. Install @sparticuz/chromium or Google Chrome."
        );
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
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    throw err;
  }
};

// ── Public service ───────────────────────────────────────────────────────────
export module rentalAgreementPdfService {
  export const generateAgreementPdf = async (
    agreement: any,
    assets: any[],
    options: {
      logoUrl?: string | null;
      lesseeCompanyName?: string | null;
      lesseeAddress?: string | null;
      lesseeGstin?: string | null;
      lesseeSignatoryName?: string | null;
      lesseeSignatoryDesignation?: string | null;
      securityDepositAmount?: number | null;
      securityDepositRef?: string | null;
      minimumLockInMonths?: number | null;
      customTermsClause?: string | null;
      arbitrationCity?: string | null;
      jurisdictionCity?: string | null;
      lessorDeliveryRepName?: string | null;
      [key: string]: any;
    } = {}
  ) => {
    // 1. Build data
    const data = buildAgreementData(agreement, assets, options);

    // 2. Render HTML via Handlebars
    const template = getRentalAgreementTemplate();
    const html = template(data);

    // 3. Generate PDF via Puppeteer
    const pdfBuffer = await generatePdfBuffer(html);

    // 4. Upload to GCP Cloud Storage
    const safeAgreementNumber = sanitizeFileName(
      agreement.agreementnumber ?? agreement.id
    );
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
    } catch (error: any) {
      const msg = String(error?.message ?? "");
      if (msg.includes("invalid_grant") || msg.includes("Invalid JWT Signature")) {
        throw new Error(
          "GCP authentication failed for bucket upload. Use Application Default Credentials locally or the assigned Cloud Run identity."
        );
      }
      throw error;
    }

    return {
      bucket: RENTAL_AGREEMENT_BUCKET,
      folder: RENTAL_AGREEMENT_FOLDER,
      destination,
      url: `https://storage.googleapis.com/${RENTAL_AGREEMENT_BUCKET}/${destination}?v=${generatedAt}`,
    };
  };
}
