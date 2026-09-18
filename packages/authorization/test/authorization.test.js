import assert from 'node:assert/strict';
import test from 'node:test';

import { authorize, canAccess, crossOrganizationRoles, roleCapabilities } from '../src/index.js';

const identity = Object.freeze({ objectId: '00000000-0000-4000-8000-000000000001' });
const organizationA = '00000000-0000-4000-8000-0000000000a1';
const organizationB = '00000000-0000-4000-8000-0000000000b2';
const activeWindow = Object.freeze({
  from: new Date('2020-01-01T00:00:00.000Z'),
  now: new Date('2025-01-01T00:00:00.000Z'),
  to: new Date('2030-01-01T00:00:00.000Z'),
});

test('denies a request with no identity', () => {
  const result = authorize({
    action: 'manage_owned_properties',
    actor: { organizationId: organizationA },
    effectiveTime: activeWindow,
    identity: { objectId: '' },
    resource: { organizationId: organizationA },
    role: 'landlord',
  });
  assert.deepEqual(result, { allowed: false, reason: 'missing_identity' });
});

test('denies an unknown role', () => {
  const result = authorize({
    action: 'manage_owned_properties',
    identity,
    role: 'guest',
  });
  assert.deepEqual(result, { allowed: false, reason: 'unknown_role' });
});

test('denies inherited object properties used as a role, failing closed instead of throwing', () => {
  assert.deepEqual(
    authorize({ action: 'manage_owned_properties', identity, role: '__proto__' }),
    { allowed: false, reason: 'unknown_role' },
  );
  assert.deepEqual(
    authorize({ action: 'manage_owned_properties', identity, role: 'toString' }),
    { allowed: false, reason: 'unknown_role' },
  );
});

test('denies inherited object properties used as an action, failing closed instead of throwing', () => {
  const result = authorize({
    action: 'toString',
    actor: { organizationId: organizationA },
    effectiveTime: activeWindow,
    identity,
    resource: { organizationId: organizationA },
    role: 'landlord',
  });
  assert.deepEqual(result, { allowed: false, reason: 'action_not_permitted' });
});

test('denies an action outside the role capability set', () => {
  const result = authorize({
    action: 'decide_onboarding_applications',
    identity,
    role: 'tenant',
  });
  assert.deepEqual(result, { allowed: false, reason: 'action_not_permitted' });
});

test('denies an organization-scoped role missing organization context', () => {
  const result = authorize({
    action: 'manage_owned_properties',
    effectiveTime: activeWindow,
    identity,
    role: 'landlord',
  });
  assert.deepEqual(result, { allowed: false, reason: 'missing_organization_context' });
});

test('allows a same-organization request for an organization-scoped role', () => {
  const result = authorize({
    action: 'manage_owned_properties',
    actor: { organizationId: organizationA },
    effectiveTime: activeWindow,
    identity,
    resource: { organizationId: organizationA },
    role: 'landlord',
  });
  assert.deepEqual(result, { allowed: true, reason: 'granted' });
});

test('denies a cross-organization request for an organization-scoped role', () => {
  const result = authorize({
    action: 'manage_owned_properties',
    actor: { organizationId: organizationA },
    effectiveTime: activeWindow,
    identity,
    resource: { organizationId: organizationB },
    role: 'landlord',
  });
  assert.deepEqual(result, { allowed: false, reason: 'cross_organization_denied' });
});

test('allows a platform_admin action without organization, relationship, or effective-time context', () => {
  const result = authorize({
    action: 'decide_onboarding_applications',
    identity,
    role: 'platform_admin',
  });
  assert.deepEqual(result, { allowed: true, reason: 'granted' });
  assert.ok(crossOrganizationRoles.includes('platform_admin'));
});

test('denies a relationship-required action when relationship context is omitted, not skipped', () => {
  const result = authorize({
    action: 'manage_assigned_portfolio_records',
    actor: { organizationId: organizationA },
    effectiveTime: activeWindow,
    identity,
    resource: { organizationId: organizationA },
    role: 'property_manager',
  });
  assert.deepEqual(result, { allowed: false, reason: 'relationship_not_granted' });
});

test('denies a relationship-required action that was not granted', () => {
  const result = authorize({
    action: 'manage_assigned_portfolio_records',
    actor: { organizationId: organizationA },
    effectiveTime: activeWindow,
    identity,
    relationship: { granted: false },
    resource: { organizationId: organizationA },
    role: 'property_manager',
  });
  assert.deepEqual(result, { allowed: false, reason: 'relationship_not_granted' });
});

test('allows a granted relationship', () => {
  const result = authorize({
    action: 'manage_assigned_portfolio_records',
    actor: { organizationId: organizationA },
    effectiveTime: activeWindow,
    identity,
    relationship: { granted: true },
    resource: { organizationId: organizationA },
    role: 'property_manager',
  });
  assert.deepEqual(result, { allowed: true, reason: 'granted' });
});

test('denies an effective-time-required action when the window is omitted, not skipped', () => {
  const result = authorize({
    action: 'manage_own_related_records',
    actor: { organizationId: organizationA },
    identity,
    resource: { organizationId: organizationA },
    role: 'tenant',
  });
  assert.deepEqual(result, { allowed: false, reason: 'missing_effective_time' });
});

test('denies a membership that has not started yet', () => {
  const result = authorize({
    action: 'manage_own_related_records',
    actor: { organizationId: organizationA },
    effectiveTime: { from: new Date('2030-01-01T00:00:00.000Z'), now: new Date('2020-01-01T00:00:00.000Z') },
    identity,
    resource: { organizationId: organizationA },
    role: 'tenant',
  });
  assert.deepEqual(result, { allowed: false, reason: 'not_yet_effective' });
});

test('denies an expired membership', () => {
  const result = authorize({
    action: 'manage_own_related_records',
    actor: { organizationId: organizationA },
    effectiveTime: {
      from: new Date('2010-01-01T00:00:00.000Z'),
      now: new Date('2030-01-01T00:00:00.000Z'),
      to: new Date('2020-01-01T00:00:00.000Z'),
    },
    identity,
    resource: { organizationId: organizationA },
    role: 'tenant',
  });
  assert.deepEqual(result, { allowed: false, reason: 'membership_expired' });
});

test('allows an active membership within its effective window', () => {
  const result = authorize({
    action: 'manage_own_related_records',
    actor: { organizationId: organizationA },
    effectiveTime: activeWindow,
    identity,
    resource: { organizationId: organizationA },
    role: 'tenant',
  });
  assert.deepEqual(result, { allowed: true, reason: 'granted' });
});

test('canAccess mirrors the authorize boolean outcome', () => {
  assert.equal(
    canAccess({
      action: 'decide_onboarding_applications',
      identity,
      role: 'platform_admin',
    }),
    true,
  );
  assert.equal(
    canAccess({
      action: 'decide_onboarding_applications',
      identity,
      role: 'tenant',
    }),
    false,
  );
});

test('every declared role has a non-empty capability list', () => {
  for (const [role, capabilities] of Object.entries(roleCapabilities)) {
    assert.ok(Array.isArray(capabilities) && capabilities.length > 0, `role ${role} must declare capabilities`);
  }
});
