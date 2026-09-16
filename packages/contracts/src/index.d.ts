import { z } from "zod";

export * from "./mcp.js";

export const roles: string[];
export const resources: string[];
export const maintenanceStatuses: string[];
export const commands: string[];
export function apiResponse<T>(data: T): { data: T };

export const publicPropertyIdSchema: z.ZodString;
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

export const publicWebOperations: Readonly<Record<string, {
  authentication: string;
  method: string;
  path: string;
}>>;