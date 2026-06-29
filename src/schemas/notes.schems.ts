export const notesSchema = {
    type: 'object',
    properties: {        
        quotenumber:{
            type:['string','null'],
            minLength: 2,
            maxLength: 490,
            errorMessage:{
                type:"Quote Number should be String",
                minLength:"Quote Number be alteast 2 characters",
                maxLength:"Quote Number between 2 to 490 characters"
            }
        },
        ticketnumber:{
            type:['string','null'],
            minLength: 2,
            maxLength: 490,
            errorMessage:{
                type:"Ticket Number should be String",
                minLength:"Ticket Number be alteast 2 characters",
                maxLength:"Ticket Number between 2 to 490 characters"
            }
        },
        title:{
            type:['string','null'],
            minLength: 2,
            maxLength: 490,
            errorMessage:{
                type:"Title should be String",
                minLength:"Title should be alteast 2 characters",
                maxLength:"Title should between 2 to 490 characters"
            }
        },
        ispinned:{
            type:['boolean','null'],
            errorMessage:{
                type:"Ispinned should be Boolean"
            }
        }
    },
    required: []

}
