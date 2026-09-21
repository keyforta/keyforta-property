import { z } from "zod";

export * from "./mcp.js";

export const roles: string[];
export const resources: string[];
export const maintenanceStatuses: string[];
export const commands: string[];
export function apiResponse<T>(data: T): { data: T };
export const apiBasePath: "/api/v1";
export const apiWireAuthority: Readonly<{
  document: "docs/openapi.yaml";
  name: "OpenAPI";
}>;

export interface HttpOperation {
  authentication: "anonymous" | "required";
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
}

export const runtimeHttpOperations: Readonly<Record<string, HttpOperation>>;

export const metaSchema: z.ZodType<Meta>;
export const problemSchema: z.ZodType<Problem>;
export function envelopeSchema<T extends z.ZodTypeAny>(dataSchema: T): z.ZodType<{
  auditEventId?: string;
  data: z.infer<T>;
  meta: Meta;
}>;
export function listEnvelopeSchema<T extends z.ZodTypeAny>(itemSchema: T): z.ZodType<{
  items: z.infer<T>[];
  meta: Meta;
  nextCursor?: string | null;
  total: number;
}>;

export interface Meta {
  requestId: string;
}

export interface Problem {
  error: {
    code: string;
    details: Record<string, unknown>;
    message: string;
    traceId: string;
  };
}

export const publicPropertyIdSchema: z.ZodString;
export const organizationIdSchema: z.ZodString;
export const publicListingIdSchema: z.ZodString;
export const landlordOnboardingApplicationIdSchema: z.ZodString;
export const propertyIdSchema: z.ZodString;
export const unitIdSchema: z.ZodString;
export const jurisdictionCodeSchema: z.ZodString;

export const propertyTypes: readonly ["apartment_building", "single_family", "townhouse", "mixed_use", "other"];
export const unitTypes: readonly ["studio", "apartment", "house", "townhouse", "commercial", "other"];
export const furnishingStatuses: readonly ["unfurnished", "part_furnished", "furnished"];
export const propertyPublicationStatuses: readonly ["draft", "pending_review", "paused", "archived"];
export const inventoryPublicationStatuses: readonly ["draft", "pending_review", "published", "paused", "archived"];
export const unitAvailabilityStatuses: readonly ["unavailable", "available", "occupied"];
export const publicListingStatuses: readonly ["draft", "published", "withdrawn"];
export const publicListingMediaReviewStatuses: readonly ["pending", "approved", "rejected"];
export const supportedCurrencies: readonly ["CDF", "USD"];
export const unitLabelUnicodeVersion: "16.0.0";
export function normalizeUnitLabel(label: string): string;
export function canonicalizeUnitLabel(label: string): string;

export interface PropertyAddress {
  avenueOrStreet: string;
  number: string;
  quartier: string;
  commune: string;
  city: string;
  province: string;
  countryCode: string;
  postalCode?: string;
}

export interface RentableUnitInput {
  label: string;
  unitType: typeof unitTypes[number];
  bedrooms: number;
  bathrooms: number;
  areaSquareMeters?: number;
  floorLabel?: string;
  furnishingStatus: typeof furnishingStatuses[number];
}

export interface AddRentalUnitInput extends RentableUnitInput {
  idempotencyKey: string;
}

export interface CreateRentalPropertyInput {
  name: string;
  propertyType: typeof propertyTypes[number];
  address: PropertyAddress;
  timeZone: string;
  jurisdictionCode?: string | null;
  firstUnit: RentableUnitInput;
  idempotencyKey: string;
}

export interface UpdateRentalPropertyInput {
  name?: string;
  propertyType?: typeof propertyTypes[number];
  address?: PropertyAddress;
  timeZone?: string;
  jurisdictionCode?: string | null;
}

export interface ArchiveMetadata {
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
}

export interface RentalProperty extends ArchiveMetadata {
  id: string;
  organizationId: string;
  name: string;
  propertyType: typeof propertyTypes[number];
  address: PropertyAddress;
  timeZone: string;
  jurisdictionCode?: string | null;
  verificationStatus: "not_started" | "pending" | "changes_requested" | "verified" | "rejected" | "expired" | "suspended";
  publicationStatus: typeof propertyPublicationStatuses[number];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RentableUnit extends RentableUnitInput, ArchiveMetadata {
  id: string;
  organizationId: string;
  propertyId: string;
  canonicalLabel: string;
  availabilityStatus: typeof unitAvailabilityStatuses[number];
  publicationStatus: typeof inventoryPublicationStatuses[number];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PricingVersion {
  id: string;
  organizationId: string;
  unitId: string;
  amountMinor: number;
  currency: typeof supportedCurrencies[number];
  billingPeriod: "month";
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdBy: string;
  correlationId: string;
  source: string;
  createdAt: string;
}

export interface UnitAvailabilityVersion {
  id: string;
  organizationId: string;
  unitId: string;
  status: "unavailable" | "available";
  reasonCode: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdBy: string;
  correlationId: string;
  source: string;
  createdAt: string;
}

export interface PublicListingSnapshot {
  propertyId: string;
  propertyVersion: number;
  unitId: string;
  unitVersion: number;
  pricingVersionId: string;
  availabilityVersionId: string;
  projection: PublicListingProjectionSnapshot;
}

export interface PublicListingProjectionSnapshot {
  amenities: readonly string[];
  availableFrom: string;
  bathrooms: number;
  bedrooms: number;
  city: string;
  currency: typeof supportedCurrencies[number];
  district: string;
  id: string;
  imageUrls: readonly string[];
  monthlyRentMinor: string;
  name: string;
  summary: string;
  areaSquareMeters?: number;
}

export interface InternalPublicListing {
  id: string;
  organizationId: string;
  propertyId: string;
  unitId: string;
  status: typeof publicListingStatuses[number];
  version: number;
  snapshot: PublicListingSnapshot | null;
  publishedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const propertyAddressSchema: z.ZodType<PropertyAddress>;
export const rentableUnitInputSchema: z.ZodType<RentableUnitInput>;
export const addRentalUnitInputSchema: z.ZodType<AddRentalUnitInput>;
export const createRentalPropertyInputSchema: z.ZodType<CreateRentalPropertyInput>;
export const updateRentalPropertyInputSchema: z.ZodType<UpdateRentalPropertyInput>;
export const rentalPropertySchema: z.ZodType<RentalProperty>;
export const rentableUnitSchema: z.ZodType<RentableUnit>;
export const pricingVersionSchema: z.ZodType<PricingVersion>;
export const unitAvailabilityVersionSchema: z.ZodType<UnitAvailabilityVersion>;
export const publicListingSnapshotSchema: z.ZodType<PublicListingSnapshot>;
export const internalPublicListingSchema: z.ZodType<InternalPublicListing>;

export interface RentalPropertyCreationResult {
  propertyId: string;
  propertyVersion: number;
  unitId: string;
  unitVersion: number;
}

export interface RentableUnitCreationResult {
  unitId: string;
  unitVersion: number;
}

export interface SetUnitPricingInput {
  amountMinor: number;
  currency: typeof supportedCurrencies[number];
  effectiveFrom: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface PricingVersionCreationResult {
  pricingVersionId: string;
  unitVersion: number;
}

export interface SetUnitAvailabilityInput {
  status: "unavailable" | "available";
  reasonCode?: string | null;
  effectiveFrom: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface AvailabilityVersionCreationResult {
  availabilityVersionId: string;
  unitVersion: number;
}

export interface ArchiveRentalInventoryInput {
  reason: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface ArchiveRentalInventoryResult {
  archived: true;
}

export interface RentalUnitProjection {
  id: string;
  label: string;
  unitType: typeof unitTypes[number];
  bedrooms: number;
  bathrooms: number;
  areaSquareMeters: number | null;
  floorLabel: string | null;
  furnishingStatus: typeof furnishingStatuses[number];
  availabilityStatus: typeof unitAvailabilityStatuses[number];
  publicationStatus: typeof inventoryPublicationStatuses[number];
  version: number;
  archivedAt: string | null;
}

export interface RentalPropertyProjection {
  id: string;
  name: string;
  propertyType: typeof propertyTypes[number];
  address: PropertyAddress;
  timeZone: string;
  jurisdictionCode?: string | null;
  verificationStatus: "not_started" | "pending" | "changes_requested" | "verified" | "rejected" | "expired" | "suspended";
  publicationStatus: typeof propertyPublicationStatuses[number];
  version: number;
  archivedAt: string | null;
  units: RentalUnitProjection[];
}

export const rentalPropertyCreationResultSchema: z.ZodType<RentalPropertyCreationResult>;
export const rentalPropertyCreationEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: RentalPropertyCreationResult;
  meta: Meta;
}>;
export const rentableUnitCreationResultSchema: z.ZodType<RentableUnitCreationResult>;
export const rentableUnitCreationEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: RentableUnitCreationResult;
  meta: Meta;
}>;
export const setUnitPricingInputSchema: z.ZodType<SetUnitPricingInput>;
export const pricingVersionCreationResultSchema: z.ZodType<PricingVersionCreationResult>;
export const pricingVersionCreationEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: PricingVersionCreationResult;
  meta: Meta;
}>;
export const setUnitAvailabilityInputSchema: z.ZodType<SetUnitAvailabilityInput>;
export const availabilityVersionCreationResultSchema: z.ZodType<AvailabilityVersionCreationResult>;
export const availabilityVersionCreationEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: AvailabilityVersionCreationResult;
  meta: Meta;
}>;
export const archiveRentalInventoryInputSchema: z.ZodType<ArchiveRentalInventoryInput>;
export const archiveRentalInventoryResultSchema: z.ZodType<ArchiveRentalInventoryResult>;
export const archiveRentalInventoryEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: ArchiveRentalInventoryResult;
  meta: Meta;
}>;
export const rentalPropertyProjectionSchema: z.ZodType<RentalPropertyProjection>;
export const rentalPropertyListEnvelopeSchema: z.ZodType<{
  items: RentalPropertyProjection[];
  meta: Meta;
}>;

export interface LandlordOnboardingApplicationInput {
  applicantName: string;
  proposedOrganizationName: string;
}

export interface LandlordOnboardingDecisionInput {
  decision: "approved" | "rejected";
  reason: string;
}

export interface JurisdictionPolicyActivationInput {
  policyKey: string;
  jurisdictionCode: string;
  version: number;
  rulePayload: Record<string, unknown>;
  requiresCounselApproval: boolean;
  ownerApproval: {
    approvedAt?: string;
    approvedByUserId: string;
    evidenceHash?: string;
    sourceReference: string;
  };
  counselApproval?: {
    approvedAt?: string;
    approvedByUserId: string;
    evidenceHash?: string;
    sourceReference: string;
  } | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface JurisdictionPolicyActivationResult {
  activationId: string;
  jurisdictionCode: string;
  policyKey: string;
  policyVersionId: string;
  version: number;
}

export interface PropertyVerificationStatusInput {
  status: "not_started" | "pending" | "changes_requested" | "verified" | "rejected" | "expired" | "suspended";
}

export interface PropertyVerificationStatusResult {
  propertyId: string;
  status: "not_started" | "pending" | "changes_requested" | "verified" | "rejected" | "expired" | "suspended";
}

export interface LandlordOnboardingApplication {
  applicantName: string;
  decidedAt: string | null;
  decisionReason: string | null;
  id: string;
  proposedOrganizationName: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
}

export const landlordOnboardingApplicationInputSchema: z.ZodType<LandlordOnboardingApplicationInput>;
export const landlordOnboardingDecisionInputSchema: z.ZodType<LandlordOnboardingDecisionInput>;
export const jurisdictionPolicyActivationInputSchema: z.ZodType<JurisdictionPolicyActivationInput>;
export const propertyVerificationStatusInputSchema: z.ZodType<PropertyVerificationStatusInput>;
export const landlordOnboardingApplicationSchema: z.ZodType<LandlordOnboardingApplication>;
export const landlordOnboardingApplicationListSchema: z.ZodType<{
  items: LandlordOnboardingApplication[];
}>;
export const jurisdictionPolicyActivationResultSchema: z.ZodType<JurisdictionPolicyActivationResult>;
export const propertyVerificationStatusResultSchema: z.ZodType<PropertyVerificationStatusResult>;

export interface ActorMembership {
  organizationId: string;
  role: "landlord" | "manager" | "tenant" | "auditor";
}

export const actorMembershipSchema: z.ZodType<ActorMembership>;
export const actorMembershipListSchema: z.ZodType<ActorMembership[]>;
export const publicPropertyProjectionSchema: z.ZodType<PublicPropertyProjection>;
export const publicPropertyListQuerySchema: z.ZodType<PublicPropertyListQuery>;

export interface PublicPropertyListQuery {
  city?: string;
  cursor?: string;
  district?: string;
  limit: number;
  maxMonthlyRentMinor?: string;
  minBedrooms?: number;
  sort: "created_at_desc" | "name_asc" | "name_desc";
}

export interface PublicPropertyProjection {
  address: string;
  amenities: readonly string[];
  availableFrom: string;
  bathrooms: number;
  bedrooms: number;
  city: string;
  currency: string;
  district: string;
  id: string;
  imageUrl?: string;
  imageUrls: readonly string[];
  monthlyRentMinor: string;
  name: string;
  summary: string;
  areaSquareMeters?: number;
}

export interface PublicPropertyListResult {
  items: PublicPropertyProjection[];
  nextCursor: string | null;
  total: number;
}

export const publicPropertyListResultSchema: z.ZodType<PublicPropertyListResult>;
export const publicPropertyEnvelopeSchema: z.ZodType<{
  data: PublicPropertyProjection;
  meta: Meta;
}>;
export const publicPropertyListEnvelopeSchema: z.ZodType<{
  items: PublicPropertyProjection[];
  meta: Meta;
  nextCursor: string | null;
  total: number;
}>;

export interface PublicViewingRequestInput {
  email: string;
  locale?: "en" | "fr";
  message?: string;
  name: string;
  phone?: string;
  preferredAt?: string;
  propertyId: string;
  website?: "";
}

export const publicViewingRequestInputSchema: z.ZodType<PublicViewingRequestInput>;
export const publicRequestReceiptSchema: z.ZodType<{
  reference: string;
  status: "accepted";
}>;
export const publicRequestReceiptEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: { reference: string; status: "accepted" };
  meta: Meta;
}>;
export const publicListingPublicationEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: { listingId: string; status: "published" | "withdrawn" };
  meta: Meta;
}>;
export interface PublicListingSummary {
  id: string;
  imageUrls: readonly string[];
  mediaReviewNotes: string | null;
  mediaReviewStatus: typeof publicListingMediaReviewStatuses[number];
  note: string;
  status: "draft" | "published" | "withdrawn";
  summary: string | null;
  title: string;
  unitId: string;
  version: number;
}
export const publicListingSummarySchema: z.ZodType<PublicListingSummary>;
export const publicListingListEnvelopeSchema: z.ZodType<{
  items: PublicListingSummary[];
  meta: Meta;
}>;
export interface CreatePublicListingInput {
  idempotencyKey: string;
  imageUrls: readonly string[];
  summary: string;
  title: string;
}
export interface CreatePublicListingResult {
  listingId: string;
  listingVersion: number;
  unitId: string;
  unitVersion: number;
}
export const createPublicListingInputSchema: z.ZodType<CreatePublicListingInput>;
export const createPublicListingEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: CreatePublicListingResult;
  meta: Meta;
}>;
export interface UpdatePublicListingDraftInput {
  expectedVersion: number;
  imageUrls: readonly string[];
  summary: string;
  title: string;
}
export interface UpdatePublicListingDraftResult {
  listingId: string;
  listingVersion: number;
}
export const updatePublicListingDraftInputSchema: z.ZodType<UpdatePublicListingDraftInput>;
export const updatePublicListingDraftEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: UpdatePublicListingDraftResult;
  meta: Meta;
}>;
export interface PublicListingMediaReviewInput {
  decision: "approved" | "rejected";
  notes?: string;
}
export interface PublicListingMediaReviewResult {
  listingId: string;
  mediaReviewStatus: typeof publicListingMediaReviewStatuses[number];
}
export const publicListingMediaReviewInputSchema: z.ZodType<PublicListingMediaReviewInput>;
export const publicListingMediaReviewEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: PublicListingMediaReviewResult;
  meta: Meta;
}>;
export interface PendingPublicListingMediaReview {
  imageUrls: readonly string[];
  listingId: string;
  organizationId: string;
  organizationName: string;
  propertyName: string;
  submittedAt: string;
  summary: string | null;
  title: string | null;
  unitId: string;
  unitLabel: string;
}
export const pendingPublicListingMediaReviewSchema: z.ZodType<PendingPublicListingMediaReview>;
export const pendingPublicListingMediaReviewListEnvelopeSchema: z.ZodType<{
  items: PendingPublicListingMediaReview[];
  meta: Meta;
}>;
export const jurisdictionPolicyActivationEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: JurisdictionPolicyActivationResult;
  meta: Meta;
}>;
export const propertyVerificationStatusEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: PropertyVerificationStatusResult;
  meta: Meta;
}>;
export const actorMembershipListEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: ActorMembership[];
  meta: Meta;
}>;
export const landlordOnboardingApplicationEnvelopeSchema: z.ZodType<{
  auditEventId?: string;
  data: LandlordOnboardingApplication;
  meta: Meta;
}>;
export const landlordOnboardingApplicationListEnvelopeSchema: z.ZodType<{
  items: LandlordOnboardingApplication[];
  meta: Meta;
}>;

export const publicWebOperations: Readonly<Record<string, {
  authentication: string;
  method: string;
  path: string;
}>>;