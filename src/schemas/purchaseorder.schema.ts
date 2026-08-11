
export const purchaseorderInsertSchema = {
    type: 'object',
    properties: {
        ponumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'PO number should be String'
            }
        },
        companyname: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Company Name should be String'
            }
        },
        companyaddress: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Company Address should be String'
            }
        },
        contactname: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Contact Address should be String'
            }
        },
        phonenumber: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Phone Number should be Number'
            }
        },
        gstnumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'GST Number should be string'
            }
        },
        io_companyname: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Bill To Companyname should be string'
            }
        },
        io_companyaddress: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Bill To Companyaddress should be string'
            }
        },
        io_contactname: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Bill To contactname should be string'
            }
        },
        io_phonenumber: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Bill To phonenumber should be Number'
            }
        },
        io_gstnumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Bill To Gstnumber should be string'
            }
        },
        dt_companyname: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Delivery To companyname should be string'
            }
        },
        dt_companyaddress: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Delivery To companyaddress should be string'
            }
        },
        dt_contactname: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Delivery To contactname should be string'
            }
        },
        dt_phonenumber: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Delivery To phonenumber should be number'
            }
        },
        dt_gstnumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: ' Delivery To Gstnumber should be string'
            }
        },
        supplierid: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'supplierid should be number'
            }
        },
        subtotal: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'subtotal should be number'
            }
        },
        discount: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'discount should be number'
            }
        },
        sgst: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'sgst should be number'
            }
        },
        cgst: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'cgst should be number'
            }
        },
        payabletaxamount: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'payabletaxamount should be number'
            }
        },
        total: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'total should be number'
            }
        },
        product: {        
            type: ["array", "null"],
            items: {
                type: "object",
            },
            errorMessage: {
                type: "product should be an array of objects"
            }
        },
        po_status: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'po_status should be string'
            }
        },
        supplieraddress: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'supplieraddress should be string'
            }
        },
        suppliercompanyname: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'suppliercompanyname should be string'
            }
        },
        supplierphonenumber: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'supplierphonenumber should be number'
            }
        },
        suppliergstnumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'suppliergstnumber should be string'
            }
        },
        instructions: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'instructions should be text'
            }
        },
        fileurl: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'fileurl should be string'
            }
        },
        invoiceurl: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Bill URL should be string'
            }
        }

    },

    required: []
};
