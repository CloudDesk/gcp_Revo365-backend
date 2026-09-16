import { quoteService } from "../services/quote.service.js"

export module quoteController {
    export const getQuotes = async (request: any, reply: any) => {
        try {
            let fetchQuoteData = await quoteService.getQuoteData(request)
            reply.send(fetchQuoteData)
        } catch (error) {
            reply.status(404).send(error.message)
        }
    }

    export const upsertQuotes = async (request: any, reply: any) => {
        try {
            let upsertQuoteData = await quoteService.upsertQuotes(request.body)
            if (upsertQuoteData.command === "UPDATE" || upsertQuoteData.command === "INSERT") {
                let message: any = {}
                message = {
                    message: upsertQuoteData.command === "UPDATE"
                        ? `Quotes Updated successfully`
                        : `Quotes Inserted successfully`,
                    Data: upsertQuoteData.rows[0]
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertQuoteData] })
            }
        } catch (error) {
            console.error("Error in 'upsertQuotes':", error);
            reply.status(404).send(error.message)
        }
    }
    export const attachQuotefiles = async (request: any, reply: any) => {
        try {
            let upsertQuoteData = await quoteService.attachQuotefiles(request)
            if (upsertQuoteData.command === "UPDATE" || upsertQuoteData.command === "INSERT") {
                let message: any = {}
                message = {
                    message: upsertQuoteData.command === "UPDATE"
                        ? `Quotes Updated successfully`
                        : `Quotes Inserted successfully`,
                    Data: upsertQuoteData.rows[0]
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertQuoteData] })
            }
        } catch (error) {
            console.error("Error in 'attachQuotefiles':", error);
            reply.status(404).send(error.message)
        }
    }

    export const attachGcpQuotefiles = async (request: any, reply: any) => {
        try {
            let upsertQuoteData = await quoteService.attachGcpQuotefiles(request)
            if (upsertQuoteData.command === "UPDATE" || upsertQuoteData.command === "INSERT") {
                let message: any = {}
                message = {
                    message: upsertQuoteData.command === "UPDATE"
                        ? `Quotes Updated successfully`
                        : `Quotes Inserted successfully`,
                    Data: upsertQuoteData.rows[0]
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertQuoteData] })
            }
        } catch (error) {
            console.error("Error in 'attachGcpQuotefiles':", error);
            reply.status(404).send(error.message)
        }
    }

} 