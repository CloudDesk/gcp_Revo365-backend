export const addressInsertSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        id: {
            type: 'number',
            errorMessage: {
                type: 'ID should be number'
            }
        },
        userid: {
            type: 'number',
            errorMessage: {
                type: 'User ID should be number'
            }
        },
        name: {
            type: 'string',
            errorMessage: {
                type: 'Name should ne string'
            }
        },
        mobilenumber: {
            type: 'number',
            errorMessage: {
                type: 'Mobile Number should be number'
            }
        },
        pincode: {
            type: 'number',
            "minimum": 100000,
            "maximum": 999999,
            "errorMessage": {
                "type": "Pin code must be a number",
                "minimum": "Pin code must contain 6 digits",
                "maximum": "Pin code must not exceed 6 digits"
            }
        },
        doornumber: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 300,
            errorMessage: {
                type: "Door Number must be string",
                minLength: "Door Number must be atleast 2",
                maxLength: "Door Number must be between 2 to 300 characters"
            }
        },
        address: {
            type: 'string',
            errorMessage: {
                type: 'Address should be string'
            }
        },
        landmark: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Land Mark should be string'
            }
        },
        city: {
            type: 'string',
            errorMessage: {
                type: "City should be string"
            }
        },
        state: {
            type: 'string',
            errorMessage: {
                type: "State should be string"
            }
        },
        email: {
            type: ['string', 'null'],
            minLength: 5,
            maxLength: 255,
            errorMessage: {
                type: "Email should be string",
                minLength: "Email should be at least 5 characters",
                maxLength: "Email should be at most 255 characters"
            }
        }
    },
    oneOf: [
        {
            required: ["id"]
        },
        {
            required: [
                "userid",
                "name",
                "mobilenumber",
                "pincode",
                "address",
                "state",
                "city"
            ]
        }
    ]
};
//# sourceMappingURL=address.schema.js.map