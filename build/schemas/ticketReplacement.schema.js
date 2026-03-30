export const initiateRentalReplacementSchema = {
    type: 'object',
    properties: {
        replacementtype: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            errorMessage: {
                type: 'Replacement Type should be a string',
                minLength: 'Replacement Type is required',
                maxLength: 'Replacement Type should be at most 100 characters'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['replacementtype'],
    errorMessage: {
        required: {
            replacementtype: 'Replacement Type is mandatory.'
        }
    }
};
export const receiveOldAssetSchema = {
    type: 'object',
    properties: {
        oldassetnumber: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: 'Old Asset Number should be a string',
                minLength: 'Old Asset Number is required',
                maxLength: 'Old Asset Number should be at most 255 characters'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['oldassetnumber'],
    errorMessage: {
        required: {
            oldassetnumber: 'Old Asset Number is mandatory.'
        }
    }
};
export const assignTechnicalReplacementSchema = {
    type: 'object',
    properties: {
        newassetnumber: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: 'New Asset Number should be a string',
                minLength: 'New Asset Number is required',
                maxLength: 'New Asset Number should be at most 255 characters'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['newassetnumber'],
    errorMessage: {
        required: {
            newassetnumber: 'New Asset Number is mandatory.'
        }
    }
};
//# sourceMappingURL=ticketReplacement.schema.js.map