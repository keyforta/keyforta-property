import type { PublicViewingRequestInput } from "@keyforta/contracts";

import type { DatabaseClient } from "../database.js";

export interface PublicViewingRequestCommand extends PublicViewingRequestInput {
  correlationId: string;
}

export interface PublicViewingRequestGateway {
  create(command: PublicViewingRequestCommand): Promise<boolean>;
}

export function createMemoryPublicViewingRequestGateway(
  publishedPropertyIds: ReadonlySet<string>,
): PublicViewingRequestGateway {
  return {
    async create(command) {
      return publishedPropertyIds.has(command.propertyId);
    },
  };
}

export function createPostgresPublicViewingRequestGateway(
  client: DatabaseClient,
): PublicViewingRequestGateway {
  return {
    async create(command) {
      const result = await client.query(
        `select app.create_public_listing_inquiry(
          $1, $2, $3, $4, $5, $6, $7, $8
        ) as accepted`,
        [
          command.propertyId,
          command.name,
          command.email,
          command.phone ?? null,
          command.preferredAt ?? null,
          command.message ?? null,
          command.locale ?? null,
          command.correlationId,
        ],
      );
      const row = result.rows[0];
      return Boolean(
        row &&
          typeof row === "object" &&
          (row as Record<string, unknown>).accepted === true,
      );
    },
  };
}