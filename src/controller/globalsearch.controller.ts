import { request } from "http";
import { globalserachService } from "../services/globalsearch.service.js";
import { ErrorHandler } from "../errorHandler/errorHandler.js";

export module globalSearchController {

    export const getALlData = async (request: any, reply: any) => {
        try {
            let result = await globalserachService.getGlobalData(request)
            reply.send(result)
        } catch (error) {
            console.error("Error: IN getALlData", error);
            let ErrorMessage =await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
    export const getAllProductData = async (request: any, reply: any) => {
        try {
            let result = await globalserachService.getGlobalProductData(request,reply)
            reply.send(result)
        } catch (error) {
            console.error("Error: IN getAllProductData", error);
            let ErrorMessage =await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

    export const getGlobalStockOrderTicketData = async (request: any, reply: any) => {
        try {
            let result = await globalserachService.getGlobalStockOrderTicketData(request,reply)
            reply.send(result)
        } catch (error) {
            console.error("Error: IN getGlobalStockOrderTicketData", error);
            let ErrorMessage =await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }

}