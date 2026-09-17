import type { DatabaseClient } from "../database.js";

export interface SetPublicListingPublicationCommand {
  correlationId: string;
  listingId: string;
  organizationId: string;
  published: boolean;
  subject: string;
}

export interface PublicListingPublicationGateway {
  setPublication(command: SetPublicListingPublicationCommand): Promise<boolean>;
}

export function createPostgresPublicListingPublicationGateway(
  client: DatabaseClient,
): PublicListingPublicationGateway {
  return {
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