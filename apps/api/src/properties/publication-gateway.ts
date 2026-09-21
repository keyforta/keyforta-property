import type { DatabaseClient, DatabaseSession } from "../database.js";
import { RentalInventoryAuthorizationError } from "./inventory-command-gateway.js";

export interface SetPublicListingPublicationCommand {
  correlationId: string;
  listingId: string;
  organizationId: string;
  published: boolean;
  subject: string;
}

export interface ListPublicListingsForActorCommand {
  correlationId: string;
  organizationId: string;
  subject: string;
}

export interface PublicListingSummary {
  id: string;
  note: string;
  status: string;
  title: string;
}

export interface PublicListingPublicationGateway {
  listForActor(
    command: ListPublicListingsForActorCommand,
  ): Promise<PublicListingSummary[]>;
  setPublication(command: SetPublicListingPublicationCommand): Promise<boolean>;
}

async function resolveActor(
  session: DatabaseSession,
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

export function createPostgresPublicListingPublicationGateway(
  client: DatabaseClient,
): PublicListingPublicationGateway {
  return {
    async listForActor(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        const result = await session.query(
          "select app.list_public_listings_for_actor() as listings",
        );
        const row = result.rows[0] as { listings?: PublicListingSummary[] } | undefined;
        return row?.listings ?? [];
      });
    },

    async setPublication(command) {
      return client.transaction(async (session) => {
        const actor = await session.query("select * from app.resolve_actor($1, $2)", [
          command.subject,
          command.organizationId,
        ]);
        if (actor.rows.length !== 1) return false;
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        const result = await session.query(
          "select app.set_public_listing_publication($1, $2) as changed",
          [command.listingId, command.published],
        );
        return (result.rows[0] as { changed?: boolean } | undefined)?.changed === true;
      });
    },
  };
}