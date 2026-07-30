const nullableString = { type: ["string", "null"] };

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
    entryside: { type: "string", enum: ["debit", "credit"] },
    amount: { type: "number", exclusiveMinimum: 0 },
    remarks: nullableString,
  },
  required: [
    "transactiondate",
    "counterpartyaccountid",
    "entryside",
    "amount",
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
