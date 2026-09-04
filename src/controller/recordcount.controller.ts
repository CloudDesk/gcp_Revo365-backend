import { FastifyRequest, FastifyReply } from "fastify";
import { recordCountService } from "../services/recordcount.service.js";

interface RecordCountRequestParams {
  objectName: string;
}

interface RecordCountResponse {
  count: number;
}

export module recordCount {
    export const getRecordCount = async (request: FastifyRequest<{ Params: RecordCountRequestParams }>, reply: FastifyReply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount: RecordCountResponse = await recordCountService.getRecordCount(objectName,request);
            reply.send(getRecordCount);
        } catch (error) {
            console.error("Error in getRecordCount", error);
            reply.send(error.message);
        }
    }
    export const getRecordCountRevo = async (request: FastifyRequest<{ Params: RecordCountRequestParams }>, reply: FastifyReply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount: RecordCountResponse = await recordCountService.getRecordCountRevo(objectName,request);
            reply.send(getRecordCount);
        } catch (error) {
            console.error("Error in getRecordCountRevo", error);
            reply.send(error.message);
        }
    }
    export const getRecordCountWithUserId = async (request: FastifyRequest<{ Params: RecordCountRequestParams }>, reply: FastifyReply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount: RecordCountResponse = await recordCountService.getRecordCountWithUserId(request);
            reply.send(getRecordCount);
        } catch (error) {
            console.error("Error in getRecordCountWithUserId", error);
            reply.send(error.message);
        }
    }
    export const getArchivefilterRecordCount = async (request: FastifyRequest<{ Params: RecordCountRequestParams }>, reply: FastifyReply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount: RecordCountResponse = await recordCountService.getArchivefilterRecordCount(objectName,request);
            reply.send(getRecordCount);
        } catch (error) {
            console.error("Error in getArchivefilterRecordCount", error);
            reply.send(error.message);
        }
    }
    export const getGlobalProductDataCount = async (request:   any, reply: any) => {
        try {
            const getRecordCount: any = await recordCountService.getGlobalProductDataCount(request,reply);
            reply.send(getRecordCount);
        } catch (error) {
            console.error("Error in getGlobalProductDataCount", error);
            reply.send(error.message);
        }
    }
}
