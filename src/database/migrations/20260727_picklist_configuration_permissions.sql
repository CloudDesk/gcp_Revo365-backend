UPDATE permissions
SET permissionset = permissionset || jsonb_build_array(
  jsonb_build_object(
    'object', 'Picklist Configuration',
    'objectAPI', 'picklist_configuration',
    'permissions', jsonb_build_object(
      'read', LOWER(role) = 'admin',
      'create', LOWER(role) = 'admin',
      'edit', LOWER(role) = 'admin',
      'delete', LOWER(role) = 'admin'
    )
  )
)
WHERE NOT EXISTS (
  SELECT 1
  FROM jsonb_array_elements(permissions.permissionset) AS permission_item
  WHERE permission_item->>'objectAPI' = 'picklist_configuration'
);
