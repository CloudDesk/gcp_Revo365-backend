import axios from "axios";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "../database/postgres.js";
import { renderHtmlToPdf } from "../utils/pdf/renderHtmlToPdf.js";
import { getDeliveryChallanDocumentHtml } from "../utils/finance/deliveryChallanDocumentTemplate.js";
import { FILE_UPLOAD_INTERNAL_SECRET, GCP_FILE_UPLOAD_BASE_URL } from "../config/config.js";

const PROCESSING_TIMEOUT_SECONDS = 10 * 60;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DELIVERY_CHALLAN_LOGO_PATH = path.resolve(__dirname, "../../assets/teqit_logo.jpeg");
let cachedLogoDataUrl: string | null | undefined;

const getLogoDataUrl = async () => {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl;
  try {
    const logo = await readFile(DELIVERY_CHALLAN_LOGO_PATH);
    cachedLogoDataUrl = `data:image/jpeg;base64,${logo.toString("base64")}`;
  } catch (error: any) {
    cachedLogoDataUrl = null;
    console.warn(`Delivery Challan logo not found at ${DELIVERY_CHALLAN_LOGO_PATH}: ${error?.message || error}`);
  }
  return cachedLogoDataUrl;
};

const sanitizeFileName = (value: unknown) => String(value || "delivery-challan")
  .trim()
  .replace(/[^a-zA-Z0-9._-]+/g, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "") || "delivery-challan";

const safeErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "Document generation failed.");
  return message.slice(0, 1000);
};

const loadDocumentData = async (challanId: number, organizationId: number) => {
  const result = await query(
    `SELECT dc.id, dc.challannumber, dc.challanmode, dc.challandate,
            dc.invoicenumber, dc.referencenumber, dc.purpose, dc.recipientname,
            dc.recipientphone, dc.recipientaddress, dc.notes, dc.showamounts,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', dcl.id,
              'productname', dcl.productname,
              'assetreference', dcl.assetreference,
              'invoicequantity', dcl.invoicequantity,
              'deliveryquantity', dcl.deliveryquantity,
              'unit', dcl.unit,
              'unitrate', dcl.unitrate,
              'lineamount', dcl.lineamount
            ) ORDER BY dcl.id) FILTER (WHERE dcl.id IS NOT NULL), '[]'::jsonb) AS lines
     FROM delivery_challans dc
     LEFT JOIN delivery_challan_lines dcl ON dcl.deliverychallanid = dc.id
     WHERE dc.id = $1 AND dc.organizationid = $2
     GROUP BY dc.id`,
    [challanId, organizationId]
  );
  return result.rows[0] || null;
};

const uploadPdf = async (buffer: Buffer, challanNumber: string) => {
  const safeNumber = sanitizeFileName(challanNumber);
  const fileName = `${safeNumber}.pdf`;
  const baseUrl = String(GCP_FILE_UPLOAD_BASE_URL || "http://localhost:4500").replace(/\/$/, "");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "application/pdf" }), fileName);
  const response = await axios.post(`${baseUrl}/delivery-challans/pdf?filename=${encodeURIComponent(fileName)}`, form, {
    headers: FILE_UPLOAD_INTERNAL_SECRET
      ? { "X-Internal-File-Secret": String(FILE_UPLOAD_INTERNAL_SECRET) }
      : undefined,
    maxBodyLength: 20 * 1024 * 1024,
    timeout: 60_000,
  });
  const url = response.data?.data?.url;
  if (!response.data?.success || !url) throw new Error("File-upload service did not return a Delivery Challan PDF URL.");
  return String(url);
};

export module deliveryChallanDocumentService {
  export const generate = async (challanId: number, organizationId: number) => {
    const startedAt = Math.floor(Date.now() / 1000);
    const staleBefore = startedAt - PROCESSING_TIMEOUT_SECONDS;
    const claim = await query(
      `UPDATE delivery_challans
       SET documentstatus = 'processing', documenterror = NULL,
           documentstarteddate = $3, documentattempts = documentattempts + 1,
           modifieddate = $3
       WHERE id = $1 AND organizationid = $2
         AND (
           documentstatus = 'pending'
           OR (documentstatus = 'processing' AND COALESCE(documentstarteddate, 0) < $4)
         )
       RETURNING id, challannumber`,
      [challanId, organizationId, startedAt, staleBefore]
    );

    if (!claim.rows[0]) {
      const current = await query(
        `SELECT documentstatus, documenturl FROM delivery_challans
         WHERE id = $1 AND organizationid = $2 LIMIT 1`,
        [challanId, organizationId]
      );
      if (!current.rows[0]) throw new Error("Delivery Challan not found.");
      return current.rows[0];
    }

    try {
      const document = await loadDocumentData(challanId, organizationId);
      if (!document) throw new Error("Delivery Challan not found.");
      const html = getDeliveryChallanDocumentHtml({
        ...document,
        logoDataUrl: await getLogoDataUrl(),
        showamounts: document.showamounts === true,
        lines: document.lines.map((line: any) => ({
          ...line,
          invoicequantity: line.invoicequantity == null ? null : Number(line.invoicequantity),
          deliveryquantity: Number(line.deliveryquantity),
          unitrate: line.unitrate == null ? null : Number(line.unitrate),
          lineamount: line.lineamount == null ? null : Number(line.lineamount),
        })),
      });
      const pdfBuffer = await renderHtmlToPdf(html);
      const documentUrl = await uploadPdf(pdfBuffer, document.challannumber);
      const completedAt = Math.floor(Date.now() / 1000);
      await query(
        `UPDATE delivery_challans
         SET documentstatus = 'ready', documenturl = $3, documenterror = NULL,
             documentgenerateddate = $4, modifieddate = $4
         WHERE id = $1 AND organizationid = $2`,
        [challanId, organizationId, documentUrl, completedAt]
      );
      return { documentstatus: "ready", documenturl: documentUrl };
    } catch (error) {
      const failedAt = Math.floor(Date.now() / 1000);
      await query(
        `UPDATE delivery_challans
         SET documentstatus = 'failed', documenterror = $3, modifieddate = $4
         WHERE id = $1 AND organizationid = $2`,
        [challanId, organizationId, safeErrorMessage(error), failedAt]
      );
      throw error;
    }
  };
}
