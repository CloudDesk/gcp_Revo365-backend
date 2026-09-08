import { query } from "../database/postgres.js";
/**
 * Inserts a new enquiry record into the enquiry_submissions table.
 * Returns the inserted row ID.
 *
 * - sheet_synced defaults to false — updated separately after sheet write
 * - Never throws — errors are logged and swallowed so the API is not affected
 */
export const insertEnquiryRecord = async (data) => {
    const sql = `
    INSERT INTO enquiry_submissions (
      recordtype,
      first_name, last_name, email, phone,
      topic, message,
      company, fleet, preferred_date, notes,
      status, sheet_synced, sheet_synced_at,
      created_at
    )
    VALUES (
      $1,
      $2, $3, $4, $5,
      $6, $7,
      $8, $9, $10, $11,
      $12, $13, $14,
      NOW()
    )
    RETURNING id
  `;
    const params = [
        data.recordtype,
        data.first_name || null,
        data.last_name || null,
        data.email || null,
        data.phone || null,
        data.topic || null, // Individual only
        data.message || null, // Individual only
        data.company || null, // Corporate only
        data.fleet || null, // Corporate only
        data.preferred_date || null, // Corporate only
        data.notes || null, // Corporate only
        data.status || "Open",
        data.sheet_synced ?? false,
        data.sheet_synced_at ?? null,
    ];
    try {
        const result = await query(sql, params);
        const insertedId = result?.rows?.[0]?.id ?? null;
        console.log(`[enquiryDB] ✅ Enquiry saved to DB | type: ${data.recordtype} | id: ${insertedId}`);
        return insertedId;
    }
    catch (error) {
        console.error(`[enquiryDB] ❌ Failed to save ${data.recordtype} enquiry to DB:`, error?.message || error);
        return null; // Return null — do NOT throw, DB failure should not affect API response
    }
};
/**
 * Marks an existing enquiry record as successfully synced to Google Sheets.
 * Called after appendToSheet() succeeds.
 *
 * @param id - The DB row ID returned from insertEnquiryRecord()
 */
export const markEnquirySheetSynced = async (id) => {
    const sql = `
    UPDATE enquiry_submissions
    SET sheet_synced = TRUE, sheet_synced_at = NOW()
    WHERE id = $1
  `;
    try {
        await query(sql, [id]);
        console.log(`[enquiryDB] ✅ Sheet sync marked for enquiry id: ${id}`);
    }
    catch (error) {
        console.error(`[enquiryDB] ❌ Failed to mark sheet_synced for id ${id}:`, error?.message || error);
        // Swallow — non-critical audit update
    }
};
//# sourceMappingURL=enquiryDB.service.js.map