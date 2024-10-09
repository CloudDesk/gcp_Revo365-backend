import { ErrorHandler } from "../errorHandler/errorHandler.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js"
import { purchaseOrderService } from "./purchaseorder.service.js";
export module generatePurchaseOrderService {
    export const generatepurchaseOrderData = async (request: any, podata: any, reply: any) => {
        console.log(JSON.stringify(podata), 'podata');
        // console.log(podata[0].id,"request from invoiceService invoiceData")
        try {
            let template = "po/Revo-PO new 1.docx"
            let result = await GenerateDocx(request, podata,template)
            console.log(result, "result from invoiceData");
            let insertFilePo: any = await purchaseOrderService.upsertPurchaseOrder(result)
            if (insertFilePo.command === "UPDATE" || insertFilePo.command === "INSERT") {
                reply.send(result.fileurl)
            }
            else {
                reply.status(404).send("File not inserted.So Please Contact Admin")
            }
        } catch (error) {
            console.error("Query Execution Error: IN generatepurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error)
            console.log(ErrorMessage);
            return ErrorMessage
        }
    }
}