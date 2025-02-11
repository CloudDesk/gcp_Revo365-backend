import { stockRevoService } from "../services/stockRevo.service.js";
export var stockRevoController;
(function (stockRevoController) {
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
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const puc = upsertStockResult.result.puc;
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                let message = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                };
                reply.status(200).send(message);
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
                const puc = upsertStockResult.result.puc;
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                let message = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                };
                reply.status(200).send(message);
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
                const puc = upsertStockResult.result.puc;
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
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
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
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
    stockRevoController.deleteStockRevoData = async (request, reply) => {
        try {
            const { id } = request.params;
            let deleteStockResult = await stockRevoService.deleteStockrevo(id);
            reply.send(deleteStockResult);
        }
        catch (error) {
            console.error("Error in deleteStockRevoData", error);
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