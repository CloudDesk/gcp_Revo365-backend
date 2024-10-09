import { generatePrdataservice } from "../services/prGenerate.service.js"

export module generatePRController {
    export const generatepr = async (request, reply) => {
        try {

            let prresult = await generatePrdataservice.generatePrdata(request, request.body, reply)
            console.log(prresult, 'PR Result final')
            reply.send(prresult)

        } catch (error) {

        }
    }
}