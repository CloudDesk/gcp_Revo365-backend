import { stockService } from "../services/stock.service.js"

export module stockController {
    export const getStockData = async (request, reply) => {
        try {

            let getstock = await stockService.getStock(request.body)
            reply.send(getstock)
        } catch (error) {
            reply.send(error.message)
        }
    }
}