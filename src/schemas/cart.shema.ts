export const cartInsertSchema = {
    type: 'object',
    properties: {
        productid:{
            type: 'number',
            // minLength: 1,
            // maxLength: 9999999999999,
            errorMessage:{
                type: "ProductID should be number"
            }
        },
        userid:{
            type: 'number',
            errorMessage:{
                type: 'User ID should be number'
            }
        },

        quantity:{
            type: 'number',
            errorMessage:{
                type:'Quantity should be number'
            }
        },
        iscart:{
            type: 'boolean',
            errorMessage:{
                type:'IsCart should be boolean'
            }
        },
        iswishlist:{
            type: 'boolean',
            errorMessage:{
                type:'IsWishlist should be boolean'
            }
        },
    },
    required: [
        // 'productid'
    ]

}