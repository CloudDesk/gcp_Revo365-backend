import { poinvoiceservice } from "../services/poinvoice.service.js";
export var poinvoicecontroller;
(function (poinvoicecontroller) {
    poinvoicecontroller.getPOInvoice = async (request, reply) => {
        try {
            let PoinvoiceResult = await poinvoiceservice.getPoInvoiceData(request);
            reply.send(PoinvoiceResult);
        }
        catch (error) {
            reply.status(404).send(error.message);
        }
    };
    poinvoicecontroller.upsertPoInvoice = async (request, reply) => {
        try {
            let host = request.headers.host;
            let upsertPoInviceResult = await poinvoiceservice.upsertPoInvoice(request.body, request.files, host);
            if (upsertPoInviceResult.command === "UPDATE" || upsertPoInviceResult.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertPoInviceResult.command === "UPDATE"
                        ? `Invoice For PO Updated  successfully`
                        : `Invoice For Po Created  successfully`
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(500).send(upsertPoInviceResult);
            }
        }
        catch (error) {
            reply.status(404).send(error.message);
        }
    };
})(poinvoicecontroller || (poinvoicecontroller = {}));
//# sourceMappingURL=poinvoice.controller.js.map