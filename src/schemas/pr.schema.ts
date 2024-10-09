export const prInsertSchema = {
    type: "object",
    properties: {
        prstatus: {
            type: ["string", "null"],
            errorMessage: {
                type: "pr status should be string",
            },
        },
        companyname: {
            type: "string",
            errorMessage: {
                type: "Company Name should be string",
            },
        },
        companyaddress: {
            type: "string",
            errorMessage: {
                type: "Company Address should be string",
            },
        },
        contactname: {
            type: "string",
            errorMessage: {
                type: "Contact Name should be string",
            },
        },
        phonenumber: {
            type: "number",
            errorMessage: {
                type: "Phone Number should be Number",
            },
        },
        gstnumber: {
            type: "string",
            errorMessage: {
                type: "GST should be string",
            },
        },
        supplierid: {
            type: "number",
            errorMessage: {
                type: "Supplier Id should be Number",
            },
        },
        prurl: {
            type: ["string","null"],
            errorMessage: {
                type: "PR Url should be string",
            },
        },
        // prdata: {
        //     type: ["array","null"],
        //     items: {
        //         type: "object",
        //         properties: {
        //             id: {
        //                 type: "integer",
        //                 errorMessage: {
        //                     type: "ID should be integer",
        //                 },
        //             },
        //             name: {
        //                 type: "string",
        //                 errorMessage: {
        //                     type: "Name should be string",
        //                 },
        //             },
        //             quantity: {
        //                 type: "integer",
        //                 errorMessage: {
        //                     type: "Quantity should be integer",
        //                 },
        //             },
        //         },
        //     },
        // },
      
    },
    required: [
        "companyname",
        "companyaddress",
        "contactname",
        "phonenumber",
        "gstnumber",
        "supplierid",
    ],
    errorMessage: {
        required: {
            companyname: "Company Name is required",
            companyaddress: "Company Address is required",
            contactname: "Contact Name is required",
            phonenumber: "Phone Number is required",
            gstnumber: "GST Number is required",
            supplierid: "Supplier ID is required."
        },
    },
};
