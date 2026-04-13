export const createRentalAgreementSchema = {
  type: "object",
  properties: {
    uniqueorderid: {
      type: "string",
      minLength: 1,
      maxLength: 255,
      errorMessage: {
        type: "Unique Order ID should be a string",
        minLength: "Unique Order ID is required",
        maxLength: "Unique Order ID should be at most 255 characters",
      },
    },
    primaryorderlineid: {
      type: ["integer", "null"],
      minimum: 1,
      errorMessage: {
        type: "Primary Order Line ID should be an integer",
        minimum: "Primary Order Line ID must be a positive integer",
      },
    },
    agreementstatus: {
      type: ["string", "null"],
      errorMessage: {
        type: "Agreement status should be a string",
      },
    },
    agreementstartdate: {
      type: ["integer", "string", "null"],
      errorMessage: {
        type: "Agreement start date should be an epoch value or date string",
      },
    },
    agreementenddate: {
      type: ["integer", "string", "null"],
      errorMessage: {
        type: "Agreement end date should be an epoch value or date string",
      },
    },
    billingfrequency: {
      type: ["string", "null"],
      errorMessage: {
        type: "Billing frequency should be a string",
      },
    },
    penaltytermsnotes: {
      type: ["string", "null"],
      errorMessage: {
        type: "Penalty terms notes should be a string",
      },
    },
    logoUrl: {
      type: ["string", "null"],
      errorMessage: {
        type: "Logo URL should be a string",
      },
    },
  },
  required: ["uniqueorderid"],
  errorMessage: {
    required: {
      uniqueorderid: "Unique Order ID is mandatory.",
    },
  },
};

export const regenerateRentalAgreementPdfSchema = {
  type: "object",
  properties: {
    logoUrl: {
      type: ["string", "null"],
      errorMessage: {
        type: "Logo URL should be a string",
      },
    },
  },
};
