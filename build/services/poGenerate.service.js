import { ErrorHandler } from "../errorHandler/errorHandler.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js";
import { purchaseOrderService } from "./purchaseorder.service.js";
export var generatePurchaseOrderService;
(function (generatePurchaseOrderService) {
    generatePurchaseOrderService.generatepurchaseOrderData = async (request, podata, reply) => {
        try {
            let template = "po/Revo-PO new 1.docx";
            let result = await GenerateDocx(request, podata, template);
            let insertFilePo = await purchaseOrderService.upsertPurchaseOrder(result);
            if (insertFilePo.command === "UPDATE" ||
                insertFilePo.command === "INSERT") {
                reply.send(result.fileurl);
            }
            else {
                reply.status(404).send("File not inserted.So Please Contact Admin");
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN generatepurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            return ErrorMessage;
        }
    };
})(generatePurchaseOrderService || (generatePurchaseOrderService = {}));
//# sourceMappingURL=poGenerate.service.js.map