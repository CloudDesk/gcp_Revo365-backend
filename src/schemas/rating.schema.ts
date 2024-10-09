
export const ratingInsertSchema = {
    type: 'object',
    properties: {
        userid: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'User Id should be number'
            }
        },
        productid: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Product Id should be number'
            }
        },
        orderid: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Order Id should be number'
            }
        },
        starrating: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Star Rating should be number'
            }
        },
        comments: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Comments should be text'
            }
        },
        url: {
            type: ['array', 'null'],
            items: {
                type: 'string'
            },
            errorMessage: {
                type: 'URL should be an array of strings'
            }
        }
        
    },

    required: []
};
