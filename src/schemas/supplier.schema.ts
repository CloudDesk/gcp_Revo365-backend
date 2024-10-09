
export const supplierInsertSchema = {
    type: 'object',
    properties: {
        suppliername: {
            type: ['string','null'],
            minLength: 2,
            maxLength: 300,
            errorMessage: {
                type: "Supplier Name must be string",
                minLength: "Supplier Name must be alteast 2 characters",
                maxLength: "Supplier Name must be between 2 to 300 characters"
            }
        },
        doornumber: {
            type: ['string','null'],
            minLength: 2,
            maxLength: 300,
            errorMessage: {
                type: "Door Number must be string",
                minLength: "Door Number must be atleast 2",
                maxLength: "Door Number must be between 2 to 300 characters"
            }
        },
        supplierphonenumber: {
            type: ['number','null'],
            minimum: 1000000000,
            maximum: 9999999999,
            errorMessage: {
                type: "Supplier Phone number should only contain numbers",
                minimum: "Supplier Phone number length must be 10 numbers",
                maximum: "Supplier Phone number length must be 10 numbers"
            }
        },
        supplierlandline:{
            type:['number','null'],
            errorMessage:{
                type: 'Supplier Land line should be number'
            }
        },
        streetname: {
            type: ['string','null'],
            minLength: 2,
            maxLength: 300,
            errorMessage: {
                type: "Street name must be string",
                minLength: "Street name must contain atleast 2 characters",
                maxLength: "Street name must not exceeds 300 characters"
            }
        },
        city: {
            type: ['string','null'],
            errorMessage: {
                type: "City should be string"
            }
        },
        state: {
            type: ['string','null'],
            errorMessage: {
                type: "State should be string"
            }
        },
        pincode: {
            type: ['number','null'],
            "minimum": 100000,
            "maximum": 999999,
            "errorMessage": {
                "type": "Pin code must be a number",
                "minimum": "Pin code must contain 6 digits",
                "maximum": "Pin code must not exceed 6 digits"
            }
        },
        isdeleted:{
            type:['boolean','null'],
            errorMessage:{
                type: 'IsDeleted should be boolean'
            }
        },
        gstnumber:{
            type:['string','null'],
            errorMessage:{
                type:'GST number should be string'
            }
        },
        supplieremail:{
            type:['string','null'],
            errorMessage:{
                type:'Supplier E-Mail should be string'
            }
        }
    },

    required: [
        // "suppliername",
        // "doornumber",
        // "streetname",
        // "pincode",
        // "supplierphonenumber",
        "supplieremail"
    ],
    errorMessage:{
        required:{
            supplieremail: "Supplier E-Mail is required"
        }
    }
};
