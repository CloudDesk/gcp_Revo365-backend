const nullableString = { type: ["string", "null"] };

export const directExpenseBillSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "integer", minimum: 1 },
    billtype: { const: "expense" },
    supplierid: { type: ["integer", "null"], minimum: 1 },
    expenseaccountid: { type: "integer", minimum: 1 },
    expensecategory: nullableString,
    payeename: nullableString,
    invoicenumber: { type: "string", minLength: 1, maxLength: 255 },
    invoicedate: { type: "number", exclusiveMinimum: 0 },
    iscreditpayment: { type: "boolean" },
    paymentduedate: { type: ["number", "null"], minimum: 0 },
    discount: { type: "number", minimum: 0 },
    cgst: { type: "number", minimum: 0, maximum: 100 },
    sgst: { type: "number", minimum: 0, maximum: 100 },
    igst: { type: "number", minimum: 0, maximum: 100 },
    taxmode: { type: "string", enum: ["cgst_sgst", "igst"] },
    suppliergstin: nullableString,
    placeofsupply: nullableString,
    productdata: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: ["string", "number", "null"] },
          lineid: { type: ["string", "number", "null"] },
          name: { type: "string", minLength: 1, maxLength: 500 },
          quantity: { type: "number", exclusiveMinimum: 0 },
          unitPrice: { type: "number", minimum: 0 },
        },
        required: ["name", "quantity", "unitPrice"],
      },
    },
  },
  required: [
    "billtype",
    "invoicenumber",
    "invoicedate",
    "productdata",
  ],
};

export const directExpenseBillPaymentTrackingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    paymentdate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    amount: { type: "number", exclusiveMinimum: 0 },
    reference: nullableString,
    remarks: nullableString,
  },
  required: ["paymentdate", "amount"],
};
