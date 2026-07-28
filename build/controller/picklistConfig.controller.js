import { picklistConfigService } from "../services/picklistConfig.service.js";
const sendServiceResult = (reply, result) => {
    if (result?.status) {
        return reply.status(result.status).send(result);
    }
    if (result?.error?.statusCode) {
        return reply.status(result.error.statusCode).send(result);
    }
    return reply.status(200).send(result);
};
export var picklistConfigController;
(function (picklistConfigController) {
    picklistConfigController.getDefinitions = async (request, reply) => {
        try {
            const result = await picklistConfigService.getDefinitions(request);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller getDefinitions", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.upsertDefinition = async (request, reply) => {
        try {
            const result = await picklistConfigService.upsertDefinition(request.body);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller upsertDefinition", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.getValues = async (request, reply) => {
        try {
            const result = await picklistConfigService.getValues(request);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller getValues", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.upsertValue = async (request, reply) => {
        try {
            const result = await picklistConfigService.upsertValue(request.body);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller upsertValue", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.upsertRelation = async (request, reply) => {
        try {
            const result = await picklistConfigService.upsertRelation(request.body);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller upsertRelation", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.deleteRelation = async (request, reply) => {
        try {
            const result = await picklistConfigService.deleteRelation(Number(request.params.id));
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller deleteRelation", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.getFieldMappings = async (request, reply) => {
        try {
            const result = await picklistConfigService.getFieldMappings(request);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller getFieldMappings", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.upsertFieldMapping = async (request, reply) => {
        try {
            const result = await picklistConfigService.upsertFieldMapping(request.body);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller upsertFieldMapping", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.resolvePicklists = async (request, reply) => {
        try {
            const result = await picklistConfigService.resolvePicklists(request);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller resolvePicklists", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.getBundleTemplates = async (request, reply) => {
        try {
            const result = await picklistConfigService.getBundleTemplates(request);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller getBundleTemplates", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.upsertBundleTemplate = async (request, reply) => {
        try {
            const result = await picklistConfigService.upsertBundleTemplate(request.body);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller upsertBundleTemplate", error);
            return reply.status(500).send(error.message);
        }
    };
    picklistConfigController.upsertBundleItem = async (request, reply) => {
        try {
            const result = await picklistConfigService.upsertBundleItem(request.body);
            return sendServiceResult(reply, result);
        }
        catch (error) {
            console.error("ERROR IN Controller upsertBundleItem", error);
            return reply.status(500).send(error.message);
        }
    };
})(picklistConfigController || (picklistConfigController = {}));
//# sourceMappingURL=picklistConfig.controller.js.map