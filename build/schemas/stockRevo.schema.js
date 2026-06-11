import { getStockLocationData } from "../utils/StockLocationPicklist/locationpicklist.js";
const locationdataajv = await getStockLocationData();
export const stockrevoSchema = {
    type: 'object',
    properties: {
        puc: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'PUC should be String'
            }
        },
        category: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Category should be String'
            }
        },
        subcategory: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Subcategory should be String'
            }
        },
        brand: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Brand should be String'
            }
        },
        model: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Model should be String'
            }
        },
        operatingsystem: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Operating System should be String'
            }
        },
        operatingsystemversion: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Operating System Version should be String'
            }
        },
        ram: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'RAM should be String'
            }
        },
        storagetype: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Storage Type should be String'
            }
        },
        storagecapacity: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Storage Capacity should be String'
            }
        },
        colour: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Colour should be String'
            }
        },
        graphicscard: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Graphics card should be String'
            }
        },
        processor: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Processor should be String'
            }
        },
        createdby: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Created by should be number'
            }
        },
        modifiedby: {
            type: ['number', 'null'],
            errorMessage: {
                type: 'Modified by should be number'
            }
        },
        serialnumber: {
            type: ["string"],
            // pattern: "^(?!\\d+$).*",
            errorMessage: {
                type: "Serial number should be a string",
                // pattern: "Serial number should not consist only of digits",
            },
        },
        stockstatus: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Stock status should be String'
            }
        },
        manufacturedyear: {
            type: ["string", "null"],
            pattern: "^(0[1-9]|[12][0-9]|3[01])[-/](0[1-9]|1[0-2])[-/](\\d{4})$",
            errorMessage: {
                type: "Manufactured year should be a string",
                pattern: "Manufactured year should be a valid date in the format DD-MM-YYYY"
            }
        },
        releaseyear: {
            type: ["string", "null"],
            pattern: "^(0[1-9]|[12][0-9]|3[01])[-/](0[1-9]|1[0-2])[-/](\\d{4})$",
            errorMessage: {
                type: "Release year should be a string",
                pattern: "Release year should be a valid date in the format DD-MM-YYYY"
            }
        },
        isdeleted: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: 'Isdeleted should be boolean'
            }
        },
        isarchive: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: 'Isarchive should be boolean'
            }
        },
        removefromrecyclebin: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: 'Remove from recyclebin should be boolean'
            }
        },
        ecompublish: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: 'Ecompublish should be boolean'
            }
        },
        productname: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Productname should be String'
            }
        },
        rfid: {
            type: ['string', 'null'],
            pattern: "^(?:|.{10}|\\d{12})$",
            errorMessage: {
                type: 'Barcode Number should be String',
                pattern: 'Barcode Number should be exactly 12 digits. Existing 10-character values are supported for legacy stock.'
            }
        },
        location: {
            type: ['string', 'null'],
            "enum": locationdataajv,
            errorMessage: {
                type: 'Location should be String',
                enum: "Entered location may not be available or check spelling."
            }
        }
    },
    required: [
        "serialnumber",
    ]
};
export const deletestockrevoSchema = {
    type: 'object',
    properties: {
        id: {
            type: ['number'],
            errorMessage: {
                type: 'Id should be number.',
            }
        },
        puc: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'PUC should be String'
            }
        },
        serialnumber: {
            type: ["string"],
            errorMessage: {
                type: "Serial number should be a string",
            },
        },
        isdeleted: {
            type: ['boolean'],
            errorMessage: {
                type: 'Isdeleted should be boolean'
            }
        },
    },
    required: [
        "puc", "serialnumber", "isdeleted", "id"
    ],
    errorMessage: {
        required: {
            id: 'Id is mandatory.',
            puc: 'PUC is mandatory.',
            serialnumber: 'Serial number is mandatory.',
            isdeleted: 'Isdeleted is mandatory.'
        }
    }
};
export const archivestockrevoSchema = {
    type: 'object',
    properties: {
        id: {
            type: ['number'],
            errorMessage: {
                type: 'id should be number'
            }
        },
        puc: {
            type: ['string'],
            errorMessage: {
                type: 'PUC should be String'
            }
        },
        serialnumber: {
            type: ["string"],
            // pattern: "^(?!\\d+$).*",
            errorMessage: {
                type: "Serial number should be a string",
                // pattern: "Serial number should not consist only of digits",
            },
        },
        isarchive: {
            type: ['boolean'],
            errorMessage: {
                type: 'Isarchive should be boolean'
            }
        },
    },
    required: [
        "puc", "serialnumber", "isarchive", "id"
    ],
    errorMessage: {
        required: {
            id: 'Id is mandatory.',
            puc: 'PUC is mandatory.',
            serialnumber: 'Serial number is mandatory.',
            isarchive: 'isarchive is mandatory.'
        }
    }
};
//# sourceMappingURL=stockRevo.schema.js.map