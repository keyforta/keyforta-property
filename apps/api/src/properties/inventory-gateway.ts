import type {
  JurisdictionPolicyActivationResult,
  PropertyVerificationStatusResult,
} from "@keyforta/contracts";

import type { DatabaseClient } from "../database.js";

export interface ActivateJurisdictionPolicyCommand {
  correlationId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  jurisdictionCode: string;
  ownerApproval: {
    approvedAt?: string;
    approvedByUserId: string;
    evidenceHash?: string;
    sourceReference: string;
  };
  policyKey: string;
  requiresCounselApproval: boolean;
  rulePayload: Record<string, unknown>;
  subject: string;
  version: number;
  counselApproval?: {
    approvedAt?: string;
    approvedByUserId: string;
    evidenceHash?: string;
    sourceReference: string;
  } | null;
}

export interface SetPropertyVerificationStatusCommand {
  correlationId: string;
  organizationId: string;
  propertyId: string;
  status: JurisdictionPolicyActivationStatus;
  subject: string;
}

export interface InventoryGateway {
  activateJurisdictionPolicy(
    command: ActivateJurisdictionPolicyCommand,
  ): Promise<JurisdictionPolicyActivationResult | undefined>;
  setPropertyVerificationStatus(
    command: SetPropertyVerificationStatusCommand,
  ): Promise<PropertyVerificationStatusResult | undefined>;
}

interface ResolvedActor {
  actor_id: string;
}

type JurisdictionPolicyActivationStatus = PropertyVerificationStatusResult["status"];

export function createPostgresInventoryGateway(
  client: DatabaseClient,
): InventoryGateway {
  return {
    async activateJurisdictionPolicy(command) {
      return client.transaction(async (session) => {
        const actor = await session.query(
          "select * from app.resolve_actor($1, null)",
          [command.subject],
        );
        const row = actor.rows[0] as ResolvedActor | undefined;
        if (!row?.actor_id) return undefined;
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        const result = await session.query(
          `with inserted_policy as (
            insert into app.jurisdiction_policy_versions (
              policy_key, jurisdiction_code, version, rule_payload,
              requires_counsel_approval, created_by_user_id
            ) values ($1, $2, $3, $4::jsonb, $5, $6)
            on conflict (policy_key, jurisdiction_code, version) do nothing
            returning id, policy_key, jurisdiction_code, version
          ), selected_policy as (
            select id, policy_key, jurisdiction_code, version
            from inserted_policy
            union all
            select existing.id, existing.policy_key, existing.jurisdiction_code, existing.version
            from app.jurisdiction_policy_versions as existing
            where existing.policy_key = $1
              and existing.jurisdiction_code = $2
              and existing.version = $3
            limit 1
          ), inserted_owner as (
            insert into app.policy_approval_evidence (
              policy_version_id, approval_role, approved_by_user_id, approved_at,
              source_reference, evidence_hash
            )
            select id, 'policy_owner', $7, coalesce($8::timestamptz, transaction_timestamp()), $9, $10
            from selected_policy
            returning id
          ), inserted_counsel as (
            insert into app.policy_approval_evidence (
              policy_version_id, approval_role, approved_by_user_id, approved_at,
              source_reference, evidence_hash
            )
            select id, 'qualified_counsel', $11, coalesce($12::timestamptz, transaction_timestamp()), $13, $14
            from selected_policy
            where $11::uuid is not null
            returning id
          )
          select
            app.activate_jurisdiction_policy(
              (select id from selected_policy),
              (select id from inserted_owner),
              (select id from inserted_counsel),
              $15::timestamptz,
              $16::timestamptz,
              $6,
              $17
            ) as activation_id,
            (select id from selected_policy) as policy_version_id,
            (select policy_key from selected_policy) as policy_key,
            (select jurisdiction_code from selected_policy) as jurisdiction_code,
            (select version from selected_policy) as version`,
          [
            command.policyKey,
            command.jurisdictionCode,
            command.version,
            JSON.stringify(command.rulePayload),
            command.requiresCounselApproval,
            row.actor_id,
            command.ownerApproval.approvedByUserId,
            command.ownerApproval.approvedAt ?? null,
            command.ownerApproval.sourceReference,
            command.ownerApproval.evidenceHash ?? null,
            command.counselApproval?.approvedByUserId ?? null,
            command.counselApproval?.approvedAt ?? null,
            command.counselApproval?.sourceReference ?? null,
            command.counselApproval?.evidenceHash ?? null,
            command.effectiveFrom,
            command.effectiveTo ?? null,
            command.correlationId,
          ],
        );
        const created = result.rows[0] as {
          activation_id?: string;
          jurisdiction_code?: string;
          policy_key?: string;
          policy_version_id?: string;
          version?: number;
        } | undefined;
        if (!created?.activation_id || !created.policy_version_id || !created.policy_key || !created.jurisdiction_code || !created.version) {
          return undefined;
        }
        return {
          activationId: created.activation_id,
          jurisdictionCode: created.jurisdiction_code,
          policyKey: created.policy_key,
          policyVersionId: created.policy_version_id,
          version: created.version,
        };
      });
    },
    async setPropertyVerificationStatus(command) {
      return client.transaction(async (session) => {
        const actor = await session.query("select * from app.resolve_actor($1, $2)", [
          command.subject,
          command.organizationId,
        ]);
        const row = actor.rows[0] as ResolvedActor | undefined;
        if (!row?.actor_id) return undefined;
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        const result = await session.query(
          "select * from app.set_property_verification_status($1, $2, $3)",
          [command.propertyId, command.status, row.actor_id],
        );
        const updated = result.rows[0] as {
          property_id?: string;
          verification_status?: PropertyVerificationStatusResult["status"];
        } | undefined;
        if (!updated?.property_id || !updated.verification_status) return undefined;
        return {
          propertyId: updated.property_id,
          status: updated.verification_status,
        };
      });
    },
  };
}
