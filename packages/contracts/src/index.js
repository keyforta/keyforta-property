import { z } from 'zod';

export const roles = ['tenant', 'landlord', 'property_manager', 'maintenance_operator', 'platform_admin'];
export const resources = ['organizations', 'profiles', 'memberships', 'invitations', 'relationships', 'properties', 'units', 'viewingRequests', 'rentalApplications', 'leases', 'occupancyPeriods', 'charges', 'ledgerEntries', 'payments', 'paymentAllocations', 'reconciliationBatches', 'serviceOffers', 'maintenanceRequests', 'maintenanceAssignments', 'maintenanceQuotes', 'maintenanceReports', 'documents', 'documentAccessGrants', 'conversations', 'messages', 'notifications', 'auditEvents'];
export const maintenanceStatuses = ['submitted', 'triaged', 'assigned', 'accepted', 'scheduled', 'in_progress', 'completed', 'confirmed', 'reopened'];
export const commands = ['createOrganization', 'inviteManager', 'acceptInvitation', 'submitRentalApplication', 'requestApplicationChanges', 'approveApplication', 'rejectApplication', 'createLeaseFromApplication', 'signLease', 'activateLease', 'generateCharges', 'recordPayment', 'allocatePayment', 'reconcilePayment', 'publishServiceOffer', 'triage', 'assign', 'accept', 'schedule', 'start', 'complete', 'confirm', 'reopen', 'approveQuote', 'rejectQuote', 'submitReport'];
export const apiResponse = (data) => ({ data });

export const publicPropertyIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const publicPropertyProjectionSchema = z.object({
	address: z.string(),
	city: z.string(),
	id: publicPropertyIdSchema,
	imageUrl: z.string().optional(),
	name: z.string(),
	summary: z.string(),
}).strip();

export const publicPropertyListQuerySchema = z.object({
	city: z.string().trim().min(1).max(120).optional(),
	cursor: publicPropertyIdSchema.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	sort: z.enum(['created_at_desc', 'name_asc', 'name_desc']).default('created_at_desc'),
}).strict();

export const publicPropertyListResultSchema = z.object({
	items: z.array(publicPropertyProjectionSchema),
	nextCursor: publicPropertyIdSchema.nullable(),
	total: z.number().int().nonnegative(),
}).strip();

export const publicWebOperations = Object.freeze({
	listProperties: { method: 'GET', path: '/properties', authentication: 'anonymous' },
	getProperty: { method: 'GET', path: '/properties/{propertyId}', authentication: 'anonymous' },
	requestViewing: { method: 'POST', path: '/viewing-requests', authentication: 'anonymous' },
	requestAccess: { method: 'POST', path: '/access-requests', authentication: 'anonymous' },
	sendContactMessage: { method: 'POST', path: '/contact-requests', authentication: 'anonymous' },
	submitRentalApplication: { method: 'POST', path: '/rental-applications', authentication: 'required' },
	registerLandlord: { method: 'POST', path: '/auth/signup/landlords', authentication: 'anonymous' },
	registerOperator: { method: 'POST', path: '/auth/signup/maintenance-operators', authentication: 'anonymous' },
});
