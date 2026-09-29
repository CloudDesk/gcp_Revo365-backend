export const servicecostestimationSchema = {
    type: 'object',
    properties: {        
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
        estimationurl:{
            type:['string','null'],
            minLength: 2,
            maxLength: 490,
            errorMessage:{
                type:"Estimation URL should be String",
                minLength:"Estimation URL should be alteast 2 characters",
                maxLength:"Estimation URL should between 2 to 490 characters"
            }
        },
        estimationstatus:{
            type:['string','null'],
            minLength: 2,
            maxLength: 490,
            errorMessage:{
                type:"Estimation status should be String",
                minLength:"Estimation status should be alteast 2 characters",
                maxLength:"Estimation status should between 2 to 490 characters"
            }
        },
        // productdata:{
        //     type:['json','null']
        // },
        // servicedata:{
        //     type:['json','null']
        // }
        productcgst:{
            type:['number','null'],
            errorMessage:{
                type:'Product CGST should be Number'
            }
        },
        productsgst:{
            type:['number','null'],
            errorMessage:{
                type:'Product SGST should be Number'
            }
        },
        producttaxamount:{
            type:['number','null'],
            errorMessage:{
                type:'Product Tax Amount should be Number'
            }
        },
        producttotal:{
            type:['number','null'],
            errorMessage:{
                type:'Product Total should be Number'
            }
        },
        servicecgst:{
            type:['number','null'],
            errorMessage:{
                type:'Service CGST should be Number'
            }
        },
        servicesgst:{
            type:['number','null'],
            errorMessage:{
                type:'Service SGST should be Number'
            }
        },
        servicetaxamount:{
            type:['number','null'],
            errorMessage:{
                type:'Service Tax Amount should be Number'
            }
        },
        servicetotal:{
            type:['number','null'],
            errorMessage:{
                type:'Service Total Amount should be Number'
            }
        },
        totalpayableamount:{
            type:['number','null'],
            errorMessage:{
                type:'Total Payable Amount Amount should be Number'
            }
        }
    },
    required: []

}
