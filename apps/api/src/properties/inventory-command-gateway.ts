import {
  canonicalizeUnitLabel,
  normalizeUnitLabel,
  type PropertyAddress,
} from "@keyforta/contracts";

import type { DatabaseClient } from "../database.js";

export interface RentableUnitInput {
  areaSquareMeters?: number;
  bathrooms: number;
  bedrooms: number;
  floorLabel?: string;
  furnishingStatus: string;
  label: string;
  unitType: string;
}

export interface CreateRentalPropertyCommand {
  address: PropertyAddress;
  correlationId: string;
  firstUnit: RentableUnitInput;
  jurisdictionCode?: string | null;
  name: string;
  organizationId: string;
  propertyType: string;
  source: string;
  subject: string;
  timeZone: string;
}

export interface RentalPropertyCreationResult {
  propertyId: string;
  propertyVersion: number;
  unitId: string;
  unitVersion: number;
}

export interface AddRentalUnitCommand {
  correlationId: string;
  organizationId: string;
  propertyId: string;
  source: string;
  subject: string;
  unit: RentableUnitInput;
}

export interface RentableUnitCreationResult {
  unitId: string;
  unitVersion: number;
}

export interface SetUnitPricingCommand {
  amountMinor: number;
  correlationId: string;
  currency: string;
  effectiveFrom: string;
  expectedVersion: number;
  organizationId: string;
  source: string;
  subject: string;
  unitId: string;
}

export interface SetUnitAvailabilityCommand {
  correlationId: string;
  effectiveFrom: string;
  expectedVersion: number;
  organizationId: string;
  reasonCode?: string | null;
  source: string;
  status: string;
  subject: string;
  unitId: string;
}

export interface ArchiveRentalUnitCommand {
  correlationId: string;
  expectedVersion: number;
  organizationId: string;
  reason: string;
  source: string;
  subject: string;
  unitId: string;
}

export interface ArchiveRentalPropertyCommand {
  correlationId: string;
  expectedVersion: number;
  organizationId: string;
  propertyId: string;
  reason: string;
  source: string;
  subject: string;
}

export interface ListRentalPropertiesCommand {
  correlationId: string;
  organizationId: string;
  subject: string;
}

export interface RentalUnitProjection {
  areaSquareMeters: number | null;
  archivedAt: string | null;
  availabilityStatus: string;
  bathrooms: number;
  bedrooms: number;
  floorLabel: string | null;
  furnishingStatus: string;
  id: string;
  label: string;
  publicationStatus: string;
  unitType: string;
  version: number;
}

export interface RentalPropertyProjection {
  address: PropertyAddress;
  archivedAt: string | null;
  id: string;
  jurisdictionCode: string | null;
  name: string;
  propertyType: string;
  publicationStatus: string;
  timeZone: string;
  units: readonly RentalUnitProjection[];
  verificationStatus: string;
  version: number;
}

export interface RentalInventoryCommandGateway {
  addRentalUnit(
    command: AddRentalUnitCommand,
  ): Promise<RentableUnitCreationResult | undefined>;
  archiveRentalProperty(command: ArchiveRentalPropertyCommand): Promise<boolean>;
  archiveRentalUnit(command: ArchiveRentalUnitCommand): Promise<boolean>;
  createRentalProperty(
    command: CreateRentalPropertyCommand,
  ): Promise<RentalPropertyCreationResult | undefined>;
  listRentalProperties(
    command: ListRentalPropertiesCommand,
  ): Promise<readonly RentalPropertyProjection[]>;
  setUnitAvailability(
    command: SetUnitAvailabilityCommand,
  ): Promise<{ availabilityVersionId: string; unitVersion: number } | undefined>;
  setUnitPricing(
    command: SetUnitPricingCommand,
  ): Promise<{ pricingVersionId: string; unitVersion: number } | undefined>;
}

export class RentalInventoryAuthorizationError extends Error {
  constructor() {
    super("The actor is not authorized to perform this rental-inventory command.");
    this.name = "RentalInventoryAuthorizationError";
  }
}

export class RentalInventoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RentalInventoryConflictError";
  }
}

const authorizationErrorCode = "42501";

async function resolveActor(
  session: {
    query(text: string, parameters?: readonly unknown[]): Promise<{ rows: readonly unknown[] }>;
  },
  subject: string,
  organizationId: string,
): Promise<void> {
  const actor = await session.query("select * from app.resolve_actor($1, $2)", [
    subject,
    organizationId,
  ]);
  if (actor.rows.length !== 1) {
    throw new RentalInventoryAuthorizationError();
  }
}

function isPostgresError(
  error: unknown,
): error is { code?: string; constraint?: string; message: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

function translateWriteError(error: unknown): never {
  if (isPostgresError(error)) {
    if (error.code === authorizationErrorCode) {
      throw new RentalInventoryAuthorizationError();
    }
    if (error.code === "23505") {
      throw new RentalInventoryConflictError(
        "A record with the same identifying value already exists.",
      );
    }
    if (error.code === "23514") {
      throw new RentalInventoryConflictError(
        "The requested change does not satisfy a required invariant.",
      );
    }
    if (error.code === "40001") {
      throw new RentalInventoryConflictError(
        "The supplied version is stale; reload and retry with the current version.",
      );
    }
  }
  throw error;
}

function toUnitParameters(unit: RentableUnitInput) {
  const normalizedLabel = normalizeUnitLabel(unit.label);
  return [
    normalizedLabel,
    canonicalizeUnitLabel(unit.label),
    unit.unitType,
    unit.bedrooms,
    unit.bathrooms,
    unit.areaSquareMeters ?? null,
    unit.floorLabel ?? null,
    unit.furnishingStatus,
  ] as const;
}

export function createPostgresRentalInventoryCommandGateway(
  client: DatabaseClient,
): RentalInventoryCommandGateway {
  return {
    async createRentalProperty(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        const [
          label,
          canonicalLabel,
          unitType,
          bedrooms,
          bathrooms,
          areaSquareMeters,
          floorLabel,
          furnishingStatus,
        ] = toUnitParameters(command.firstUnit);
        try {
          const result = await session.query(
            `select * from app.create_rental_property(
              $1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::smallint, $10::smallint,
              $11, $12, $13, $14, $15
            )`,
            [
              command.name,
              command.propertyType,
              JSON.stringify(command.address),
              command.timeZone,
              command.jurisdictionCode ?? null,
              label,
              canonicalLabel,
              unitType,
              bedrooms,
              bathrooms,
              areaSquareMeters,
              floorLabel,
              furnishingStatus,
              command.correlationId,
              command.source,
            ],
          );
          const row = result.rows[0] as
            | {
                property_id?: string;
                property_version?: number;
                unit_id?: string;
                unit_version?: number;
              }
            | undefined;
          if (
            !row?.property_id ||
            row.property_version === undefined ||
            !row.unit_id ||
            row.unit_version === undefined
          ) {
            return undefined;
          }
          return {
            propertyId: row.property_id,
            propertyVersion: row.property_version,
            unitId: row.unit_id,
            unitVersion: row.unit_version,
          };
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async addRentalUnit(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        const [
          label,
          canonicalLabel,
          unitType,
          bedrooms,
          bathrooms,
          areaSquareMeters,
          floorLabel,
          furnishingStatus,
        ] = toUnitParameters(command.unit);
        try {
          const result = await session.query(
            `select * from app.add_rental_unit(
              $1, $2, $3, $4, $5::smallint, $6::smallint, $7, $8, $9, $10, $11
            )`,
            [
              command.propertyId,
              label,
              canonicalLabel,
              unitType,
              bedrooms,
              bathrooms,
              areaSquareMeters,
              floorLabel,
              furnishingStatus,
              command.correlationId,
              command.source,
            ],
          );
          const row = result.rows[0] as
            | { unit_id?: string; unit_version?: number }
            | undefined;
          if (!row?.unit_id || row.unit_version === undefined) return undefined;
          return { unitId: row.unit_id, unitVersion: row.unit_version };
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async setUnitPricing(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        try {
          const result = await session.query(
            `select * from app.set_unit_pricing($1, $2, $3, $4, $5, $6, $7)`,
            [
              command.unitId,
              command.amountMinor,
              command.currency,
              command.effectiveFrom,
              command.expectedVersion,
              command.correlationId,
              command.source,
            ],
          );
          const row = result.rows[0] as
            | { pricing_version_id?: string; unit_version?: number }
            | undefined;
          if (!row?.pricing_version_id || row.unit_version === undefined) return undefined;
          return { pricingVersionId: row.pricing_version_id, unitVersion: row.unit_version };
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async setUnitAvailability(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        try {
          const result = await session.query(
            `select * from app.set_unit_availability($1, $2, $3, $4, $5, $6, $7)`,
            [
              command.unitId,
              command.status,
              command.reasonCode ?? null,
              command.effectiveFrom,
              command.expectedVersion,
              command.correlationId,
              command.source,
            ],
          );
          const row = result.rows[0] as
            | { availability_version_id?: string; unit_version?: number }
            | undefined;
          if (!row?.availability_version_id || row.unit_version === undefined) return undefined;
          return {
            availabilityVersionId: row.availability_version_id,
            unitVersion: row.unit_version,
          };
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async archiveRentalUnit(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        try {
          const result = await session.query(
            "select app.archive_rental_unit($1, $2, $3, $4, $5) as archived",
            [
              command.unitId,
              command.reason,
              command.expectedVersion,
              command.correlationId,
              command.source,
            ],
          );
          return (result.rows[0] as { archived?: boolean } | undefined)?.archived === true;
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async archiveRentalProperty(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        try {
          const result = await session.query(
            "select app.archive_rental_property($1, $2, $3, $4, $5) as archived",
            [
              command.propertyId,
              command.reason,
              command.expectedVersion,
              command.correlationId,
              command.source,
            ],
          );
          return (result.rows[0] as { archived?: boolean } | undefined)?.archived === true;
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async listRentalProperties(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        const result = await session.query(
          "select app.list_rental_properties_for_actor() as properties",
        );
        const row = result.rows[0] as { properties?: RentalPropertyProjection[] } | undefined;
        return row?.properties ?? [];
      });
    },
  };
}
