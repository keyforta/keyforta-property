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
export const publicPropertyListQuerySchema: z.ZodObject<{
  city: z.ZodOptional<z.ZodString>;
  cursor: z.ZodOptional<z.ZodString>;
  district: z.ZodOptional<z.ZodString>;
  limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
  maxMonthlyRentMinor: z.ZodOptional<z.ZodString>;
  minBedrooms: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
  sort: z.ZodDefault<z.ZodEnum<{
    created_at_desc: "created_at_desc";
    name_asc: "name_asc";
    name_desc: "name_desc";
  }>>;
}>;

export type PublicPropertyListQuery = z.infer<typeof publicPropertyListQuerySchema>;

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
  auditEventId?: string;
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