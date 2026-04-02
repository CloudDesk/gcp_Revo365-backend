import fs from "fs";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { admin } from "../firebase/firebaseAdmin.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RENTAL_AGREEMENT_BUCKET = "rental-agreeements";
const RENTAL_AGREEMENT_FOLDER = "rental-agreements";
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const DEFAULT_TEXT_COLOR = [0.11, 0.14, 0.2];
const MUTED_TEXT_COLOR = [0.36, 0.45, 0.59];
const BORDER_COLOR = [0.82, 0.86, 0.91];
const LIGHT_FILL_COLOR = [0.97, 0.98, 1];
const TITLE_FILL_COLOR = [0.92, 0.95, 1];
const sanitizeFileName = (value) => String(value ?? "rental-agreement")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "rental-agreement";
const formatDate = (value) => {
    if (value == null || value === "") {
        return "-";
    }
    const numericValue = Number(value);
    const normalizedValue = Number.isFinite(numericValue) && numericValue > 0
        ? String(Math.trunc(numericValue)).length <= 10
            ? numericValue * 1000
            : numericValue
        : value;
    const date = new Date(normalizedValue);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};
const formatCurrency = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return "INR 0.00";
    }
    return `INR ${numericValue.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
};
const escapePdfText = (value) => String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ");
const colorToPdf = (rgb) => rgb.map((value) => value.toFixed(3)).join(" ");
const measureTextWidth = (text, fontSize, bold = false) => {
    const safeText = String(text ?? "");
    const averageCharacterWidth = bold ? 0.56 : 0.51;
    return safeText.length * fontSize * averageCharacterWidth;
};
const wrapText = (text, maxWidth, fontSize, bold = false) => {
    const normalizedText = String(text ?? "").replace(/\s+/g, " ").trim();
    if (!normalizedText) {
        return [""];
    }
    const words = normalizedText.split(" ");
    const lines = [];
    let currentLine = "";
    words.forEach((word) => {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (measureTextWidth(candidate, fontSize, bold) <= maxWidth) {
            currentLine = candidate;
            return;
        }
        if (currentLine) {
            lines.push(currentLine);
        }
        if (measureTextWidth(word, fontSize, bold) <= maxWidth) {
            currentLine = word;
            return;
        }
        let remainingWord = word;
        while (remainingWord.length > 0) {
            let splitIndex = remainingWord.length;
            while (splitIndex > 1 &&
                measureTextWidth(`${remainingWord.slice(0, splitIndex)}-`, fontSize, bold) > maxWidth) {
                splitIndex -= 1;
            }
            if (splitIndex <= 1) {
                break;
            }
            const chunk = remainingWord.slice(0, splitIndex);
            remainingWord = remainingWord.slice(splitIndex);
            lines.push(remainingWord ? `${chunk}-` : chunk);
        }
        currentLine = remainingWord;
    });
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines.length > 0 ? lines : [""];
};
const parseJpegDimensions = (buffer) => {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        throw new Error("Unsupported logo format. Expected JPEG data.");
    }
    let offset = 2;
    while (offset < buffer.length) {
        while (offset < buffer.length && buffer[offset] === 0xff) {
            offset += 1;
        }
        const marker = buffer[offset];
        offset += 1;
        if (marker === 0xd9 || marker === 0xda) {
            break;
        }
        if (offset + 1 >= buffer.length) {
            break;
        }
        const blockLength = buffer.readUInt16BE(offset);
        offset += 2;
        if (marker === 0xc0 ||
            marker === 0xc1 ||
            marker === 0xc2 ||
            marker === 0xc3 ||
            marker === 0xc5 ||
            marker === 0xc6 ||
            marker === 0xc7 ||
            marker === 0xc9 ||
            marker === 0xca ||
            marker === 0xcb ||
            marker === 0xcd ||
            marker === 0xce ||
            marker === 0xcf) {
            const height = buffer.readUInt16BE(offset + 1);
            const width = buffer.readUInt16BE(offset + 3);
            return { width, height };
        }
        offset += blockLength - 2;
    }
    throw new Error("Unable to read JPEG dimensions for rental agreement logo.");
};
const loadTeqitLogo = () => {
    const candidatePaths = [
        path.resolve(__dirname, "../../assets/teqit_logo.jpeg"),
        path.resolve(process.cwd(), "assets/teqit_logo.jpeg"),
    ];
    for (const candidatePath of candidatePaths) {
        if (!fs.existsSync(candidatePath)) {
            continue;
        }
        try {
            const buffer = fs.readFileSync(candidatePath);
            const { width, height } = parseJpegDimensions(buffer);
            return { buffer, width, height };
        }
        catch (error) {
            console.error(`Failed to load rental agreement logo from ${candidatePath}.`, error);
        }
    }
    return null;
};
const drawLogoFit = (logo, maxWidth, maxHeight) => {
    const widthRatio = maxWidth / logo.width;
    const heightRatio = maxHeight / logo.height;
    const scale = Math.min(widthRatio, heightRatio);
    return {
        width: logo.width * scale,
        height: logo.height * scale,
    };
};
const buildPdfDocument = (agreement, assets) => {
    const logo = loadTeqitLogo();
    const pages = [{ commands: [] }];
    let currentPageIndex = 0;
    let cursorY = PAGE_HEIGHT - PAGE_MARGIN;
    const currentPage = () => pages[currentPageIndex];
    const addPage = () => {
        pages.push({ commands: [] });
        currentPageIndex = pages.length - 1;
        cursorY = PAGE_HEIGHT - PAGE_MARGIN;
    };
    const ensureSpace = (requiredHeight) => {
        if (cursorY - requiredHeight < PAGE_MARGIN) {
            addPage();
        }
    };
    const addRectangle = (x, yTop, width, height, options) => {
        const bottomY = yTop - height;
        const commands = [];
        if (options?.fillColor) {
            commands.push(`${colorToPdf(options.fillColor)} rg`);
        }
        if (options?.strokeColor) {
            commands.push(`${colorToPdf(options.strokeColor)} RG`);
        }
        if (options?.lineWidth != null) {
            commands.push(`${options.lineWidth.toFixed(2)} w`);
        }
        commands.push(`${x.toFixed(2)} ${bottomY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`);
        if (options?.fillColor && options?.strokeColor) {
            commands.push("B");
        }
        else if (options?.fillColor) {
            commands.push("f");
        }
        else {
            commands.push("S");
        }
        currentPage().commands.push(commands.join("\n"));
    };
    const addLine = (x1, y1, x2, y2, strokeColor = BORDER_COLOR, lineWidth = 1) => {
        currentPage().commands.push(`${colorToPdf(strokeColor)} RG\n${lineWidth.toFixed(2)} w\n${x1.toFixed(2)} ${y1.toFixed(2)} m\n${x2.toFixed(2)} ${y2.toFixed(2)} l\nS`);
    };
    const addText = (text, x, y, options) => {
        const font = options?.font ?? "F1";
        const size = options?.size ?? 11;
        const color = options?.color ?? DEFAULT_TEXT_COLOR;
        const safeText = String(text ?? "");
        let targetX = x;
        if (options?.maxWidth && options?.align === "right") {
            const textWidth = measureTextWidth(safeText, size, font === "F2");
            targetX = x + options.maxWidth - textWidth;
        }
        currentPage().commands.push(`BT\n/${font} ${size.toFixed(2)} Tf\n${colorToPdf(color)} rg\n1 0 0 1 ${targetX.toFixed(2)} ${y.toFixed(2)} Tm\n(${escapePdfText(safeText)}) Tj\nET`);
    };
    const addWrappedText = (text, x, yTop, width, options) => {
        const font = options?.font ?? "F1";
        const size = options?.size ?? 11;
        const lineGap = options?.lineGap ?? 4;
        const lines = wrapText(text, width, size, font === "F2");
        let lineY = yTop;
        lines.forEach((line) => {
            addText(line, x, lineY, { font, size, color: options?.color });
            lineY -= size + lineGap;
        });
        return {
            lines,
            bottomY: lineY,
            height: lines.length * size + Math.max(lines.length - 1, 0) * lineGap,
        };
    };
    const addImage = (x, yTop, width, height) => {
        const bottomY = yTop - height;
        currentPage().commands.push(`q\n${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${bottomY.toFixed(2)} cm\n/Im1 Do\nQ`);
    };
    const addMetaPair = (label, value, x, yTop, maxWidth, valueSize = 14) => {
        addText(label, x, yTop, {
            font: "F2",
            size: 10,
            color: MUTED_TEXT_COLOR,
        });
        const wrappedValue = wrapText(value, maxWidth, valueSize, true);
        wrappedValue.forEach((line, index) => {
            addText(line, x, yTop - 22 - index * (valueSize + 2), {
                font: "F2",
                size: valueSize,
            });
        });
    };
    const customerName = [agreement.firstname, agreement.lastname]
        .filter(Boolean)
        .join(" ")
        .trim();
    const penaltyNotes = agreement.penaltytermssnapshot?.notes ||
        "Penalty invoice generation is manual and uses the existing product invoice template.";
    const headerHeight = 58;
    ensureSpace(headerHeight + 24);
    addRectangle(PAGE_MARGIN, cursorY, CONTENT_WIDTH, headerHeight, {
        fillColor: TITLE_FILL_COLOR,
        strokeColor: BORDER_COLOR,
        lineWidth: 1,
    });
    addText("Rental Agreement", PAGE_MARGIN + 18, cursorY - 22, {
        font: "F2",
        size: 21,
    });
    addText(`Agreement No: ${agreement.agreementnumber ?? "-"}`, PAGE_MARGIN + 18, cursorY - 40, {
        size: 10,
        color: MUTED_TEXT_COLOR,
    });
    if (logo) {
        const logoBox = drawLogoFit(logo, 104, 32);
        const logoX = PAGE_MARGIN + CONTENT_WIDTH - logoBox.width - 18;
        const logoTop = cursorY - (headerHeight - logoBox.height) / 2;
        addImage(logoX, logoTop, logoBox.width, logoBox.height);
    }
    cursorY -= headerHeight + 18;
    const infoCardHeight = 128;
    const infoInnerX = PAGE_MARGIN + 18;
    const infoGap = 18;
    const leftSectionWidth = 220;
    const middleSectionWidth = 95;
    const rightSectionWidth = 140;
    ensureSpace(infoCardHeight + 20);
    addRectangle(PAGE_MARGIN, cursorY, CONTENT_WIDTH, infoCardHeight, {
        fillColor: LIGHT_FILL_COLOR,
        strokeColor: BORDER_COLOR,
        lineWidth: 1,
    });
    const middleX = infoInnerX + leftSectionWidth + infoGap;
    const rightX = middleX + middleSectionWidth + infoGap;
    addMetaPair("CUSTOMER", customerName || "-", infoInnerX, cursorY - 18, leftSectionWidth, 15);
    addWrappedText(agreement.useremail || "-", infoInnerX, cursorY - 62, leftSectionWidth, { size: 10, lineGap: 2 });
    addWrappedText(agreement.usermobilenumber || "-", infoInnerX, cursorY - 80, leftSectionWidth, { size: 10, lineGap: 2 });
    addMetaPair("STATUS", agreement.agreementstatus || "-", middleX, cursorY - 18, middleSectionWidth, 15);
    addMetaPair("START DATE", formatDate(agreement.agreementstartdate), middleX, cursorY - 72, middleSectionWidth, 13);
    addMetaPair("CONTRACT", agreement.uniqueorderid || "-", rightX, cursorY - 18, rightSectionWidth, 12);
    addMetaPair("END DATE", formatDate(agreement.agreementenddate), rightX, cursorY - 72, rightSectionWidth, 13);
    addLine(middleX - infoGap / 2, cursorY - 16, middleX - infoGap / 2, cursorY - infoCardHeight + 16, [0.9, 0.93, 0.96], 0.8);
    addLine(rightX - infoGap / 2, cursorY - 16, rightX - infoGap / 2, cursorY - infoCardHeight + 16, [0.9, 0.93, 0.96], 0.8);
    cursorY -= infoCardHeight + 20;
    const cardGap = 18;
    const cardWidth = (CONTENT_WIDTH - cardGap) / 2;
    ensureSpace(98);
    addRectangle(PAGE_MARGIN, cursorY, cardWidth, 82, {
        fillColor: [1, 1, 1],
        strokeColor: BORDER_COLOR,
        lineWidth: 1,
    });
    addText("BILLING FREQUENCY", PAGE_MARGIN + 16, cursorY - 22, {
        font: "F2",
        size: 10,
        color: MUTED_TEXT_COLOR,
    });
    addText(agreement.billingfrequency || "-", PAGE_MARGIN + 16, cursorY - 52, {
        font: "F2",
        size: 16,
    });
    const pricingX = PAGE_MARGIN + cardWidth + cardGap;
    addRectangle(pricingX, cursorY, cardWidth, 82, {
        fillColor: [1, 1, 1],
        strokeColor: BORDER_COLOR,
        lineWidth: 1,
    });
    addText("PRICING SNAPSHOT", pricingX + 16, cursorY - 22, {
        font: "F2",
        size: 10,
        color: MUTED_TEXT_COLOR,
    });
    addText(`Monthly: ${formatCurrency(agreement.pricingtermssnapshot?.monthlyamount ?? 0)}`, pricingX + 16, cursorY - 48, { size: 12 });
    addText(`Total: ${formatCurrency(agreement.pricingtermssnapshot?.totalcontractvalue ?? 0)}`, pricingX + 16, cursorY - 68, { size: 12 });
    cursorY -= 98;
    const penaltyLines = wrapText(penaltyNotes, CONTENT_WIDTH - 32, 11);
    const penaltyHeight = Math.max(82, 44 + penaltyLines.length * 15);
    ensureSpace(penaltyHeight + 18);
    addRectangle(PAGE_MARGIN, cursorY, CONTENT_WIDTH, penaltyHeight, {
        fillColor: [1, 1, 1],
        strokeColor: BORDER_COLOR,
        lineWidth: 1,
    });
    addText("PENALTY TERMS", PAGE_MARGIN + 16, cursorY - 22, {
        font: "F2",
        size: 10,
        color: MUTED_TEXT_COLOR,
    });
    addWrappedText(penaltyNotes, PAGE_MARGIN + 16, cursorY - 46, CONTENT_WIDTH - 32, {
        size: 11,
        lineGap: 4,
    });
    cursorY -= penaltyHeight + 18;
    const tableInnerLeft = PAGE_MARGIN + 16;
    const tableWidth = CONTENT_WIDTH - 32;
    const columnWidths = [115, 90, 130, 60, 96];
    const columnStarts = [
        tableInnerLeft,
        tableInnerLeft + columnWidths[0],
        tableInnerLeft + columnWidths[0] + columnWidths[1],
        tableInnerLeft + columnWidths[0] + columnWidths[1] + columnWidths[2],
        tableInnerLeft +
            columnWidths[0] +
            columnWidths[1] +
            columnWidths[2] +
            columnWidths[3],
    ];
    const assetRowHeight = 28;
    const assetCardHeight = 70 + Math.max(assets.length, 1) * assetRowHeight;
    ensureSpace(assetCardHeight + 18);
    addRectangle(PAGE_MARGIN, cursorY, CONTENT_WIDTH, assetCardHeight, {
        fillColor: [1, 1, 1],
        strokeColor: BORDER_COLOR,
        lineWidth: 1,
    });
    addText("LINKED ASSETS", PAGE_MARGIN + 16, cursorY - 22, {
        font: "F2",
        size: 12,
    });
    addText(`${assets.length} asset${assets.length === 1 ? "" : "s"}`, PAGE_MARGIN + CONTENT_WIDTH - 116, cursorY - 22, {
        size: 10,
        color: MUTED_TEXT_COLOR,
        maxWidth: 100,
        align: "right",
    });
    addLine(tableInnerLeft, cursorY - 40, tableInnerLeft + tableWidth, cursorY - 40);
    ["PRODUCT", "ASSET", "ORDER LINE", "STATUS", "MONTHLY AMOUNT"].forEach((label, index) => {
        addText(label, columnStarts[index], cursorY - 55, {
            font: "F2",
            size: 8,
            color: MUTED_TEXT_COLOR,
        });
    });
    if (assets.length === 0) {
        addText("No linked assets.", tableInnerLeft, cursorY - 82, { size: 10 });
    }
    assets.forEach((asset, index) => {
        const rowTop = cursorY - 68 - index * assetRowHeight;
        const rowTextY = rowTop - 15;
        addText(asset.productname ?? "-", columnStarts[0], rowTextY, { size: 9.5 });
        addText(asset.assetnumber ?? "-", columnStarts[1], rowTextY, { size: 9.5 });
        addText(asset.orderlinenumber ?? "-", columnStarts[2], rowTextY, { size: 9.5 });
        addText(asset.assetstatus ?? "-", columnStarts[3], rowTextY, { size: 9.5 });
        addText(formatCurrency(asset.productamount ?? 0), columnStarts[4], rowTextY, {
            size: 9.5,
            maxWidth: columnWidths[4],
            align: "right",
        });
        addLine(tableInnerLeft, rowTop - assetRowHeight, tableInnerLeft + tableWidth, rowTop - assetRowHeight, index === assets.length - 1 ? BORDER_COLOR : [0.9, 0.93, 0.96]);
    });
    cursorY -= assetCardHeight + 18;
    const terms = [
        "This agreement governs the rental assets listed above for the stated contract period.",
        "Recurring rental billing follows the configured billing frequency and continues unless stopped by an approved rental workflow.",
        "Replacement, return, lost, damaged, renewal, and stop-rental actions must be processed through the ticket-driven rental service workflow.",
        penaltyNotes,
    ];
    const estimatedTermsHeight = 30 +
        terms.reduce((total, term) => {
            return total + wrapText(term, CONTENT_WIDTH - 42, 10).length * 16;
        }, 0);
    ensureSpace(estimatedTermsHeight + 60);
    addText("TERMS AND CONDITIONS", PAGE_MARGIN, cursorY, {
        font: "F2",
        size: 12,
    });
    cursorY -= 22;
    terms.forEach((term, index) => {
        const wrapped = wrapText(term, CONTENT_WIDTH - 42, 10);
        addText(`${index + 1}.`, PAGE_MARGIN, cursorY, {
            font: "F2",
            size: 10,
        });
        addWrappedText(term, PAGE_MARGIN + 18, cursorY, CONTENT_WIDTH - 42, {
            size: 10,
            lineGap: 4,
        });
        cursorY -= wrapped.length * 14 + 10;
    });
    cursorY -= 18;
    ensureSpace(50);
    addLine(PAGE_MARGIN, cursorY, PAGE_MARGIN + 220, cursorY);
    addText("Authorized Signatory", PAGE_MARGIN, cursorY - 16, {
        size: 10,
        color: MUTED_TEXT_COLOR,
    });
    addLine(PAGE_MARGIN + CONTENT_WIDTH - 220, cursorY, PAGE_MARGIN + CONTENT_WIDTH, cursorY);
    addText("Customer Acknowledgement", PAGE_MARGIN + CONTENT_WIDTH - 220, cursorY - 16, {
        size: 10,
        color: MUTED_TEXT_COLOR,
    });
    const objects = [];
    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[2] = "";
    objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
    objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;
    const logoObjectId = logo ? 5 : null;
    if (logoObjectId) {
        objects[logoObjectId] =
            `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} ` +
                `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.buffer.length} >>\nstream\n` +
                logo.buffer.toString("binary") +
                `\nendstream`;
    }
    const firstPageObjectId = logoObjectId ? 6 : 5;
    const firstContentObjectId = firstPageObjectId + pages.length;
    const pageRefs = pages
        .map((_, index) => `${firstPageObjectId + index} 0 R`)
        .join(" ");
    objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
    pages.forEach((page, index) => {
        const pageObjectId = firstPageObjectId + index;
        const contentObjectId = firstContentObjectId + index;
        const xObjectSection = logoObjectId
            ? `/XObject << /Im1 ${logoObjectId} 0 R >> `
            : "";
        objects[pageObjectId] =
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
                `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xObjectSection}>> ` +
                `/Contents ${contentObjectId} 0 R >>`;
        const stream = page.commands.join("\n");
        const streamLength = Buffer.byteLength(stream, "binary");
        objects[contentObjectId] =
            `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
    });
    let pdfContent = "%PDF-1.4\n";
    const offsets = [0];
    for (let objectId = 1; objectId < objects.length; objectId += 1) {
        offsets[objectId] = Buffer.byteLength(pdfContent, "binary");
        pdfContent += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(pdfContent, "binary");
    pdfContent += `xref\n0 ${objects.length}\n`;
    pdfContent += "0000000000 65535 f \n";
    for (let objectId = 1; objectId < objects.length; objectId += 1) {
        pdfContent += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
    }
    pdfContent += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdfContent, "binary");
};
export var rentalAgreementPdfService;
(function (rentalAgreementPdfService) {
    rentalAgreementPdfService.generateAgreementPdf = async (agreement, assets, _options) => {
        const safeAgreementNumber = sanitizeFileName(agreement.agreementnumber ?? agreement.id);
        const pdfBuffer = buildPdfDocument(agreement, assets);
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
            const errorMessage = String(error?.message || "");
            if (errorMessage.includes("invalid_grant") ||
                errorMessage.includes("Invalid JWT Signature")) {
                throw new Error("GCP authentication failed for bucket upload. Use Application Default Credentials locally or the assigned Cloud Run identity for revo-dev-and-test.");
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
})(rentalAgreementPdfService || (rentalAgreementPdfService = {}));
//# sourceMappingURL=rentalAgreementPdf.service.js.map