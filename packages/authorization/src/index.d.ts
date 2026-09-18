export type AuthorizationRole =
  | "landlord"
  | "maintenance_operator"
  | "platform_admin"
  | "property_manager"
  | "tenant";

export interface AuthorizationOrganizationContext {
  actorOrganizationId?: string;
  resourceOrganizationId?: string;
}

export interface AuthorizationRelationshipContext {
  granted: boolean;
  required: boolean;
}

export interface AuthorizationEffectiveTime {
  from?: Date;
  now?: Date;
  to?: Date | null;
}

export interface AuthorizationRequest {
  action: string;
  effectiveTime?: AuthorizationEffectiveTime;
  identity: { objectId: string };
  organization?: AuthorizationOrganizationContext;
  relationship?: AuthorizationRelationshipContext;
  role: AuthorizationRole | string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
}

export declare const accessScopes: Record<string, string>;
export declare const authorizationDimensions: readonly string[];
export declare const landlordCapabilities: readonly string[];
export declare const platformAdminCapabilities: readonly string[];
export declare const propertyManagerCapabilities: readonly string[];
export declare const maintenanceOperatorCapabilities: readonly string[];
export declare const tenantCapabilities: readonly string[];
export declare const crossOrganizationRoles: readonly string[];
export declare const roleCapabilities: Record<string, readonly string[]>;
export declare function authorize(request: AuthorizationRequest): AuthorizationDecision;
export declare function canAccess(request: AuthorizationRequest): boolean;
