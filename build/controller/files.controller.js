import { fileservice } from "../services/file.service.js";
export var fileController;
(function (fileController) {
    fileController.insertFile = async (request, reply) => {
        try {
            let insertFileResult = await fileservice.insertFile(request);
            return insertFileResult;
        }
        catch (error) {
            reply.send(error.message);
        }
    };
})(fileController || (fileController = {}));
//# sourceMappingURL=files.controller.js.map