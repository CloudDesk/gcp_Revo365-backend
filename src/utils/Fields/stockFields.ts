import { query } from "../../database/postgres.js"

export const stockBoolean = ["isdeleted",
    "isarchive",
    "removefromrecyclebin",
    "ecompublish"]

export const stockInteger = [

    "createddate",
    "modifieddate",
    "createdby",
    "modifiedby",
    "manufacturedyear",
    "releaseyear"
]

export const stockText = [
    "puc",
    "category",
    "subcategory",
    "brand",
    "model",
    "operatingsystem",
    "operatingsystemversion",
    "ram",
    "storagetype",
    "storagecapacity",
    "colour",
    "graphicscard",
    "processor",
    "serialnumber",
    "stockstatus",
    "stocktype",
    "productname",
    "rfid",
    "hsncode",
    "saccode"
]


export const stockArray = [
   
]

export const stocklocationArray = [
    "location"
]





