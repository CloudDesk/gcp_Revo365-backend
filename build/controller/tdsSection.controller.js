import { tdsSectionService } from "../services/tdsSection.service.js";
import { sendFinanceError } from "./finance.controller.utils.js";
export var tdsSectionController;
(function (tdsSectionController) {
    tdsSectionController.list = async (request, reply) => {
        try {
            const data = await tdsSectionService.list(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    tdsSectionController.getById = async (request, reply) => {
        try {
            const data = await tdsSectionService.getById(request);
            return reply.send({ success: true, data });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    tdsSectionController.create = async (request, reply) => {
        try {
            const data = await tdsSectionService.create(request);
            return reply.status(201).send({
                success: true,
                message: "TDS section created successfully.",
                data,
            });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
    tdsSectionController.update = async (request, reply) => {
        try {
            const data = await tdsSectionService.update(request);
            return reply.send({
                success: true,
                message: "TDS section updated successfully.",
                data,
            });
        }
        catch (error) {
            return sendFinanceError(reply, error);
        }
    };
})(tdsSectionController || (tdsSectionController = {}));
//# sourceMappingURL=tdsSection.controller.js.map