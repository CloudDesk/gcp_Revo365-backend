import assert from "node:assert/strict";
import test from "node:test";
import { getDeliveryChallanDocumentHtml } from "../utils/finance/deliveryChallanDocumentTemplate.js";

const baseDocument = {
  challannumber: "DC-00000042",
  challanmode: "invoice" as const,
  challandate: "2026-08-12",
  invoicenumber: "INV-42",
  purpose: "Customer delivery",
  recipientname: "Example & Customer",
  recipientphone: "9876543210",
  recipientemail: "recipient@example.com",
  recipientaddress: "1 <Main> Street",
  billingaddress: "Billing Street",
  showamounts: false,
  lines: [{ productname: "Laptop <Pro>", deliveryquantity: 1, unit: "Nos", hsnsaccode: "8471", taxableamount: 100, gstrate: 18, gstamount: 18, totalamount: 118 }],
};

test("Delivery Challan PDF omits monetary columns when amounts are disabled", () => {
  const html = getDeliveryChallanDocumentHtml(baseDocument);
  assert.doesNotMatch(html, />Taxable</);
  assert.doesNotMatch(html, />GST</);
  assert.match(html, /Example &amp; Customer/);
  assert.match(html, /recipient@example\.com/);
  assert.match(html, /Billing Street/);
  assert.match(html, /Laptop &lt;Pro&gt;/);
  assert.match(html, /Delivery Qty/);
  assert.doesNotMatch(html, /Invoice Qty/);
  assert.match(html, /Recipient's Signature/);
});

test("Delivery Challan PDF includes taxable, GST, and total snapshots", () => {
  const html = getDeliveryChallanDocumentHtml({ ...baseDocument, showamounts: true });
  assert.match(html, />Taxable</);
  assert.match(html, />GST</);
  assert.match(html, />Total</);
  assert.match(html, /₹118\.00/);
  assert.match(html, /8471/);
});

test("Delivery Challan PDF wraps and safely escapes address components", () => {
  const html = getDeliveryChallanDocumentHtml({
    ...baseDocument,
    billingaddress: "12 Main Road, Chennai, Tamil Nadu 600001",
    recipientaddress: "Floor <2>\nTech Park, Chennai",
  });
  assert.match(html, /12 Main Road,<br>Chennai,<br>Tamil Nadu 600001/);
  assert.match(html, /Floor &lt;2&gt;,<br>Tech Park,<br>Chennai/);
  assert.match(html, /overflow-wrap:anywhere/);
});
