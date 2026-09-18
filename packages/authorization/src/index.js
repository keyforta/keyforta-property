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

export const platformAdminCapabilities = Object.freeze([
  'review_onboarding_applications', 'decide_onboarding_applications', 'platform_operations_with_audit'
]);

export const propertyManagerCapabilities = Object.freeze(['manage_assigned_portfolio_records']);

export const maintenanceOperatorCapabilities = Object.freeze(['manage_own_profile_and_assigned_jobs']);

export const tenantCapabilities = Object.freeze(['manage_own_related_records']);

// Roles that are not scoped to a single organization membership. Platform
// administrators act across organizations by design (see ADR-002); every
// other role must resolve to a matching organization before an action is
// evaluated.
export const crossOrganizationRoles = Object.freeze(['platform_admin']);

export const roleCapabilities = Object.freeze({
  landlord: landlordCapabilities,
  maintenance_operator: maintenanceOperatorCapabilities,
  platform_admin: platformAdminCapabilities,
  property_manager: propertyManagerCapabilities,
  tenant: tenantCapabilities
});

/**
 * @typedef {object} AuthorizationRequest
 * @property {{ objectId: string }} identity - The authenticated caller. Must
 *   come from a verified credential, never a client-supplied value.
 * @property {string} role - The caller's role, resolved from a trusted
 *   membership record, never from client input.
 * @property {string} action - The capability the caller is attempting.
 * @property {{ actorOrganizationId?: string, resourceOrganizationId?: string }} [organization]
 *   - Organization context. Required for every role except the
 *   cross-organization roles above. Both IDs must originate from resolved,
 *   trusted state (membership lookup and resource lookup), never from
 *   unauthenticated client input.
 * @property {{ required: boolean, granted: boolean }} [relationship] - An
 *   additional relationship check (for example, a manager's active property
 *   assignment) beyond organization membership.
 * @property {{ now?: Date, from?: Date, to?: Date | null }} [effectiveTime]
 *   - The membership's effective time window. When present, `now` must fall
 *   within `[from, to)`.
 */

/**
 * Evaluate every authorization dimension declared in ADR-002 and return a
 * decision with a machine-readable reason. This function performs no I/O:
 * callers must resolve identity, role, organization membership, relationship,
 * and effective-time state from trusted sources (typically the database)
 * before calling it.
 *
 * @param {AuthorizationRequest} request
 * @returns {{ allowed: boolean, reason: string }}
 */
export function authorize(request) {
  const { action, effectiveTime, identity, organization, relationship, role } = request ?? {};

  if (!identity?.objectId?.trim()) {
    return { allowed: false, reason: 'missing_identity' };
  }

  if (!role || !roleCapabilities[role]) {
    return { allowed: false, reason: 'unknown_role' };
  }

  if (!action || !roleCapabilities[role].includes(action)) {
    return { allowed: false, reason: 'action_not_permitted' };
  }

  if (!crossOrganizationRoles.includes(role)) {
    const actorOrganizationId = organization?.actorOrganizationId;
    const resourceOrganizationId = organization?.resourceOrganizationId;
    if (!actorOrganizationId || !resourceOrganizationId) {
      return { allowed: false, reason: 'missing_organization_context' };
    }
    if (actorOrganizationId !== resourceOrganizationId) {
      return { allowed: false, reason: 'cross_organization_denied' };
    }
  }

  if (relationship?.required && !relationship.granted) {
    return { allowed: false, reason: 'relationship_not_granted' };
  }

  if (effectiveTime) {
    const now = effectiveTime.now ?? new Date();
    if (effectiveTime.from && now < effectiveTime.from) {
      return { allowed: false, reason: 'not_yet_effective' };
    }
    if (effectiveTime.to && now >= effectiveTime.to) {
      return { allowed: false, reason: 'membership_expired' };
    }
  }

  return { allowed: true, reason: 'granted' };
}

/**
 * Convenience wrapper over {@link authorize} returning only the boolean
 * decision. Prefer {@link authorize} when a denial reason is needed for
 * logging or tests.
 *
 * @param {AuthorizationRequest} request
 * @returns {boolean}
 */
export const canAccess = (request) => authorize(request).allowed;
