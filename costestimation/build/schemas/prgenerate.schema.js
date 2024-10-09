export const generatePRSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            id: {
                type: 'number',
                errorMessage: {
                    type: 'ID should be number'
                }
            },
            companyname: {
                type: 'string',
                errorMessage: {
                    type: 'Company Name should be string'
                }
            },
            companyaddress: {
                type: 'string',
                errorMessage: {
                    type: 'Company Address should be string'
                }
            },
            contactname: {
                type: 'string',
                errorMessage: {
                    type: 'Contact Name should be string'
                }
            },
            phonenumber: {
                type: 'number',
                errorMessage: {
                    type: 'Phone Number should be number'
                }
            },
            gstnumber: {
                type: 'string',
                errorMessage: {
                    type: 'GST should be string'
                }
            },
            prnumber: {
                type: 'string',
                errorMessage: {
                    type: 'PR Number should be string'
                }
            },
            changeFormat: {
                type: 'string',
                errorMessage: {
                    type: 'Date should be string'
                }
            },
            // prdata: {
            //     type: 'array',
            //     items: {
            //         type: 'object',
            //         properties: {
            //             id: {
            //                 type: 'integer',
            //                 errorMessage: {
            //                     type: 'ID should be integer'
            //                 }
            //             },
            //             name: {
            //                 type: 'string',
            //                 errorMessage: {
            //                     type: 'Name should be string'
            //                 }
            //             },
            //             quantity: {
            //                 type: 'integer',
            //                 errorMessage: {
            //                     type: 'Quantity should be integer'
            //                 }
            //             }
            //         },
            //         required: ['id', 'name', 'quantity']
            //     }
            // }
        },
        required: [
            'id',
            'companyname',
            'companyaddress',
            'contactname',
            'phonenumber',
            'gstnumber',
            'prnumber',
            'changeFormat',
        ],
        errorMessage: {
            required: {
                id: 'ID is required',
                companyname: 'Company Name is required',
                companyaddress: 'Company Address is required',
                contactname: 'Contact Name is required',
                phonenumber: 'Phone Number is required',
                gstnumber: 'GST Number is required',
                prnumber: 'PR Number is required',
                changeFormat: 'Date is required',
            }
        }
    }
};
//# sourceMappingURL=prgenerate.schema.js.map