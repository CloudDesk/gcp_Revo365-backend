import { kubbTicketsService } from "../services/kubbTickets.service.js";

export module kubbTicketsController {
    export const createTicket = async (request: any, reply: any) => {
        try {
            const { name, email, phone } = request.body;

            // Basic presence validation
            if (!name || !email || !phone) {
                return reply.status(400).send({ error: "Name, Email, and Phone are required" });
            }

            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return reply.status(400).send({ error: "Invalid email format" });
            }

            // Phone validation (numeric check)
            const phoneStr = String(phone).replace(/\D/g, '');
            if (phoneStr.length < 10) {
                return reply.status(400).send({ error: "Phone number must be at least 10 digits" });
            }

            const ticket = await kubbTicketsService.createTicket({ name, email, phone });
            reply.status(201).send({
                message: "Ticket created successfully",
                data: ticket
            });
        } catch (error: any) {
            console.error("Error in 'kubbTicketsController.createTicket':", error);
            reply.status(500).send({ error: error.message });
        }
    };

    export const getAllTickets = async (request: any, reply: any) => {
        try {
            const { pageNumber, recordCount } = request.params;
            const { search, searchTerm } = request.query;
            const finalSearch = search || searchTerm || "";
            const tickets = await kubbTicketsService.getAllTickets(Number(pageNumber), Number(recordCount), finalSearch);
            reply.status(200).send(tickets);
        } catch (error: any) {
            console.error("Error in 'kubbTicketsController.getAllTickets':", error);
            reply.status(500).send({ error: error.message });
        }
    };

    export const getTicketById = async (request: any, reply: any) => {
        try {
            const { id } = request.params;
            const ticket = await kubbTicketsService.getTicketById(Number(id));

            if (!ticket) {
                return reply.status(404).send({ error: "Ticket not found" });
            }

            reply.status(200).send(ticket);
        } catch (error: any) {
            console.error("Error in 'kubbTicketsController.getTicketById':", error);
            reply.status(500).send({ error: error.message });
        }
    };
    export const getSingleTicket = async (request: any, reply: any) => {
        try {
            const { id } = request.params;
            const ticket = await kubbTicketsService.getTicketById(Number(id));
            reply.status(200).send({ success: true, data: ticket });
        } catch (error: any) {
            reply.status(500).send({ error: error.message });
        }
    };

    export const updateTicket = async (request: any, reply: any) => {
        try {
            const { id } = request.params;
            const updated = await kubbTicketsService.updateTicket(Number(id), request.body);
            reply.status(200).send({ success: true, data: updated });
        } catch (error: any) {
            reply.status(500).send({ error: error.message });
        }
    };
}
