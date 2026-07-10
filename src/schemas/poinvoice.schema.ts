export const poInvoiceSchema = {
    type: 'object',
    properties: {
        invoiceamount: {
            type: "number",
            errorMessage: {
                type: "Bill Amount Should Be Number"
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
                type: "Bill Date should Be Number"
            }
        },
        subtotal: {
            type: "number",
            errorMessage: {
                type: "Bill Sub Total Should Be Number"
            }
        },
        discount: {
            type: "number",
            errorMessage: {
                type: "Bill Discount Should Be Number"
            }
        },
        sgst: {
            type: "number",
            errorMessage: {
                type: "Bill SGST Should Be Number"
            }
        },
        cgst: {
            type: "number",
            errorMessage: {
                type: "Bill CGST Should Be Number"
            }
        },
        payabletaxamount: {
            type: "number",
            errorMessage: {
                type: "Bill Tax Amount Should Be Number"
            }
        },
        productdata: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    id: {
                        type: ["number", "string", "null"],
                    },
                    lineid: {
                        type: ["number", "string", "null"],
                    },
                    name: {
                        type: "string",
                        errorMessage: {
                            type: "Product Name Should Be String"
                        }
                    },
                    unitPrice: {
                        type: "number",
                        errorMessage: {
                            type: "Unit Price Should Be Number"
                        }
                    },
                    poquantity: {
                        type: "number",
                        errorMessage: {
                            type: "PO Quantity Should Be Number"
                        }
                    },
                    quantity: {
                        type: "number",
                        errorMessage: {
                            type: "Bill Quantity Should Be Number"
                        }
                    },
                    total: {
                        type: "number",
                        errorMessage: {
                            type: "Line Total Should Be Number"
                        }
                    },
                },
                required: ["name", "quantity"]
            },
            errorMessage: {
                type: "Bill Products should be an array of objects"
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
