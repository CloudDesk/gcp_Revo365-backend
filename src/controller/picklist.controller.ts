import { picklistservice } from "../services/picklist.service.js"
import { FastifyRequest, FastifyReply } from "fastify";

export module picklistControler {

    export const getPicklistforobject = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            console.log('Get Product picklist')
            let getPicklistData = await picklistservice.getProductPicklist(request)
            reply.send(getPicklistData)
        } catch (error) {
            console.error('ERROR IN  Controller getPicklistforobject', error);
            reply.send(error.message)
        } 
    }

    export const getAllPicklist = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let getPicklistData = await picklistservice.getAllPicklist(request)
            reply.send(getPicklistData)
        } catch (error) {
            console.error('ERROR IN  Controller getAllPicklist', error);
            reply.send(error.message)
        } 
    }

}