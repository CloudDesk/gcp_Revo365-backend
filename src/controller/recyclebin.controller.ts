import { recycleBinSerivce } from "../services/recyclebin.service.js"

export module recycleBinController {
    export const getRecycleBindata = async (request, reply) => {
        try {
            const { pageNumber, recordCount } = request.params
            let getRecycleBinData = await recycleBinSerivce.getRecycleBinData(pageNumber, recordCount,);
            reply.send(getRecycleBinData)

        } catch (error) {
            console.error("Error in 'getRecycleBindata':", error);
            reply.send(error)
        }
    }

    export const getRecycleBindataRevo = async (request, reply) => {
        try {
            const { pageNumber, recordCount } = request.params
            let getRecycleBinData = await recycleBinSerivce.getRecycleBinDataRevo(pageNumber, recordCount,);
            reply.send(getRecycleBinData)

        } catch (error) {
            console.error("Error in 'getRecycleBindataRevo':", error);
            reply.send(error)
        }
    }
}