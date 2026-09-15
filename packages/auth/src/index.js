export const authSurfaces = Object.freeze({
  public: { loginRequired: false },
  portal: { loginRequired: true, provider: 'Microsoft Entra External ID' },
  admin: { loginRequired: true, provider: 'Microsoft Entra External ID' }
});

export const sessionKeys = Object.freeze({ portal: 'keyforta.portal.session', admin: 'keyforta.admin.session' });

export const protectedAppRules = Object.freeze([
  'Unauthenticated users render the app login screen and no protected data.',
  'The API validates identity, organization membership, role, relationship, and resource scope.',
  'Technician access is additionally limited to assigned work and its active time window.',
  'Admin actions require platform-admin authorization and produce audit events.'
]);
