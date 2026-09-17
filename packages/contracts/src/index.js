import { z } from 'zod';

export * from './mcp.js';

export const roles = ['tenant', 'landlord', 'property_manager', 'maintenance_operator', 'platform_admin'];
export const resources = ['organizations', 'profiles', 'memberships', 'invitations', 'relationships', 'properties', 'units', 'viewingRequests', 'rentalApplications', 'leases', 'occupancyPeriods', 'charges', 'ledgerEntries', 'payments', 'paymentAllocations', 'reconciliationBatches', 'serviceOffers', 'maintenanceRequests', 'maintenanceAssignments', 'maintenanceQuotes', 'maintenanceReports', 'documents', 'documentAccessGrants', 'conversations', 'messages', 'notifications', 'auditEvents'];
export const maintenanceStatuses = ['submitted', 'triaged', 'assigned', 'accepted', 'scheduled', 'in_progress', 'completed', 'confirmed', 'reopened'];
export const commands = ['createOrganization', 'inviteManager', 'acceptInvitation', 'submitRentalApplication', 'requestApplicationChanges', 'approveApplication', 'rejectApplication', 'createLeaseFromApplication', 'signLease', 'activateLease', 'generateCharges', 'recordPayment', 'allocatePayment', 'reconcilePayment', 'publishServiceOffer', 'triage', 'assign', 'accept', 'schedule', 'start', 'complete', 'confirm', 'reopen', 'approveQuote', 'rejectQuote', 'submitReport'];
export const apiResponse = (data) => ({ data });
export const apiBasePath = '/api/v1';
export const apiWireAuthority = Object.freeze({
	document: 'docs/openapi.yaml',
	name: 'OpenAPI',
});

export const metaSchema = z.object({
	requestId: z.string().min(1).max(128),
}).strict();

export const problemSchema = z.object({
	error: z.object({
		code: z.string().min(1),
		details: z.record(z.string(), z.unknown()),
		message: z.string().min(1),
		traceId: z.string().min(1).max(128),
	}).strict(),
}).strict();

export const envelopeSchema = (dataSchema) => z.object({
	auditEventId: z.string().min(1).optional(),
	data: dataSchema,
	meta: metaSchema,
}).strict();

export const listEnvelopeSchema = (itemSchema) => z.object({
	items: z.array(itemSchema),
	meta: metaSchema,
	nextCursor: z.string().min(1).max(128).nullable().optional(),
	total: z.number().int().nonnegative(),
}).strict();

export const runtimeHttpOperations = Object.freeze({
	listProperties: { method: 'GET', path: '/properties', authentication: 'anonymous' },
	getProperty: { method: 'GET', path: '/properties/{propertyId}', authentication: 'anonymous' },
	publishPublicListing: { method: 'POST', path: '/public-listings/{listingId}/publish', authentication: 'required' },
	withdrawPublicListing: { method: 'POST', path: '/public-listings/{listingId}/withdraw', authentication: 'required' },
	submitLandlordOnboardingApplication: { method: 'POST', path: '/landlord-onboarding-applications', authentication: 'required' },
	listLandlordOnboardingApplications: { method: 'GET', path: '/landlord-onboarding-applications', authentication: 'required' },
	decideLandlordOnboardingApplication: { method: 'POST', path: '/landlord-onboarding-applications/{applicationId}/decision', authentication: 'required' },
	requestViewing: { method: 'POST', path: '/viewing-requests', authentication: 'anonymous' },
});

export const publicPropertyIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const organizationIdSchema = z.uuid();
export const publicListingIdSchema = z.uuid();
export const landlordOnboardingApplicationIdSchema = z.uuid();

export const landlordOnboardingApplicationInputSchema = z.object({
	applicantName: z.string().trim().min(2).max(120),
	proposedOrganizationName: z.string().trim().min(2).max(160),
}).strict();

export const landlordOnboardingDecisionInputSchema = z.object({
	decision: z.enum(['approved', 'rejected']),
	reason: z.string().trim().min(3).max(1000),
}).strict();

export const landlordOnboardingApplicationSchema = z.object({
	applicantName: z.string(),
	decidedAt: z.iso.datetime().nullable(),
	decisionReason: z.string().nullable(),
	id: landlordOnboardingApplicationIdSchema,
	proposedOrganizationName: z.string(),
	status: z.enum(['pending', 'approved', 'rejected']),
	submittedAt: z.iso.datetime(),
}).strip();

export const landlordOnboardingApplicationListSchema = z.object({
	items: z.array(landlordOnboardingApplicationSchema),
}).strip();

export const publicPropertyProjectionSchema = z.object({
	address: z.string(),
	amenities: z.array(z.string()),
	availableFrom: z.iso.date(),
	bathrooms: z.number().int().positive(),
	bedrooms: z.number().int().nonnegative(),
	city: z.string(),
	currency: z.string().length(3).regex(/^[A-Z]{3}$/),
	district: z.string(),
	id: publicPropertyIdSchema,
	imageUrl: z.string().optional(),
	imageUrls: z.array(z.string()).min(1),
	monthlyRentMinor: z.string().regex(/^[1-9]\d*$/),
	name: z.string(),
	summary: z.string(),
	areaSquareMeters: z.number().int().positive().optional(),
}).strip();

export const publicPropertyListQuerySchema = z.object({
	city: z.string().trim().min(1).max(120).optional(),
	cursor: publicPropertyIdSchema.optional(),
	district: z.string().trim().min(1).max(120).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	maxMonthlyRentMinor: z.string().regex(/^[1-9]\d{0,17}$/).optional(),
	minBedrooms: z.coerce.number().int().min(0).max(100).optional(),
	sort: z.enum(['created_at_desc', 'name_asc', 'name_desc']).default('created_at_desc'),
}).strict();

export const publicPropertyListResultSchema = z.object({
	items: z.array(publicPropertyProjectionSchema),
	nextCursor: publicPropertyIdSchema.nullable(),
	total: z.number().int().nonnegative(),
}).strip();

export const publicPropertyEnvelopeSchema = envelopeSchema(publicPropertyProjectionSchema);
export const publicPropertyListEnvelopeSchema = z.object({
	items: z.array(publicPropertyProjectionSchema),
	meta: metaSchema,
	nextCursor: publicPropertyIdSchema.nullable(),
	total: z.number().int().nonnegative(),
}).strict();

export const publicViewingRequestInputSchema = z.object({
	email: z.email().max(254),
	locale: z.enum(['en', 'fr']).optional(),
	message: z.string().trim().max(1000).optional(),
	name: z.string().trim().min(2).max(120),
	phone: z.string().trim().min(7).max(40).optional(),
	preferredAt: z.iso.datetime().optional(),
	propertyId: publicPropertyIdSchema,
	website: z.literal('').optional(),
}).strict();

export const publicRequestReceiptSchema = z.object({
	reference: z.string().min(1).max(200),
	status: z.literal('accepted'),
}).strict();

export const publicRequestReceiptEnvelopeSchema = envelopeSchema(publicRequestReceiptSchema);

export const publicListingPublicationEnvelopeSchema = envelopeSchema(z.object({
	listingId: publicListingIdSchema,
	status: z.enum(['published', 'withdrawn']),
}).strict());

export const landlordOnboardingApplicationEnvelopeSchema = envelopeSchema(landlordOnboardingApplicationSchema);

export const landlordOnboardingApplicationListEnvelopeSchema = z.object({
	items: z.array(landlordOnboardingApplicationSchema),
	meta: metaSchema,
}).strict();

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
