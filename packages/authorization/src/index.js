export const accessScopes = {
  tenant: 'own_related_records',
  landlord: 'owned_property_records',
  property_manager: 'assigned_portfolio_records',
  maintenance_operator: 'own_profile_and_assigned_jobs',
  platform_admin: 'platform_operations_with_audit'
};

export const authorizationDimensions = Object.freeze(['identity', 'organization', 'role', 'relationship', 'resource', 'action', 'effectiveTime']);

export const landlordCapabilities = Object.freeze([
  'create_organization', 'manage_owned_properties', 'manage_owned_units', 'review_related_applications',
  'invite_property_manager', 'review_owned_leases', 'review_owned_financials', 'manage_owned_maintenance',
  'manage_owned_documents', 'review_related_messages'
]);

export const canAccess = (role, resource, action) => Boolean(role && resource && action && accessScopes[role]);
