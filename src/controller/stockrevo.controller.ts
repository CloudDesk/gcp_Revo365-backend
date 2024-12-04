import { stockRevoService } from "../services/stockRevo.service.js";

export module stockRevoController {
    export const getStockRevoData = async (request: any, reply: any) => {
        try {
            let result = await stockRevoService.getStockRevoData(request);
            reply.send(result);
        } catch (error) {
            reply.send(error.message);
        }
    };
    export const getEachStockRevoData = async (request: any, reply: any) => {
        try {
            let result = await stockRevoService.getEachStockRevoData(request);
            reply.send(result);
        } catch (error) {
            reply.send(error.message);
        }
    };

    export const getEwasteStocksRevo = async (request: any, reply: any) => {
        try {
            let getProductsResult = await stockRevoService.getEwasteStocksrevo(request)
            reply.send(getProductsResult)

        } catch (error) {
            reply.send(`${error.message} error in get Products`)
        }
    }

    export const updateEwaste = async (request: any, reply: any) => {
        try {
            const { id } = request.params; 
            let deleteStockResult = await stockRevoService.updateEwaste(id); // Pass the id directly as an integer
            reply.send(deleteStockResult); // Send the result back to the client
        } catch (error) {
            reply.send(error.message); // Handle and send errors if any
        }
    };

    export const getDeletedStocksRevo = async (request: any, reply: any) => {
        try {
            let getProductsResult = await stockRevoService.getDeletedStocksrevo(request)
            reply.send(getProductsResult)

        } catch (error) {
            reply.send(`${error.message} error in get Products`)
        }
    }
    export const updateRemovedFromRecyclebinRevo = async (request: any, reply: any) => {
        try {
            let resultremoverecyclebin = await stockRevoService.updateRemoveFromRecyclebin()
            reply.send(resultremoverecyclebin)
        } catch (error) {
            reply.send(`Error in updating recyclebin : ${error.message}`)
        }
    }


    export const upsertStockRevoData = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await stockRevoService.upsertStockRevoData(request.body);
            console.log(JSON.stringify(upsertStockResult));
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                // console.log('-- Request', puc, '-- Request');
                const pucArray: string[] = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                 let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                //let updateQuantity = await stockRevoService.testinupdateQuantity(pucArray);
                console.log('-- Update Quantity Result', updateQuantity, '-- Update Quantity Result');
                let message: any = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
                };
                reply.status(200).send(message);
            } else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            reply.send(error.message);
        }
    };

    export const assetlocationstock = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await stockRevoService.upsertStockRevoData(request.body);
            console.log(JSON.stringify(upsertStockResult));
            if (upsertStockResult.command === "UPDATE" || upsertStockResult.command === "INSERT") {
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                // console.log('-- Request', puc, '-- Request');
                const pucArray: string[] = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                let updateQuantity = await stockRevoService.updateQuantity(pucArray);
                console.log('-- Update Quantity Result', updateQuantity, '-- Update Quantity Result');
                let message: any = {
                    product: upsertStockResult.command === "UPDATE"
                        ? `Stock Updated successfully`
                        : `Stock Inserted successfully`,
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
                };
                reply.status(200).send(message);
            } else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            reply.send(error.message);
        }
    };

    export const upsertStockRevoDatadelete = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await stockRevoService.upsertStockRevoDatadelete(request.body);
            console.log(JSON.stringify(upsertStockResult));
            if (upsertStockResult?.command === "UPDATE" || upsertStockResult?.command === "INSERT") {
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                console.log(upsertStockResult.result.rows[0], 'Data in stock Deletion');
                // console.log('-- Request', puc, '-- Request');
                const pucArray: string[] = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                 let updateQuantity = await stockRevoService.updateQuantity(pucArray);
              //  let updateQuantity = await stockRevoService.testinupdateQuantity(pucArray);
                console.log('-- Update Quantity Result', updateQuantity, '-- Update Quantity Result');
                let message: any = {
                    Stock: upsertStockResult.command === "UPDATE" && upsertStockResult.result.rows[0]?.isdeleted === true
                        ? `Stock Deleted successfully`
                        : `Stock Restored succcessfully`,
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
                };
                reply.status(200).send(message);
            } else if (upsertStockResult.status === 400) {
                reply.status(404).send({ error: [upsertStockResult.message] });
            }
            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            reply.send(error.message);
        }
    };
    export const upsertStockRevoDataarchive = async (request: any, reply: any) => {
        try {
            let upsertStockResult: any = await stockRevoService.upsertStockRevoDataarchive(request.body);
            console.log(JSON.stringify(upsertStockResult));
            if (upsertStockResult?.command === "UPDATE" || upsertStockResult?.command === "INSERT") {
                const puc = upsertStockResult.result.puc; // Get the puc from the result
                console.log(upsertStockResult.result.rows[0], 'Data in stock Archive');
                // console.log('-- Request', puc, '-- Request');
                const pucArray: string[] = Array.from(new Set(upsertStockResult.result.rows.map(row => row.puc)));
                 let updateQuantity = await stockRevoService.updateQuantity(pucArray);
               // let updateQuantity = await stockRevoService.testinupdateQuantity(pucArray);
                console.log('-- Update Quantity Result', updateQuantity, '-- Update Quantity Result');
                let message: any = {
                    Stock: upsertStockResult.command === "UPDATE" && upsertStockResult.result.rows[0]?.isarchive === true
                        ? `Stock successfully archived`
                        : `Stock  successfully unarchived`,
                    // totalCount: upsertStockResult.totalCount, // Include the total count in the response
                    // updateQuantity
                };
                reply.status(200).send(message);
            } else if (upsertStockResult.status === 400) {
                reply.status(404).send({ error: [upsertStockResult.message] });
            }

            else {
                reply.status(404).send({ error: [upsertStockResult] });
            }
        } catch (error) {
            reply.send(error.message);
        }
    };
    export const deleteStockRevoData = async (request: any, reply: any) => {
        try {
            const { id } = request.params
            let deleteStockResult = await stockRevoService.deleteStockrevo(id);
            reply.send(deleteStockResult);
        } catch (error) {
            reply.send(error.message);
        }
    };
    export const getArcheivedStocksRevo = async (request: any, reply: any) => {
        try {
            let getProductsResult = await stockRevoService.getArcheivedStocksrevo(request)
            reply.send(getProductsResult)

        } catch (error) {
            reply.send(`${error.message} error in get Products`)
        }
    }
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
}

