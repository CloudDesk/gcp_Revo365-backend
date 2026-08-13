import assert from "node:assert/strict";
import test from "node:test";
import { getDeliveryChallanDocumentHtml } from "../utils/finance/deliveryChallanDocumentTemplate.js";

const baseDocument = {
  challannumber: "DC-00000042",
  challanmode: "invoice" as const,
  challandate: "2026-08-12",
  invoicenumber: "INV-42",
  recipientname: "Example & Customer",
  recipientphone: "9876543210",
  recipientaddress: "1 <Main> Street",
  showamounts: false,
  lines: [{ productname: "Laptop <Pro>", invoicequantity: 2, deliveryquantity: 1, unit: "Nos", unitrate: 100, lineamount: 100 }],
};

test("Delivery Challan PDF omits monetary columns when Show Amounts is disabled", () => {
  const html = getDeliveryChallanDocumentHtml(baseDocument);
  assert.doesNotMatch(html, />Rate</);
  assert.doesNotMatch(html, />Amount</);
  assert.doesNotMatch(html, /₹100\.00/);
  assert.match(html, /Example &amp; Customer/);
  assert.match(html, /9876543210<\/div><div class="recipient-address">1 &lt;Main&gt; Street/);
  assert.match(html, />S\.No<\/th>/);
  assert.match(html, /Laptop &lt;Pro&gt;/);
});

test("Delivery Challan PDF includes immutable monetary snapshots when enabled", () => {
  const html = getDeliveryChallanDocumentHtml({ ...baseDocument, showamounts: true });
  assert.match(html, />Rate</);
  assert.match(html, />Amount</);
  assert.match(html, /₹100\.00/);
});
