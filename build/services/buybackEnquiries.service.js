import { query } from "../database/postgres.js";
export var buybackEnquiriesService;
(function (buybackEnquiriesService) {
    buybackEnquiriesService.createEnquiry = async (data) => {
        const queryText = `
      INSERT INTO buyback_enquiries (
        name, phone, email, device_type, device_model, status, followup_notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
        const params = [
            data.name,
            data.phone,
            data.email,
            data.device_type,
            data.device_model,
            data.status || "Open",
            data.followup_notes || null,
        ];
        const result = await query(queryText, params);
        return result.rows[0];
    };
    buybackEnquiriesService.getAllEnquiries = async (pageNumber, recordCount, search = "") => {
        const offset = (pageNumber - 1) * recordCount;
        let queryText = `SELECT * FROM buyback_enquiries`;
        const queryParams = [];
        let paramIndex = 1;
        if (search) {
            queryText += `
        WHERE name ILIKE $${paramIndex}
          OR email ILIKE $${paramIndex}
          OR phone ILIKE $${paramIndex}
          OR device_type ILIKE $${paramIndex}
          OR device_model ILIKE $${paramIndex}
          OR status ILIKE $${paramIndex}
      `;
            queryParams.push(`%${search}%`);
            paramIndex++;
        }
        queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1};`;
        queryParams.push(recordCount, offset);
        const result = await query(queryText, queryParams);
        return result.rows;
    };
    buybackEnquiriesService.getEnquiryById = async (id) => {
        const result = await query(`SELECT * FROM buyback_enquiries WHERE id = $1;`, [id]);
        return result.rows[0];
    };
    buybackEnquiriesService.updateEnquiry = async (id, data) => {
        const queryText = `
      UPDATE buyback_enquiries
      SET
        name = $1,
        phone = $2,
        email = $3,
        device_type = $4,
        device_model = $5,
        status = $6,
        followup_notes = $7,
        modified_at = NOW()
      WHERE id = $8
      RETURNING *;
    `;
        const result = await query(queryText, [
            data.name,
            data.phone,
            data.email,
            data.device_type,
            data.device_model,
            data.status || "Open",
            data.followup_notes || null,
            id,
        ]);
        return result.rows[0];
    };
    buybackEnquiriesService.getCount = async (search = "") => {
        if (search) {
            const result = await query(`
          SELECT count(*) FROM buyback_enquiries
          WHERE name ILIKE $1
             OR email ILIKE $1
             OR phone ILIKE $1
             OR device_type ILIKE $1
             OR device_model ILIKE $1
             OR status ILIKE $1
        `, [`%${search}%`]);
            return result.rows[0].count;
        }
        const result = await query(`SELECT count(*) FROM buyback_enquiries`, []);
        return result.rows[0].count;
    };
})(buybackEnquiriesService || (buybackEnquiriesService = {}));
//# sourceMappingURL=buybackEnquiries.service.js.map