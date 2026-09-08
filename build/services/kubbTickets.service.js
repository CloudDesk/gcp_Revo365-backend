import { query } from "../database/postgres.js";
export var kubbTicketsService;
(function (kubbTicketsService) {
    kubbTicketsService.createTicket = async (ticketData) => {
        const { name, email, phone } = ticketData;
        const now = Date.now();
        const queryText = `
            INSERT INTO kubb_tickets (name, email, phone, createddate, modifieddate)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const params = [name, email, phone, now, now];
        const result = await query(queryText, params);
        return result.rows[0];
    };
    kubbTicketsService.getAllTickets = async (pageNumber, recordCount, search = "") => {
        const offset = (pageNumber - 1) * recordCount;
        let queryText = `SELECT * FROM kubb_tickets`;
        const queryParams = [];
        let paramIndex = 1;
        if (search) {
            queryText += ` WHERE name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone::text ILIKE $${paramIndex}`;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }
        queryText += ` ORDER BY createddate DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1};`;
        queryParams.push(recordCount, offset);
        console.log("DEBUG: getAllTickets called with search:", search);
        console.log("DEBUG: Query Text:", queryText);
        console.log("DEBUG: Query Params:", queryParams);
        const result = await query(queryText, queryParams);
        console.log("DEBUG: Query Result Rows:", result.rows.length);
        return result.rows;
    };
    kubbTicketsService.getTicketById = async (id) => {
        const queryText = `SELECT * FROM kubb_tickets WHERE id = $1;`;
        const result = await query(queryText, [id]);
        return result.rows[0];
    };
    kubbTicketsService.updateTicket = async (id, data) => {
        const { name, email, phone } = data;
        const now = Date.now();
        const queryText = `
            UPDATE kubb_tickets 
            SET name = $1, email = $2, phone = $3, modifieddate = $4
            WHERE id = $5
            RETURNING *;
        `;
        const result = await query(queryText, [name, email, phone, now, id]);
        return result.rows[0];
    };
})(kubbTicketsService || (kubbTicketsService = {}));
//# sourceMappingURL=kubbTickets.service.js.map