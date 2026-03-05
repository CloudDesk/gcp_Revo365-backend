import axios from "axios";

// ─── Config from environment ──────────────────────────────────────────────────
const WEBHOOK_URL = process.env.ENQUIRY_SHEETS_WEBHOOK_URL || "";
const SHEET_SECRET = process.env.ENQUIRY_SHEETS_SECRET || "";

// ─── Retry config ─────────────────────────────────────────────────────────────
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500; // 500ms → 1000ms → 2000ms (exponential backoff)

// ─── Helper: sleep ────────────────────────────────────────────────────────────
const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// ─── Helper: IST timestamp ────────────────────────────────────────────────────
export const getISTTimestamp = (): string => {
    return new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
};

/**
 * Appends a row to the specified Google Sheet tab via the Apps Script Web App.
 *
 * - Uses exponential backoff retry (up to 3 attempts) for transient errors.
 * - NEVER throws — failures are logged and swallowed so the enquiry API
 *   always returns 200 to the end user even if the sheet write fails.
 *
 * @param sheetName  - The tab name in Google Sheets ("Corporate" or "Individual")
 * @param rowData    - Array of values to write (one per column, in order)
 */
export const appendToSheet = async (
    sheetName: string,
    rowData: (string | number | null | undefined)[]
): Promise<void> => {
    if (!WEBHOOK_URL) {
        console.warn(
            "[sheetsService] ENQUIRY_SHEETS_WEBHOOK_URL is not set — skipping sheet write."
        );
        return;
    }

    const payload = {
        secret: SHEET_SECRET,
        sheetName,
        rowData: rowData.map((v) => (v === null || v === undefined ? "" : String(v))),
    };

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await axios.post(WEBHOOK_URL, payload, {
                timeout: 15000, // 15 second timeout per attempt
                headers: { "Content-Type": "application/json" },
            });

            const data = response.data;

            if (data?.success === false) {
                // Apps Script returned a logical error (e.g., wrong secret, sheet not found)
                console.error(
                    `[sheetsService] Apps Script error on sheet "${sheetName}":`,
                    data.error
                );
                // Do NOT retry on logical errors — retrying won't help
                return;
            }

            console.log(
                `[sheetsService] ✅ Row appended to sheet "${sheetName}" | Row: ${data?.rowCount ?? "?"}`
            );
            return; // ✅ Success — exit

        } catch (err: any) {
            lastError = err;
            const isRetryable =
                err?.code === "ECONNRESET" ||
                err?.code === "ECONNABORTED" ||
                err?.code === "ETIMEDOUT" ||
                (err?.response?.status >= 500 && err?.response?.status < 600);

            if (!isRetryable || attempt === MAX_RETRIES) {
                break; // Don't retry on non-retryable errors or final attempt
            }

            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 500, 1000, 2000
            console.warn(
                `[sheetsService] Attempt ${attempt}/${MAX_RETRIES} failed for sheet "${sheetName}". Retrying in ${delay}ms...`
            );
            await sleep(delay);
        }
    }

    // All retries exhausted — log and move on (do NOT throw)
    console.error(
        `[sheetsService] ❌ Failed to append row to sheet "${sheetName}" after ${MAX_RETRIES} attempts. Error:`,
        lastError instanceof Error ? lastError.message : lastError
    );
};
