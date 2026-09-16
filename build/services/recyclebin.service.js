import { query } from "../database/postgres.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var recycleBinSerivce;
(function (recycleBinSerivce) {
    recycleBinSerivce.getRecycleBinData = async (pageNumber, recordCount) => {
        try {
            const offset = (pageNumber - 1) * recordCount;
            let querystring = `select * from products where isdeleted = true and removefromrecyclebin = false ORDER BY modifieddate DESC OFFSET ${offset} LIMIT ${recordCount}`;
            let result = await query(querystring, []);
            return result.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getRecycleBinData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
    recycleBinSerivce.getRecycleBinDataRevo = async (pageNumber, recordCount) => {
        try {
            const offset = (pageNumber - 1) * recordCount;
            let querystring = `select * from stock_revo where isdeleted = true and removefromrecyclebin = false ORDER BY modifieddate DESC OFFSET ${offset} LIMIT ${recordCount}`;
            let result = await query(querystring, []);
            return result.rows;
        }
        catch (error) {
            console.error("Query Execution Error: IN getRecycleBinDataRevo", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(recycleBinSerivce || (recycleBinSerivce = {}));
//# sourceMappingURL=recyclebin.service.js.map