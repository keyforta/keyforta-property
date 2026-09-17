import type {
  LandlordOnboardingApplication,
  LandlordOnboardingApplicationInput,
  LandlordOnboardingDecisionInput,
} from "@keyforta/contracts";

import type { DatabaseClient } from "../database.js";

export interface SubmitLandlordOnboardingCommand extends LandlordOnboardingApplicationInput {
  applicantObjectId: string;
  applicantSubject: string;
  correlationId: string;
}

export interface DecideLandlordOnboardingCommand extends LandlordOnboardingDecisionInput {
  administratorObjectId: string;
  administratorSubject: string;
  applicationId: string;
  correlationId: string;
}

export interface LandlordOnboardingGateway {
  decide(command: DecideLandlordOnboardingCommand): Promise<LandlordOnboardingApplication | undefined>;
  list(): Promise<LandlordOnboardingApplication[]>;
  submit(command: SubmitLandlordOnboardingCommand): Promise<LandlordOnboardingApplication | undefined>;
}

interface ApplicationRow {
  applicant_name: string;
  decided_at: Date | string | null;
  decision_reason?: string | null;
  id: string;
  proposed_organization_name: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: Date | string;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toApplication(row: ApplicationRow): LandlordOnboardingApplication {
  return {
    applicantName: row.applicant_name,
    decidedAt: row.decided_at === null ? null : timestamp(row.decided_at),
    decisionReason: row.decision_reason ?? null,
    id: row.id,
    proposedOrganizationName: row.proposed_organization_name,
    status: row.status,
    submittedAt: timestamp(row.submitted_at),
  };
}

export function createPostgresLandlordOnboardingGateway(
  client: DatabaseClient,
): LandlordOnboardingGateway {
  return {
    async decide(command) {
      const result = await client.query(
        "select * from app.decide_landlord_onboarding_application($1, $2, $3, $4, $5, $6)",
        [command.applicationId, command.administratorSubject,
          command.administratorObjectId, command.decision, command.reason,
          command.correlationId],
      );
      const row = result.rows[0] as ApplicationRow | undefined;
      return row ? toApplication(row) : undefined;
    },
    async list() {
      const result = await client.query(
        "select * from app.list_landlord_onboarding_applications()",
      );
      return result.rows.map((row) => toApplication(row as ApplicationRow));
    },
    async submit(command) {
      const result = await client.query(
        "select * from app.submit_landlord_onboarding_application($1, $2, $3, $4, $5)",
        [command.applicantSubject, command.applicantObjectId,
          command.applicantName, command.proposedOrganizationName,
          command.correlationId],
      );
      const row = result.rows[0] as ApplicationRow | undefined;
      return row ? toApplication(row) : undefined;
    },
  };
}