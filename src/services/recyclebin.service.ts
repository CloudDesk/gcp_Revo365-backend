import { query } from "../database/postgres.js"
import { ErrorHandler } from "../errorHandler/errorHandler.js";

export module recycleBinSerivce {

    export const getRecycleBinData = async (pageNumber: number, recordCount: number) => {
        try {
            const offset = (pageNumber - 1) * recordCount;
            let querystring = `select * from products where isdeleted = true and removefromrecyclebin = false ORDER BY modifieddate DESC OFFSET ${offset} LIMIT ${recordCount}`
            let result = await query(querystring, [])
            return result.rows
        } catch (error) {
            console.error("Query Execution Error: IN getRecycleBinData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }
    export const getRecycleBinDataRevo = async (pageNumber: number, recordCount: number) => {
        try {
            const offset = (pageNumber - 1) * recordCount;
            let querystring = `select * from stock_revo where isdeleted = true and removefromrecyclebin = false ORDER BY modifieddate DESC OFFSET ${offset} LIMIT ${recordCount}`
            let result = await query(querystring, [])
            return result.rows
        } catch (error) {
            console.error("Query Execution Error: IN getRecycleBinDataRevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }
}