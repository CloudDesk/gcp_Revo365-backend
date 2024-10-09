import { ErrorHandler } from "../errorHandler/errorHandler.js"
import { ticketService } from "../services/ticket.service.js"

export module ticketController {
    export const getTicketDynamicData = async (request, reply) => {
        try {

            let getstock = await ticketService.getTicketDynamic(request)
            reply.send(getstock)
        } catch (error) {
            reply.send(error.message)
        }
    }
    export const getTicketsData = async (request, reply) => {
        try {
            let ticketData = await ticketService.getTicketData(request);
            reply.send(ticketData)
        } catch (error) {
            let ErrorDetails = ErrorHandler.handleQueryError(error);
            reply.status(404).send(ErrorDetails);
        }
    }

    export const getQueueTicketsData = async (request, reply) => {
        try {
            let ticketData = await ticketService.getQueueTicketData(request);
            reply.send(ticketData)
        } catch (error) {
            let ErrorDetails = ErrorHandler.handleQueryError(error);
            reply.status(404).send(ErrorDetails);
        }
    }

    export const upsertTickets = async (request, reply) => {
        console.log(request);
        try {
            let host = request.headers.host
            let upsertTicket = await ticketService.upsertTickets(request.body, request.files, host)
            if (upsertTicket.command === "UPDATE" || upsertTicket.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertTicket.command === "UPDATE"
                        ? `Ticket Updated Successfully`
                        : `Ticket Raised Successfully`
                };
                reply.status(200).send(message);
            } else {
                reply.status(400).send(upsertTicket)
            }
        } catch (error) {
            let ErrorDetails = ErrorHandler.handleQueryError(error);
            reply.status(404).send(ErrorDetails);
        }
    }

    export const upsertTicketspayment = async (request, host) => {
        console.log(request);
        try {
            let host = request.headers.host
            request.files = request.body.ticket.recipturl
            delete request.body.ticket.recipturl
            let upsertTicket = await ticketService.upsertTicketspayment(request.body.ticket, request.files, host)
            if (upsertTicket.command === "UPDATE" || upsertTicket.command === "INSERT") {
                let message: any = {};
                message = {
                    message: upsertTicket.command === "UPDATE"
                        ? `Ticket Updated Successfully`
                        : `Ticket Raised Successfully`
                };
                // reply.status(200).send(message);
                return { status: 200, message: message }
            } else {
                // reply.status(400).send(upsertTicket)

                return { status: 404, message: upsertTicket }
            }
        } catch (error) {
            let ErrorDetails = ErrorHandler.handleQueryError(error);
            return { status: 404, message: ErrorDetails }
        }
    }
}