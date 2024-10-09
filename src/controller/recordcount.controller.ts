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
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const getRecordCountRevo = async (request: FastifyRequest<{ Params: RecordCountRequestParams }>, reply: FastifyReply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount: RecordCountResponse = await recordCountService.getRecordCountRevo(objectName,request);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const getRecordCountWithUserId = async (request: FastifyRequest<{ Params: RecordCountRequestParams }>, reply: FastifyReply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount: RecordCountResponse = await recordCountService.getRecordCountWithUserId(request);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const getArchivefilterRecordCount = async (request: FastifyRequest<{ Params: RecordCountRequestParams }>, reply: FastifyReply) => {
        try {
            const { objectName } = request.params;
            const getRecordCount: RecordCountResponse = await recordCountService.getArchivefilterRecordCount(objectName,request);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        } catch (error) {
            reply.send(error.message);
        }
    }
    export const getGlobalProductDataCount = async (request:   any, reply: any) => {
        try {
            const getRecordCount: any = await recordCountService.getGlobalProductDataCount(request,reply);
            console.log(getRecordCount, 'get Record Count');
            reply.send(getRecordCount);
        } catch (error) {
            reply.send(error.message);
        }
    }
}
