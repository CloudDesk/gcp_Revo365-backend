import pool, { query } from "../database/postgres.js";
import {
  FinanceValidationError,
  nowEpoch,
  requireIsoDate,
  resolveFinanceContext,
} from "../utils/finance/finance.utils.js";
import {
  DeliverableInvoiceLine,
  extractDeliverableInvoiceLines,
  validateManualDeliveryLines,
  validateDeliveryQuantities,
} from "../utils/finance/deliveryChallan.utils.js";
import { toCustomerStatementDate } from "../utils/finance/customerStatement.utils.js";

const requirePositiveInteger = (value: unknown, fieldName: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new FinanceValidationError(`${fieldName} must be a positive integer.`);
  }
  return parsed;
};

const normalizePage = (value: unknown, fallback: number, maximum: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

const requireCustomer = async (customerId: number) => {
  const result = await query(`SELECT id, firstname, lastname, usermobilenumber FROM users WHERE id = $1 LIMIT 1`, [customerId]);
  if (!result.rows[0]) {
    throw new FinanceValidationError("Customer not found.", 404, "FINANCE_CUSTOMER_NOT_FOUND");
  }
  return result.rows[0];
};

const optionalPositiveInteger = (value: unknown, fieldName: string): number | null => {
  if (value == null || value === "") return null;
  return requirePositiveInteger(value, fieldName);
};

const limitedText = (value: unknown, fieldName: string, maximum: number) => {
  const normalized = String(value || "").trim();
  if (normalized.length > maximum) {
    throw new FinanceValidationError(`${fieldName} cannot exceed ${maximum} characters.`);
  }
  return normalized || null;
};

const hasInvoiceFinancialVisibility = async (request: any) => {
  const role = String(request.session?.role || "").trim().toLowerCase();
  const result = await query(
    `SELECT item->'permissions'->>'read' AS canread
     FROM permissions p
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.permissionset, '[]'::jsonb)) item
     WHERE LOWER(p.role) = $1 AND item->>'objectAPI' = 'revoinvoice'
     LIMIT 1`,
    [role]
  );
  return result.rows[0]?.canread === "true";
};

const deliveredMap = (rows: any[]) => new Map<string, number>(
  rows.map((row) => [String(row.invoicelinekey), Number(row.deliveredquantity || 0)])
);

const withDeliveryProgress = (
  lines: DeliverableInvoiceLine[],
  delivered: Map<string, number>
) => lines.map((line) => {
  const previouslydeliveredquantity = Number(delivered.get(line.invoicelinekey) || 0);
  return {
    ...line,
    previouslydeliveredquantity,
    remainingquantity: Math.max(line.invoicequantity - previouslydeliveredquantity, 0),
  };
});

export module deliveryChallanService {
  export const createCustomerAddress = async (request: any) => {
    resolveFinanceContext(request);
    const customerId = requirePositiveInteger(request.params?.customerId, "customerId");
    const customer = await requireCustomer(customerId);
    const address = limitedText(request.body?.address, "address", 1000);
    const city = limitedText(request.body?.city, "city", 255);
    const state = limitedText(request.body?.state, "state", 255);
    const pincode = String(request.body?.pincode || "").trim();
    const mobilenumber = String(request.body?.mobilenumber || customer.usermobilenumber || "").trim();
    if (!address || !city || !state) {
      throw new FinanceValidationError("Address, city, and state are required.");
    }
    if (!/^\d{6}$/.test(pincode)) {
      throw new FinanceValidationError("pincode must contain 6 digits.");
    }
    if (!/^\d{7,15}$/.test(mobilenumber.replace(/\D/g, ""))) {
      throw new FinanceValidationError("mobilenumber must contain 7 to 15 digits.");
    }
    const name = limitedText(request.body?.name, "name", 255)
      || [customer.firstname, customer.lastname].filter(Boolean).join(" ").trim()
      || `Customer ${customerId}`;
    const result = await query(
      `INSERT INTO address
        (userid, name, mobilenumber, pincode, doornumber, address, landmark,
         city, state, email, createddate, modifieddate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       RETURNING id, userid, name, mobilenumber, pincode, doornumber, address,
                 landmark, city, state, email`,
      [customerId, name, mobilenumber, pincode,
       limitedText(request.body?.doornumber, "doornumber", 300), address,
       limitedText(request.body?.landmark, "landmark", 500), city, state,
       limitedText(request.body?.email, "email", 255), Date.now()]
    );
    return result.rows[0];
  };

  export const list = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const customerId = optionalPositiveInteger(
      request.params?.customerId ?? request.query?.customerid,
      "customerId"
    );
    const page = normalizePage(request.query?.page, 1, 1_000_000);
    const count = normalizePage(request.query?.count, 10, 100);
    if (customerId) await requireCustomer(customerId);
    const offset = (page - 1) * count;
    const customerClause = customerId ? "AND dc.customerid = $2" : "";
    const recordParams = customerId
      ? [organizationId, customerId, offset, count]
      : [organizationId, offset, count];
    const offsetPosition = customerId ? 3 : 2;

    const [records, total] = await Promise.all([
      query(
        `SELECT dc.id, dc.challannumber, dc.challanmode, dc.invoiceid, dc.invoicenumber,
                dc.challandate, dc.notes, dc.referencenumber, dc.recipientname,
                COUNT(dcl.id)::int AS deliveredlinecount,
                COALESCE(SUM(dcl.deliveryquantity), 0) AS totaldeliveredquantity
         FROM delivery_challans dc
         JOIN delivery_challan_lines dcl ON dcl.deliverychallanid = dc.id
         WHERE dc.organizationid = $1 ${customerClause}
         GROUP BY dc.id
         ORDER BY dc.challandate DESC, dc.id DESC
         OFFSET $${offsetPosition} LIMIT $${offsetPosition + 1}`,
        recordParams
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM delivery_challans dc
         WHERE dc.organizationid = $1 ${customerClause}`,
        customerId ? [organizationId, customerId] : [organizationId]
      ),
    ]);

    return {
      records: records.rows.map((row: any) => ({
        ...row,
        id: Number(row.id),
        invoiceid: row.invoiceid == null ? null : Number(row.invoiceid),
        challandate: toCustomerStatementDate(row.challandate),
        deliveredlinecount: Number(row.deliveredlinecount),
        totaldeliveredquantity: Number(row.totaldeliveredquantity),
      })),
      total: Number(total.rows[0]?.total || 0),
      page,
      count,
    };
  };

  export const listEligibleInvoices = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const customerId = requirePositiveInteger(request.params?.customerId, "customerId");
    await requireCustomer(customerId);
    const invoices = await query(
      `SELECT id, invoicenumber, invoicedate, createddate, invoicefor, invoicedata
       FROM revoinvoice
       WHERE customerid = $1
         AND LOWER(COALESCE(invoicefor, '')) <> 'penalty'
       ORDER BY COALESCE(invoicedate, createddate) DESC, id DESC`,
      [customerId]
    );
    const delivered = await query(
      `SELECT dc.invoiceid, dcl.invoicelinekey,
              SUM(dcl.deliveryquantity) AS deliveredquantity
       FROM delivery_challans dc
       JOIN delivery_challan_lines dcl ON dcl.deliverychallanid = dc.id
       WHERE dc.organizationid = $1 AND dc.customerid = $2
       GROUP BY dc.invoiceid, dcl.invoicelinekey`,
      [organizationId, customerId]
    );
    const byInvoice = new Map<number, Map<string, number>>();
    for (const row of delivered.rows) {
      const invoiceId = Number(row.invoiceid);
      const invoiceMap = byInvoice.get(invoiceId) || new Map<string, number>();
      invoiceMap.set(String(row.invoicelinekey), Number(row.deliveredquantity));
      byInvoice.set(invoiceId, invoiceMap);
    }

    return invoices.rows.flatMap((invoice: any) => {
      const lines = withDeliveryProgress(
        extractDeliverableInvoiceLines(invoice.invoicedata),
        byInvoice.get(Number(invoice.id)) || new Map()
      );
      const remainingquantity = lines.reduce((sum, line) => sum + line.remainingquantity, 0);
      if (!lines.length || remainingquantity <= 0) return [];
      return [{
        id: Number(invoice.id),
        invoicenumber: String(invoice.invoicenumber || `INV-${invoice.id}`),
        invoicedate: toCustomerStatementDate(invoice.invoicedate || invoice.createddate),
        source: String(invoice.invoicefor || "invoice"),
        remaininglinecount: lines.filter((line) => line.remainingquantity > 0).length,
        remainingquantity,
      }];
    });
  };

  export const getInvoiceLines = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const customerId = requirePositiveInteger(request.params?.customerId, "customerId");
    const invoiceId = requirePositiveInteger(request.params?.invoiceId, "invoiceId");
    await requireCustomer(customerId);
    const invoice = await query(
      `SELECT id, invoicenumber, invoicedate, createddate, invoicefor, invoicedata
       FROM revoinvoice
       WHERE id = $1 AND customerid = $2
         AND LOWER(COALESCE(invoicefor, '')) <> 'penalty'
       LIMIT 1`,
      [invoiceId, customerId]
    );
    if (!invoice.rows[0]) {
      throw new FinanceValidationError("Invoice not found for this customer.", 404, "DELIVERY_INVOICE_NOT_FOUND");
    }
    const delivered = await query(
      `SELECT dcl.invoicelinekey, SUM(dcl.deliveryquantity) AS deliveredquantity
       FROM delivery_challans dc
       JOIN delivery_challan_lines dcl ON dcl.deliverychallanid = dc.id
       WHERE dc.organizationid = $1 AND dc.customerid = $2 AND dc.invoiceid = $3
       GROUP BY dcl.invoicelinekey`,
      [organizationId, customerId, invoiceId]
    );
    const row = invoice.rows[0];
    return {
      invoice: {
        id: Number(row.id),
        invoicenumber: String(row.invoicenumber || `INV-${row.id}`),
        invoicedate: toCustomerStatementDate(row.invoicedate || row.createddate),
        source: String(row.invoicefor || "invoice"),
      },
      lines: withDeliveryProgress(
        extractDeliverableInvoiceLines(row.invoicedata),
        deliveredMap(delivered.rows)
      ),
    };
  };

  export const create = async (request: any) => {
    const { actor, organizationId } = resolveFinanceContext(request);
    const mode = String(request.body?.challanmode || "invoice").trim().toLowerCase();
    if (mode !== "invoice" && mode !== "manual") {
      throw new FinanceValidationError("challanmode must be invoice or manual.");
    }
    const customerId = optionalPositiveInteger(
      request.params?.customerId ?? request.body?.customerid,
      "customerId"
    );
    const invoiceId = mode === "invoice"
      ? requirePositiveInteger(request.body?.invoiceid, "invoiceid")
      : null;
    if (mode === "invoice" && !customerId) {
      throw new FinanceValidationError("customerId is required for an Invoice-linked Challan.");
    }
    if (mode === "manual" && request.body?.invoiceid != null) {
      throw new FinanceValidationError("A Manual/General Challan cannot reference an Invoice.");
    }
    const challandate = requireIsoDate(request.body?.challandate, "challandate");
    const notes = limitedText(request.body?.notes, "notes", 1000);
    let referencenumber = limitedText(request.body?.referencenumber, "referencenumber", 255);
    const purpose = limitedText(request.body?.purpose, "purpose", 500);
    let recipientname = limitedText(request.body?.recipientname, "recipientname", 255);
    let recipientphone = limitedText(request.body?.recipientphone, "recipientphone", 50);
    let recipientaddress = limitedText(request.body?.recipientaddress, "recipientaddress", 2000);
    const showamounts = mode === "invoice" && request.body?.showamounts === true;
    if (showamounts && !(await hasInvoiceFinancialVisibility(request))) {
      throw new FinanceValidationError(
        "You do not have permission to include Invoice amounts on a Delivery Challan.",
        403,
        "DELIVERY_CHALLAN_AMOUNT_ACCESS_DENIED"
      );
    }
    const requestedLines = request.body?.lines;
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      if (customerId) {
        const customer = await client.query(
          `SELECT id, firstname, lastname, usermobilenumber FROM users WHERE id = $1 LIMIT 1`,
          [customerId]
        );
        if (!customer.rows[0]) {
          throw new FinanceValidationError("Customer not found.", 404, "FINANCE_CUSTOMER_NOT_FOUND");
        }
        const customerRow = customer.rows[0];
        recipientname ||= [customerRow.firstname, customerRow.lastname].filter(Boolean).join(" ").trim() || `Customer ${customerId}`;
        recipientphone ||= String(customerRow.usermobilenumber || "").trim() || null;
        if (!recipientaddress) {
          const address = await client.query(
            `SELECT doornumber, address, landmark, city, state, pincode
             FROM address WHERE userid = $1 ORDER BY modifieddate DESC NULLS LAST, id DESC LIMIT 1`,
            [customerId]
          );
          if (address.rows[0]) {
            recipientaddress = [address.rows[0].doornumber, address.rows[0].address,
              address.rows[0].landmark, address.rows[0].city, address.rows[0].state,
              address.rows[0].pincode].filter(Boolean).join(", ") || null;
          }
        }
      }
      if (mode === "manual" && !customerId && !recipientname) {
        throw new FinanceValidationError("Recipient name is required when a Manual/General Challan has no customer.");
      }

      let invoice: any = null;
      let validatedLines: any[];
      if (mode === "invoice") {
        const invoiceResult = await client.query(
        `SELECT id, invoicenumber, invoicedata FROM revoinvoice
         WHERE id = $1 AND customerid = $2
           AND LOWER(COALESCE(invoicefor, '')) <> 'penalty'
         FOR UPDATE`,
        [invoiceId, customerId]
        );
        invoice = invoiceResult.rows[0];
        if (!invoice) {
          throw new FinanceValidationError("Invoice not found for this customer.", 404, "DELIVERY_INVOICE_NOT_FOUND");
        }
        // The source Invoice number is the canonical reference for an
        // Invoice-linked Challan; no duplicate user entry is required.
        referencenumber = String(invoice.invoicenumber || `INV-${invoiceId}`);
        const priorResult = await client.query(
        `SELECT dcl.invoicelinekey, SUM(dcl.deliveryquantity) AS deliveredquantity
         FROM delivery_challans dc
         JOIN delivery_challan_lines dcl ON dcl.deliverychallanid = dc.id
         WHERE dc.organizationid = $1 AND dc.customerid = $2 AND dc.invoiceid = $3
         GROUP BY dcl.invoicelinekey`,
        [organizationId, customerId, invoiceId]
        );
        validatedLines = validateDeliveryQuantities(
          extractDeliverableInvoiceLines(invoice.invoicedata),
          deliveredMap(priorResult.rows),
          requestedLines
        );
      } else {
        validatedLines = validateManualDeliveryLines(requestedLines);
      }
      const timestamp = nowEpoch();
      const sequence = await client.query(
        `SELECT nextval(pg_get_serial_sequence('delivery_challans', 'id')) AS id`
      );
      const challanId = Number(sequence.rows[0].id);
      const challannumber = `DC-${String(challanId).padStart(8, "0")}`;
      await client.query(
        `INSERT INTO delivery_challans
          (id, organizationid, challannumber, challanmode, customerid, invoiceid,
           invoicenumber, challandate, showamounts, referencenumber, purpose,
           recipientname, recipientphone, recipientaddress, notes, createdby, createddate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [challanId, organizationId, challannumber, mode, customerId, invoiceId,
         invoice ? String(invoice.invoicenumber || `INV-${invoiceId}`) : null,
         challandate, showamounts, referencenumber, purpose, recipientname,
         recipientphone, recipientaddress, notes, actor, timestamp]
      );
      for (const line of validatedLines) {
        await client.query(
          `INSERT INTO delivery_challan_lines
            (deliverychallanid, linesource, invoicelinekey, productid, productname,
             invoicequantity, deliveryquantity, unit, assetreference, unitrate,
             lineamount, createdby, createddate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [challanId, mode === "invoice" ? "invoice" : line.linesource,
           line.invoicelinekey || null, line.productid, line.productname,
           line.invoicequantity || null, line.deliveryquantity, line.unit || "Nos",
           line.assetreference || null, showamounts ? line.unitrate : null,
           showamounts && line.unitrate != null
             ? Math.round(Number(line.unitrate) * Number(line.deliveryquantity) * 100) / 100
             : null,
           actor, timestamp]
        );
      }
      await client.query("COMMIT");
      return { id: challanId, challannumber };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  export const getById = async (request: any) => {
    const { organizationId } = resolveFinanceContext(request);
    const customerId = optionalPositiveInteger(request.params?.customerId, "customerId");
    const challanId = requirePositiveInteger(request.params?.challanId, "challanId");
    const result = await query(
      `SELECT dc.id, dc.challannumber, dc.challanmode, dc.customerid, dc.invoiceid,
              dc.invoicenumber, dc.challandate, dc.showamounts, dc.referencenumber,
              dc.purpose, dc.recipientname, dc.recipientphone, dc.recipientaddress,
              dc.notes, dc.createdby, dc.createddate,
              COALESCE(jsonb_agg(jsonb_build_object(
                'id', dcl.id,
                'invoicelinekey', dcl.invoicelinekey,
                'productid', dcl.productid,
                'productname', dcl.productname,
                'linesource', dcl.linesource,
                'invoicequantity', dcl.invoicequantity,
                'deliveryquantity', dcl.deliveryquantity,
                'unit', dcl.unit,
                'assetreference', dcl.assetreference,
                'unitrate', CASE WHEN dc.showamounts THEN dcl.unitrate ELSE NULL END,
                'lineamount', CASE WHEN dc.showamounts THEN dcl.lineamount ELSE NULL END
              ) ORDER BY dcl.id) FILTER (WHERE dcl.id IS NOT NULL), '[]'::jsonb) AS lines
       FROM delivery_challans dc
       LEFT JOIN delivery_challan_lines dcl ON dcl.deliverychallanid = dc.id
       WHERE dc.id = $1 AND dc.organizationid = $2
         ${customerId ? "AND dc.customerid = $3" : ""}
       GROUP BY dc.id`,
      customerId ? [challanId, organizationId, customerId] : [challanId, organizationId]
    );
    if (!result.rows[0]) {
      throw new FinanceValidationError("Delivery Challan not found.", 404, "DELIVERY_CHALLAN_NOT_FOUND");
    }
    const row = result.rows[0];
    const canViewAmounts = row.showamounts === true
      && await hasInvoiceFinancialVisibility(request);
    return {
      ...row,
      id: Number(row.id),
      customerid: row.customerid == null ? null : Number(row.customerid),
      invoiceid: row.invoiceid == null ? null : Number(row.invoiceid),
      challandate: toCustomerStatementDate(row.challandate),
      showamounts: canViewAmounts,
      lines: row.lines.map((line: any) => ({
        ...line,
        id: Number(line.id),
        invoicequantity: line.invoicequantity == null ? null : Number(line.invoicequantity),
        deliveryquantity: Number(line.deliveryquantity),
        unitrate: canViewAmounts && line.unitrate != null ? Number(line.unitrate) : null,
        lineamount: canViewAmounts && line.lineamount != null ? Number(line.lineamount) : null,
      })),
    };
  };
}
