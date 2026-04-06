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
export const assignCommercialReplacementSchema = {
    type: 'object',
    properties: {
        newproductid: {
            type: 'integer',
            minimum: 1,
            errorMessage: {
                type: 'New Product ID should be an integer',
                minimum: 'New Product ID must be a positive integer'
            }
        },
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
        effectivefrom: {
            // expected as BIGINT (epoch) from client
            type: 'integer',
            minimum: 0,
            errorMessage: {
                type: 'Effective From should be an integer',
                minimum: 'Effective From must be >= 0'
            }
        },
        billingmode: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            errorMessage: {
                type: 'Billing Mode should be a string',
                minLength: 'Billing Mode is required',
                maxLength: 'Billing Mode should be at most 100 characters'
            }
        },
        revisedremainingmonths: {
            type: 'integer',
            minimum: 1,
            errorMessage: {
                type: 'Revised remaining months should be an integer',
                minimum: 'Revised remaining months must be >= 1'
            }
        },
        newrate: {
            // Stored into orderline.productamount/orderamount (often numeric-but-saved-as-text)
            type: ['string', 'number', 'null'],
            errorMessage: {
                type: 'New rate should be a string or number'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['newproductid', 'newassetnumber', 'effectivefrom', 'billingmode', 'revisedremainingmonths'],
    errorMessage: {
        required: {
            newproductid: 'New Product ID is mandatory.',
            newassetnumber: 'New Asset Number is mandatory.',
            effectivefrom: 'Effective From is mandatory.',
            billingmode: 'Billing Mode is mandatory.',
            revisedremainingmonths: 'Revised remaining months is mandatory.'
        }
    }
};
export const rejectReplacementSchema = {
    type: 'object',
    properties: {
        rejectionaction: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            errorMessage: {
                type: 'Rejection Action should be a string',
                minLength: 'Rejection Action is required',
                maxLength: 'Rejection Action should be at most 100 characters'
            }
        },
        stoprentalfinancialmode: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Stop Rental Financial Mode should be a string'
            }
        },
        effectivefrom: {
            type: ['integer', 'null'],
            minimum: 0,
            errorMessage: {
                type: 'Effective From should be an integer',
                minimum: 'Effective From must be >= 0'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['rejectionaction'],
    errorMessage: {
        required: {
            rejectionaction: 'Rejection Action is mandatory.'
        }
    }
};
export const stopRentalSchema = {
    type: 'object',
    properties: {
        stoprentalfinancialmode: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            errorMessage: {
                type: 'Stop Rental Financial Mode should be a string',
                minLength: 'Stop Rental Financial Mode is required',
                maxLength: 'Stop Rental Financial Mode should be at most 100 characters'
            }
        },
        effectivefrom: {
            type: ['integer', 'null'],
            minimum: 0,
            errorMessage: {
                type: 'Effective From should be an integer',
                minimum: 'Effective From must be >= 0'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['stoprentalfinancialmode'],
    errorMessage: {
        required: {
            stoprentalfinancialmode: 'Stop Rental Financial Mode is mandatory.'
        }
    }
};
export const returnRentalAssetSchema = {
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
        returneddate: {
            type: ['integer', 'null'],
            minimum: 0,
            errorMessage: {
                type: 'Returned Date should be an integer',
                minimum: 'Returned Date must be >= 0'
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
export const markRentalAssetLostSchema = {
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
        lostdate: {
            type: ['integer', 'null'],
            minimum: 0,
            errorMessage: {
                type: 'Lost Date should be an integer',
                minimum: 'Lost Date must be >= 0'
            }
        },
        reason: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Reason should be a string'
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
export const assessRentalDamageSchema = {
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
        damageassessment: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            errorMessage: {
                type: 'Damage Assessment should be a string',
                minLength: 'Damage Assessment is required',
                maxLength: 'Damage Assessment should be at most 100 characters'
            }
        },
        damageddate: {
            type: ['integer', 'null'],
            minimum: 0,
            errorMessage: {
                type: 'Damaged Date should be an integer',
                minimum: 'Damaged Date must be >= 0'
            }
        },
        reason: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Reason should be a string'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['oldassetnumber', 'damageassessment'],
    errorMessage: {
        required: {
            oldassetnumber: 'Old Asset Number is mandatory.',
            damageassessment: 'Damage Assessment is mandatory.'
        }
    }
};
export const linkPenaltyInvoiceSchema = {
    type: 'object',
    properties: {
        penaltyinvoiceid: {
            type: 'integer',
            minimum: 1,
            errorMessage: {
                type: 'Penalty Invoice ID should be an integer',
                minimum: 'Penalty Invoice ID must be a positive integer'
            }
        },
        penaltyamount: {
            type: ['number', 'integer'],
            minimum: 0,
            errorMessage: {
                type: 'Penalty Amount should be a number',
                minimum: 'Penalty Amount must be >= 0'
            }
        },
        penaltytype: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Penalty Type should be a string'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['penaltyinvoiceid', 'penaltyamount'],
    errorMessage: {
        required: {
            penaltyinvoiceid: 'Penalty Invoice ID is mandatory.',
            penaltyamount: 'Penalty Amount is mandatory.'
        }
    }
};
export const renewRentalContractSchema = {
    type: 'object',
    properties: {
        requestedrenewaldate: {
            type: ['integer', 'string'],
            errorMessage: {
                type: 'Requested Renewal Date should be an epoch integer or date string'
            }
        },
        approvedrenewaldate: {
            type: ['integer', 'string', 'null'],
            errorMessage: {
                type: 'Approved Renewal Date should be an epoch integer or date string'
            }
        },
        remarks: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Remarks should be a string'
            }
        }
    },
    required: ['requestedrenewaldate'],
    errorMessage: {
        required: {
            requestedrenewaldate: 'Renewal Date is mandatory.'
        }
    }
};
//# sourceMappingURL=ticketReplacement.schema.js.map