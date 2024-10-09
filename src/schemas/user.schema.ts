
export const userInsertSchema = {
    type: 'object',
    properties: {
        useremail: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'User e-mail should be string'
            }
        },
        userpassword: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'User Password should be string'
            }
        },
    },

    required: []
};
