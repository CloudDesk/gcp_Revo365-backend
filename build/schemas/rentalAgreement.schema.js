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
        lesseeCompanyName: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee company name should be a string",
            },
        },
        lesseeAddress: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee address should be a string",
            },
        },
        lesseeGstin: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee GSTIN should be a string",
            },
        },
        lesseeSignatoryName: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee signatory name should be a string",
            },
        },
        lesseeSignatoryDesignation: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee signatory designation should be a string",
            },
        },
        securityDepositAmount: {
            type: ["number", "integer", "null"],
            minimum: 0,
            errorMessage: {
                type: "Security deposit amount should be a number",
                minimum: "Security deposit amount cannot be negative",
            },
        },
        securityDepositRef: {
            type: ["string", "null"],
            errorMessage: {
                type: "Security deposit reference should be a string",
            },
        },
        securityDepositMonths: {
            type: ["number", "integer", "null"],
            minimum: 0,
            errorMessage: {
                type: "Security deposit months should be a number",
                minimum: "Security deposit months cannot be negative",
            },
        },
        minimumLockInMonths: {
            type: ["number", "integer", "null"],
            minimum: 0,
            errorMessage: {
                type: "Minimum lock-in months should be a number",
                minimum: "Minimum lock-in months cannot be negative",
            },
        },
        witness1Name: {
            type: ["string", "null"],
            errorMessage: {
                type: "Witness 1 name should be a string",
            },
        },
        witness2Name: {
            type: ["string", "null"],
            errorMessage: {
                type: "Witness 2 name should be a string",
            },
        },
        deliveryAddress: {
            type: ["string", "null"],
            errorMessage: {
                type: "Delivery address should be a string",
            },
        },
        annexure1EquipmentRows: {
            type: ["array", "null"],
            items: {
                type: "object",
                properties: {
                    assetNo: { type: ["string", "null"] },
                    accessories: { type: ["string", "null"] },
                    remarks: { type: ["string", "null"] },
                },
                additionalProperties: false,
            },
        },
        annexure2DeliveryRows: {
            type: ["array", "null"],
            items: {
                type: "object",
                properties: {
                    assetNo: { type: ["string", "null"] },
                    conditionOnDelivery: { type: ["string", "null"] },
                    preExistingDamageNotes: { type: ["string", "null"] },
                },
                additionalProperties: false,
            },
        },
    },
    required: ["uniqueorderid"],
    additionalProperties: false,
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
        lesseeCompanyName: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee company name should be a string",
            },
        },
        lesseeAddress: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee address should be a string",
            },
        },
        lesseeGstin: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee GSTIN should be a string",
            },
        },
        lesseeSignatoryName: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee signatory name should be a string",
            },
        },
        lesseeSignatoryDesignation: {
            type: ["string", "null"],
            errorMessage: {
                type: "Lessee signatory designation should be a string",
            },
        },
        securityDepositAmount: {
            type: ["number", "integer", "null"],
            minimum: 0,
            errorMessage: {
                type: "Security deposit amount should be a number",
                minimum: "Security deposit amount cannot be negative",
            },
        },
        securityDepositRef: {
            type: ["string", "null"],
            errorMessage: {
                type: "Security deposit reference should be a string",
            },
        },
        securityDepositMonths: {
            type: ["number", "integer", "null"],
            minimum: 0,
            errorMessage: {
                type: "Security deposit months should be a number",
                minimum: "Security deposit months cannot be negative",
            },
        },
        minimumLockInMonths: {
            type: ["number", "integer", "null"],
            minimum: 0,
            errorMessage: {
                type: "Minimum lock-in months should be a number",
                minimum: "Minimum lock-in months cannot be negative",
            },
        },
        witness1Name: {
            type: ["string", "null"],
            errorMessage: {
                type: "Witness 1 name should be a string",
            },
        },
        witness2Name: {
            type: ["string", "null"],
            errorMessage: {
                type: "Witness 2 name should be a string",
            },
        },
        deliveryAddress: {
            type: ["string", "null"],
            errorMessage: {
                type: "Delivery address should be a string",
            },
        },
        annexure1EquipmentRows: {
            type: ["array", "null"],
            items: {
                type: "object",
                properties: {
                    assetNo: { type: ["string", "null"] },
                    accessories: { type: ["string", "null"] },
                    remarks: { type: ["string", "null"] },
                },
                additionalProperties: false,
            },
        },
        annexure2DeliveryRows: {
            type: ["array", "null"],
            items: {
                type: "object",
                properties: {
                    assetNo: { type: ["string", "null"] },
                    conditionOnDelivery: { type: ["string", "null"] },
                    preExistingDamageNotes: { type: ["string", "null"] },
                },
                additionalProperties: false,
            },
        },
    },
    additionalProperties: false,
};
//# sourceMappingURL=rentalAgreement.schema.js.map