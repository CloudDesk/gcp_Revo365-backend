-- Vendor role and business-customer assignment scope.
-- Idempotent: safe to run on every deploy.

CREATE TABLE IF NOT EXISTS business_customer_vendor_assignments (
    id SERIAL PRIMARY KEY,
    vendoruserid INTEGER NOT NULL,
    customerid INTEGER NOT NULL,
    isactive BOOLEAN DEFAULT TRUE,
    assignedby INTEGER,
    createddate BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    modifieddate BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bcva_vendor_customer
    ON business_customer_vendor_assignments(vendoruserid, customerid);

CREATE INDEX IF NOT EXISTS idx_bcva_vendor_active
    ON business_customer_vendor_assignments(vendoruserid, isactive);

CREATE INDEX IF NOT EXISTS idx_bcva_customer_active
    ON business_customer_vendor_assignments(customerid, isactive);

INSERT INTO picklist (
    label,
    value,
    object,
    controlledvalue,
    fieldname,
    controlledlabel,
    controlledfieldname,
    parent
)
SELECT
    'Vendor',
    'vendor',
    'inventoryusers',
    NULL,
    'role',
    NULL,
    NULL,
    NULL
WHERE NOT EXISTS (
    SELECT 1
    FROM picklist
    WHERE object = 'inventoryusers'
      AND fieldname = 'role'
      AND LOWER(value) = 'vendor'
);

INSERT INTO permissions (permissionname, role, permissionset)
SELECT
    'Vendor',
    'vendor',
    '[
      {
        "object": "Home",
        "objectAPI": "home",
        "permissions": { "read": true, "create": false, "edit": false, "delete": false }
      },
      {
        "object": "Business Customers",
        "objectAPI": "users",
        "permissions": { "read": true, "create": false, "edit": false, "delete": false },
        "scope": {
          "moduleLabel": "Business Customers",
          "customerType": "business",
          "assignment": "assigned_to_me",
          "allowedPaths": ["/customer"],
          "menuLabels": { "/customer": "Business Customers" },
          "relatedModules": [
            "detail",
            "rental_products",
            "rental_agreements",
            "rental_service_requests",
            "rental_invoices",
            "purchases"
          ],
          "forceBusinessCustomerFilter": true
        }
      },
      {
        "object": "Rental Service Requests",
        "objectAPI": "tickets",
        "permissions": { "read": true, "create": true, "edit": true, "delete": false },
        "scope": {
          "moduleLabel": "Rental Service Requests",
          "customerType": "business",
          "assignment": "assigned_to_me",
          "ticketType": "rental_only",
          "allowedPaths": ["/service-request"],
          "menuLabels": { "/service-request": "Rental Service Requests" },
          "forceRentalTicketType": true
        }
      },
      {
        "object": "Revo Invoice",
        "objectAPI": "revoinvoice",
        "permissions": { "read": true, "create": false, "edit": false, "delete": false },
        "scope": {
          "assignment": "assigned_to_me",
          "customerType": "business",
          "invoiceFor": ["rental", "service"],
          "allowedPaths": []
        }
      },
      {
        "object": "Rental Agreements",
        "objectAPI": "rental_agreement",
        "permissions": { "read": true, "create": true, "edit": false, "delete": false },
        "scope": {
          "assignment": "assigned_to_me",
          "customerType": "business",
          "allowedPaths": []
        }
      },
      {
        "object": "Orders",
        "objectAPI": "orders",
        "permissions": { "read": true, "create": false, "edit": false, "delete": false },
        "scope": {
          "assignment": "assigned_to_me",
          "customerType": "business",
          "allowedPaths": []
        }
      }
    ]'::jsonb
WHERE NOT EXISTS (
    SELECT 1
    FROM permissions
    WHERE LOWER(role) = 'vendor'
);
