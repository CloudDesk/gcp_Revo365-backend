UPDATE permissions
SET permissionset = permissionset || jsonb_build_array(
  jsonb_build_object(
    'object', 'Buyback Enquiries',
    'objectAPI', 'buyback_enquiries',
    'permissions', jsonb_build_object(
      'read', role = 'admin',
      'create', false,
      'edit', role = 'admin',
      'delete', false
    )
  )
)
WHERE NOT EXISTS (
  SELECT 1
  FROM jsonb_array_elements(permissions.permissionset) AS permission_item
  WHERE permission_item->>'objectAPI' = 'buyback_enquiries'
);
