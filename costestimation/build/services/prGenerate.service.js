import { ErrorHandler } from "../errorHandler/errorHandler.js";
import GenerateDocx from "../utils/DocXGenerator/GenerateDocx.js";
import { purchaseRequestService } from "./purchaseRequest.Service.js";
export var generatePrdataservice;
(function (generatePrdataservice) {
    generatePrdataservice.generatePrdata = async (request, prdata, reply) => {
        console.log(JSON.stringify(prdata), 'prdata');
        try {
            let template = 'pr/Revo-PR.docx';
            console.log(JSON.stringify(prdata), 'prdata2');
            let result = await GenerateDocx(request, prdata, template);
            let prurl = result.fileurl;
            delete result.fileurl;
            result.prurl = prurl;
            let insertFilePr = await purchaseRequestService.upsertPurchaseRequestData(result);
            if (insertFilePr.command === "UPDATE" || insertFilePr.command === "INSERT") {
                return result.prurl;
            }
            else {
                reply.status(404).send("File not inserted.So Please Contact Admin");
            }
        }
        catch (error) {
            console.error("Query Execution Error: IN generatepurchaseOrderData", error);
            let ErrorMessage = await ErrorHandler.handleQueryError(error);
            console.log(ErrorMessage);
            return ErrorMessage;
        }
    };
})(generatePrdataservice || (generatePrdataservice = {}));
//# sourceMappingURL=prGenerate.service.js.map