import { fileservice } from "../services/file.service.js"
import { FastifyRequest, FastifyReply } from "fastify";

export module fileController {

    export const insertFile = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let insertFileResult = await fileservice.insertFile(request)
            return insertFileResult
        } catch (error) {
            console.error('ERROR IN  Controller insertFile', error);
            reply.send(error.message)
        }
    }
}