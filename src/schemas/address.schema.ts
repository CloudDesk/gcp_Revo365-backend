export const addressInsertSchema = {
    type: 'object',
    properties: {
        userid:{
            type:['number','null'],
            errorMessage:{
                type:'User ID should be number'
            }
        },
        name:{
            type:['string','null'],
            errorMessage:{
                type:'Name should ne string'
            }
        },
        mobilenumber:{
            type:['number','null'],
            errorMessage:{
                type:'Mobile Number should be number'
            }
        },
        pincode: {
            type: ['number','null'],
            "minimum": 100000,
            "maximum": 999999,
            "errorMessage": {
                "type": "Pin code must be a number",
                "minimum": "Pin code must contain 6 digits",
                "maximum": "Pin code must not exceed 6 digits"
            }
        },
        doornumber: {
            type: ['string','null'],
            minLength: 2,
            maxLength: 300,
            errorMessage: {
                type: "Door Number must be string",
                minLength: "Door Number must be atleast 2",
                maxLength: "Door Number must be between 2 to 300 characters"
            }
        },
        address:{
            type:['string','null'],
            errorMessage:{
                type:'Address should be string'
            }
        },
        landmark:{
            type:['string','null'],
            errorMessage:{
                type:'Land Mark should be string'
            }
        },
        city: {
            type: ['string','null'],
            errorMessage: {
                type: "City should be string"
            }
        },
        state: {
            type: ['string','null'],
            errorMessage: {
                type: "State should be string"
            }
        },
    },
    required: []
}