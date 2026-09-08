import { stockRevoService } from "../services/stockRevo.service.js";
export var stockRevoController;
(function (stockRevoController) {
    // Admin route — ecomvisible is query-param driven (?ecomvisible=true or ?ecomvisible=false)
    stockRevoController.getStockRevoData = async (request, reply) => {
        try {
            let result = await stockRevoService.getStockRevoData(request);
            reply.send(result);
        }
        catch (error) {
            console.error("Error in getStockRevoData", error);
            reply.send(error.message);
        }
    };
    stockRevoController.searchStockRevoData = async (request, reply) => {
        try {
            const searchValue = String(request.query?.search ?? "").trim();
            if (!searchValue) {
                return reply.status(400).send({
                    message: "The search query parameter is required.",
                });
            }
            const result = await stockRevoService.searchStockRevoData(request);
            return reply.status(200).send(result);
        }
        catch (error) {
            console.error("Error in searchStockRevoData", error);
            return reply.status(500).send({
                message: "Unable to search stock records.",
            });
        }
    };
    stockRevoController.getEachStockRevoData = async (request, reply) => {
        try {
            let result = await stockRevoService.getEachStockRevoData(request);
            reply.send(result);
        }
        catch (error) {
            console.error("Error in getEachStockRevoData", error);
            reply.send(error.message);
        }
    };
    stockRevoController.getNextStockBarcodeNumber = async (request, reply) => {
        try {
            const result = await stockRevoService.generateUniqueBarcodeNumber();
            if (typeof result === "string") {
                reply.status(200).send({ barcode: result });
            }
            else if (result?.status) {
                reply.status(result.status).send({ message: result.message });
            }
            else {
                reply.status(500).send({ message: "Unable to generate Barcode Number." });
            }
        }
        catch (error) {
            console.error("Error in getNextStockBarcodeNumber", error);
            reply.send(error.message);
        }
    };
    stockRevoController.releaseServiceHoldStockToAvailable = async (request, reply) => {
        try {
            const { id } = request.params;
            const stockId = Number(id);
            const result = await stockRevoService.releaseServiceHoldStockToAvailable(stockId, request.session?.id ?? null);
            if (result?.command === "UPDATE") {
                const pucArray = result.affectedPucs || Array.from(new Set(result.result.rows.map((row) => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                reply.status(200).send({
                    message: "Stock marked as repaired and moved to Available.",
                    stock: result.result.rows[0] ?? null,
                });
            }
            else if (result?.status) {
                reply.status(result.status).send({ message: result.message });
            }
            else {
                reply.status(404).send({ error: [result] });
            }
        }
        catch (error) {
            console.error("Error in releaseServiceHoldStockToAvailable", error);
            reply.send(error.message);
        }
    };
    stockRevoController.markLostStockAsFound = async (request, reply) => {
        try {
            const { id } = request.params;
            const stockId = Number(id);
            const result = await stockRevoService.markLostStockAsFound(stockId, request.session?.id ?? null);
            if (result?.command === "UPDATE") {
                const pucArray = result.affectedPucs || Array.from(new Set(result.result.rows.map((row) => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                reply.status(200).send({
                    message: "Lost stock marked as found and moved to Available.",
                    stock: result.result.rows[0] ?? null,
                });
            }
            else if (result?.status) {
                reply.status(result.status).send({ message: result.message });
            }
            else {
                reply.status(404).send({ error: [result] });
            }
        }
        catch (error) {
            console.error("Error in markLostStockAsFound", error);
            reply.send(error.message);
        }
    };
    stockRevoController.markDamagedStockAsRepaired = async (request, reply) => {
        try {
            const { id } = request.params;
            const stockId = Number(id);
            const result = await stockRevoService.markDamagedStockAsRepaired(stockId, request.session?.id ?? null);
            if (result?.command === "UPDATE") {
                const pucArray = result.affectedPucs || Array.from(new Set(result.result.rows.map((row) => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                reply.status(200).send({
                    message: "Damaged stock marked as repaired and moved to Available.",
                    stock: result.result.rows[0] ?? null,
                });
            }
            else if (result?.status) {
                reply.status(result.status).send({ message: result.message });
            }
            else {
                reply.status(404).send({ error: [result] });
            }
        }
        catch (error) {
            console.error("Error in markDamagedStockAsRepaired", error);
            reply.send(error.message);
        }
    };
    stockRevoController.getEwasteStocksRevo = async (request, reply) => {
        try {
            let getProductsResult = await stockRevoService.getEwasteStocksrevo(request);
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error("Error in getEwasteStocksRevo", error);
            reply.send(`${error.message} error in get Products`);
        }
    };
    stockRevoController.updateEwaste = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteStockResult = await stockRevoService.updateEwaste(id);
            reply.send(deleteStockResult);
        }
        catch (error) {
            console.error("Error in updateEwaste", error);
            reply.send(error.message);
        }
    };
    stockRevoController.getDeletedStocksRevo = async (request, reply) => {
        try {
            let getProductsResult = await stockRevoService.getDeletedStocksrevo(request);
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error("Error in getDeletedStocksRevo", error);
            reply.send(`${error.message} error in get Products`);
        }
    };
    stockRevoController.updateRemovedFromRecyclebinRevo = async (request, reply) => {
        try {
            let resultremoverecyclebin = await stockRevoService.updateRemoveFromRecyclebin();
            reply.send(resultremoverecyclebin);
        }
        catch (error) {
            console.error("Error in updateRemovedFromRecyclebinRevo", error);
            reply.send(`Error in updating recyclebin : ${error.message}`);
        }
    };
    stockRevoController.upsertStockRevoData = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertStockRevoData(request.body);
            console.log("request body", request.body);
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const pucArray = upsertStockResult.affectedPucs || Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                const responseMessage = upsertStockResult.command === "UPDATE"
                    ? `Stock Updated successfully`
                    : `Stock Inserted successfully`;
                const message = {
                    product: responseMessage,
                    message: responseMessage,
                    stock: upsertStockResult.result.rows?.[0] || null,
                    command: upsertStockResult.command,
                    totalCount: upsertStockResult.totalCount,
                };
                reply.status(200).send(message);
            }
            else if (upsertStockResult?.status) {
                reply.status(upsertStockResult.status).send({
                    message: upsertStockResult.message,
                    errorDetails: upsertStockResult.errorDetails,
                });
            }
            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        }
        catch (error) {
            console.error("Error in upsertStockRevoData", error);
            reply.send(error.message);
        }
    };
    stockRevoController.assetlocationstock = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertStockRevoData(request.body);
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const pucArray = upsertStockResult.affectedPucs || Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                let message = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                };
                reply.status(200).send(message);
            }
            else if (upsertStockResult?.status) {
                reply.status(upsertStockResult.status).send({
                    message: upsertStockResult.message,
                    errorDetails: upsertStockResult.errorDetails,
                });
            }
            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        }
        catch (error) {
            console.error("Error in assetlocationstock", error);
            reply.send(error.message);
        }
    };
    stockRevoController.upsertStockRevoDatadelete = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertStockRevoDatadelete(request.body);
            if (upsertStockResult?.command === "UPDATE" || upsertStockResult?.command === "INSERT") {
                const pucArray = upsertStockResult.affectedPucs || Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                let message = {
                    Stock: upsertStockResult.command === "UPDATE" && upsertStockResult.result.rows[0]?.isdeleted === true
                        ? `Stock Deleted successfully`
                        : `Stock Restored succcessfully`,
                };
                reply.status(200).send(message);
            }
            else if (upsertStockResult.status === 400) {
                reply.status(404).send({ error: [upsertStockResult.message] });
            }
            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        }
        catch (error) {
            console.error("Error in upsertStockRevoDatadelete", error);
            reply.send(error.message);
        }
    };
    stockRevoController.upsertStockRevoDataarchive = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertStockRevoDataarchive(request.body);
            if (upsertStockResult?.command === "UPDATE" || upsertStockResult?.command === "INSERT") {
                const pucArray = upsertStockResult.affectedPucs || Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                let message = {
                    Stock: upsertStockResult.command === "UPDATE" && upsertStockResult.result.rows[0]?.isarchive === true
                        ? `Stock successfully archived`
                        : `Stock  successfully unarchived`,
                };
                reply.status(200).send(message);
            }
            else if (upsertStockResult.status === 400) {
                reply.status(404).send({ error: [upsertStockResult.message] });
            }
            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        }
        catch (error) {
            console.error("Error in upsertStockRevoDataarchive", error);
            reply.send(error.message);
        }
    };
    stockRevoController.getArcheivedStocksRevo = async (request, reply) => {
        try {
            let getProductsResult = await stockRevoService.getArcheivedStocksrevo(request);
            reply.send(getProductsResult);
        }
        catch (error) {
            console.error("Error in getArcheivedStocksRevo", error);
            reply.send(`${error.message} error in get Products`);
        }
    };
})(stockRevoController || (stockRevoController = {}));
//# sourceMappingURL=stockrevo.controller.js.map