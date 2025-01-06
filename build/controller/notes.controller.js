import { notesService } from "../services/notes.service.js";
export var notesController;
(function (notesController) {
    notesController.getnotes = async (request, reply) => {
        try {
            let fetchnotesData = await notesService.getNotesData(request);
            reply.send(fetchnotesData);
        }
        catch (error) {
            reply.status(404).send(error.message);
        }
    };
    notesController.upsertnotes = async (request, reply) => {
        try {
            let upsertnotesData = await notesService.upsertNotes(request.body);
            if (upsertnotesData.command === "UPDATE" || upsertnotesData.command === "INSERT") {
                let message = {};
                message = {
                    message: upsertnotesData.command === "UPDATE"
                        ? `Notes Updated successfully`
                        : `Notes Inserted successfully`,
                    Data: upsertnotesData.rows[0]
                };
                reply.status(200).send(message);
            }
            else {
                console.log("else upsertnotesData Error");
                console.log(upsertnotesData);
                reply.status(404).send({ error: [upsertnotesData] });
            }
        }
        catch (error) {
            reply.status(404).send(error.message);
        }
    };
})(notesController || (notesController = {}));
//# sourceMappingURL=notes.controller.js.map