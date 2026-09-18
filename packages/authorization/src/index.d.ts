export type AuthorizationRole =
  | "landlord"
  | "maintenance_operator"
  | "platform_admin"
  | "property_manager"
  | "tenant";

export interface AuthorizationActorContext {
  organizationId?: string;
}

export interface AuthorizationResourceContext {
  organizationId?: string;
}

export interface AuthorizationRelationshipContext {
  granted: boolean;
}

export interface AuthorizationEffectiveTime {
  from?: Date;
  now?: Date;
  to?: Date | null;
}

export interface AuthorizationRequest {
  action: string;
  actor?: AuthorizationActorContext;
  effectiveTime?: AuthorizationEffectiveTime;
  identity: { objectId: string };
  relationship?: AuthorizationRelationshipContext;
  resource?: AuthorizationResourceContext;
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
