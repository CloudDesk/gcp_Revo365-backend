import { notesService } from "../services/notes.service.js"

export module notesController {
    export const getnotes = async (request: any, reply: any) => {
        try {
            let fetchnotesData = await notesService.getNotesData(request)
            reply.send(fetchnotesData)
        } catch (error) {
            console.error('ERROR IN  Controller getnotes', error);
            reply.status(404).send(error.message)
        }
    }

    export const upsertnotes = async (request: any, reply: any) => {
        try {
            let upsertnotesData = await notesService.upsertNotes(request.body)
            if (upsertnotesData.command === "UPDATE" || upsertnotesData.command === "INSERT") {
                let message: any = {}
                message = {
                    message: upsertnotesData.command === "UPDATE"
                        ? `Notes Updated successfully`
                        : `Notes Inserted successfully`,
                    Data: upsertnotesData.rows[0]
                };
                reply.status(200).send(message)
            }
            else {
                reply.status(404).send({ error: [upsertnotesData] })
            }
        } catch (error) {
            console.error('ERROR IN  Controller upsertnotes', error);
            reply.status(404).send(error.message)
        }
    }
} 