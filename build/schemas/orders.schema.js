export const ordersInsertSchema = {
    type: 'object',
    properties: {
        productid: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Product ID should be number'
            }
        },
        userid: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'User ID should be number'
            }
        },
        addressid: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Address ID should be number'
            }
        },
        orderamount: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Order Amount should be number'
            }
        },
        orderid: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Order ID should be string'
            }
        },
        orderstatus: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Order status should be string'
            }
        },
        delivereddate: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Deliver Date should be number'
            }
        },
        cancelleddate: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Cancelled Date should be number'
            }
        },
        returneddate: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Returned Date should be number'
            }
        },
        quantity: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Quantity should be number'
            }
        },
        transactionid: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Transaction ID should be string'
            }
        }
    },
    required: []
};
//# sourceMappingURL=orders.schema.js.map