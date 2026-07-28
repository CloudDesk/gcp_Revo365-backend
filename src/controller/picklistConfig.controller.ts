import { FastifyReply, FastifyRequest } from "fastify";
import { picklistConfigService } from "../services/picklistConfig.service.js";

const sendServiceResult = (reply: FastifyReply, result: any) => {
  if (result?.status) {
    return reply.status(result.status).send(result);
  }

  if (result?.error?.statusCode) {
    return reply.status(result.error.statusCode).send(result);
  }

  return reply.status(200).send(result);
};

export module picklistConfigController {
  export const getDefinitions = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.getDefinitions(request);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller getDefinitions", error);
      return reply.status(500).send(error.message);
    }
  };

  export const upsertDefinition = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.upsertDefinition(request.body);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller upsertDefinition", error);
      return reply.status(500).send(error.message);
    }
  };

  export const getValues = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.getValues(request);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller getValues", error);
      return reply.status(500).send(error.message);
    }
  };

  export const upsertValue = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.upsertValue(request.body);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller upsertValue", error);
      return reply.status(500).send(error.message);
    }
  };

  export const upsertRelation = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.upsertRelation(request.body);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller upsertRelation", error);
      return reply.status(500).send(error.message);
    }
  };

  export const deleteRelation = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const result = await picklistConfigService.deleteRelation(Number(request.params.id));
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller deleteRelation", error);
      return reply.status(500).send(error.message);
    }
  };

  export const getFieldMappings = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.getFieldMappings(request);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller getFieldMappings", error);
      return reply.status(500).send(error.message);
    }
  };

  export const upsertFieldMapping = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.upsertFieldMapping(request.body);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller upsertFieldMapping", error);
      return reply.status(500).send(error.message);
    }
  };

  export const resolvePicklists = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.resolvePicklists(request);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller resolvePicklists", error);
      return reply.status(500).send(error.message);
    }
  };

  export const getBundleTemplates = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.getBundleTemplates(request);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller getBundleTemplates", error);
      return reply.status(500).send(error.message);
    }
  };

  export const upsertBundleTemplate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.upsertBundleTemplate(request.body);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller upsertBundleTemplate", error);
      return reply.status(500).send(error.message);
    }
  };

  export const upsertBundleItem = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await picklistConfigService.upsertBundleItem(request.body);
      return sendServiceResult(reply, result);
    } catch (error) {
      console.error("ERROR IN Controller upsertBundleItem", error);
      return reply.status(500).send(error.message);
    }
  };
}
