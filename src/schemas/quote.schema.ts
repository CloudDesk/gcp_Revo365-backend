export const quoteinsert ={
    type:'object',
    properties:{
        status:{
            type:['string','null'],
            errorMessage:{
                type:'Status must be string'
            }
        },
        prnumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'PR Number should be String'
            }
        },
        quoteurl:{
            type:['string','null'],
            errorMessage:{
                type: 'Quote URL should be string'
            }
        }
    }
}