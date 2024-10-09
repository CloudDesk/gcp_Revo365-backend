import { quoteService } from "../services/quote.service.js";
export var quoteController;
(function (quoteController) {
    quoteController.getQuotes = async (request, reply) => {
        try {
            let fetchQuoteData = await quoteService.getQuoteData(request);
            reply.send(fetchQuoteData);
        }
        catch (error) {
            reply.status(404).send(error.message);
        }
    };
    quoteController.upsertQuotes = async (request, reply) => {
        try {
            let upsertQuoteData = await quoteService.upsertQuotes(request.body);
            console.log(upsertQuoteData, "upsertQuoteData");
            if (upsertQuoteData.command === "UPDATE" || upsertQuoteData.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertQuoteData.command === "UPDATE"
                        ? `Quotes Updated successfully`
                        : `Quotes Inserted successfully`,
                    Data: upsertQuoteData.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                console.log("else upsertQuoteData Error");
                console.log(upsertQuoteData);
                reply.status(404).send({ error: [upsertQuoteData] });
            }
        }
        catch (error) {
            reply.status(404).send(error.message);
        }
    };
    quoteController.attachQuotefiles = async (request, reply) => {
        try {
            let upsertQuoteData = await quoteService.attachQuotefiles(request);
            if (upsertQuoteData.command === "UPDATE" || upsertQuoteData.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertQuoteData.command === "UPDATE"
                        ? `Quotes Updated successfully`
                        : `Quotes Inserted successfully`,
                    Data: upsertQuoteData.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                console.log("else upsertQuoteData Error");
                reply.status(404).send({ error: [upsertQuoteData] });
            }
        }
        catch (error) {
            reply.status(404).send(error.message);
        }
    };
})(quoteController || (quoteController = {}));
//# sourceMappingURL=quote.controller.js.map