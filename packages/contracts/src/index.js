import { z } from 'zod';
import countries from 'i18n-iso-countries';
import {
	unitLabelAssignedPattern,
	unitLabelCaseFolding,
	unitLabelUnicodeVersion,
	unitLabelWhitespace,
} from './unit-label-case-folding.js';

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
	createProperty: { method: 'POST', path: '/properties', authentication: 'required' },
	listMyRentalProperties: { method: 'GET', path: '/properties/mine', authentication: 'required' },
	archiveProperty: { method: 'DELETE', path: '/properties/{propertyId}', authentication: 'required' },
	addRentalUnit: { method: 'POST', path: '/properties/{propertyId}/units', authentication: 'required' },
	setUnitPricing: { method: 'PATCH', path: '/units/{unitId}/pricing', authentication: 'required' },
	setUnitAvailability: { method: 'PATCH', path: '/units/{unitId}/availability', authentication: 'required' },
	archiveUnit: { method: 'DELETE', path: '/units/{unitId}', authentication: 'required' },
	publishPublicListing: { method: 'POST', path: '/public-listings/{listingId}/publish', authentication: 'required' },
	withdrawPublicListing: { method: 'POST', path: '/public-listings/{listingId}/withdraw', authentication: 'required' },
	listMyPublicListings: { method: 'GET', path: '/public-listings/mine', authentication: 'required' },
	activateJurisdictionPolicy: { method: 'POST', path: '/admin/jurisdiction-policies/activate', authentication: 'required' },
	setPropertyVerificationStatus: { method: 'PATCH', path: '/properties/{propertyId}/verification-status', authentication: 'required' },
	listActorMemberships: { method: 'GET', path: '/session/memberships', authentication: 'required' },
	submitLandlordOnboardingApplication: { method: 'POST', path: '/landlord-onboarding-applications', authentication: 'required' },
	listLandlordOnboardingApplications: { method: 'GET', path: '/landlord-onboarding-applications', authentication: 'required' },
	decideLandlordOnboardingApplication: { method: 'POST', path: '/landlord-onboarding-applications/{applicationId}/decision', authentication: 'required' },
	createPublicListing: { method: 'POST', path: '/units/{unitId}/public-listing', authentication: 'required' },
	updatePublicListingDraft: { method: 'PATCH', path: '/public-listings/{listingId}/draft', authentication: 'required' },
	listPendingPublicListingMediaReview: { method: 'GET', path: '/admin/public-listings/pending-review', authentication: 'required' },
	reviewPublicListingMedia: { method: 'POST', path: '/admin/public-listings/{listingId}/media-review', authentication: 'required' },
	requestViewing: { method: 'POST', path: '/viewing-requests', authentication: 'anonymous' },
});

export const publicPropertyIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const organizationIdSchema = z.uuid();
export const publicListingIdSchema = z.uuid();
export const landlordOnboardingApplicationIdSchema = z.uuid();
export const propertyIdSchema = z.uuid();
export const unitIdSchema = z.uuid();

export const propertyTypes = Object.freeze([
	'apartment_building',
	'single_family',
	'townhouse',
	'mixed_use',
	'other',
]);
export const unitTypes = Object.freeze([
	'studio',
	'apartment',
	'house',
	'townhouse',
	'commercial',
	'other',
]);
export const furnishingStatuses = Object.freeze(['unfurnished', 'part_furnished', 'furnished']);
export const propertyPublicationStatuses = Object.freeze(['draft', 'pending_review', 'paused', 'archived']);
export const inventoryPublicationStatuses = Object.freeze(['draft', 'pending_review', 'published', 'paused', 'archived']);
export const unitAvailabilityStatuses = Object.freeze(['unavailable', 'available', 'occupied']);
export const publicListingStatuses = Object.freeze(['draft', 'published', 'withdrawn']);
export const publicListingMediaReviewStatuses = Object.freeze(['pending', 'approved', 'rejected']);
export const supportedCurrencies = Object.freeze(['CDF', 'USD']);
export { unitLabelUnicodeVersion };

const boundedTextSchema = (maximum) => z.string().trim().min(1).max(maximum);
// PublicListing media images must be externally hosted over https:// only,
// mirroring the database check in migration 0030
// (app.validate_public_listing_media_payload); an http:// URL must fail
// here with a 400 validation error rather than reach the SQL layer.
const httpsImageUrlSchema = z.url({ protocol: /^https$/ }).max(2048);
const timestampSchema = z.iso.datetime();
const positiveVersionSchema = z.number().int().positive();
const actorIdSchema = z.uuid();
export const jurisdictionCodeSchema = z.string().trim().regex(/^[A-Z]{2}(-[A-Z0-9]{1,6})?$/);

const isSupportedUnitLabel = (label) => {
	for (let index = 0; index < label.length; index += 1) {
		const codeUnit = label.charCodeAt(index);
		if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
			if (index + 1 >= label.length) return false;
			const nextCodeUnit = label.charCodeAt(index + 1);
			if (nextCodeUnit < 0xDC00 || nextCodeUnit > 0xDFFF) return false;
			index += 1;
		} else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
			return false;
		}
	}
	return [...label].every((symbol) => unitLabelAssignedPattern.test(symbol));
};

export const normalizeUnitLabel = (label) => {
	if (!isSupportedUnitLabel(label)) {
		throw new TypeError(`Unit labels must contain assigned Unicode ${unitLabelUnicodeVersion} scalar values`);
	}
	const symbols = [...label];
	let start = 0;
	let end = symbols.length;
	while (start < end && unitLabelWhitespace.has(symbols[start].codePointAt(0))) start += 1;
	while (end > start && unitLabelWhitespace.has(symbols[end - 1].codePointAt(0))) end -= 1;
	return symbols.slice(start, end).join('').normalize('NFC');
};
export const canonicalizeUnitLabel = (label) => [...normalizeUnitLabel(label)]
	.flatMap((symbol) => {
		const codePoint = symbol.codePointAt(0);
		const folded = unitLabelCaseFolding.get(codePoint) ?? codePoint;
		return Array.isArray(folded) ? folded : [folded];
	})
	.map((codePoint) => String.fromCodePoint(codePoint))
	.join('')
	.normalize('NFC');

const ianaTimeZoneSchema = boundedTextSchema(100).refine((timeZone) => {
	try {
		new Intl.DateTimeFormat('en', { timeZone }).format();
		return true;
	} catch {
		return false;
	}
}, 'Invalid IANA time-zone identifier');

const intervalSchema = z.object({
	effectiveFrom: timestampSchema,
	effectiveTo: timestampSchema.nullable().optional(),
}).strict().superRefine(({ effectiveFrom, effectiveTo }, context) => {
	if (effectiveTo != null && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)) {
		context.addIssue({
			code: 'custom',
			message: 'effectiveTo must be later than effectiveFrom',
			path: ['effectiveTo'],
		});
	}
});

const withArchiveMetadata = (schema) => schema.superRefine((value, context) => {
	const archiveValues = [value.archivedAt, value.archivedBy, value.archiveReason];
	const hasAllArchiveValues = archiveValues.every((item) => item !== null);
	const hasNoArchiveValues = archiveValues.every((item) => item === null);
	if ((!hasAllArchiveValues && !hasNoArchiveValues)
		|| (value.publicationStatus === 'archived' && !hasAllArchiveValues)
		|| (value.publicationStatus !== 'archived' && !hasNoArchiveValues)) {
		context.addIssue({
			code: 'custom',
			message: 'Archive metadata must be present together only for archived records',
			path: ['archivedAt'],
		});
	}
});

export const propertyAddressSchema = z.object({
	avenueOrStreet: boundedTextSchema(160),
	number: boundedTextSchema(160),
	quartier: boundedTextSchema(160),
	commune: boundedTextSchema(160),
	city: boundedTextSchema(160),
	province: boundedTextSchema(160),
	countryCode: z.string().trim().length(2).regex(/^[A-Z]{2}$/).refine(
		(countryCode) => countries.isValid(countryCode),
		'Invalid ISO 3166-1 alpha-2 country code',
	),
	postalCode: boundedTextSchema(160).optional(),
}).strict();

export const rentableUnitInputSchema = z.object({
	label: z.string().max(320).refine(
		isSupportedUnitLabel,
		`Unit label must contain assigned Unicode ${unitLabelUnicodeVersion} scalar values`,
	).transform(normalizeUnitLabel).refine(
		(label) => [...label].length >= 1 && [...label].length <= 80,
		'Unit label must contain between 1 and 80 Unicode code points',
	),
	unitType: z.enum(unitTypes),
	bedrooms: z.number().int().min(0).max(20),
	bathrooms: z.number().int().min(1).max(20),
	areaSquareMeters: z.number().int().min(1).max(100000).optional(),
	floorLabel: boundedTextSchema(40).optional(),
	furnishingStatus: z.enum(furnishingStatuses),
}).strict();

export const addRentalUnitInputSchema = rentableUnitInputSchema.extend({
	idempotencyKey: boundedTextSchema(128),
}).strict();

export const createRentalPropertyInputSchema = z.object({
	name: boundedTextSchema(160),
	propertyType: z.enum(propertyTypes),
	address: propertyAddressSchema,
	timeZone: ianaTimeZoneSchema,
	jurisdictionCode: jurisdictionCodeSchema.nullable().optional(),
	firstUnit: rentableUnitInputSchema,
	idempotencyKey: boundedTextSchema(128),
}).strict();

export const updateRentalPropertyInputSchema = z.object({
	name: boundedTextSchema(160).optional(),
	propertyType: z.enum(propertyTypes).optional(),
	address: propertyAddressSchema.optional(),
	timeZone: ianaTimeZoneSchema.optional(),
	jurisdictionCode: jurisdictionCodeSchema.nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
	message: 'At least one field must be provided',
});

const archiveFields = {
	archivedAt: timestampSchema.nullable(),
	archivedBy: actorIdSchema.nullable(),
	archiveReason: boundedTextSchema(1000).nullable(),
};

export const rentalPropertySchema = withArchiveMetadata(z.object({
	id: z.uuid(),
	organizationId: organizationIdSchema,
	name: boundedTextSchema(160),
	propertyType: z.enum(propertyTypes),
	address: propertyAddressSchema,
	timeZone: ianaTimeZoneSchema,
	jurisdictionCode: jurisdictionCodeSchema.nullable().optional(),
	verificationStatus: z.enum(['not_started', 'pending', 'changes_requested', 'verified', 'rejected', 'expired', 'suspended']),
	publicationStatus: z.enum(propertyPublicationStatuses),
	version: positiveVersionSchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
	...archiveFields,
}).strict());

const validateCanonicalUnitLabel = (value, context) => {
	if (value.canonicalLabel !== canonicalizeUnitLabel(value.label)) {
		context.addIssue({
			code: 'custom',
			message: `canonicalLabel must use Unicode ${unitLabelUnicodeVersion} default case folding`,
			path: ['canonicalLabel'],
		});
	}
};

export const rentableUnitSchema = withArchiveMetadata(z.object({
	id: z.uuid(),
	organizationId: organizationIdSchema,
	propertyId: z.uuid(),
	...rentableUnitInputSchema.shape,
	canonicalLabel: boundedTextSchema(320),
	availabilityStatus: z.enum(unitAvailabilityStatuses),
	publicationStatus: z.enum(inventoryPublicationStatuses),
	version: positiveVersionSchema,
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
	...archiveFields,
}).strict()).superRefine(validateCanonicalUnitLabel);

const provenanceFields = {
	createdBy: actorIdSchema,
	correlationId: boundedTextSchema(128),
	source: boundedTextSchema(64),
	createdAt: timestampSchema,
};

export const pricingVersionSchema = z.object({
	id: z.uuid(),
	organizationId: organizationIdSchema,
	unitId: z.uuid(),
	amountMinor: z.number().int().positive().safe(),
	currency: z.enum(supportedCurrencies),
	billingPeriod: z.literal('month'),
	...intervalSchema.shape,
	...provenanceFields,
}).strict().superRefine((value, context) => {
	if (value.effectiveTo != null && Date.parse(value.effectiveTo) <= Date.parse(value.effectiveFrom)) {
		context.addIssue({
			code: 'custom',
			message: 'effectiveTo must be later than effectiveFrom',
			path: ['effectiveTo'],
		});
	}
});

export const unitAvailabilityVersionSchema = z.object({
	id: z.uuid(),
	organizationId: organizationIdSchema,
	unitId: z.uuid(),
	status: z.enum(['unavailable', 'available']),
	reasonCode: boundedTextSchema(64).nullable(),
	...intervalSchema.shape,
	...provenanceFields,
}).strict().superRefine((value, context) => {
	if (value.effectiveTo != null && Date.parse(value.effectiveTo) <= Date.parse(value.effectiveFrom)) {
		context.addIssue({
			code: 'custom',
			message: 'effectiveTo must be later than effectiveFrom',
			path: ['effectiveTo'],
		});
	}
	if (value.status === 'unavailable' && value.reasonCode === null) {
		context.addIssue({
			code: 'custom',
			message: 'Unavailable intervals require a reason code',
			path: ['reasonCode'],
		});
	}
	if (value.status === 'available' && value.reasonCode !== null) {
		context.addIssue({
			code: 'custom',
			message: 'Available intervals cannot carry an unavailable reason code',
			path: ['reasonCode'],
		});
	}
});

export const landlordOnboardingApplicationInputSchema = z.object({
	applicantName: z.string().trim().min(2).max(120),
	proposedOrganizationName: z.string().trim().min(2).max(160),
}).strict();

export const landlordOnboardingDecisionInputSchema = z.object({
	decision: z.enum(['approved', 'rejected']),
	reason: z.string().trim().min(3).max(1000),
}).strict();

export const jurisdictionPolicyActivationInputSchema = z.object({
	policyKey: boundedTextSchema(80).regex(/^[a-z][a-z0-9_]{2,79}$/),
	jurisdictionCode: jurisdictionCodeSchema,
	version: z.number().int().positive(),
	rulePayload: z.record(z.string(), z.unknown()),
	requiresCounselApproval: z.boolean(),
	ownerApproval: z.object({
		approvedAt: timestampSchema.optional(),
		approvedByUserId: actorIdSchema,
		evidenceHash: boundedTextSchema(200).optional(),
		sourceReference: boundedTextSchema(500),
	}).strict(),
	counselApproval: z.object({
		approvedAt: timestampSchema.optional(),
		approvedByUserId: actorIdSchema,
		evidenceHash: boundedTextSchema(200).optional(),
		sourceReference: boundedTextSchema(500),
	}).strict().nullable().optional(),
	effectiveFrom: timestampSchema,
	effectiveTo: timestampSchema.nullable().optional(),
}).strict().superRefine((value, context) => {
	if (value.requiresCounselApproval && !value.counselApproval) {
		context.addIssue({
			code: 'custom',
			message: 'Counsel approval is required when requiresCounselApproval is true',
			path: ['counselApproval'],
		});
	}
	if (value.effectiveTo != null && Date.parse(value.effectiveTo) <= Date.parse(value.effectiveFrom)) {
		context.addIssue({
			code: 'custom',
			message: 'effectiveTo must be later than effectiveFrom',
			path: ['effectiveTo'],
		});
	}
});

export const propertyVerificationStatusInputSchema = z.object({
	status: z.enum(['not_started', 'pending', 'changes_requested', 'verified', 'rejected', 'expired', 'suspended']),
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

export const jurisdictionPolicyActivationResultSchema = z.object({
	activationId: z.uuid(),
	jurisdictionCode: jurisdictionCodeSchema,
	policyKey: boundedTextSchema(80),
	policyVersionId: z.uuid(),
	version: z.number().int().positive(),
}).strict();

export const propertyVerificationStatusResultSchema = z.object({
	propertyId: propertyIdSchema,
	status: z.enum(['not_started', 'pending', 'changes_requested', 'verified', 'rejected', 'expired', 'suspended']),
}).strict();

export const actorMembershipSchema = z.object({
	organizationId: organizationIdSchema,
	role: z.enum(['landlord', 'manager', 'tenant', 'auditor']),
}).strict();

export const actorMembershipListSchema = z.array(actorMembershipSchema);

export const publicPropertyProjectionSchema = z.object({
	address: z.string(),
	amenities: z.array(z.string()),
	availableFrom: z.iso.date(),
	bathrooms: z.number().int().positive(),
	bedrooms: z.number().int().nonnegative(),
	city: z.string(),
	currency: z.string().length(3).regex(/^[A-Z]{3}$/),
	district: z.string(),
	id: z.union([publicPropertyIdSchema, z.uuid()]),
	imageUrl: z.string().optional(),
	imageUrls: z.array(z.string()).min(1),
	monthlyRentMinor: z.string().regex(/^[1-9]\d*$/),
	name: z.string(),
	summary: z.string(),
	areaSquareMeters: z.number().int().positive().optional(),
}).strip();

const publicListingProjectionSnapshotSchema = z.object({
	amenities: z.array(boundedTextSchema(160)).max(100),
	availableFrom: z.iso.date(),
	bathrooms: z.number().int().min(1).max(20),
	bedrooms: z.number().int().min(0).max(20),
	city: boundedTextSchema(160),
	currency: z.enum(supportedCurrencies),
	district: boundedTextSchema(160),
	id: publicPropertyIdSchema,
	imageUrls: z.array(z.url().max(2048)).min(1).max(50),
	monthlyRentMinor: z.string().regex(/^[1-9]\d{0,18}$/).refine(
		(value) => BigInt(value) <= 9223372036854775807n,
		'Value exceeds the positive signed 64-bit range',
	),
	name: boundedTextSchema(160),
	summary: boundedTextSchema(4000),
	areaSquareMeters: z.number().int().min(1).max(100000).optional(),
}).strict();

export const publicListingSnapshotSchema = z.object({
	propertyId: z.uuid(),
	propertyVersion: positiveVersionSchema,
	unitId: z.uuid(),
	unitVersion: positiveVersionSchema,
	pricingVersionId: z.uuid(),
	availabilityVersionId: z.uuid(),
	projection: publicListingProjectionSnapshotSchema,
}).strict();

export const internalPublicListingSchema = z.object({
	id: publicListingIdSchema,
	organizationId: organizationIdSchema,
	propertyId: z.uuid(),
	unitId: z.uuid(),
	status: z.enum(publicListingStatuses),
	version: positiveVersionSchema,
	snapshot: publicListingSnapshotSchema.nullable(),
	publishedAt: timestampSchema.nullable(),
	withdrawnAt: timestampSchema.nullable(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
}).strict().superRefine((value, context) => {
	if (value.status === 'published' && (value.snapshot === null || value.publishedAt === null)) {
		context.addIssue({
			code: 'custom',
			message: 'Published listings require a snapshot and publication time',
			path: ['snapshot'],
		});
	}
	if (value.status === 'published' && value.withdrawnAt !== null) {
		context.addIssue({
			code: 'custom',
			message: 'Published listings cannot have a withdrawal time',
			path: ['withdrawnAt'],
		});
	}
	if (value.status === 'withdrawn' && value.withdrawnAt === null) {
		context.addIssue({
			code: 'custom',
			message: 'Withdrawn listings require a withdrawal time',
			path: ['withdrawnAt'],
		});
	}
	if (value.status !== 'withdrawn' && value.withdrawnAt !== null) {
		context.addIssue({
			code: 'custom',
			message: 'Only withdrawn listings can have a withdrawal time',
			path: ['withdrawnAt'],
		});
	}
	if (value.snapshot !== null
		&& (value.snapshot.propertyId !== value.propertyId || value.snapshot.unitId !== value.unitId)) {
		context.addIssue({
			code: 'custom',
			message: 'Listing and snapshot inventory identifiers must match',
			path: ['snapshot'],
		});
	}
});

export const publicPropertyListQuerySchema = z.object({
	city: z.string().trim().min(1).max(120).optional(),
	cursor: publicPropertyIdSchema.optional(),
	district: z.string().trim().min(1).max(120).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	maxMonthlyRentMinor: z.string().regex(/^[1-9]\d{0,17}$/).optional(),
	minBedrooms: z.preprocess(
		(value) => value === '' ? Number.NaN : value,
		z.coerce.number().int().min(0).max(100).optional(),
	),
	sort: z.enum(['created_at_desc', 'name_asc', 'name_desc']).default('created_at_desc'),
}).strict();

export const publicPropertyListResultSchema = z.object({
	items: z.array(publicPropertyProjectionSchema).max(100),
	nextCursor: publicPropertyIdSchema.nullable(),
	total: z.number().int().nonnegative(),
}).strip();

export const publicPropertyEnvelopeSchema = z.object({
	data: publicPropertyProjectionSchema,
	meta: metaSchema,
}).strict();
export const publicPropertyListEnvelopeSchema = z.object({
	items: z.array(publicPropertyProjectionSchema).max(100),
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

// Bounds mirror the SQL projection in app.list_public_listings_for_actor
// (migration 0030): title = properties.name (<=160) + " — " (3) +
// units.label (<=80) = 243 max (or the landlord-authored title, bounded to
// 140 chars, once set); note = address.commune (<=160) + ", " (2) +
// address.city (<=160) = 322 max. A property/unit pair at the true maximum
// lengths must round-trip through this schema without a parse failure.
// `summary`/`imageUrls` are null/empty for a listing with no draft snapshot
// yet (a legacy pre-REQ-037 fixture); `mediaReviewNotes` is null until a
// platform administrator records a review decision (REQ-037).
export const publicListingSummarySchema = z.object({
	id: publicListingIdSchema,
	imageUrls: z.array(httpsImageUrlSchema),
	mediaReviewNotes: boundedTextSchema(2000).nullable(),
	mediaReviewStatus: z.enum(publicListingMediaReviewStatuses),
	note: boundedTextSchema(322),
	status: z.enum(publicListingStatuses),
	summary: boundedTextSchema(4000).nullable(),
	title: boundedTextSchema(243),
	unitId: unitIdSchema,
	version: positiveVersionSchema,
}).strict();

export const publicListingListEnvelopeSchema = z.object({
	items: z.array(publicListingSummarySchema),
	meta: metaSchema,
}).strict();

export const createPublicListingInputSchema = z.object({
	idempotencyKey: boundedTextSchema(128),
	imageUrls: z.array(httpsImageUrlSchema).min(1).max(10),
	summary: boundedTextSchema(4000),
	title: boundedTextSchema(140),
}).strict();

export const createPublicListingResultSchema = z.object({
	listingId: publicListingIdSchema,
	listingVersion: positiveVersionSchema,
	unitId: unitIdSchema,
	unitVersion: positiveVersionSchema,
}).strict();

export const createPublicListingEnvelopeSchema = envelopeSchema(createPublicListingResultSchema);

export const updatePublicListingDraftInputSchema = z.object({
	expectedVersion: positiveVersionSchema,
	imageUrls: z.array(httpsImageUrlSchema).min(1).max(10),
	summary: boundedTextSchema(4000),
	title: boundedTextSchema(140),
}).strict();

export const updatePublicListingDraftResultSchema = z.object({
	listingId: publicListingIdSchema,
	listingVersion: positiveVersionSchema,
}).strict();

export const updatePublicListingDraftEnvelopeSchema = envelopeSchema(updatePublicListingDraftResultSchema);

export const publicListingMediaReviewInputSchema = z.object({
	decision: z.enum(['approved', 'rejected']),
	notes: boundedTextSchema(2000).optional(),
}).strict()
	.refine(
		(value) => value.decision !== 'rejected' || Boolean(value.notes?.trim()),
		{ message: 'Rejecting a listing requires reviewer notes.', path: ['notes'] },
	);

export const publicListingMediaReviewResultSchema = z.object({
	listingId: publicListingIdSchema,
	mediaReviewStatus: z.enum(publicListingMediaReviewStatuses),
}).strict();

export const publicListingMediaReviewEnvelopeSchema = envelopeSchema(publicListingMediaReviewResultSchema);

// Bounds mirror app.list_public_listings_pending_media_review (0030):
// organizationName/propertyName <=160, unitLabel <=80, title <=140,
// summary <=4000, up to 10 image URLs of at most 2048 characters each.
export const pendingPublicListingMediaReviewSchema = z.object({
	imageUrls: z.array(httpsImageUrlSchema).max(10),
	listingId: publicListingIdSchema,
	organizationId: organizationIdSchema,
	organizationName: boundedTextSchema(160),
	propertyName: boundedTextSchema(160),
	submittedAt: timestampSchema,
	summary: boundedTextSchema(4000).nullable(),
	title: boundedTextSchema(140).nullable(),
	unitId: unitIdSchema,
	unitLabel: boundedTextSchema(80),
}).strict();

export const pendingPublicListingMediaReviewListEnvelopeSchema = z.object({
	items: z.array(pendingPublicListingMediaReviewSchema),
	meta: metaSchema,
}).strict();


export const jurisdictionPolicyActivationEnvelopeSchema = envelopeSchema(jurisdictionPolicyActivationResultSchema);

export const propertyVerificationStatusEnvelopeSchema = envelopeSchema(propertyVerificationStatusResultSchema);

export const actorMembershipListEnvelopeSchema = envelopeSchema(actorMembershipListSchema);

export const landlordOnboardingApplicationEnvelopeSchema = envelopeSchema(landlordOnboardingApplicationSchema);

export const landlordOnboardingApplicationListEnvelopeSchema = z.object({
	items: z.array(landlordOnboardingApplicationSchema),
	meta: metaSchema,
}).strict();

export const rentalPropertyCreationResultSchema = z.object({
	propertyId: z.uuid(),
	propertyVersion: positiveVersionSchema,
	unitId: z.uuid(),
	unitVersion: positiveVersionSchema,
}).strict();

export const rentalPropertyCreationEnvelopeSchema = envelopeSchema(rentalPropertyCreationResultSchema);

export const rentableUnitCreationResultSchema = z.object({
	unitId: z.uuid(),
	unitVersion: positiveVersionSchema,
}).strict();

export const rentableUnitCreationEnvelopeSchema = envelopeSchema(rentableUnitCreationResultSchema);

export const setUnitPricingInputSchema = z.object({
	amountMinor: z.number().int().positive().safe(),
	currency: z.enum(supportedCurrencies),
	effectiveFrom: timestampSchema,
	expectedVersion: positiveVersionSchema,
	idempotencyKey: boundedTextSchema(128),
}).strict();

export const pricingVersionCreationResultSchema = z.object({
	pricingVersionId: z.uuid(),
	unitVersion: positiveVersionSchema,
}).strict();

export const pricingVersionCreationEnvelopeSchema = envelopeSchema(pricingVersionCreationResultSchema);

export const setUnitAvailabilityInputSchema = z.object({
	status: z.enum(['unavailable', 'available']),
	reasonCode: boundedTextSchema(64).nullable().optional(),
	effectiveFrom: timestampSchema,
	expectedVersion: positiveVersionSchema,
	idempotencyKey: boundedTextSchema(128),
}).strict().superRefine((value, context) => {
	if (value.status === 'unavailable' && !value.reasonCode) {
		context.addIssue({
			code: 'custom',
			message: 'Unavailable intervals require a reason code',
			path: ['reasonCode'],
		});
	}
	if (value.status === 'available' && value.reasonCode) {
		context.addIssue({
			code: 'custom',
			message: 'Available intervals cannot carry an unavailable reason code',
			path: ['reasonCode'],
		});
	}
});

export const availabilityVersionCreationResultSchema = z.object({
	availabilityVersionId: z.uuid(),
	unitVersion: positiveVersionSchema,
}).strict();

export const availabilityVersionCreationEnvelopeSchema = envelopeSchema(availabilityVersionCreationResultSchema);

export const archiveRentalInventoryInputSchema = z.object({
	reason: boundedTextSchema(1000),
	expectedVersion: positiveVersionSchema,
	idempotencyKey: boundedTextSchema(128),
}).strict();

export const archiveRentalInventoryResultSchema = z.object({
	archived: z.literal(true),
}).strict();

export const archiveRentalInventoryEnvelopeSchema = envelopeSchema(archiveRentalInventoryResultSchema);

export const rentalPropertyProjectionSchema = z.object({
	id: z.uuid(),
	name: boundedTextSchema(160),
	propertyType: z.enum(propertyTypes),
	address: propertyAddressSchema,
	timeZone: ianaTimeZoneSchema,
	jurisdictionCode: jurisdictionCodeSchema.nullable(),
	verificationStatus: z.enum(['not_started', 'pending', 'changes_requested', 'verified', 'rejected', 'expired', 'suspended']),
	publicationStatus: z.enum(propertyPublicationStatuses),
	version: positiveVersionSchema,
	archivedAt: timestampSchema.nullable(),
	units: z.array(z.object({
		id: z.uuid(),
		label: boundedTextSchema(320),
		unitType: z.enum(unitTypes),
		bedrooms: z.number().int().min(0),
		bathrooms: z.number().int().min(1),
		areaSquareMeters: z.number().int().min(1).nullable(),
		floorLabel: boundedTextSchema(40).nullable(),
		furnishingStatus: z.enum(furnishingStatuses),
		availabilityStatus: z.enum(unitAvailabilityStatuses),
		publicationStatus: z.enum(inventoryPublicationStatuses),
		version: positiveVersionSchema,
		archivedAt: timestampSchema.nullable(),
	}).strict()),
}).strict();

export const rentalPropertyListEnvelopeSchema = z.object({
	items: z.array(rentalPropertyProjectionSchema),
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
