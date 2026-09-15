const crudSamples = {
  profiles: { role: 'maintenance_operator', displayName: 'New mock profile', email: 'new@example.test' },
  properties: { name: 'New mock property', address: 'Gombe', ownerId: 'profile-owner-001' },
  units: { propertyId: 'property-riverside', label: 'Unit mock' },
  leases: { unitId: 'unit-riverside-01', tenantId: 'profile-tenant-001', status: 'draft' },
  charges: { leaseId: 'lease-riverside-001', type: 'rent', amount: 400 },
  payments: { leaseId: 'lease-riverside-001', amount: 400, type: 'rent' },
  viewingRequests: { propertyId: 'property-riverside', requesterId: 'profile-tenant-001', status: 'requested' },
  maintenanceRequests: { propertyId: 'property-riverside', requesterId: 'profile-tenant-001', title: 'Mock maintenance request', status: 'submitted' },
  maintenanceQuotes: { maintenanceRequestId: 'maintenance-pump-001', operatorId: 'profile-operator-001', amount: 100, status: 'submitted' },
  maintenanceReports: { maintenanceRequestId: 'maintenance-pump-001', operatorId: 'profile-operator-001', status: 'draft' },
  documents: { ownerId: 'profile-tenant-001', type: 'identity', status: 'submitted' },
  messages: { conversationId: 'conversation-001', senderId: 'profile-manager-001', body: 'Mock message' },
  notifications: { recipientId: 'profile-tenant-001', type: 'maintenance', title: 'Mock notification' },
  auditEvents: { actorId: 'profile-manager-001', action: 'read', resource: 'auditEvents' },
};

export function runCrud(resource, operation) {
  const api = window.KeyfortaMockApi;
  const first = api.list(resource).items[0];
  if (operation === 'create') return api.create(resource, crudSamples[resource], 'crud:create');
  if (operation === 'read') return api.list(resource);
  if (operation === 'update') {
    return first ? api.update(resource, first.id, { mockUpdated: true }, 'crud:update') : { message: 'No record available to update' };
  }
  if (operation === 'delete') {
    return first && resource !== 'auditEvents'
      ? api.remove(resource, first.id, 'crud:delete')
      : { message: 'No deletable record available' };
  }
  return { message: `Unsupported CRUD operation: ${operation}` };
}
