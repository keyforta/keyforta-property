import type { DatabaseClient } from "../database.js";

export interface ActorMembership {
  organizationId: string;
  role: "landlord" | "manager" | "tenant" | "auditor";
}

export interface LookupActorMembershipsCommand {
  subject: string;
}

export interface MembershipLookupGateway {
  lookupMemberships(
    command: LookupActorMembershipsCommand,
  ): Promise<ActorMembership[]>;
}

interface MembershipRow {
  organization_id: string;
  role: ActorMembership["role"];
}

export function createPostgresMembershipLookupGateway(
  client: DatabaseClient,
): MembershipLookupGateway {
  return {
    async lookupMemberships(command) {
      return client.transaction(async (session) => {
        const result = await session.query(
          "select * from app.resolve_actor_memberships($1)",
          [command.subject],
        );
        return (result.rows as MembershipRow[]).map((row) => ({
          organizationId: row.organization_id,
          role: row.role,
        }));
      });
    },
  };
}
