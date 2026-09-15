/* KEYFORTA mock API adapter. Replace this file's persistence with HTTP calls when
   the backend is connected; keep the resource names, command names, and response
   shapes stable. All records are synthetic and browser-local. */
(() => {
  const now = () => new Date().toISOString();
  const id = (resource) => `mock_${resource.slice(0, 4)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const resourceDefinitions = {
    profiles: { label: 'Profiles', required: ['role', 'displayName', 'email'], fields: ['id', 'role', 'displayName', 'email', 'phone', 'verificationStatus', 'skills', 'serviceArea', 'availability', 'createdAt', 'updatedAt'] },
    properties: { label: 'Properties', required: ['name', 'address', 'ownerId'], fields: ['id', 'name', 'address', 'city', 'ownerId', 'managerId', 'verificationStatus', 'createdAt', 'updatedAt'] },
    units: { label: 'Units', required: ['propertyId', 'label'], fields: ['id', 'propertyId', 'label', 'type', 'bedrooms', 'bathrooms', 'monthlyRent', 'availabilityStatus', 'createdAt', 'updatedAt'] },
    leases: { label: 'Leases', required: ['unitId', 'tenantId', 'status'], fields: ['id', 'unitId', 'tenantId', 'coTenantIds', 'guarantorId', 'status', 'startDate', 'endDate', 'monthlyRent', 'depositAmount', 'advanceRentAmount', 'discountPercent', 'dueDay', 'gracePeriodDays', 'lateFee', 'version', 'createdAt', 'updatedAt'] },
    charges: { label: 'Charges', required: ['leaseId', 'type', 'amount'], fields: ['id', 'leaseId', 'type', 'amount', 'currency', 'dueDate', 'status', 'createdAt', 'updatedAt'] },
    payments: { label: 'Payments', required: ['leaseId', 'amount', 'type'], fields: ['id', 'leaseId', 'amount', 'currency', 'type', 'method', 'status', 'reference', 'paidAt', 'createdAt', 'updatedAt'] },
    viewingRequests: { label: 'Viewing requests', required: ['propertyId', 'requesterId', 'status'], fields: ['id', 'propertyId', 'requesterId', 'requestedAt', 'scheduledAt', 'status', 'notes', 'createdAt', 'updatedAt'] },
    maintenanceRequests: { label: 'Maintenance requests', required: ['propertyId', 'requesterId', 'title', 'status'], fields: ['id', 'propertyId', 'unitId', 'requesterId', 'assignedOperatorId', 'title', 'description', 'category', 'priority', 'status', 'accessWindow', 'createdAt', 'updatedAt'] },
    maintenanceQuotes: { label: 'Maintenance quotes', required: ['maintenanceRequestId', 'operatorId', 'amount', 'status'], fields: ['id', 'maintenanceRequestId', 'operatorId', 'laborAmount', 'materialsAmount', 'amount', 'currency', 'validUntil', 'status', 'reviewedBy', 'createdAt', 'updatedAt'] },
    maintenanceReports: { label: 'Maintenance reports', required: ['maintenanceRequestId', 'operatorId', 'status'], fields: ['id', 'maintenanceRequestId', 'operatorId', 'arrivalAt', 'startedAt', 'completedAt', 'workPerformed', 'materials', 'totalCost', 'status', 'customerConfirmation', 'createdAt', 'updatedAt'] },
    documents: { label: 'Documents', required: ['ownerId', 'type', 'status'], fields: ['id', 'ownerId', 'relatedType', 'relatedId', 'type', 'storageKey', 'status', 'version', 'reviewedBy', 'reviewedAt', 'createdAt', 'updatedAt'] },
    messages: { label: 'Messages', required: ['conversationId', 'senderId', 'body'], fields: ['id', 'conversationId', 'senderId', 'recipientId', 'body', 'readAt', 'createdAt', 'updatedAt'] },
    notifications: { label: 'Notifications', required: ['recipientId', 'type', 'title'], fields: ['id', 'recipientId', 'type', 'title', 'body', 'readAt', 'createdAt', 'updatedAt'] },
    auditEvents: { label: 'Audit events', required: ['actorId', 'action', 'resource'], fields: ['id', 'actorId', 'role', 'action', 'resource', 'resourceId', 'reason', 'metadata', 'createdAt', 'updatedAt'] }
  };

  const seed = {
    profiles: [
      { id: 'profile-tenant-001', role: 'tenant', displayName: 'Amani Mukendi', email: 'amani@example.test', phone: '+243 81 000 0001', verificationStatus: 'verified', createdAt: '2026-05-01T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z' },
      { id: 'profile-owner-001', role: 'landlord', displayName: 'Jean Kalala', email: 'jean@example.test', phone: '+243 81 000 0002', verificationStatus: 'review', createdAt: '2026-05-01T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z' },
      { id: 'profile-manager-001', role: 'property_manager', displayName: 'Grace Ilunga', email: 'grace@example.test', phone: '+243 81 000 0003', verificationStatus: 'verified', createdAt: '2026-05-01T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z' },
      { id: 'profile-operator-001', role: 'maintenance_operator', displayName: 'Patrick Beya Services', email: 'patrick@example.test', phone: '+243 81 000 0004', verificationStatus: 'verified', skills: ['Plumbing', 'Electrical', 'Generator service'], serviceArea: 'Kinshasa', availability: 'weekdays', createdAt: '2026-05-01T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z' }
    ],
    properties: [{ id: 'property-riverside', name: 'Riverside apartment', address: 'Ngaliema', city: 'Kinshasa', ownerId: 'profile-owner-001', managerId: 'profile-manager-001', verificationStatus: 'review', createdAt: '2026-05-01T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z' }],
    units: [{ id: 'unit-riverside-01', propertyId: 'property-riverside', label: 'Unit 1A', type: 'apartment', bedrooms: 2, bathrooms: 1, monthlyRent: 400, availabilityStatus: 'occupied', createdAt: '2026-05-01T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z' }],
    leases: [{ id: 'lease-riverside-001', unitId: 'unit-riverside-01', tenantId: 'profile-tenant-001', coTenantIds: [], status: 'active', startDate: '2026-01-01', endDate: '2026-12-31', monthlyRent: 400, depositAmount: 1200, advanceRentAmount: 360, discountPercent: 10, dueDay: 5, gracePeriodDays: 5, lateFee: 20, version: 1, createdAt: '2026-01-01T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z' }],
    charges: [{ id: 'charge-rent-may-001', leaseId: 'lease-riverside-001', type: 'rent', amount: 400, currency: 'USD', dueDate: '2026-05-05', status: 'scheduled', createdAt: '2026-05-01T09:00:00Z', updatedAt: '2026-05-01T09:00:00Z' }],
    payments: [{ id: 'payment-apr-001', leaseId: 'lease-riverside-001', amount: 400, currency: 'USD', type: 'rent', method: 'cash', status: 'reconciled', reference: 'RCT-2026-04-001', paidAt: '2026-04-04T09:00:00Z', createdAt: '2026-04-04T09:00:00Z', updatedAt: '2026-04-04T09:00:00Z' }],
    viewingRequests: [{ id: 'viewing-riverside-001', propertyId: 'property-riverside', requesterId: 'profile-tenant-001', requestedAt: '2026-05-08T09:00:00Z', scheduledAt: null, status: 'requested', notes: '', createdAt: '2026-05-08T09:00:00Z', updatedAt: '2026-05-08T09:00:00Z' }],
    maintenanceRequests: [{ id: 'maintenance-pump-001', propertyId: 'property-riverside', unitId: 'unit-riverside-01', requesterId: 'profile-tenant-001', assignedOperatorId: 'profile-operator-001', title: 'Water pump inspection', description: 'The pump stops intermittently.', category: 'plumbing', priority: 'high', status: 'assigned', accessWindow: { startsAt: '2026-05-12T14:00:00Z', endsAt: '2026-05-12T16:00:00Z' }, createdAt: '2026-05-08T09:00:00Z', updatedAt: '2026-05-10T09:00:00Z' }],
    maintenanceQuotes: [{ id: 'quote-pump-001', maintenanceRequestId: 'maintenance-pump-001', operatorId: 'profile-operator-001', laborAmount: 80, materialsAmount: 120, amount: 200, currency: 'USD', validUntil: '2026-05-15', status: 'requested', reviewedBy: null, createdAt: '2026-05-10T09:00:00Z', updatedAt: '2026-05-10T09:00:00Z' }],
    maintenanceReports: [], documents: [], messages: [], notifications: [], auditEvents: []
  };
  const permissions = {
    tenant: { profiles: 'read:self', properties: 'read:related', units: 'read:related', leases: 'read:self', charges: 'read:self', payments: 'read:self', viewingRequests: 'crud:self', maintenanceRequests: 'crud:self', maintenanceQuotes: 'read:related', maintenanceReports: 'read:related', documents: 'read:self', messages: 'crud:self', notifications: 'read:self' },
    landlord: { profiles: 'crud:self', properties: 'crud:owned', units: 'crud:owned', leases: 'read:owned', charges: 'read:owned', payments: 'read:owned', viewingRequests: 'read:owned', maintenanceRequests: 'crud:owned', maintenanceQuotes: 'read:owned', maintenanceReports: 'read:owned', documents: 'crud:owned', messages: 'crud:related', notifications: 'read:self' },
    property_manager: { profiles: 'crud:assigned', properties: 'crud:assigned', units: 'crud:assigned', leases: 'crud:assigned', charges: 'crud:assigned', payments: 'crud:assigned', viewingRequests: 'crud:assigned', maintenanceRequests: 'crud:assigned', maintenanceQuotes: 'crud:assigned', maintenanceReports: 'crud:assigned', documents: 'crud:assigned', messages: 'crud:assigned', notifications: 'read:self' },
    maintenance_operator: { profiles: 'crud:self', properties: 'read:assigned', units: 'read:assigned', leases: 'read:assigned', charges: 'none', payments: 'read:self', viewingRequests: 'read:assigned', maintenanceRequests: 'crud:assigned', maintenanceQuotes: 'crud:self', maintenanceReports: 'crud:self', documents: 'crud:self', messages: 'crud:assigned', notifications: 'read:self' }
  };
  const stored = JSON.parse(localStorage.getItem('kf-mock-db') || 'null');
  const db = stored && stored.records ? stored : { records: clone(seed), actor: { id: 'profile-manager-001', role: 'property_manager' } };
  const persist = () => localStorage.setItem('kf-mock-db', JSON.stringify(db));
  const recordAudit = (action, resource, resourceId, reason = 'mock-ui action') => { db.records.auditEvents.push({ id: id('auditEvents'), actorId: db.actor.id, role: db.actor.role, action, resource, resourceId, reason, metadata: { source: 'mock-api' }, createdAt: now(), updatedAt: now() }); };
  const assertResource = (resource) => { if (!resourceDefinitions[resource]) throw new Error(`Unknown resource: ${resource}`); };
  const assertFields = (resource, input) => { const missing = resourceDefinitions[resource].required.filter((field) => input[field] === undefined || input[field] === ''); if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`); };
  const api = {
    definitions: clone(resourceDefinitions),
    permissions: clone(permissions),
    setActor(actor) { db.actor = { id: actor.id, role: actor.role }; persist(); return clone(db.actor); },
    getActor() { return clone(db.actor); },
    list(resource, filters = {}) { assertResource(resource); let items = db.records[resource] || []; for (const [key, value] of Object.entries(filters)) items = items.filter((item) => String(item[key]) === String(value)); return { items: clone(items), total: items.length, nextCursor: null }; },
    get(resource, resourceId) { assertResource(resource); const item = (db.records[resource] || []).find((row) => row.id === resourceId); return item ? clone(item) : null; },
    create(resource, input, reason) { assertResource(resource); assertFields(resource, input); const timestamp = now(); const item = { ...clone(input), id: input.id || id(resource), createdAt: timestamp, updatedAt: timestamp }; db.records[resource].push(item); recordAudit('create', resource, item.id, reason); persist(); return clone(item); },
    update(resource, resourceId, patch, reason) { assertResource(resource); const rows = db.records[resource] || []; const index = rows.findIndex((row) => row.id === resourceId); if (index < 0) throw new Error(`Record not found: ${resource}/${resourceId}`); rows[index] = { ...rows[index], ...clone(patch), id: resourceId, updatedAt: now() }; recordAudit('update', resource, resourceId, reason); persist(); return clone(rows[index]); },
    remove(resource, resourceId, reason) { assertResource(resource); const rows = db.records[resource] || []; const index = rows.findIndex((row) => row.id === resourceId); if (index < 0) throw new Error(`Record not found: ${resource}/${resourceId}`); const [deleted] = rows.splice(index, 1); recordAudit('delete', resource, resourceId, reason); persist(); return clone(deleted); },
    command(action, resource, resourceId, payload = {}) { const map = { acceptJob: { status: 'accepted' }, scheduleJob: { status: 'scheduled' }, startJob: { status: 'in_progress' }, completeJob: { status: 'completed' }, confirmResolution: { status: 'confirmed' }, reopenRequest: { status: 'reopened' }, approveQuote: { status: 'approved' }, rejectQuote: { status: 'rejected' } }; if (map[action]) return this.update(resource, resourceId, { ...map[action], ...payload }, `command:${action}`); if (action === 'submitQuote') return this.create('maintenanceQuotes', payload, 'command:submitQuote'); if (action === 'submitReport') return this.create('maintenanceReports', payload, 'command:submitReport'); throw new Error(`Unsupported command: ${action}`); }
  };
  window.KeyfortaMockApi = api;
})();
