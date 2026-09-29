import { stockService } from "../services/stock.service.js";
export var stockController;
(function (stockController) {
    stockController.getStockData = async (request, reply) => {
        try {
            let getstock = await stockService.getStock(request.body);
            reply.send(getstock);
        }
        catch (error) {
            console.error("Error in 'getStockData':", error);
            reply.send(error.message);
        }
    };
})(stockController || (stockController = {}));
//# sourceMappingURL=stock.controller.js.map