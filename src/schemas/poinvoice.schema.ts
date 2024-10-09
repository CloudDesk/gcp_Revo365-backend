export const poInvoiceSchema = {
    type: 'object',
    properties: {
        invoiceamount: {
            type: "number",
            errorMessage: {
                type: "Invoice Amount Should Be Number"
            }
        },
        ponumber: {
            type: "string",
            errorMessage: {
                type: "PO Number Should Be String"
            }
        },
        invoicedate: {
            type: "number",
            errorMessage: {
                type: "Invoice Date should Be Number"
            }
        },
        // paymentdata: {
        //     type: "array",
        //     items: {
        //         type: 'object',
        //         properties: {
        //             id: {
        //                 type: 'string',
        //                 errorMessage: {
        //                     type: 'ID should be string'
        //                 }
        //             },
        //             paymentamount: {
        //                 type: 'string',
        //                 errorMessage: {
        //                     type: 'Payment Amount should be string'
        //                 }
        //             },
        //             paymentmethod: {
        //                 type: 'string',
        //                 errorMessage: {
        //                     type: 'Payment Method Should Be String'
        //                 }
        //             },
        //             transactionid: {
        //                 type: 'string',
        //                 errorMessage: {
        //                     type: 'Transaction Id Should Be string'
        //                 }
        //             },
        //             paymentmode: {
        //                 type: 'string',
        //                 errorMessage: {
        //                     type: 'Payment Mode Should Be String'
        //                 }
        //             },
        //             paymentdate: {
        //                 type: 'string',
        //                 errorMessage: {
        //                     type: 'Payment Date Should Be String'
        //                 }
        //             },
        //         },
        //     }
        // }
    },
    required: ["invoiceamount", "invoicedate", "ponumber"]

}