export const inventoryusersSchema = {
    type: 'object',
    properties: {
        usermail: {
            type: ['string', 'null'],
            minLength: 6,
            maxLength: 250,
            errorMessage: {
                type: "User Mail sjould be String",
                minLength: "User Mail should be at least 6 characters long",
                maxLength: "User Mail should between 6 to 250 characters"
            }
        },
        userpassword: {
            type: ['string', 'null'],
            minLength: 6,
            maxLength: 250,
            errorMessage: {
                type: "User Password should be String",
                minLength: "User Password should be alteast 6 characters",
                maxLength: "User Password should between 6 to 250 characters"
            }
        },
        role: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 490,
            errorMessage: {
                type: "Role should be String",
                minLength: "Role should be alteast 2 characters",
                maxLength: "Role should between 2 to 490 characters"
            }
        },
        usersphonenumber: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Users Phone Number should be Number"
            }
        },
        firstname: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 250,
            errorMessage: {
                type: "First Name should be String",
                minLength: "First Name should be alteast 2 characters",
                maxLength: "First Name should between 2 to 250 characters"
            }
        },
        lastname: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 250,
            errorMessage: {
                type: "Last Name should be String",
                minLength: "Last Name should be alteast 2 characters",
                maxLength: "Last Name should between 2 to 250 characters"
            }
        },
    },
    required: [
    // "usermail",
    // "userpassword"
    ]
};
//# sourceMappingURL=inventoryusers.schema.js.map