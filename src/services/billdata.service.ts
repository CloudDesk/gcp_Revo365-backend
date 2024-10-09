import { ErrorHandler } from "../errorHandler/errorHandler.js";

export module billdatacontroller {
    export const getBillData = async (request: any, ) => {
        try {
            let orderid = request.params.orderid;
            let queryText = `SELECT * FROM stock_revo s  
                            JOIN 
                            orders o ON s.orderid = p.id  WHERE orderid = $1`;
            
        } catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    }
}