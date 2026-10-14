-- Display the core automatic control accounts in the normal Chart of Accounts
-- list while keeping them protected as system-managed accounts.

INSERT INTO finance_account_types (
    typecode,
    typename,
    accountcategory,
    categorylabel,
    displayorder,
    status,
    isconfigurable
)
VALUES
    ('accounts_receivable', 'Accounts Receivable', 'asset', 'Assets', 21, 'active', FALSE),
    ('gst_input_cgst', 'Input CGST', 'asset', 'Assets', 210, 'active', FALSE),
    ('gst_input_sgst', 'Input SGST', 'asset', 'Assets', 211, 'active', FALSE),
    ('gst_input_igst', 'Input IGST', 'asset', 'Assets', 212, 'active', FALSE),
    ('accounts_payable', 'Accounts Payable', 'liability', 'Liability', 81, 'active', FALSE),
    ('gst_output_cgst', 'Output CGST', 'liability', 'Liability', 213, 'active', FALSE),
    ('gst_output_sgst', 'Output SGST', 'liability', 'Liability', 214, 'active', FALSE),
    ('gst_output_igst', 'Output IGST', 'liability', 'Liability', 215, 'active', FALSE)
ON CONFLICT (typecode) DO UPDATE SET
    typename = EXCLUDED.typename,
    accountcategory = EXCLUDED.accountcategory,
    categorylabel = EXCLUDED.categorylabel,
    displayorder = EXCLUDED.displayorder,
    status = EXCLUDED.status,
    isconfigurable = EXCLUDED.isconfigurable,
    modifieddate = EXTRACT(EPOCH FROM NOW())::BIGINT;

INSERT INTO finance_accounts (
    organizationid,
    accountcode,
    accountname,
    accounttype,
    accountsubtype,
    currencycode,
    issystem,
    status,
    createdby,
    modifiedby
)
SELECT
    organizations.organizationid,
    defaults.accountcode,
    defaults.accountname,
    defaults.accounttype,
    defaults.accountsubtype,
    'INR',
    TRUE,
    'active',
    'migration',
    'migration'
FROM (SELECT DISTINCT organizationid FROM finance_accounts) organizations
CROSS JOIN (VALUES
    ('SYS-AR', 'Accounts Receivable', 'asset', 'accounts_receivable'),
    ('SYS-AP', 'Accounts Payable', 'liability', 'accounts_payable'),
    ('SYS-CGST-OUTPUT', 'Output CGST', 'liability', 'gst_output_cgst'),
    ('SYS-SGST-OUTPUT', 'Output SGST', 'liability', 'gst_output_sgst'),
    ('SYS-IGST-OUTPUT', 'Output IGST', 'liability', 'gst_output_igst'),
    ('SYS-CGST-INPUT', 'Input CGST', 'asset', 'gst_input_cgst'),
    ('SYS-SGST-INPUT', 'Input SGST', 'asset', 'gst_input_sgst'),
    ('SYS-IGST-INPUT', 'Input IGST', 'asset', 'gst_input_igst')
) AS defaults(accountcode, accountname, accounttype, accountsubtype)
ON CONFLICT DO NOTHING;

INSERT INTO finance_schema_versions (version, description)
VALUES (
    '20261013_chart_accounts_list_system_defaults',
    'List AR, AP and six component-specific GST controls as protected automatic Chart of Accounts records'
)
ON CONFLICT (version) DO NOTHING;
