export const transactionInsertSchema = {
    type: 'object',
    properties: {
        transactionid: {
            type: 'string',
            errorMessage: {
                type: 'Transaction Id should be a string'
            }
        },
        transactiondata: {
            type: ['object', 'null'],
            errorMessage: {
                type: 'Transaction data should be a JSON object'
            }
        }
    },
    required: []
};
//# sourceMappingURL=transaction.scheme.js.map