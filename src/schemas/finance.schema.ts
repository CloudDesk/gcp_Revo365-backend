const nullableString = { type: ["string", "null"] };

export const createChartAccountSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accounttype: { type: "string", minLength: 1, maxLength: 50 },
    accountname: { type: "string", minLength: 1, maxLength: 255 },
    accountcode: { type: "string", minLength: 1, maxLength: 40 },
    description: { type: ["string", "null"], maxLength: 2000 },
  },
  required: ["accounttype", "accountname", "accountcode"],
};

export const createBankCashAccountSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accounttype: { type: "string", enum: ["bank", "cash"] },
    accountname: { type: "string", minLength: 1, maxLength: 255 },
    bankname: nullableString,
    accountnumber: nullableString,
    ifsccode: nullableString,
    branchname: nullableString,
    openingbalance: { type: "number" },
    openingbalancedate: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    currencycode: {
      type: "string",
      pattern: "^[A-Za-z]{3}$",
    },
    status: { type: "string", enum: ["active", "inactive"] },
    isecommercedefault: { type: "boolean" },
    confirmdefaultreplacement: { type: "boolean" },
  },
  required: [
    "accounttype",
    "accountname",
    "openingbalance",
    "openingbalancedate",
  ],
};

export const updateBankCashAccountSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    accountname: { type: "string", minLength: 1, maxLength: 255 },
    bankname: nullableString,
    accountnumber: nullableString,
    ifsccode: nullableString,
    branchname: nullableString,
    status: { type: "string", enum: ["active", "inactive"] },
    isecommercedefault: { type: "boolean" },
    confirmdefaultreplacement: { type: "boolean" },
    version: { type: "integer", minimum: 1 },
  },
};

export const createDirectBankTransactionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    transactiondate: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    counterpartyaccountid: { type: "integer", minimum: 1 },
    entryname: { type: "string", minLength: 1, maxLength: 255 },
    entryside: { type: "string", enum: ["debit", "credit"] },
    amount: { type: "number", exclusiveMinimum: 0 },
    remarks: nullableString,
  },
  required: [
    "transactiondate",
    "counterpartyaccountid",
    "entryname",
    "entryside",
    "amount",
  ],
};

export const createRetailReceiptSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    transactiondate: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    customerid: { type: "integer", minimum: 1 },
    amount: { type: "number", exclusiveMinimum: 0 },
    requestreference: {
      type: "string",
      minLength: 8,
      maxLength: 100,
    },
    receiptmode: {
      type: "string",
      enum: ["retail", "rental", "all"],
    },
    remarks: nullableString,
    allocations: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          invoiceid: { type: "integer", minimum: 1 },
          allocationamount: { type: "number", exclusiveMinimum: 0 },
          tdsapplied: { type: "boolean" },
          tdsamount: { type: "number", minimum: 0 },
        },
        required: ["invoiceid", "allocationamount"],
      },
    },
  },
  required: [
    "transactiondate",
    "customerid",
    "amount",
    "requestreference",
    "allocations",
  ],
};

export const createSupplierPaymentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    transactiondate: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    supplierid: { type: "integer", minimum: 1 },
    amount: { type: "number", exclusiveMinimum: 0 },
    requestreference: {
      type: "string",
      minLength: 8,
      maxLength: 100,
    },
    remarks: nullableString,
    allocations: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          billid: { type: "integer", minimum: 1 },
          allocationamount: { type: "number", exclusiveMinimum: 0 },
          tdsapplied: { type: "boolean" },
          tdssectionid: { type: ["integer", "null"], minimum: 1 },
          tdsamount: { type: "number", minimum: 0 },
        },
        required: ["billid", "allocationamount"],
      },
    },
  },
  required: [
    "transactiondate",
    "supplierid",
    "amount",
    "requestreference",
    "allocations",
  ],
};

export const createTdsSectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    newcode: { type: "string", minLength: 1, maxLength: 20 },
    natureofpayment: { type: "string", minLength: 1, maxLength: 500 },
    rate: { type: "string", minLength: 1, maxLength: 50 },
  },
  required: ["newcode", "natureofpayment", "rate"],
};
