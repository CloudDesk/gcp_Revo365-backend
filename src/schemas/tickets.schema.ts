export const ticketsSchema = {
    type: 'object',
    properties: {
        ticketnumber: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Ticket Number should be a string",
                minLength: "Ticket Number should be at least 1 character long",
                maxLength: "Ticket Number should be between 1 to 500 characters"
            }
        },
        ticketstatus: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Ticket Status should be a string",
                minLength: "Ticket Status should be at least 1 character long",
                maxLength: "Ticket Status should be between 1 to 500 characters"
            }
        },
        tikcetcomments: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Ticket Comments should be a string"
            }
        },
        assignedto: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Assigned To should be an integer"
            }
        },
        tickettype: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Ticket Type should be a string",
                minLength: "Ticket Type should be at least 1 character long",
                maxLength: "Ticket Type should be between 1 to 255 characters"
            }
        },
        ticketpriority: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 500,
            errorMessage: {
                type: "Ticket Priority should be a string",
                minLength: "Ticket Priority should be at least 1 character long",
                maxLength: "Ticket Priority should be between 1 to 500 characters"
            }
        },
        transactionid: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Transaction ID should be a string",
                minLength: "Transaction ID should be at least 1 character long",
                maxLength: "Transaction ID should be between 1 to 255 characters"
            }
        },
        amount: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Amount should be a number"
            }
        },
        paymentmethod: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Payment Method should be a string",
                minLength: "Payment Method should be at least 1 character long",
                maxLength: "Payment Method should be between 1 to 255 characters"
            }
        },
        transactiondate: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Transaction Date should be an integer"
            }
        },
        payeremail: {
            type: ['string', 'null'],
            minLength: 6,
            maxLength: 255,
            errorMessage: {
                type: "Payer Email should be a string",
                minLength: "Payer Email should be at least 6 characters long",
                maxLength: "Payer Email should be between 6 to 255 characters"
            }
        },
        issuedescription: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Issue Description should be a string"
            }
        },
        recipturl: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 200,
            errorMessage: {
                type: "Receipt URL should be a string",
                minLength: "Receipt URL should be atleast 2 character",
                maxLength: "Receipt URL should be at most 200 characters long"
            }
        },
        trackingnumber: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Tracking Number should be a string",
                minLength: "Tracking Number should be at least 1 character long",
                maxLength: "Tracking Number should be between 1 to 255 characters"
            }
        },
        productname: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Product Name should be a string",
                minLength: "Product Name should be at least 1 character long",
                maxLength: "Product Name should be between 1 to 255 characters"
            }
        },
        purchasedate: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Purchase Date should be an integer"
            }
        },
        userid: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "User ID should be an integer"
            }
        },
        location: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Location should be a string",
                minLength: "Location should be at least 1 character long",
                maxLength: "Location should be between 1 to 255 characters"
            }
        },
        issuetype: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Issue Type should be a string",
                minLength: "Issue Type should be at least 1 character long",
                maxLength: "Issue Type should be between 1 to 255 characters"
            }
        },
        servicetype: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Service Type should be a string",
                minLength: "Service Type should be at least 1 character long",
                maxLength: "Service Type should be between 1 to 255 characters"
            }
        },
        proceedwithvalueservice: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Proceed with Value Service should be a boolean"
            }
        },
        productcategory: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Product Category should be a string",
                minLength: "Product Category should be at least 1 character long",
                maxLength: "Product Category should be between 1 to 255 characters"
            }
        },
        productbrand: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Product Brand should be a string",
                minLength: "Product Brand should be at least 1 character long",
                maxLength: "Product Brand should be between 1 to 255 characters"
            }
        },
        productmodel: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 255,
            errorMessage: {
                type: "Product Model should be a string",
                minLength: "Product Model should be at least 1 character long",
                maxLength: "Product Model should be between 1 to 255 characters"
            }
        },
        receiversemail: {
            type: ['string', 'null'],
            minLength: 6,
            maxLength: 250,
            errorMessage: {
                type: "Receivers Email should be a string",
                minLength: "Receivers Email should be at least 6 characters long",
                maxLength: "Receivers Email should be between 6 to 250 characters"
            }
        },
        assignedid: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Assigned ID should be an integer"
            }
        },
        approvedcostestimationid: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Approved Cost Estimation ID should be an integer"
            }
        },
        addressid: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Address ID should be an integer"
            }
        },
        queuenumber: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Queue Number should be an integer"
            }
        },
        requestedrenewaldate: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Requested Renewal Date should be an integer"
            }
        },
        requestedstopdate: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Requested Stop Date should be an integer"
            }
        },
    },
    required: [
        // 'tickettype'
    ] 
};
