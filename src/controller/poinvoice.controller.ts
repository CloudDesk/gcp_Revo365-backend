import { poinvoiceservice } from "../services/poinvoice.service.js"

export module poinvoicecontroller {
    export const getPOInvoice = async (request: any, reply: any) => {
        try {
            let PoinvoiceResult = await poinvoiceservice.getPoInvoiceData(request);
            reply.send(PoinvoiceResult)
        } catch (error) {
            reply.status(404).send(error.message)
        }
    }

    export const upsertPoInvoice = async (request: any, reply: any) => {
        try {

            let host = request.headers.host
            let upsertPoInviceResult = await poinvoiceservice.upsertPoInvoice(request.body, request.files, host)
            if (upsertPoInviceResult.command === "UPDATE" || upsertPoInviceResult.command === "INSERT") {
                let message: any = {}
                message = {
                    message: upsertPoInviceResult.command === "UPDATE"
                        ? `Invoice For PO Updated  successfully`
                        : `Invoice For Po Created  successfully`
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(500).send(upsertPoInviceResult)
            }

        } catch (error) {
            reply.status(404).send(error.message)

        }
    }
}