import { ErrorHandler } from "../errorHandler/errorHandler.js";
export var billdatacontroller;
(function (billdatacontroller) {
    billdatacontroller.getBillData = async (request) => {
        try {
            let orderid = request.params.orderid;
            let queryText = `SELECT * FROM stock_revo s  
                            JOIN 
                            orders o ON s.orderid = p.id  WHERE orderid = $1`;
        }
        catch (error) {
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(billdatacontroller || (billdatacontroller = {}));
//# sourceMappingURL=billdata.service.js.map