export const SERVICE_ESTIMATION_GST_RATE = 18;
const SPLIT_GST_RATE = SERVICE_ESTIMATION_GST_RATE / 2;
const TAMIL_NADU = "tamilnadu";
const normalizeState = (value) => String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
export const resolveServiceEstimationCustomerState = (ticketAddressState, latestCustomerAddressState) => String(ticketAddressState ?? "").trim() ||
    String(latestCustomerAddressState ?? "").trim() ||
    "Tamil Nadu";
export const getServiceEstimationTaxContext = (customerState) => {
    const intraState = normalizeState(customerState) === TAMIL_NADU;
    return {
        customerstate: customerState,
        taxtype: intraState ? "intra_state" : "inter_state",
        taxlabel: intraState ? "CGST 9% + SGST 9%" : "IGST 18%",
        cgst: intraState ? SPLIT_GST_RATE : 0,
        sgst: intraState ? SPLIT_GST_RATE : 0,
        igst: intraState ? 0 : SERVICE_ESTIMATION_GST_RATE,
    };
};
//# sourceMappingURL=serviceEstimationTaxPolicy.js.map