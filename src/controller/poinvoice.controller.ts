import { poinvoiceservice } from "../services/poinvoice.service.js"

export module poinvoicecontroller {
    export const getPOInvoice = async (request: any, reply: any) => {
        try {
            let PoinvoiceResult = await poinvoiceservice.getPoInvoiceData(request);
            reply.send(PoinvoiceResult)
        } catch (error) {
            console.error('ERROR IN  Controller getPOInvoice', error);
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
            console.error('ERROR IN  Controller upsertPoInvoice', error);
            reply.status(404).send(error.message)

        }
    }

    export const deletePoInvoice = async (request: any, reply: any) => {
        try {
            const { id } = request.params
            let deleteStockResult = await poinvoiceservice.deletePoInvoice(id);
            reply.send(deleteStockResult);
        } catch (error) {
            console.error('ERROR IN  Controller deletePoInvoice', error);
            reply.send(error.message);
        }
    };

    export const upsertGcpPoInvoice = async (request: any, reply: any) => {
        try {

            let host = request.headers.host
            let upsertPoInviceResult = await poinvoiceservice.upsertGcpPoInvoice(request.body)
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
            console.error('ERROR IN  Controller upsertGcpPoInvoice', error);
            reply.status(404).send(error.message)

        }
    }
}