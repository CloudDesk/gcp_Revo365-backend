
export const productrevoInsertSchema = {

    type: 'object',
    properties: {

        //common for all 
        productname: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Product Name must be string",
                minLength: "Product Name Must contain atleast 2 characters",
                maxLength: "Product Name Must not exceed 5000 characters"
            }
        },
        hsncode: {
            type: ['string', 'null'],
            maxLength: 50,
            errorMessage: {
                type: "HSN Code must be string",
                maxLength: "HSN Code must not exceed 50 characters"
            }
        },
        saccode: {
            type: ['string', 'null'],
            maxLength: 50,
            errorMessage: {
                type: "SAC Code must be string",
                maxLength: "SAC Code must not exceed 50 characters"
            }
        },
        storage: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Stoage must be string",
            }
        },
        display: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Display must be string",
            }
        },
        graphicsprocessingunit: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Graphics processing unit should be string"
            }
        },
        operatingsystem: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Operating System should be string"
            }
        },
        ports: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Ports should be a string value"
            }
        },
        connectivity: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Connectivity should be a string value"
            }
        },
        weight:
        {
            type: ['number', 'null'],
            minimum: 0.1,
            maximum: 99,
            errorMessage: {
                type: "weight must be number",
                minimum: "Weight can't be 0",
                maximum: "Weight must not exceeds 99"
            }
        },
        category: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Category should be a string value"
            }
        },
        unitofmeasurement: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Unit of measurement should be a string value"
            }
        },
        costperproduct: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Cost per product should be a number"
            }
        },
        large: {
            type: ["array", "null"],
            items: {
                type: "string"
            },
            errorMessage: {
                "type": "Large should be a Array value"
            }
        },
        medium: {
            type: ["array", "null"],
            items: {
                type: "string"
            },
            errorMessage: {
                "type": "Medium should be a Array value"
            }
        },
        small: {
            type: ["array", "null"],
            items: {
                type: "string"
            },
            errorMessage: {
                "type": "Small should be a Array value"
            }
        },
        price: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Price must be number",
            }
        },
        processor: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Processor should be a string value"
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
        operatingsystemversion: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Operating System version should be a string value"
            }
        },
        ram: {
            type: ['string', 'null'],
            errorMessage: {
                type: "RAM should be a string value"
            }
        },
        storagetype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Storage Type should be a string value"
            }
        },
        storagecapacity: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Storage Capacity should be a string value"
            }
        },
        displaytype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Display Type should be a string value"
            }
        },
        displaysize: {
            type: ['number', 'null'],
            minimum: 0.1,
            maximum: 999.9,
            errorMessage: {
                type: "Display Size must be string",
                minimum: "Display Size must be atleast 1 number",
                maximum: "Display Size must not exceed 3 number"
            }
        },
        displayresolution: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Display Resolution must be string",
                minLength: "Display Resolution must contain 2 characters",
                maxLength: "Display Resolution must not exceeds 500 characters"
            }
        },
        batterylife: {
            type: ['number', 'null'],
            minimum: 1,
            maximum: 999,
            errorMessage: {
                type: "Battery Life must be number",
                minimum: "Battery Life must contain characters between 1 to 3",
                maximum: "Battery Life must contain characters between 1 to 3"
            }
        },
        colour: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Colour must be string",
                minLength: "Colour must contain 2 characters",
                maxLength: "Colour must not exceeds 500 characters"
            }
        },
        fingerprintreader: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Finger Print Reader must be boolean value"
            }
        },
        chargerports: {
            type: ['array', 'null'],
            errorMessage: {
                type: "Charger Ports should be a Array value"
            }
        },
        adaptertypes: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Adapter Types should be a string value"
            }
        },
        dimensions: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Dimensions must be string",
                minLength: "Dimensions must contain 2 characters",
                maxLength: "Dimensions must not exceeds 500 characters"
            }
        },
        manufacturedate: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Manufactured Date should be number"
            }
        },
        releaseyear: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Release Year should be number"
            }
        },
        additionalfeatures: {
            type: ['string', 'null'],
            maxLength: 8000,
            errorMessage: {
                type: "Additional Features must be string",
                maxLength: "Additional Features allow maximum 8000 characters"
            }
        },
        suppliername: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Supplier name should be string"
            }
        },
        doornumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Door number should be string"
            }
        },
        streetname: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Street name should be syring"
            }
        },
        city: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'City should be string'
            }
        },
        state: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'State should be string'
            }
        },
        pincode: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Pincode should be a number"
            }
        },
        graphicscard: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Graphics Card must be string",
                minLength: "Graphics Card must contain 2 characters",
                maxLength: "Graphics Card must not exceeds 500 characters"
            }
        },
        recordtype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Record type should be a string"
            }
        },
        subcategory: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Sub-category should be a string"
            }
        },
        producttype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Product type should be a string"
            }
        },
        buildtype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Build type should be a string"
            }
        },
        fulfillmenttype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Fulfillment type should be a string"
            }
        },
        sparetype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Spare type should be a string"
            }
        },
        location: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Location should be a string"
            }
        },
        productadditiondate: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Product addition date should be a number"
            }
        },
        supplierphonenumber: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Supplier phone number should be a number"
            }
        },
        supplierlandline: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Supplier landline number should be a number"
            }
        },
        condition: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Condition should be string"
            }
        },
        ageoflaptop: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Age of laptop should be string"
            }
        },
        usagehours: {
            type: ['number', 'null'],
            minimum: 1,
            maximum: 999,
            errorMessage: {
                type: "Usage Hours should be number",
                minimum: "Usage Hours must be between 1 to 3 characters",
                maximum: "Usage Hours must be between 1 to 3 characters"
            }
        },
        servicehistory: {
            type: ['string', 'null'],
            maxLength: 8000,
            errorMessage: {
                type: "Service History should be string",
                maxLength: "Service History length must not exceed 8000 characters"
            }
        },
        laptopconditiondescription: {
            type: ['string', 'null'],
            maxLength: 8000,
            errorMessage: {
                type: "Laptop Condition Description should be string",
                maxLength: "Laptop Condition Description must not exceed 8000 characters"
            }
        },
        accessoriesincluded: {
            type: ['array', 'null'],
            errorMessage: {
                type: "Accessories Included should be array"
            }
        },
        originalbox: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Original Box should be boolean"
            }
        },
        previoususage: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Previous Usage should be string"
            }
        },
        alterations: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Alteration should be a string"
            }
        },
        warrantyvalid: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Warranty Valid should be boolean"
            }
        },
        accessories: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Accessories should be string"
            }
        },
        imeinumber: {
            type: ['number', 'null'],
            minimum: 100000000000000,
            maximum: 999999999999999,
            errorMessage: {
                type: "IMEI Number should be number",
                minimum: "IMEI Number Length must be 15 characters",
                maximum: "IMEI Number Length must be 15 characters"
            }
        },
        batteryhealth: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Battery  Health should be string ",
                minLength: "Battery Health Length must be atleast 2 characters",
                maxLength: "Battery Health Length must not exceed 500 characters"
            }
        },
        screencondition: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Screen Condition should be string"
            }
        },
        bodycondition: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Body Condition should be string"
            }
        },
        cameracondition: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Camera Condition should be string"
            }
        },
        additionalnotes: {
            type: ['string', 'null'],
            maxLength: 8000,
            errorMessage: {
                type: "Additional Notes should be string",
                maxLength: "Additional Notes can't exceed 8000 characters"
            }
        },

        frontcameraspecifications: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Frontcamera Specifications should be string",
                minLength: "Frontcamera Specifications Length must be atleast 2 characters",
                maxLength: "Frontcamera Specifications Length must not exceed 500 characters"
            }
        },
        backcameraspecifications: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Backcamera Specifications should be string",
                minLength: "Backcamera Specifications Length must be atleast 2 characters",
                maxLength: "Backcamera Specifications Length must not exceed 500 characters"
            }
        },
        chargingtype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Charging Type should be string"
            }
        },
        batterytype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Battery Type should be string"
            }
        },
        batterycapacity: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Battery Capacity should be string",
                minLength: "Battery Capacity must contain 2 characters",
                maxLength: "Battery Capacity must not exceed 500 characters"
            }
        },
        isarchive: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "IsArchive should be boolean"
            }
        },
        refurbishmentstatus: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Refurbishment Status should be string"
            }
        },
        refurbishmentdate: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Refurbishment Date should be number"
            }
        },
        warranty: {
            type: ["string", "null"],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Warranty should be string",
                minLength: "Warranty must contain atleast 2 characters",
                maxLength: "Warraty can have maximum 500 characters"
            }
        },
        refurbisherinformation: {
            type: ["string", "null"],
            errorMessage: {
                type: "Refurbisher Information should be string"
            }
        },
        certifications: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Certifications should be string"
            }
        },
        refurbishmentprocessdetails: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Refurbishment process details should be string"
            }
        },
        additionalrefurbishmentnotes: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Additional refurbishment notes should be string"
            }
        },
        refurbishedwarrantyterms: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Refurbished warranty terms should be string"
            }
        },
        material: {

            type: ["string", 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Material should be string",
                minLength: "Material Length must be 2 characters",
                maxLength: "Material Length must be not exceed 500 characters"
            }
        },
        cablelength: {
            type: ["string", 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Cable Length should be string",
                minLength: "Cable Length Length must be 2 characters",
                maxLength: "Cable Length Length must not exceed 500 characters"
            }
        },
        outputpowerwattage: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Output Power Wattage should be string"
            },
        },
        plugtype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Plug Type should be string"
            },
        },
        inputvoltage: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Input Voltage should be string",
                minLength: "Input Voltage Length must be 2 characters",
                maxLength: "Input Voltage Length must not exceed 500 characters"
            }
        },
        inputcurrent: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Input Current should be string",
                minLength: "Input Current Length must be 2 characters",
                maxLength: "Input Current Length must atleat 500 characters"
            }
        },
        outputvoltage: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Output Voltage should be string",
                minLength: "Output Voltage Length must be 2 characters",
                maxLength: "Output Voltage Length must not exceed 500 characters"
            }
        },
        outputcurrent: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Output Current should be string",
                minLength: "Output Current Length must be 2 characters",
                maxLength: "Output Current Length must not exceed 500 characters"
            }
        },
        poweroutput: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Power Output should be string",
                minLength: "Power Output Length must be 2 characters",
                maxLength: "Power Output Length must not exceed 500 characters"
            }
        },
        physicalcondition: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Physical Condition should be string",
                minLength: "Physical Condition must be 2 characters",
                maxLength: "Physical Condition field should not exceed 500 characters"
            }
        },
        workingcondition: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Working Condition should be string",
                minLength: "Working Condition must be 2 characters",
                maxLength: "Working Condition should not exceed 500 characters"
            }
        },
        missingparts: {
            type: ["string", 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Missing Parts should be string",
                minLength: "Missing Parts must be 2 characters",
                maxLength: "Missing Parts should not exceed 500 characters"
            }
        },
        ageoflaptopyear: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Age of Laptop Year should be a string value"
            }
        },
        ageoflaptopmonth: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Age of Laptop Month should be a string value"
            }
        },
        ageoftheproduct: {
            type: ['number', 'null'],
            minimum: 1,
            maximum: 999,
            errorMessage: {
                type: "Age of the Product should be number",
                minimum: "Age of the Product length must be between 1 to 3 characters",
                maximum: "Age of the Product length must be between 1 to 3 characters"
            }
        },
        refurbishedpart: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Refurbished Part  should be string",
                minLength: "Refurbished Part length must be 2 characters",
                maxLength: "Refurbished Part length must not exceed 500 characters"
            }
        },
        refurbisheddate: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Refurbished Date should be number"
            }
        },
        warrantyenddate: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Warranty End Date should be number"
            }
        },
        isdeleted: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "IsDeleted should be boolean"
            }
        },
        laptopaccessories: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Laptop accessories should be string"
            }
        },
        mobileaccessories: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Mobile accessories should be string"
            }
        },
        connectivitytype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Connectivity Type should be a string"
            }
        },
        dpi: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "DPI should be boolean"
            }
        },
        sensortype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Sensor Type should be a string"
            }
        },
        pollingrate: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Polling Rate should be a string'
            }
        },
        numberofbuttons: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Number of Buttons should be a string'
            }
        },
        keylayout: {
            type: ['string', 'null'],
            errorMessage: {
                type: 'Key Layout is should be string.'
            }
        },
        backlight: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Back Light should be String"
            }
        },
        accessoriesfor: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Accessoriesfor should be String"
            }
        },
        interface: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Interface  should be a string."
            }
        },
        datatransferspeed: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Data Transfer Speed must be a string"
            }
        },
        formfactor: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Form factor Speed must be a string"
            }
        },
        systemrequirements: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Form factor Speed must be a string"
            }
        },
        numberofports: {
            type: ['number', 'null'],
            minimum: 1,
            maximum: 999,
            errorMessage: {
                type: "Number of Ports should be Number.",
                minimum: "Number of Ports should be greater than or equal to 1",
                maximum: "Number of Ports should be less than 1000"
            }
        },
        accessoriestype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Accessories type must be a string"
            }
        },
        portsandconnectivity: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Ports and Connectivity should be a String."
            }
        },
        coolingpadmaterial: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Ports and Connectivity should be a String."
            }
        },
        fanspeed: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Fan Speed should be a String.",
                minLength: "The Fan Speed field should have at least 2 characters.",
                maxLength: "The Fan Speed field should not exceed 500 characters."
            }
        },
        numberoffans: {
            type: ["number", "null"],
            minimum: 1,
            maximum: 999,
            errorMessage: {
                type: "Number of Fans should be a Number.",
                minimum: "Number of Fans should be greater than or equal to 1.",
                maximum: "Number of Fans should be less than or equal to 999"
            }
        },
        noiselevel: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Noise Level should be a String.",
                minLength: "The Noise Level field should contain atleast 2 character.",
                maxLength: "The Noise Level field should not exceed 500 characters."
            }
        },
        powersource: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Power Source should be a String."
            }
        },
        paneltype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Panel Type should be a string"
            }
        },
        refreshrate: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Refresh Rate should be a string"
            }
        },
        responsetime: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Response Time must be a string",
                minLength: "Response Time must contain at least 2 characters",
                maxLength: "Response Time must not exceed 500 characters"
            }
        },
        aspectratio: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Aspect Ratio must be a string",
            }
        },
        contrastratio: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Contrast Ratio must be a string",
            }
        },
        touchscreensupport: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Touchscreen Support must be a boolean value"
            }
        },
        frequency: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Frequency must be one of the provided options"
            }
        },
        noisecancellation: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Noise Cancellation must be one of the provided options"
            }
        },
        headsettype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Headset Type must be one of the provided options"
            }
        },
        deepbass: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Deep Bass must be a boolean value"
            }
        },
        headphonedriversize: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Headphone Driver Size must be one of the provided options"
            }
        },
        inlineremote: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Inline Remote must be a boolean value"
            }
        },
        connectortype: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Connector Type must be one of the provided options"
            }
        },
        voltageandcurrentrating: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Voltage and Current Rating must be alphanumeric",
            }
        },
        compatiblelaptopsize: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Compatible Laptop Size must be alphanumeric",
            }
        },
        bagcapacity: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Bag Capacity must be alphanumeric",
            }
        },
        accessoriesbrand: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Protective case Brand must be a string",
                minLength: "Protective case Brand should contain at least 2 characters",
                maxLength: "Protective case Brand should not exceed 500 characters"
            }
        },
        thickness: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Thickness must be a string",
                minLength: "Thickness should contain at least 2 characters",
                maxLength: "Thickness should not exceed 500 characters"
            }
        },
        packagecontents: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Package contents must be a string",
                minLength: "Package contents should contain at least 2 characters",
                maxLength: "Package contents should not exceed 500 characters"
            }
        },
        designedfor: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Designed for must be a string",
                minLength: "Designed for should contain at least 2 characters",
                maxLength: "Designed for should not exceed 500 characters"
            }
        },
        lightindicator: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Light indicator must be a string"
            }
        },
        includeschargingcable: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Includes charging cable must be either 'Yes' or 'No'",
            }
        },
        powerinput: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Power Input must be a string",
                minLength: "Power Input should contain at least 2 characters",
                maxLength: "Power Input should not exceed 500 characters"
            }
        },

        powersupply: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Power Supply must be a string",
                minLength: "Power Supply should contain at least 2 characters",
                maxLength: "Power Supply should not exceed 500 characters"
            }
        },

        foldable: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Foldable must be string",
            }
        },
        compatibility: {
            type: ['string', 'null'],
            minLength: 1,
            maxLength: 8000,
            errorMessage: {
                type: "Compatibility must be a string",
                minLength: "Compatibility should contain at least 1 character",
                maxLength: "Compatibility should not exceed 8000 characters"
            }
        },
        accessoriesmaterial: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Accessories material must be string",
            }
        },
        sticklength: {
            type: ['string', 'null'],
            minLength: 2,
            maxLength: 500,
            errorMessage: {
                type: "Stick Length must be a string",
                minLength: "Stick Length should contain at least 2 characters",
                maxLength: "Stick Length should not exceed 500 characters"
            }
        },
        connector1: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Connector1 must be string",
            }
        },
        connector2: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Connector2 must be string",
            }
        },
        connector3: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Connector3 must be string",
            }
        },
        connector4: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Connector4 must be string",
            }
        },
        adapterporttype: {
            type: ['array', 'null'],
            errorMessage: {
                type: "Adapter port type must be an array"
            }
        },
        supports: {
            type: ['array', 'null'],
            errorMessage: {
                type: "Supports should be a array"
            }
        },
        supplierid: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Supplier Id should be a number"
            }
        },
        puc: {
            type: ['string', 'null'],
            errorMessage: {
                type: "PUC should be a string"
            }
        },
        quantity: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Quantity should be a number"
            }
        },
        ecompublishedquantity: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Ecompublished quantity should be a number"
            }
        },
        soldquantity: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Sold quantity should be a number"
            }
        },
        availablequantity: {
            type: ['number', 'null'],
            errorMessage: {
                type: "Available quantity should be a number"
            }
        },
        removefromrecyclebin: {
            type: ['boolean', 'null'],
            errorMessage: {
                type: "Removefrom recyclebin should be a boolean"
            }
        },
        productstatus: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Product status should be a string"
            }
        },
        ponumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: "PO number should be a string"
            }
        },
        serialnumber: {
            type: ['string', 'null'],
            errorMessage: {
                type: "Serial number should be a string"
            }
        }
    },
    required: [
        // "productname","brand","model",
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
