export const revoinvoiceSchema = {
    type: 'object',
    properties: {
        companyname: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Company Name should be a string",
                minLength: "Company Name should be at least 1 character long",
                maxLength: "Company Name should be between 1 to 500 characters"
            }
        },
        companyaddress: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Company Address should be a string",
                minLength: "Company Address should be at least 1 character long",
                maxLength: "Company Address should be between 1 to 500 characters"
            }
        },
        contactname: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Contact Name should be a string",
                minLength: "Contact Name should be at least 1 character long",
                maxLength: "Contact Name should be between 1 to 500 characters"
            }
        },
        phonenumber: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Phone Number should be a number"
            }
        },
        gstnumber: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "GST Number should be a string",
                minLength: "GST Number should be at least 1 character long",
                maxLength: "GST Number should be between 1 to 500 characters"
            }
        },
        customername: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Customer Name should be a string",
                minLength: "Customer Name should be at least 1 character long",
                maxLength: "Customer Name should be between 1 to 500 characters"
            }
        },
        customeraddress: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Customer Address should be a string",
                minLength: "Customer Address should be at least 1 character long",
                maxLength: "Customer Address should be between 1 to 500 characters"
            }
        },
        customerphonenumber: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Customer Phone Number should be a number"
            }
        },
        // invoicedate: {
        //     type: ['number', 'null'],
        //     errorMessage: {
        //         type: "Invoice Date should be an number"
        //     }
        // },
        invoicenumber: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Invoice Number should be a string",
                minLength: "Invoice Number should be at least 1 character long",
                maxLength: "Invoice Number should be between 1 to 500 characters"
            }
        },
        invoiceurl: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Invoice URL should be a string"
            }
        },
        // invoicedata: {
        //     type: ['object', 'null'],
        //     errorMessage: {
        //         type: "Invoice Data should be an object"
        //     }
        // },
        invoicefor: {
            type: ['string', 'null'],
            maxLength: 100,
            errorMessage: {
                type: "Invoice For should be a string",
                maxLength: "Invoice For should be at most 100 characters long"
            }
        },
        orderid: {
            type: ['string', 'null'],
            maxLength: 500,
            errorMessage: {
                type: "Order ID should be a string",
                maxLength: "Order ID should be at most 500 characters long"
            }
        },
        // servicedata: {
        //     type: ['object', 'null'],
        //     errorMessage: {
        //         type: "Service Data should be an object"
        //     }
        // },
        gst: {
            type: ['string', 'null'],
            maxLength: 255,
            errorMessage: {
                type: "GST should be a string",
                maxLength: "GST should be at most 255 characters long"
            }
        },
        taxamount: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Tax Amount should be a number"
            }
        },
        discount: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Discount should be a number"
            }
        },
        totalorderamount: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Total Order Amount should be a number"
            }
        },
        ticketnumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Ticket Number should be a string"
            }
        },
        iscreditpayment: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Is Credit Payment should be a boolean"
            }
        },
        paymentduedate: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Payment Due Date should be an number"
            }
        },
    },
    required: [
    // 'invoicenumber'
    ]
};
//# sourceMappingURL=revoinvoice.schema.js.map