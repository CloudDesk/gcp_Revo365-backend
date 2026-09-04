const toNumber = (value) => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
};
const toPaise = (value) => Math.round(toNumber(value) * 100);
const fromPaise = (value) => value / 100;
const toRateBasisPoints = (value) => Math.round(toNumber(value) * 100);
const calculateTaxPaise = (taxablePaise, rate) => Math.round((taxablePaise * toRateBasisPoints(rate)) / 10000);
const normalizeTaxMode = (line) => {
    const storedMode = String(line.taxmode || "").trim().toLowerCase();
    return storedMode === "igst" || toNumber(line.igst) > 0 ? "igst" : "cgst_sgst";
};
const normalizeRate = (value) => fromPaise(toPaise(value));
export const calculateRentalInvoiceSnapshot = (lines) => {
    if (!Array.isArray(lines) || lines.length === 0) {
        throw new Error("At least one rental order line is required for invoicing.");
    }
    const lineModes = new Set(lines.map(normalizeTaxMode));
    if (lineModes.size > 1) {
        throw new Error("Rental invoice lines cannot mix CGST/SGST and IGST tax modes.");
    }
    const items = lines.map((line) => {
        const quantity = Math.max(toNumber(line.quantity), 1);
        const grossPaise = Math.max(toPaise(line.productamount), 0);
        const discountPaise = Math.min(Math.max(toPaise(line.discountamount), 0), grossPaise);
        const taxablePaise = grossPaise - discountPaise;
        const taxMode = normalizeTaxMode(line);
        const cgstRate = taxMode === "cgst_sgst" ? normalizeRate(line.cgst) : 0;
        const sgstRate = taxMode === "cgst_sgst" ? normalizeRate(line.sgst) : 0;
        const igstRate = taxMode === "igst" ? normalizeRate(line.igst) : 0;
        const cgstPaise = taxMode === "cgst_sgst" ? calculateTaxPaise(taxablePaise, cgstRate) : 0;
        const sgstPaise = taxMode === "cgst_sgst" ? calculateTaxPaise(taxablePaise, sgstRate) : 0;
        const igstPaise = taxMode === "igst" ? calculateTaxPaise(taxablePaise, igstRate) : 0;
        const taxPaise = cgstPaise + sgstPaise + igstPaise;
        return {
            orderLineId: Number(line.id),
            orderLineNumber: String(line.orderlinenumber || ""),
            productName: String(line.productname || "Rental Device"),
            quantity,
            unitRate: fromPaise(Math.round(grossPaise / quantity)),
            grossAmount: fromPaise(grossPaise),
            discountAmount: fromPaise(discountPaise),
            taxableAmount: fromPaise(taxablePaise),
            taxMode,
            cgstRate,
            sgstRate,
            igstRate,
            cgstAmount: fromPaise(cgstPaise),
            sgstAmount: fromPaise(sgstPaise),
            igstAmount: fromPaise(igstPaise),
            taxAmount: fromPaise(taxPaise),
            totalAmount: fromPaise(taxablePaise + taxPaise),
            sacCode: String(line.saccode || line.hsncode || "997315"),
            rentStartDate: line.rentstartdate ?? null,
            rentEndDate: line.rentenddate ?? null,
        };
    });
    const sumPaise = (selector) => items.reduce((total, item) => total + toPaise(selector(item)), 0);
    const subtotalPaise = sumPaise((item) => item.grossAmount);
    const discountPaise = sumPaise((item) => item.discountAmount);
    const taxablePaise = sumPaise((item) => item.taxableAmount);
    const cgstPaise = sumPaise((item) => item.cgstAmount);
    const sgstPaise = sumPaise((item) => item.sgstAmount);
    const igstPaise = sumPaise((item) => item.igstAmount);
    const taxPaise = cgstPaise + sgstPaise + igstPaise;
    const totalBeforeRoundOffPaise = taxablePaise + taxPaise;
    const payablePaise = Math.round(totalBeforeRoundOffPaise / 100) * 100;
    const firstItem = items[0];
    return {
        version: 2,
        currency: "INR",
        taxMode: firstItem.taxMode,
        cgstRate: firstItem.cgstRate,
        sgstRate: firstItem.sgstRate,
        igstRate: firstItem.igstRate,
        subtotalAmount: fromPaise(subtotalPaise),
        discountAmount: fromPaise(discountPaise),
        taxableAmount: fromPaise(taxablePaise),
        cgstAmount: fromPaise(cgstPaise),
        sgstAmount: fromPaise(sgstPaise),
        igstAmount: fromPaise(igstPaise),
        taxAmount: fromPaise(taxPaise),
        totalBeforeRoundOff: fromPaise(totalBeforeRoundOffPaise),
        roundOffAmount: fromPaise(payablePaise - totalBeforeRoundOffPaise),
        payableAmount: fromPaise(payablePaise),
        items,
    };
};
//# sourceMappingURL=rentalInvoiceCalculation.js.map