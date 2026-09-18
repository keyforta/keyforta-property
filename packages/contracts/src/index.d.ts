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

export const propertyTypes: readonly ["apartment_building", "single_family", "townhouse", "mixed_use", "other"];
export const unitTypes: readonly ["studio", "apartment", "house", "townhouse", "commercial", "other"];
export const furnishingStatuses: readonly ["unfurnished", "part_furnished", "furnished"];
export const inventoryPublicationStatuses: readonly ["draft", "pending_review", "published", "paused", "archived"];
export const unitAvailabilityStatuses: readonly ["unavailable", "available", "occupied"];
export const publicListingStatuses: readonly ["draft", "published", "withdrawn"];
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

export interface CreateRentalPropertyInput {
  name: string;
  propertyType: typeof propertyTypes[number];
  address: PropertyAddress;
  timeZone: string;
  firstUnit: RentableUnitInput;
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
  verificationStatus: string;
  publicationStatus: typeof inventoryPublicationStatuses[number];
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
export const createRentalPropertyInputSchema: z.ZodType<CreateRentalPropertyInput>;
export const rentalPropertySchema: z.ZodType<RentalProperty>;
export const rentableUnitSchema: z.ZodType<RentableUnit>;
export const pricingVersionSchema: z.ZodType<PricingVersion>;
export const unitAvailabilityVersionSchema: z.ZodType<UnitAvailabilityVersion>;
export const publicListingSnapshotSchema: z.ZodType<PublicListingSnapshot>;
export const internalPublicListingSchema: z.ZodType<InternalPublicListing>;

export interface LandlordOnboardingApplicationInput {
  applicantName: string;
  proposedOrganizationName: string;
}

export interface LandlordOnboardingDecisionInput {
  decision: "approved" | "rejected";
  reason: string;
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
export const landlordOnboardingApplicationSchema: z.ZodType<LandlordOnboardingApplication>;
export const landlordOnboardingApplicationListSchema: z.ZodType<{
  items: LandlordOnboardingApplication[];
}>;
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