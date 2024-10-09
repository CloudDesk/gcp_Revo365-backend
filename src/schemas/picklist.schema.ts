export const picklistInsertSchema = {
    type: 'object',
    properties: {
        label:{
            type:['string','null'],
            errorMessage:{
                type:'Label should be string'
            }
        },
        value:{
            type:['string','null'],
            errorMessage:{
                type:'Value should be string'
            }
        },
        object:{
            type:['string','null'],
            errorMessage:{
                type:'Object should be string'
            }
        },
        controlledvalue:{
            type:['string','null'],
            errorMessage:{
                type:'Controlled value should be string'
            }
        },
        fieldname:{
            type:['string','null'],
            errorMessage:{
                type:'Field name should be string'
            }
        },
        controlledlabel:{
            type:['string','null'],
            errorMessage:{
                type:'Controlled label should be string'
            }
        },
        controlledfieldname:{
            type:['string','null'],
            errorMessage:{
                type:'Controlled field name should be string'
            }
        },
        parent:{
            type:['string','null'],
            errorMessage:{
                type:'Parent should be string'
            }
        }
    },
    required: [
    ]

}