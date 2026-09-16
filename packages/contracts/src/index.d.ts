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
  limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
  sort: z.ZodDefault<z.ZodEnum<{
    created_at_desc: "created_at_desc";
    name_asc: "name_asc";
    name_desc: "name_desc";
  }>>;
}>;

export type PublicPropertyListQuery = z.infer<typeof publicPropertyListQuerySchema>;

export interface PublicPropertyProjection {
  address: string;
  city: string;
  id: string;
  imageUrl?: string;
  name: string;
  summary: string;
}

export interface PublicPropertyListResult {
  items: PublicPropertyProjection[];
  nextCursor: string | null;
  total: number;
}

export const publicPropertyListResultSchema: z.ZodType<PublicPropertyListResult>;

export const publicWebOperations: Readonly<Record<string, {
  authentication: string;
  method: string;
  path: string;
}>>;