
export const productInsertSchema = {

    type: 'object',
    properties: {

        //common for all 
        productname: {
            type: 'string',
            minLength: 2,
            maxLength: 300,
            errorMessage: {
                type: "Product Name must be string",
                minLength: "Product Name Must contain atleast 2 characters",
                maxLength: "Product Name Must not exceed 300 characters"
            }
        },
        brand: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Brand should be a string value"
            }
        },
        model: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Model should be a string value"
            }
        },
        // productid: {
        //     type: ['string', 'null'],
        //     minLength: 2,
        //     maxLength: 300,
        //     errorMessage: {
        //         type: "Product ID should be a string value",
        //         minLength: "Product ID  Should Contain at least 2 Characters",
        //         maxLength: "Product ID Can have maximum of 300 Characters"
        //     }
        // },
        // storagecapacity: {
        //     type: ['string', 'null'],
        //     errorMessage: {
        //         type: "Storage Capacity should be a string value"
        //     }
        // },
        // colour: {
        //     type: ['string', 'null'],
        //     minLength: 2,
        //     maxLength: 300,
        //     errorMessage: {
        //         type: "Colour must be string",
        //         minLength: "Colour must contain 2 characters",
        //         maxLength: "Colour must not exceeds 300 characters"
        //     }
        // },
        // weight:
        // {
        //     type: ['number', 'null'],
        //     minimum: 0.1,
        //     maximum: 99,
        //     errorMessage: {
        //         type: "weight must be number",
        //         minimum: "Weight can't be 0",
        //         maximum: "Weight must not exceeds 99"
        //     }
        // },
        // dimensions: {
        //     type: ['string', 'null'],
        //     minLength: 2,
        //     maxLength: 300,
        //     errorMessage: {
        //         type: "Dimensions must be string",
        //         minLength: "Dimensions must contain 2 characters",
        //         maxLength: "Dimensions must not exceeds 300 characters"
        //     }
        // },
        // price: {
        //     type: 'number',
        //     errorMessage: {
        //         type: "Price must be number",
        //     }
        // },
        // manufacturedate: {
        //     type: ['number', 'null'],
        //     errorMessage: {
        //         type: "Manufactured Date should be number"
        //     }
        // },

        // additionalfeatures: {
        //     type: ['string', 'null'],
        //     maxLength: 8000,
        //     errorMessage: {
        //         type: "Additional Features must be string",
        //         maxLength: "Additional Features allow maximum 8000 characters"
        //     }
        // },
        // // new laptop
        // processor: {
        //     type: ['string', 'null'],
        //     errorMessage: {
        //         type: "Processor should be a string value"
        //     }
        // },
        
    //     operatingsystemversion: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Operating System version should be a string value"
    //         }
    //     },
    //     ram: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "RAM should be a string value"
    //         }
    //     },
    //     storagetype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Storage Type should be a string value"
    //         }
    //     },
    //     displaytype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Display Type should be a string value"
    //         }
    //     },
    //     displaysize: {
    //         type: ['number', 'null'],
    //         minimum: 0.1,
    //         maximum: 999.9,
    //         errorMessage: {
    //             type: "Display Size must be string",
    //             minimum: "Display Size must be atleast 1 number",
    //             maximum: "Display Size must not exceed 3 number"
    //         }
    //     },
    //     displayresolution: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Display Resolution must be string",
    //             minLength: "Display Resolution must contain 2 characters",
    //             maxLength: "Display Resolution must not exceeds 300 characters"
    //         }
    //     },
    //     graphicscard: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Graphics Card must be string",
    //             minLength: "Graphics Card must contain 2 characters",
    //             maxLength: "Graphics Card must not exceeds 300 characters"
    //         }
    //     },
    //     fingerprintreader: {
    //         type: ['boolean', 'null'],
    //         errorMessage: {
    //             type: "Finger Print Reader must be boolean value"
    //         }
    //     },
    //     batterylife: {
    //         type: ['number', 'null'],
    //         minimum: 1,
    //         maximum: 999,
    //         errorMessage: {
    //             type: "Battery Life must be number",
    //             minimum: "Battery Life must contain characters between 1 to 3",
    //             maximum: "Battery Life must contain characters between 1 to 3"
    //         }
    //     },
    //     chargerports: {
    //         type: ['array', 'null'],
    //         errorMessage: {
    //             type: "Charger Ports should be a Array value"
    //         }
    //     },
    //     releaseyear: {
    //         type: ['number', 'null'],
    //         errorMessage: {
    //             type: "Release Year should be number"
    //         }
    //     },
    //     adaptertypes: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Adapter Types should be a string value"
    //         }
    //     },
    //     large: {
    //         type: ["array", "null"],
    //         items: {
    //             type: "string"
    //         },
    //         errorMessage: {
    //             "type": "Large should be a Array value"
    //         }
    //     },
    //     medium: {
    //         type: ["array", "null"],
    //         items: {
    //             type: "string"
    //         },
    //         errorMessage: {
    //             "type": "Medium should be a Array value"
    //         }
    //     },
    //     small: {
    //         type: ["array", "null"],
    //         items: {
    //             type: "string"
    //         },
    //         errorMessage: {
    //             "type": "Small should be a Array value"
    //         }
    //     },

    //     //   used laptop
    //     condition: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Condition should be string"
    //         }
    //     },
    //     ageoflaptopyear: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Age of Laptop Year should be a string value"
    //         }
    //     },
    //     ageoflaptopmonth: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Age of Laptop Month should be a string value"
    //         }
    //     },
    //   /*  usagehours: {
    //         type: ['number', 'null'],
    //         minimum: 1,
    //         maximum: 999,
    //         errorMessage: {
    //             type: "Usage Hours should be number",
    //             minimum: "Usage Hours must be between 1 to 3 characters",
    //             maximum: "Usage Hours must be between 1 to 3 characters"
    //         }
    //     },*/
        
    //     servicehistory: {
    //         type: ['string', 'null'],
    //         maxLength: 8000,
    //         errorMessage: {
    //             type: "Service History should be string",
    //             maxLength: "Service History length must not exceed 8000 characters"
    //         }
    //     },
    //     laptopconditiondescription: {
    //         type: ['string', 'null'],
    //         maxLength: 8000,
    //         errorMessage: {
    //             type: "Laptop Condition Description should be string",
    //             maxLength: "Laptop Condition Description must not exceed 8000 characters"
    //         }
    //     },
    //     accessoriesincluded: {
    //         type: ['array', 'null'],
    //         errorMessage: {
    //             type: "Accessories Included should be array"
    //         }
    //     },
    //     originalbox: {
    //         type: ['boolean', 'null'],
    //         errorMessage: {
    //             type: "Original Box should be boolean"
    //         }
    //     },

    //     //     // mobile used

    //     previoususage: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Previous Usage should be string"
    //         }
    //     },
    //     alterations: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Alteration should be a string"
    //         }
    //     },
    //     // warrantyvalid: {
    //     //     type: ['boolean', 'null'],
    //     //     errorMessage: {
    //     //         type: "Warranty Valid should be boolean"
    //     //     }
    //     // },
    //     accessories: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Accessories should be string"
    //         }
    //     },
    //     imeinumber: {
    //         type: ['number', 'null'],
    //         minimum: 100000000000000,
    //         maximum: 999999999999999,
    //         errorMessage: {
    //             type: "IMEI Number should be number",
    //             minimum: "IMEI Number Length must be 15 characters",
    //             maximum: "IMEI Number Length must be 15 characters"
    //         }
    //     },
    //     batteryhealth: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Battery  Health should be string ",
    //             minLength: "Battery Health Length must be atleast 2 characters",
    //             maxLength: "Battery Health Length must not exceed 300 characters"
    //         }
    //     },
    //     screencondition: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Screen Condition should be string"
    //         }
    //     },
    //     bodycondition: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Body Condition should be string"
    //         }
    //     },
    //     cameracondition: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Camera Condition should be string"
    //         }
    //     },
    //     additionalnotes: {
    //         type: ['string', 'null'],
    //         maxLength: 8000,
    //         errorMessage: {
    //             type: "Additional Notes should be string",
    //             maxLength: "Additional Notes can't exceed 8000 characters"
    //         }
    //     },
    //     operatingsystem: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Operating System should be string"
    //         }
    //     },
    //     frontcameraspecifications: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Frontcamera Specifications should be string",
    //             minLength: "Frontcamera Specifications Length must be atleast 2 characters",
    //             maxLength: "Frontcamera Specifications Length must not exceed 300 characters"
    //         }
    //     },
    //     backcameraspecifications: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Backcamera Specifications should be string",
    //             minLength: "Backcamera Specifications Length must be atleast 2 characters",
    //             maxLength: "Backcamera Specifications Length must not exceed 300 characters"
    //         }
    //     },
    //     chargingtype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Charging Type should be string"
    //         }
    //     },
    //     batterytype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Battery Type should be string"
    //         }
    //     },
    //     batterycapacity: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Battery Capacity should be string",
    //             minLength: "Battery Capacity must contain 2 characters",
    //             maxLength: "Battery Capacity must not exceed 300 characters"
    //         }
    //     },
    //     warrantyenddate: {
    //         type: ['number', 'null'],
    //         errorMessage: {
    //             type: "Warranty End Date should be number"
    //         }
    //     },

    //     //refurbishment

    //     refurbishmentstatus: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Refurbishment Status should be string"
    //         }
    //     },
    //    /* refurbishmentdate: {
    //         type: ['number', 'null'],
    //         errorMessage: {
    //             type: "Refurbishment Date should be number"
    //         }
    //     },*/
    //     warranty: {
    //         type: ["string", "null"],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Warranty should be string",
    //             minLength: "Warranty must contain atleast 2 characters",
    //             maxLength: "Warraty can have maximum 300 characters"
    //         }
    //     },
    //     refurbisherinformation: {
    //         type: ["string", "null"],
    //         errorMessage: {
    //             type: "Refurbisher Information should be string"
    //         }
    //     },
    //     certifications: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Certifications should be string"
    //         }
    //     },

    //     //    New Accessories
    //     material: {
    //         type: ["string", 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Material should be string",
    //             minLength: "Material Length must be 2 characters",
    //             maxLength: "Material Length must be not exceed 300 characters"
    //         }
    //     },
    //     cablelength: {
    //         type: ["string", 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Cable Length should be string",
    //             minLength: "Cable Length Length must be 2 characters",
    //             maxLength: "Cable Length Length must not exceed 300 characters"
    //         }
    //     },
    //     outputpowerwattage: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Output Power Wattage should be string"
    //         },
    //     },
    //     plugtype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Plug Type should be string"
    //         },
    //     },
    //     inputvoltage: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Input Voltage should be string",
    //             minLength: "Input Voltage Length must be 2 characters",
    //             maxLength: "Input Voltage Length must not exceed 300 characters"
    //         }
    //     },
    //     inputcurrent: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Input Current should be string",
    //             minLength: "Input Current Length must be 2 characters",
    //             maxLength: "Input Current Length must atleat 300 characters"
    //         }
    //     },
    //     outputvoltage: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Output Voltage should be string",
    //             minLength: "Output Voltage Length must be 2 characters",
    //             maxLength: "Output Voltage Length must not exceed 300 characters"
    //         }
    //     },
    //     outputcurrent: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Output Current should be string",
    //             minLength: "Output Current Length must be 2 characters",
    //             maxLength: "Output Current Length must not exceed 300 characters"
    //         }
    //     },
    //     poweroutput: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Power Output should be string",
    //             minLength: "Power Output Length must be 2 characters",
    //             maxLength: "Power Output Length must not exceed 300 characters"
    //         }
    //     },
    //     //   Used accessories
    //     physicalcondition: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Physical Condition should be string",
    //             minLength: "Physical Condition must be 2 characters",
    //             maxLength: "Physical Condition field should not exceed 300 characters"
    //         }
    //     },
    //     workingcondition: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Working Condition should be string",
    //             minLength: "Working Condition must be 2 characters",
    //             maxLength: "Working Condition should not exceed 300 characters"
    //         }
    //     },
    //     missingparts: {
    //         type: ["string", 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Missing Parts should be string",
    //             minLength: "Missing Parts must be 2 characters",
    //             maxLength: "Missing Parts should not exceed 300 characters"
    //         }
    //     },
    //     ageoftheproduct: {
    //         type: ['number', 'null'],
    //         minimum: 1,
    //         maximum: 999,
    //         errorMessage: {
    //             type: "Age of the Product should be number",
    //             minimum: "Age of the Product length must be between 1 to 3 characters",
    //             maximum: "Age of the Product length must be between 1 to 3 characters"
    //         }
    //     },
    //     refurbishedpart: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Refurbished Part  should be string",
    //             minLength: "Refurbished Part length must be 2 characters",
    //             maxLength: "Refurbished Part length must not exceed 300 characters"
    //         }
    //     },
    //     refurbisheddate: {
    //         type: ['number', 'null'],
    //         errorMessage: {
    //             type: "Refurbished Date should be number"
    //         }
    //     },
    //     // laptop accessories
    //     connectivitytype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Connectivity Type should be a string"
    //         }
    //     },
    //     supports: {
    //         type: ['array', 'null'],
    //         errorMessage: {
    //             type: "Supports should be a array"
    //         }
    //     },
    //     dpi: {
    //         type: ['boolean', 'null'],
    //         errorMessage: {
    //             type: "DPI should be boolean"
    //         }
    //     },
    //     sensortype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Sensor Type should be a string"
    //         }
    //     },
    //     pollingrate: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: 'Polling Rate should be a string'
    //         }
    //     },
    //     numberofbuttons: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: 'Number of Buttons should be a string'
    //         }
    //     },
    //     keylayout: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: 'Key Layout is should be string.'
    //         }
    //     },
    //     backlight: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Back Light should be String"
    //         }
    //     },
    //     interface: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Interface  should be a string."
    //         }
    //     },
    //     datatransferspeed: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Data Transfer Speed must be a string"
    //         }
    //     },
    //     formfactor: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Form factor Speed must be a string"
    //         }
    //     },
    //     systemrequirements: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Form factor Speed must be a string"
    //         }
    //     },
    //     numberofports: {
    //         type: ['number', 'null'],
    //         minimum: 1,
    //         maximum: 999,
    //         errorMessage: {
    //             type: "Number of Ports should be Number.",
    //             minimum: "Number of Ports should be greater than or equal to 1",
    //             maximum: "Number of Ports should be less than 1000"
    //         }
    //     },
    //     portsandconnectivity: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Ports and Connectivity should be a String."
    //         }
    //     },
    //     fanspeed: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Fan Speed should be a String.",
    //             minLength: "The Fan Speed field should have at least 2 characters.",
    //             maxLength: "The Fan Speed field should not exceed 300 characters."
    //         }
    //     },
    //     numberoffans: {
    //         type: ["number", "null"],
    //         minimum: 1,
    //         maximum: 999,
    //         errorMessage: {
    //             type: "Number of Fans should be a Number.",
    //             minimum: "Number of Fans should be greater than or equal to 1.",
    //             maximum: "Number of Fans should be less than or equal to 999"
    //         }
    //     },
    //     noiselevel: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Noise Level should be a String.",
    //             minLength: "The Noise Level field should contain atleast 2 character.",
    //             maxLength: "The Noise Level field should not exceed 300 characters."
    //         }
    //     },
    //     powersource: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Power Source should be a String."
    //         }
    //     },
    //     paneltype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Panel Type should be a string"
    //         }
    //     },
    //     refreshrate: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Refresh Rate should be a string"
    //         }
    //     },
    //     responsetime: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Response Time must be a string",
    //             minLength: "Response Time must contain at least 2 characters",
    //             maxLength: "Response Time must not exceed 300 characters"
    //         }
    //     },
    //     aspectratio: {
    //         type: ['number', 'null'],
    //         minimum: 1,
    //         maximum: 999,
    //         errorMessage: {
    //             type: "Aspect Ratio must be a number",
    //             minimum: "Aspect Ratio must be at least 1",
    //             maximum: "Aspect Ratio must not exceed 999"
    //         }
    //     },
    //     contrastratio: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Contrast Ratio must be a string",
    //         }
    //     },
    //     touchscreensupport: {
    //         type: ['boolean', 'null'],
    //         errorMessage: {
    //             type: "Touchscreen Support must be a boolean value"
    //         }
    //     },
    //     frequency: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Frequency must be one of the provided options"
    //         }
    //     },
    //     noisecancellation: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Noise Cancellation must be one of the provided options"
    //         }
    //     },
    //     headsettype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Headset Type must be one of the provided options"
    //         }
    //     },
    //     deepbass: {
    //         type: ['boolean', 'null'],
    //         errorMessage: {
    //             type: "Deep Bass must be a boolean value"
    //         }
    //     },
    //     headphonedriversize: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Headphone Driver Size must be one of the provided options"
    //         }
    //     },
    //     inlineremote: {
    //         type: ['boolean', 'null'],
    //         errorMessage: {
    //             type: "Inline Remote must be a boolean value"
    //         }
    //     },
    //     connectortype: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Connector Type must be one of the provided options"
    //         }
    //     },
    //     voltageandcurrentrating: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Voltage and Current Rating must be alphanumeric",
    //         }
    //     },
    //     compatiblelaptopsize: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Compatible Laptop Size must be alphanumeric",
    //         }
    //     },
    //     bagcapacity: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Bag Capacity must be alphanumeric",
    //         }
    //     },
    //     // mobile accessories
    //     accessoriesbrand: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Protective case Brand must be a string",
    //             minLength: "Protective case Brand should contain at least 2 characters",
    //             maxLength: "Protective case Brand should not exceed 300 characters"
    //         }
    //     },
    //     thickness: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Thickness must be a string",
    //             minLength: "Thickness should contain at least 2 characters",
    //             maxLength: "Thickness should not exceed 300 characters"
    //         }
    //     },
    //     packagecontents: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Package contents must be a string",
    //             minLength: "Package contents should contain at least 2 characters",
    //             maxLength: "Package contents should not exceed 300 characters"
    //         }
    //     },
    //     designedfor: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Designed for must be a string",
    //             minLength: "Designed for should contain at least 2 characters",
    //             maxLength: "Designed for should not exceed 300 characters"
    //         }
    //     },
    //     adapterporttype: {
    //         type: ['array', 'null'],
    //         errorMessage: {
    //             type: "Adapter port type must be an array"
    //         }
    //     },
    //     lightindicator: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Light indicator must be a string"
    //         }
    //     },
    //     powerinput: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Power Input must be a string",
    //             minLength: "Power Input should contain at least 2 characters",
    //             maxLength: "Power Input should not exceed 300 characters"
    //         }
    //     },
    //     includeschargingcable: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Includes charging cable must be either 'Yes' or 'No'",
    //         }
    //     },
    //     powersupply: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Power Supply must be a string",
    //             minLength: "Power Supply should contain at least 2 characters",
    //             maxLength: "Power Supply should not exceed 300 characters"
    //         }
    //     },

    //     foldable: {
    //         type: ['string', 'null'],
    //         errorMessage: {
    //             type: "Foldable must be either 'Yes' or 'No'",
    //         }
    //     },
    //     compatibility: {
    //         type: ['string', 'null'],
    //         minLength: 1,
    //         maxLength: 8000,
    //         errorMessage: {
    //             type: "Compatibility must be a string",
    //             minLength: "Compatibility should contain at least 1 character",
    //             maxLength: "Compatibility should not exceed 8000 characters"
    //         }
    //     },
    //     sticklength: {
    //         type: ['string', 'null'],
    //         minLength: 2,
    //         maxLength: 300,
    //         errorMessage: {
    //             type: "Stick Length must be a string",
    //             minLength: "Stick Length should contain at least 2 characters",
    //             maxLength: "Stick Length should not exceed 300 characters"
    //         }
    //     },
    },
    required: [
        "productname","brand","model",
        // "productid", "displaysize","displayresolution","graphicscard","batterylife",
        // "colour","weight","dimensions","price"
        // ,"displaytype","storagecapacity","processor","ram",
        // "storagetype","chargerports","adaptertypes","manufacturedate","releaseyear","condition",
        // "ageoflaptopyear","ageoflaptopmonth","accessoriesincluded","originalbox",
        // "imeinumber","batteryhealth","screencondition","bodycondition","cameracondition",
        // "operatingsystem","chargingtype","batterytype","batterycapacity","refurbishmentstatus",
        // "certifications","outputpowerwattage","plugtype","inputvoltage",
        // "inputcurrent","outputvoltage","outputcurrent","poweroutput","physicalcondition",
        // "workingcondition","ageoftheproduct","refurbishedpart","refurbisheddate","connectivitytype",
        // "warranty","supports","dpi","sensortype","pollingrate","numberofbuttons","interface",
        // "paneltype","responsetime","aspectratio","contrastratio","touchscreensupport","frequency",
        // "noisecancellation","headsettype","deepbass","headphonedriversize","inlineremote",
        // "connectortype","voltageandcurrentrating","compatiblelaptopsize","bagcapacity","accessoriesbrand",
        // "thickness","packagecontents","adapterporttype","lightindicator","powerinput",
        // "includeschargingcable","powersupply","compatibility","sticklength","operatingsystemversion"
    ]
};


export const deleteProductSchema = {
    type: 'object',
    required: ['id'],
    properties: {
        id: {
            type: 'number',
            errorMessage: {
                type: 'Product ID must be a Number',
            }
        }
    }
};