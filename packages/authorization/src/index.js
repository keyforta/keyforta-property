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

// Roles that are not scoped to a single organization membership or a single
// resource. Platform administrators act across organizations by design (see
// ADR-002); every other role must resolve a matching, trusted resource and
// organization before an action is evaluated.
export const crossOrganizationRoles = Object.freeze(['platform_admin']);

/**
 * Policy metadata for every capability, keyed by role then action. This is
 * the single source of truth for which dimensions a given action requires,
 * so those requirements cannot be bypassed by a caller simply omitting the
 * corresponding request field (every dimension check below fails closed when
 * its required context is absent).
 *
 * - `scope: 'platform'` — no resource/organization context required (only
 *   `crossOrganizationRoles` may declare this).
 * - `scope: 'organization'` — the resource must belong to the actor's
 *   organization.
 * - `requiresRelationship` — an additional trusted relationship fact (for
 *   example, an active manager-property assignment) must be supplied and
 *   granted; omitting the `relationship` field denies the request, it does
 *   not skip the check.
 * - `requiresEffectiveTime` — a trusted effective-dating window must be
 *   supplied; omitting the `effectiveTime` field denies the request, it does
 *   not skip the check.
 */
const capabilityPolicies = Object.freeze({
  landlord: Object.freeze(Object.fromEntries(landlordCapabilities.map((action) => [
    action,
    Object.freeze({ requiresEffectiveTime: true, requiresRelationship: false, scope: 'organization' }),
  ]))),
  maintenance_operator: Object.freeze(Object.fromEntries(maintenanceOperatorCapabilities.map((action) => [
    action,
    Object.freeze({ requiresEffectiveTime: true, requiresRelationship: true, scope: 'organization' }),
  ]))),
  platform_admin: Object.freeze(Object.fromEntries(platformAdminCapabilities.map((action) => [
    action,
    Object.freeze({ requiresEffectiveTime: false, requiresRelationship: false, scope: 'platform' }),
  ]))),
  property_manager: Object.freeze(Object.fromEntries(propertyManagerCapabilities.map((action) => [
    action,
    Object.freeze({ requiresEffectiveTime: true, requiresRelationship: true, scope: 'organization' }),
  ]))),
  tenant: Object.freeze(Object.fromEntries(tenantCapabilities.map((action) => [
    action,
    Object.freeze({ requiresEffectiveTime: true, requiresRelationship: false, scope: 'organization' }),
  ]))),
});

export const roleCapabilities = Object.freeze({
  landlord: landlordCapabilities,
  maintenance_operator: maintenanceOperatorCapabilities,
  platform_admin: platformAdminCapabilities,
  property_manager: propertyManagerCapabilities,
  tenant: tenantCapabilities
});

function policyFor(role, action) {
  if (!Object.prototype.hasOwnProperty.call(capabilityPolicies, role)) return undefined;
  const rolePolicies = capabilityPolicies[role];
  if (!Object.prototype.hasOwnProperty.call(rolePolicies, action)) return undefined;
  return rolePolicies[action];
}

/**
 * @typedef {object} AuthorizationRequest
 * @property {{ objectId: string }} identity - The authenticated caller. Must
 *   come from a verified credential, never a client-supplied value.
 * @property {string} role - The caller's role, resolved from a trusted
 *   membership record, never from client input.
 * @property {string} action - The capability the caller is attempting.
 * @property {{ organizationId?: string }} [actor] - The actor's own
 *   organization, resolved from a trusted membership lookup. Required for
 *   every role except the cross-organization roles above.
 * @property {{ organizationId?: string }} [resource] - The target resource's
 *   organization, resolved from a trusted resource lookup (never a
 *   client-supplied organization ID). Required for every role except the
 *   cross-organization roles above.
 * @property {{ granted: boolean }} [relationship] - An additional trusted
 *   relationship fact (for example, a manager's active property
 *   assignment). Required whenever the capability policy declares
 *   `requiresRelationship`; omitting it denies the request.
 * @property {{ now?: Date, from?: Date, to?: Date | null }} [effectiveTime]
 *   - The membership's effective time window. Required whenever the
 *   capability policy declares `requiresEffectiveTime`; omitting it denies
 *   the request. When present, `now` must fall within `[from, to)`.
 */

/**
 * Evaluate every authorization dimension declared in ADR-002 and return a
 * decision with a machine-readable reason. This function performs no I/O:
 * callers must resolve identity, role, organization membership, resource,
 * relationship, and effective-time state from trusted sources (typically the
 * database) before calling it. Every dimension a capability's policy
 * declares as required fails closed when its context is missing — a caller
 * cannot bypass a check by simply omitting the corresponding field.
 *
 * @param {AuthorizationRequest} request
 * @returns {{ allowed: boolean, reason: string }}
 */
export function authorize(request) {
  const { action, actor, effectiveTime, identity, relationship, resource, role } = request ?? {};

  if (!identity?.objectId?.trim()) {
    return { allowed: false, reason: 'missing_identity' };
  }

  const policy = role === undefined ? undefined : policyFor(role, action);
  if (!policy) {
    return { allowed: false, reason: !role || !Object.prototype.hasOwnProperty.call(capabilityPolicies, role)
      ? 'unknown_role'
      : 'action_not_permitted' };
  }

  if (policy.scope === 'organization') {
    const actorOrganizationId = actor?.organizationId;
    const resourceOrganizationId = resource?.organizationId;
    if (!actorOrganizationId || !resourceOrganizationId) {
      return { allowed: false, reason: 'missing_organization_context' };
    }
    if (actorOrganizationId !== resourceOrganizationId) {
      return { allowed: false, reason: 'cross_organization_denied' };
    }
  }

  if (policy.requiresRelationship) {
    if (!relationship || relationship.granted !== true) {
      return { allowed: false, reason: 'relationship_not_granted' };
    }
  }

  if (policy.requiresEffectiveTime) {
    if (!effectiveTime) {
      return { allowed: false, reason: 'missing_effective_time' };
    }
    const now = effectiveTime.now ?? new Date();
    if (!effectiveTime.from || now < effectiveTime.from) {
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
