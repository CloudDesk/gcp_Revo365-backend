import { stockRevoService } from "../services/stockRevo.service.js";
export var stockRevoController;
(function (stockRevoController) {
    stockRevoController.getStockRevoData = async (request, reply) => {
        try {
            let result = await stockRevoService.getStockRevoData(request);
            reply.send(result);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    stockRevoController.getEachStockRevoData = async (request, reply) => {
        try {
            let result = await stockRevoService.getEachStockRevoData(request);
            reply.send(result);
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    stockRevoController.updateRemovedFromRecyclebinRevo = async (request, reply) => {
        try {
            let resultremoverecyclebin = await stockRevoService.updateRemoveFromRecyclebin();
            reply.send(resultremoverecyclebin);
        }
        catch (error) {
            reply.send(`Error in updating recyclebin : ${error.message}`);
        }
    };
    stockRevoController.upsertStockRevoData = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertStockRevoData(request.body);
            console.log(JSON.stringify(upsertStockResult));
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                // console.log('-- Request', puc, '-- Request');
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                //let updateQuantity = await stockRevoService.testinupdateQuantity(pucArray);
                console.log('-- Update Quantity Result', updateQuantity, '-- Update Quantity Result');
                let message = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    stockRevoController.assetlocationstock = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertStockRevoData(request.body);
            console.log(JSON.stringify(upsertStockResult));
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                // console.log('-- Request', puc, '-- Request');
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                console.log('-- Update Quantity Result', updateQuantity, '-- Update Quantity Result');
                let message = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
                };
                reply.status(200).send(message);
            }
            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        }
        catch (error) {
            reply.send(error.message);
        }
    };
    stockRevoController.upsertStockRevoDatadelete = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertStockRevoDatadelete(request.body);
            console.log(JSON.stringify(upsertStockResult));
            if (upsertStockResult?.command === "UPDATE" || upsertStockResult?.command === "INSERT") {
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                console.log(upsertStockResult.result.rows[0], 'Data in stock Deletion');
                // console.log('-- Request', puc, '-- Request');
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                //  let updateQuantity = await stockRevoService.testinupdateQuantity(pucArray);
                console.log('-- Update Quantity Result', updateQuantity, '-- Update Quantity Result');
                let message = {
                    Stock: upsertStockResult.command === "UPDATE" && upsertStockResult.result.rows[0]?.isdeleted === true
                        ? `Stock Deleted successfully`
                        : `Stock Restored succcessfully`,
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
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
            reply.send(error.message);
        }
    };
    stockRevoController.upsertStockRevoDataarchive = async (request, reply) => {
        try {
            let upsertStockResult = await stockRevoService.upsertStockRevoDataarchive(request.body);
            console.log(JSON.stringify(upsertStockResult));
            if (upsertStockResult?.command === "UPDATE" || upsertStockResult?.command === "INSERT") {
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                console.log(upsertStockResult.result.rows[0], 'Data in stock Archive');
                // console.log('-- Request', puc, '-- Request');
                const pucArray = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                // let updateQuantity = await stockRevoService.testinupdateQuantity(pucArray);
                console.log('-- Update Quantity Result', updateQuantity, '-- Update Quantity Result');
                let message = {
                    Stock: upsertStockResult.command === "UPDATE" && upsertStockResult.result.rows[0]?.isarchive === true
                        ? `Stock successfully archived`
                        : `Stock  successfully unarchived`,
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
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
            reply.send(error.message);
        }
    };
    stockRevoController.getArcheivedStocksRevo = async (request, reply) => {
        try {
            let getProductsResult = await stockRevoService.getArcheivedStocksrevo(request);
            reply.send(getProductsResult);
        }
        catch (error) {
            reply.send(`${error.message} error in get Products`);
        }
    };
    // export const testgetArcheivedStocksRevo = async (request: any, reply: any) => {
    //     try {
    //         // let puc = ['la-nw-0000000100']
    //         let puc = ['mp-nw-0000000094']
    //         let getProductsResult = await stockRevoService.testinupdateQuantity(puc)
    //         reply.send(getProductsResult)
    //     } catch (error) {
    //         reply.send(`${error.message} error in get Products`)
    //     }
    // }
})(stockRevoController || (stockRevoController = {}));
//# sourceMappingURL=stockrevo.controller.js.map