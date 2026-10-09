import assert from "node:assert/strict";
import Fastify from "fastify";
import formbody from "@fastify/formbody";
import Multer from "fastify-multer";
import fastifyRawBody from "fastify-raw-body";
import Revo365Routes from "../routes/routes.js";
import pool, { query } from "../database/postgres.js";
import {
  connectGetSessionredis,
  redisClient,
} from "../database/redis.session.js";
import { saveSession } from "../services/session.service.js";

type ProductRecord = {
  id: number;
  puc: string;
  productname: string;
  category: string;
  subcategory: string;
  producttype?: string | null;
  buildtype?: string | null;
  fulfillmenttype?: string | null;
  sparetype?: string | null;
};

type PicklistValue = {
  id: number;
  code: string;
  label: string;
  value: string;
  metadata_json?: Record<string, any>;
};

const runId = `codex-api-${Date.now()}`;
const productPrefix = `Codex API Matrix ${runId}`;
const serialPrefix = `CODEX-${Date.now()}`;
const sessionId = `codex-verification-${Date.now()}`;
const writeOutput = console.log.bind(console);
console.log = () => {};

const app = Fastify({ logger: false });
const createdProductIds: number[] = [];
const createdStockIds: number[] = [];
const failures: string[] = [];
const responseContracts = {
  productHasMessage: true,
  productHasRecord: true,
  stockHasMessage: true,
  stockHasRecord: true,
};

const request = async (
  method: "GET" | "POST",
  url: string,
  payload?: Record<string, any>,
) => {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: sessionId },
    ...(payload ? { payload } : {}),
  });
  let body: any;
  try {
    body = response.json();
  } catch {
    body = response.body;
  }
  return { status: response.statusCode, body };
};

const expectSuccess = (
  result: Awaited<ReturnType<typeof request>>,
  context: string,
) => {
  assert.equal(
    result.status,
    200,
    `${context} returned ${result.status}: ${JSON.stringify(result.body)}`,
  );
  return result.body;
};

const getActiveValues = async (definitionCode: string) => {
  const result = await query(
    `SELECT value.id, value.code, value.label, value.value, value.metadata_json
     FROM picklist_values value
     JOIN picklist_definitions definition ON definition.id = value.definition_id
     WHERE definition.code = $1
       AND definition.is_active = TRUE
       AND value.is_active = TRUE
     ORDER BY value.sort_order, value.label`,
    [definitionCode],
  );
  return result.rows as PicklistValue[];
};

const findCreatedProduct = async (productname: string) => {
  const result = await query(
    `SELECT id, puc, productname, category, subcategory, producttype, buildtype,
            fulfillmenttype, sparetype
     FROM product_revo
     WHERE productname = $1
     ORDER BY id DESC
     LIMIT 1`,
    [productname],
  );
  assert.equal(result.rows.length, 1, `Created Product not found: ${productname}`);
  const product = result.rows[0] as ProductRecord;
  assert.ok(product.id, `Created Product has no ID: ${productname}`);
  assert.ok(product.puc, `Created Product has no PUC: ${productname}`);
  createdProductIds.push(Number(product.id));
  return product;
};

const createProduct = async (
  payload: Record<string, any>,
  context: string,
) => {
  const response = expectSuccess(
    await request("POST", "/v2/product", payload),
    context,
  );
  responseContracts.productHasMessage &&= typeof response?.message === "string";
  responseContracts.productHasRecord &&=
    Boolean(response?.record?.id) || Boolean(response?.data?.id);

  const product = await findCreatedProduct(payload.productname);
  const readBody = expectSuccess(
    await request("GET", `/v2/product/${product.id}`),
    `${context} read-back`,
  );
  assert.ok(Array.isArray(readBody), `${context} GET response must be an array`);
  assert.equal(readBody[0]?.id, product.id, `${context} GET returned wrong Product`);
  assert.equal(readBody[0]?.puc, product.puc, `${context} GET returned wrong PUC`);
  return product;
};

const createStock = async (
  product: ProductRecord,
  index: number,
  stockType: string,
) => {
  const taxField = stockType === "rental_product" ? "saccode" : "hsncode";
  const taxValue = stockType === "rental_product" ? "997315" : "84713010";
  const taxResponse = expectSuccess(
    await request("POST", "/v2/product", {
      id: product.id,
      [taxField]: taxValue,
    }),
    `Product tax update ${product.productname}`,
  );
  responseContracts.productHasMessage &&=
    typeof taxResponse?.message === "string";

  const serialnumber = `${serialPrefix}-${String(index).padStart(3, "0")}`;
  const payload = {
    puc: product.puc,
    productname: product.productname,
    category: product.category,
    subcategory: product.subcategory,
    brand: "dell",
    model: `API-${index}`,
    serialnumber,
    stockstatus: "Available",
    stocktype: stockType,
    location: "head_office",
    ecompublish: false,
    ...(stockType === "third_party_product" ? { thirdpartyquantity: 5 } : {}),
  };
  const response = expectSuccess(
    await request("POST", "/v2/stock", payload),
    `Stock create ${product.productname}`,
  );
  responseContracts.stockHasMessage &&= typeof response?.message === "string";
  responseContracts.stockHasRecord &&=
    Boolean(response?.stock?.id) || Boolean(response?.data?.id);

  const persisted = await query(
    `SELECT id, puc, productname, serialnumber, stocktype, stockstatus, rfid
     FROM stock_revo
     WHERE serialnumber = $1`,
    [serialnumber],
  );
  assert.equal(
    persisted.rows.length,
    1,
    `Stock was not persisted for ${product.productname}`,
  );
  const stock = persisted.rows[0];
  createdStockIds.push(Number(stock.id));
  assert.equal(stock.puc, product.puc, "Stock PUC does not match Product PUC");
  assert.match(String(stock.rfid), /^\d{12}$/, "Generated barcode is not 12 digits");

  const readBody = expectSuccess(
    await request("GET", `/v2/stock/${stock.id}`),
    `Stock read-back ${product.productname}`,
  );
  assert.ok(Array.isArray(readBody), "Stock GET response must be an array");
  assert.equal(readBody[0]?.id, stock.id, "Stock GET returned wrong Stock");
  assert.equal(readBody[0]?.productid, product.id, "Stock GET Product join is wrong");
  assert.equal(
    readBody[0]?.[taxField],
    taxValue,
    `Stock GET did not expose Product ${taxField}`,
  );

  const quantityResult = await query(
    `SELECT quantity, oncatalogueqty, offcatalogueqty, rentaltotalquantity,
            rentalavailablequantity
     FROM product_revo
     WHERE id = $1`,
    [product.id],
  );
  const quantities = quantityResult.rows[0];
  if (stockType === "third_party_product") {
    assert.equal(quantities.quantity, 5, "Third-party quantity was not aggregated");
  } else {
    assert.equal(quantities.quantity, 1, "Physical Stock quantity was not aggregated");
  }
  if (stockType === "on_catalogue_product") {
    assert.equal(quantities.oncatalogueqty, 1, "On-catalogue quantity is wrong");
  }
  if (stockType === "off_catalogue_product") {
    assert.equal(quantities.offcatalogueqty, 1, "Off-catalogue quantity is wrong");
  }
  if (stockType === "rental_product") {
    assert.equal(quantities.rentaltotalquantity, 1, "Rental total is wrong");
    assert.equal(quantities.rentalavailablequantity, 1, "Rental available is wrong");
  }

  const listBody = expectSuccess(
    await request(
      "GET",
      `/v2/stock?serialnumber=${encodeURIComponent(serialnumber)}&count=10`,
    ),
    `Stock filtered list ${product.productname}`,
  );
  assert.ok(Array.isArray(listBody), "Stock list response must be an array");
  assert.equal(listBody.length, 1, "Filtered Stock list returned unexpected rows");
  assert.equal(listBody[0]?.id, stock.id, "Filtered Stock list returned wrong row");
};

const cleanup = async () => {
  await query("BEGIN");
  try {
    await query(`DELETE FROM stock_revo WHERE serialnumber LIKE $1`, [
      `${serialPrefix}%`,
    ]);
    await query(
      `DELETE FROM product_bom_lines
       WHERE product_bom_id IN (
         SELECT bom.id
         FROM product_boms bom
         JOIN product_revo product ON product.id = bom.product_id
         WHERE product.productname LIKE $1
       )`,
      [`${productPrefix}%`],
    );
    await query(
      `DELETE FROM product_boms
       WHERE product_id IN (
         SELECT id FROM product_revo WHERE productname LIKE $1
       )`,
      [`${productPrefix}%`],
    );
    await query(`DELETE FROM product_revo WHERE productname LIKE $1`, [
      `${productPrefix}%`,
    ]);
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
};

const main = async () => {
  const categories = await getActiveValues("product_revo_category");
  const roles = await getActiveValues("product_revo_component_role");
  const stockTypesResult = await query(
    `SELECT DISTINCT stocktype
     FROM stock_revo
     WHERE stocktype IS NOT NULL
     ORDER BY stocktype`,
  );
  const stockTypes = stockTypesResult.rows.map((row: any) => row.stocktype);
  const supplierResult = await query(
    `SELECT id FROM supplier
     WHERE (isdeleted = FALSE OR isdeleted IS NULL)
     ORDER BY id
     LIMIT 1`,
  );
  const supplierId = supplierResult.rows[0]?.id;

  assert.deepEqual(
    categories.map((value) => value.code),
    ["new", "refurbished"],
    "Unexpected active Product conditions",
  );
  assert.equal(roles.length, 17, "Expected 17 active component roles");
  assert.ok(supplierId, "No active Supplier available for Product payloads");
  assert.deepEqual(
    stockTypes,
    [
      "off_catalogue_product",
      "on_catalogue_product",
      "rental_product",
      "third_party_product",
    ],
    "Unexpected live Stock types",
  );

  await app.register(formbody);
  await app.register(fastifyRawBody, {
    global: false,
    field: "rawBody",
    encoding: "utf8",
    runFirst: true,
  });
  await app.register(Multer.contentParser);
  await app.register(Revo365Routes, { fastifyInstance: app });
  await app.ready();
  await connectGetSessionredis();

  const unauthorized = await app.inject({ method: "GET", url: "/v2/product" });
  assert.equal(unauthorized.statusCode, 401, "Product API accepted no session");
  await saveSession(sessionId, {
    id: 1,
    email: "codex-api-verification@local",
    role: "verification",
  });

  const spareProductsByRole = new Map<string, ProductRecord>();
  let caseIndex = 0;

  for (const category of categories) {
    for (const role of roles) {
      caseIndex += 1;
      const product = await createProduct(
        {
          productname: `${productPrefix} Spare ${category.code} ${role.code}`,
          category: category.code,
          subcategory: "spares",
          sparetype: role.code,
          brand: "dell",
          model: `${role.code}-${category.code}`,
          warranty: "1_year",
          price: 1000 + caseIndex,
          supplierid: supplierId,
          hsncode: "84713010",
          saccode: "997315",
          formfactor: "API verification",
          compatibility: "Computer component verification",
          ecomvisible: false,
        },
        `Spare ${category.code}/${role.code}`,
      );
      if (category.code === "new") spareProductsByRole.set(role.code, product);
      await createStock(
        product,
        caseIndex,
        stockTypes[(caseIndex - 1) % stockTypes.length],
      );

      const options = expectSuccess(
        await request(
          "GET",
          `/v2/product/component-options?component_role=${encodeURIComponent(
            role.code,
          )}&search=${encodeURIComponent(product.productname)}`,
        ),
        `Component lookup ${role.code}`,
      );
      assert.ok(Array.isArray(options), "Component options response must be an array");
      assert.equal(options[0]?.id, product.id, `Component lookup missed ${role.code}`);
      assert.equal(
        options[0]?.role_match_rank,
        0,
        `Component lookup did not rank ${role.code} as an exact match`,
      );
    }
  }

  const packageTypes = ["computer_full_set", "single_computer"];
  const buildFulfilments = [
    ["oem_prebuilt", "prepacked"],
    ["oem_prebuilt", "virtual_kit"],
    ["custom_assembled", "assemble_to_stock"],
    ["custom_assembled", "assemble_to_order"],
  ];

  for (const category of categories) {
    for (const packageType of packageTypes) {
      for (const [buildType, fulfillmentType] of buildFulfilments) {
        caseIndex += 1;
        const requiredRoles = roles.filter((role) =>
          (role.metadata_json?.requiredWhen || []).some(
            (rule: any) =>
              (!rule.packageType || rule.packageType === packageType) &&
              (!rule.buildType || rule.buildType === buildType),
          ),
        );
        const bomcomponents = requiredRoles.map((role, index) => {
          const component = spareProductsByRole.get(role.code);
          assert.ok(component, `No Spare Product exists for role ${role.code}`);
          return {
            component_role_value_id: role.id,
            component_role_code: role.code,
            component_label: role.label,
            component_product_id: component.id,
            component_product_name: component.productname,
            component_product_puc: component.puc,
            component_product_brand: "dell",
            component_price: 1000,
            quantity:
              role.code === "monitor" && packageType === "computer_full_set"
                ? 2
                : 1,
            is_required: true,
            is_customer_selected: buildType === "custom_assembled",
            sort_order: index * 10,
          };
        });
        const product = await createProduct(
          {
            productname: `${productPrefix} Computer ${category.code} ${packageType} ${buildType} ${fulfillmentType}`,
            category: category.code,
            subcategory: "computer",
            producttype: packageType,
            buildtype: buildType,
            fulfillmenttype: fulfillmentType,
            brand: "dell",
            model: `${packageType}-${buildType}-${fulfillmentType}`,
            warranty: "1_year",
            price: 50000 + caseIndex,
            supplierid: supplierId,
            hsncode: "84713010",
            saccode: "997315",
            processor: "API verification processor",
            ram: "16 GB",
            storagetype: "ssd",
            storagecapacity: "512 GB",
            operatingsystem: "windows",
            ecomvisible: false,
            bomcomponents,
            configurationmetadata: {
              verificationRun: runId,
              expectedRequiredRoles: requiredRoles.map((role) => role.code),
            },
          },
          `Computer ${category.code}/${packageType}/${buildType}/${fulfillmentType}`,
        );
        await createStock(
          product,
          caseIndex,
          stockTypes[(caseIndex - 1) % stockTypes.length],
        );

        const bom = expectSuccess(
          await request("GET", `/v2/product/${product.id}/bom`),
          `BOM read-back ${product.productname}`,
        );
        assert.equal(bom?.product_id, product.id, "BOM belongs to wrong Product");
        assert.equal(bom?.package_type, packageType, "BOM package type mismatch");
        assert.equal(bom?.build_type, buildType, "BOM build type mismatch");
        assert.equal(
          bom?.fulfillment_type,
          fulfillmentType,
          "BOM fulfillment type mismatch",
        );
        assert.equal(
          bom?.components?.length,
          requiredRoles.length,
          "BOM component count mismatch",
        );
        for (const line of bom.components || []) {
          assert.ok(line.component_product_id, "BOM line lost component Product ID");
          assert.ok(line.component_product_puc, "BOM line lost component Product PUC");
        }
      }
    }
  }

  const remainingProducts = await query(
    `SELECT COUNT(*)::int AS count
     FROM product_revo
     WHERE productname LIKE $1`,
    [`${productPrefix}%`],
  );
  const remainingStocks = await query(
    `SELECT COUNT(*)::int AS count
     FROM stock_revo
     WHERE serialnumber LIKE $1`,
    [`${serialPrefix}%`],
  );

  assert.equal(
    remainingProducts.rows[0].count,
    50,
    "Expected 50 Product matrix records before cleanup",
  );
  assert.equal(
    remainingStocks.rows[0].count,
    50,
    "Expected 50 Stock matrix records before cleanup",
  );

  return {
    runId,
    products: createdProductIds.length,
    stocks: createdStockIds.length,
    spareCases: categories.length * roles.length,
    computerCases:
      categories.length * packageTypes.length * buildFulfilments.length,
    stockTypes,
    responseContracts,
    failures,
  };
};

try {
  const summary = await main();
  writeOutput(`PRODUCT_STOCK_API_MATRIX=${JSON.stringify(summary)}`);
} catch (error: any) {
  failures.push(error?.stack || error?.message || String(error));
  console.error(`PRODUCT_STOCK_API_MATRIX_FAILED=${JSON.stringify({ failures })}`);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error("Verification cleanup failed", error);
    process.exitCode = 1;
  }
  if (redisClient?.isOpen) {
    await redisClient.del(sessionId);
    await redisClient.quit();
  }
  await app.close();
  await pool.end();
}
