import { ErrorHandler } from "../errorHandler/errorHandler.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js"
import { purchaseRequestService } from "./purchaseRequest.Service.js";
export module generatePrdataservice {
    export const generatePrdata = async (request: any, prdata: any, reply: any) => {
        try {
            let template = 'pr/Revo-PR.docx'
            let result = await GenerateDocx(request, prdata, template);
            let prurl = result.fileurl
            delete result.fileurl;
            result.prurl = prurl
            let insertFilePr: any = await purchaseRequestService.upsertPurchaseRequestData(result)
            if (insertFilePr.command === "UPDATE" || insertFilePr.command === "INSERT") {
                return result.prurl
            }
            else {
                reply.status(404).send("File not inserted.So Please Contact Admin")
            }
        } catch (error) {
            console.error("Query Execution Error: IN generatePrdata", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            return ErrorMessage
        }
    }
}