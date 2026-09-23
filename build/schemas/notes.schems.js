export const notesSchema = {
    type: 'object',
    properties: {
        quotenumber: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 490,
            errorMessage: {
                type: "Quote Number should be String",
                minLength: "Quote Number be alteast 2 characters",
                maxLength: "Quote Number between 2 to 490 characters"
            }
        },
        ticketnumber: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 490,
            errorMessage: {
                type: "Ticket Number should be String",
                minLength: "Ticket Number be alteast 2 characters",
                maxLength: "Ticket Number between 2 to 490 characters"
            }
        },
        technicianid: {
            type: ['integer', 'null'],
            errorMessage: {
                type: "Technician Id should be Integer"
            }
        },
        technicianname: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 490,
            errorMessage: {
                type: "Technician Name should be String",
                minLength: "Technician Name be alteast 2 characters",
                maxLength: "Technician Name between 2 to 490 characters"
            }
        },
        title: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 490,
            errorMessage: {
                type: "Title should be String",
                minLength: "Title should be alteast 2 characters",
                maxLength: "Title should between 2 to 490 characters"
            }
        },
        ispinned: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Ispinned should be Boolean"
            }
        }
    },
    required: []
};
//# sourceMappingURL=notes.schems.js.map