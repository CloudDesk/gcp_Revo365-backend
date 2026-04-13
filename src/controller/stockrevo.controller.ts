import { stockRevoService } from "../services/stockRevo.service.js";

export module stockRevoController {
    // Admin route — ecomvisible is query-param driven (?ecomvisible=true or ?ecomvisible=false)
    export const getStockRevoData = async (request: any, reply: any) => {
        try {
            let result = await stockRevoService.getStockRevoData(request);
            reply.send(result);
        } catch (error) {
            console.error("Error in getStockRevoData", error);
            reply.send(error.message);
        }
    };
    export const getEachStockRevoData = async (request: any, reply: any) => {
        try {
            let result = await stockRevoService.getEachStockRevoData(request);
            reply.send(result);
        } catch (error) {
            console.error("Error in getEachStockRevoData", error);
            reply.send(error.message);
        }
    };

    export const releaseServiceHoldStockToAvailable = async (request: any, reply: any) => {
        try {
            const { id } = request.params;
            const stockId = Number(id);
            const result: any = await stockRevoService.releaseServiceHoldStockToAvailable(
                stockId,
                request.session?.id ?? null
            );

            if (result?.command === "UPDATE") {
                const pucArray: string[] = result.affectedPucs || Array.from(new Set(result.result.rows.map((row: any) => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                reply.status(200).send({
                    message: "Stock marked as repaired and moved to Available.",
                    stock: result.result.rows[0] ?? null,
                });
            } else if (result?.status) {
                reply.status(result.status).send({ message: result.message });
            } else {
                reply.status(404).send({ error: [result] });
            }
        } catch (error) {
            console.error("Error in releaseServiceHoldStockToAvailable", error);
            reply.send(error.message);
        }
    };

    export const getEwasteStocksRevo = async (request: any, reply: any) => {
        try {
            let getProductsResult = await stockRevoService.getEwasteStocksrevo(request)
            reply.send(getProductsResult)

        } catch (error) {
            console.error("Error in getEwasteStocksRevo", error);
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const updateEwaste = async (request: any, reply: any) => {
        try {
            const { id } = request.params;
            let deleteStockResult = await stockRevoService.updateEwaste(id);
            reply.send(deleteStockResult);
        } catch (error) {
            console.error("Error in updateEwaste", error);
            reply.send(error.message);
        }
    };

    export const getDeletedStocksRevo = async (request: any, reply: any) => {
        try {
            let getProductsResult = await stockRevoService.getDeletedStocksrevo(request)
            reply.send(getProductsResult)

        } catch (error) {
            console.error("Error in getDeletedStocksRevo", error);
            reply.send(`${error.message} error in get Products`)
        }
    }
    export const updateRemovedFromRecyclebinRevo = async (request: any, reply: any) => {
        try {
            let resultremoverecyclebin = await stockRevoService.updateRemoveFromRecyclebin()
            reply.send(resultremoverecyclebin)
        } catch (error) {
            console.error("Error in updateRemovedFromRecyclebinRevo", error);
            reply.send(`Error in updating recyclebin : ${error.message}`)
        }
    }


    export const upsertStockRevoData = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await stockRevoService.upsertStockRevoData(request.body);
            console.log("request body", request.body)
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const pucArray: string[] = upsertStockResult.affectedPucs || Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                let message: any = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                };
                reply.status(200).send(message);
            } else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            console.error("Error in upsertStockRevoData", error);
            reply.send(error.message);
        }
    };

    export const assetlocationstock = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await stockRevoService.upsertStockRevoData(request.body);
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const pucArray: string[] = upsertStockResult.affectedPucs || Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                let message: any = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                };
                reply.status(200).send(message);
            } else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            console.error("Error in assetlocationstock", error);
            reply.send(error.message);
        }
    };


    export const upsertStockRevoDatadelete = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await stockRevoService.upsertStockRevoDatadelete(request.body);
            if (upsertStockResult?.command === "UPDATE" || upsertStockResult?.command === "INSERT") {
                const pucArray: string[] = upsertStockResult.affectedPucs || Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                let message: any = {
                    Stock: upsertStockResult.command === "UPDATE" && upsertStockResult.result.rows[0]?.isdeleted === true
                        ? `Stock Deleted successfully`
                        : `Stock Restored succcessfully`,
                };
                reply.status(200).send(message);
            } else if (upsertStockResult.status === 400) {
                reply.status(404).send({ error: [upsertStockResult.message] });
            }
            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            console.error("Error in upsertStockRevoDatadelete", error);
            reply.send(error.message);
        }
    };
    export const upsertStockRevoDataarchive = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await stockRevoService.upsertStockRevoDataarchive(request.body);
            if (upsertStockResult?.command === "UPDATE" || upsertStockResult?.command === "INSERT") {
                const pucArray: string[] = upsertStockResult.affectedPucs || Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                await stockRevoService.updateQuantity(pucArray);
                let message: any = {
                    Stock: upsertStockResult.command === "UPDATE" && upsertStockResult.result.rows[0]?.isarchive === true
                        ? `Stock successfully archived`
                        : `Stock  successfully unarchived`,
                };
                reply.status(200).send(message);
            } else if (upsertStockResult.status === 400) {
                reply.status(404).send({ error: [upsertStockResult.message] });
            }

            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            console.error("Error in upsertStockRevoDataarchive", error);
            reply.send(error.message);
        }
    };
    export const getArcheivedStocksRevo = async (request: any, reply: any) => {
        try {
            let getProductsResult = await stockRevoService.getArcheivedStocksrevo(request)
            reply.send(getProductsResult)

        } catch (error) {
            console.error("Error in getArcheivedStocksRevo", error);
            reply.send(`${error.message} error in get Products`)
        }
    }
}

