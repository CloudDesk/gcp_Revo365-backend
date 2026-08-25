import pool, { query } from "../database/postgres.js";

const main = async () => {
  const mapping = await query(`
    SELECT
      COUNT(*) FILTER (WHERE a.documenttype = 'purchase_bill')::int AS supplier_allocations,
      COUNT(*) FILTER (WHERE a.documenttype = 'purchase_bill' AND pb.id IS NOT NULL)::int AS matched_supplier_bills,
      COUNT(*) FILTER (WHERE a.documenttype = 'purchase_bill' AND pb.id IS NULL)::int AS missing_supplier_bills,
      COUNT(*) FILTER (
        WHERE a.documenttype = 'purchase_bill' AND pb.id IS NOT NULL
          AND COALESCE(a.documentnumber, '') <> COALESCE(pb.invoicenumber, '')
      )::int AS supplier_number_mismatches,
      COUNT(*) FILTER (
        WHERE a.documenttype = 'purchase_bill'
          AND NULLIF(BTRIM(COALESCE(pb.invoiceurl, '')), '') IS NOT NULL
      )::int AS supplier_files_available,
      COUNT(*) FILTER (WHERE a.documenttype = 'sales_invoice')::int AS customer_allocations,
      COUNT(*) FILTER (WHERE a.documenttype = 'sales_invoice' AND si.id IS NOT NULL)::int AS matched_sales_invoices,
      COUNT(*) FILTER (WHERE a.documenttype = 'sales_invoice' AND si.id IS NULL)::int AS missing_sales_invoices,
      COUNT(*) FILTER (
        WHERE a.documenttype = 'sales_invoice' AND si.id IS NOT NULL
          AND COALESCE(a.documentnumber, '') <> COALESCE(si.invoicenumber, '')
      )::int AS sales_number_mismatches,
      COUNT(*) FILTER (
        WHERE a.documenttype = 'sales_invoice'
          AND NULLIF(BTRIM(COALESCE(si.invoiceurl, '')), '') IS NOT NULL
      )::int AS sales_files_available
    FROM bank_transaction_allocations a
    JOIN bank_transactions t ON t.id = a.banktransactionid
    LEFT JOIN poinvoice pb
      ON a.documenttype = 'purchase_bill' AND pb.id = a.documentid
    LEFT JOIN revoinvoice si
      ON a.documenttype = 'sales_invoice' AND si.id = a.documentid
    WHERE t.postingstatus = 'posted'
      AND a.status = 'applied'
      AND a.tdsapplied = TRUE
      AND a.tdsamount > 0
  `);

  const repeatedNumbers = await query(`
    SELECT documenttype,
           COUNT(*)::int AS repeated_number_groups,
           COALESCE(SUM((distinct_ids > 1)::int), 0)::int AS groups_with_multiple_document_ids
    FROM (
      SELECT a.documenttype, a.documentnumber,
             COUNT(DISTINCT a.documentid) AS distinct_ids
      FROM bank_transaction_allocations a
      JOIN bank_transactions t ON t.id = a.banktransactionid
      WHERE t.postingstatus = 'posted'
        AND a.status = 'applied'
        AND a.tdsapplied = TRUE
        AND a.tdsamount > 0
      GROUP BY a.documenttype, a.documentnumber
      HAVING COUNT(*) > 1
    ) repeated
    GROUP BY documenttype
    ORDER BY documenttype
  `);

  const result = mapping.rows[0];
  const failures =
    Number(result.missing_supplier_bills) +
    Number(result.supplier_number_mismatches) +
    Number(result.missing_sales_invoices) +
    Number(result.sales_number_mismatches);

  console.log(JSON.stringify({ mapping: result, repeatedNumbers: repeatedNumbers.rows }, null, 2));
  if (failures > 0) throw new Error(`TDS document-link audit found ${failures} mapping error(s).`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
