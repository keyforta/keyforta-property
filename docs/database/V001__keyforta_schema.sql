-- KEYFORTA V001: normative PostgreSQL schema
-- PostgreSQL 16+. Apply once through the migration role.
-- No application code is contained in this file.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE organization_type AS ENUM ('landlord', 'manager', 'operator', 'platform');
CREATE TYPE organization_status AS ENUM ('active', 'suspended', 'closed');
CREATE TYPE party_type AS ENUM ('person', 'legal_entity');
CREATE TYPE party_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE profile_type AS ENUM ('tenant', 'landlord', 'manager', 'maintenance_operator', 'platform_admin', 'support_agent');
CREATE TYPE verification_status AS ENUM ('not_started', 'pending', 'changes_requested', 'verified', 'rejected', 'expired', 'suspended');
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended', 'ended');
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE relationship_status AS ENUM ('pending', 'active', 'ended', 'revoked');
CREATE TYPE property_type AS ENUM ('residential', 'commercial', 'mixed_use');
CREATE TYPE unit_type AS ENUM ('apartment', 'house', 'room', 'office', 'retail', 'other');
CREATE TYPE publication_status AS ENUM ('draft', 'pending_review', 'published', 'paused', 'archived');
CREATE TYPE availability_status AS ENUM ('available', 'reserved', 'occupied', 'unavailable');
CREATE TYPE viewing_request_status AS ENUM ('requested', 'scheduled', 'completed', 'cancelled', 'no_show');
CREATE TYPE application_state AS ENUM ('draft', 'submitted_for_manager_review', 'changes_requested', 'resubmitted', 'approved', 'rejected', 'withdrawn');
CREATE TYPE lease_state AS ENUM ('draft', 'offered', 'accepted', 'signed', 'active', 'ended', 'terminated');
CREATE TYPE term_version_status AS ENUM ('draft', 'offered', 'accepted', 'signed', 'superseded');
CREATE TYPE occupancy_state AS ENUM ('planned', 'active', 'ended', 'cancelled');
CREATE TYPE charge_frequency AS ENUM ('one_time', 'monthly', 'quarterly', 'annual');
CREATE TYPE charge_state AS ENUM ('scheduled', 'generated', 'due', 'partially_paid', 'paid', 'waived', 'reversed');
CREATE TYPE ledger_account_type AS ENUM ('tenant_receivable', 'landlord_payable', 'deposit_liability', 'revenue', 'cash_clearing', 'provider_clearing', 'expense');
CREATE TYPE ledger_direction AS ENUM ('debit', 'credit');
CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'mobile_money', 'card', 'other');
CREATE TYPE payment_state AS ENUM ('initiated', 'pending', 'received', 'allocated', 'reconciled', 'failed', 'refunded', 'reversed');
CREATE TYPE refund_state AS ENUM ('requested', 'pending', 'completed', 'failed', 'cancelled');
CREATE TYPE reconciliation_state AS ENUM ('open', 'in_review', 'reconciled', 'exception', 'closed');
CREATE TYPE service_offer_state AS ENUM ('draft', 'published', 'paused', 'withdrawn');
CREATE TYPE maintenance_request_state AS ENUM ('submitted', 'triaged', 'assigned', 'accepted', 'scheduled', 'in_progress', 'completed', 'confirmed', 'reopened', 'cancelled');
CREATE TYPE assignment_state AS ENUM ('assigned', 'accepted', 'declined', 'ended', 'cancelled');
CREATE TYPE access_window_state AS ENUM ('scheduled', 'active', 'expired', 'cancelled');
CREATE TYPE quote_state AS ENUM ('draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'withdrawn', 'expired');
CREATE TYPE report_state AS ENUM ('draft', 'submitted', 'accepted', 'rejected');
CREATE TYPE inspection_type AS ENUM ('move_in', 'move_out', 'maintenance');
CREATE TYPE inspection_state AS ENUM ('draft', 'scheduled', 'in_progress', 'completed', 'accepted', 'cancelled');
CREATE TYPE document_state AS ENUM ('active', 'archived', 'deleted');
CREATE TYPE document_review_state AS ENUM ('review_pending', 'approved', 'rejected', 'quarantined');
CREATE TYPE access_grant_state AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE conversation_state AS ENUM ('open', 'closed', 'reported');
CREATE TYPE message_state AS ENUM ('sent', 'deleted', 'redacted');
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'whatsapp', 'in_app');
CREATE TYPE notification_delivery_state AS ENUM ('queued', 'sending', 'delivered', 'failed', 'cancelled');
CREATE TYPE audit_outcome AS ENUM ('success', 'denied', 'failure');
CREATE TYPE outbox_state AS ENUM ('pending', 'published', 'failed', 'dead_lettered');
CREATE TYPE inbox_state AS ENUM ('received', 'processed', 'failed', 'dead_lettered');
CREATE TYPE idempotency_state AS ENUM ('in_progress', 'completed', 'failed', 'expired');
CREATE TYPE webhook_state AS ENUM ('received', 'verified', 'processed', 'rejected', 'failed');
CREATE TYPE retention_action AS ENUM ('delete', 'anonymize', 'archive');
CREATE TYPE retention_execution_state AS ENUM ('started', 'completed', 'failed');
CREATE TYPE legal_hold_state AS ENUM ('active', 'released', 'expired');

CREATE TABLE parties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    party_type party_type NOT NULL,
    legal_name text,
    preferred_name text,
    status party_status NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT parties_name_required CHECK (nullif(trim(coalesce(legal_name, preferred_name, '')), '') IS NOT NULL)
);

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name citext NOT NULL,
    display_name citext NOT NULL,
    organization_type organization_type NOT NULL,
    status organization_status NOT NULL DEFAULT 'active',
    default_currency char(3) NOT NULL DEFAULT 'USD',
    time_zone text NOT NULL DEFAULT 'Africa/Kinshasa',
    jurisdiction_code text NOT NULL DEFAULT 'CD-KN',
    policy_version text NOT NULL DEFAULT 'initial',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organizations_currency_ck CHECK (default_currency IN ('USD', 'CDF')),
    CONSTRAINT organizations_name_ck CHECK (length(trim(legal_name::text)) > 0 AND length(trim(display_name::text)) > 0),
    CONSTRAINT organizations_legal_name_uq UNIQUE (legal_name)
);

CREATE TABLE external_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer text NOT NULL,
    subject text NOT NULL,
    party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    email citext,
    status text NOT NULL DEFAULT 'active',
    last_authenticated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT external_identities_status_ck CHECK (status IN ('active', 'disabled')),
    CONSTRAINT external_identities_issuer_subject_uq UNIQUE (issuer, subject)
);

CREATE TABLE profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    profile_type profile_type NOT NULL,
    display_name text NOT NULL,
    email citext,
    phone text,
    locale text NOT NULL DEFAULT 'fr-CD',
    verification_status verification_status NOT NULL DEFAULT 'not_started',
    service_area jsonb NOT NULL DEFAULT '{}'::jsonb,
    skills jsonb NOT NULL DEFAULT '[]'::jsonb,
    availability jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT profiles_display_name_ck CHECK (length(trim(display_name)) > 0),
    CONSTRAINT profiles_party_type_uq UNIQUE (party_id, profile_type)
);

CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    roles text[] NOT NULL,
    scope jsonb NOT NULL DEFAULT '{}'::jsonb,
    status membership_status NOT NULL DEFAULT 'invited',
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_to timestamptz,
    invitation_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT memberships_roles_ck CHECK (cardinality(roles) > 0),
    CONSTRAINT memberships_dates_ck CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT memberships_version_ck CHECK (version > 0)
);

CREATE TABLE invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    email citext NOT NULL,
    proposed_roles text[] NOT NULL,
    scope jsonb NOT NULL DEFAULT '{}'::jsonb,
    token_digest text NOT NULL,
    status invitation_status NOT NULL DEFAULT 'pending',
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    invited_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invitations_roles_ck CHECK (cardinality(proposed_roles) > 0),
    CONSTRAINT invitations_token_uq UNIQUE (token_digest),
    CONSTRAINT invitations_expiry_ck CHECK (expires_at > created_at)
);

ALTER TABLE memberships
    ADD CONSTRAINT memberships_invitation_fk
    FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE RESTRICT;

CREATE TABLE relationships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    from_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    to_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    relationship_type text NOT NULL,
    scope jsonb NOT NULL DEFAULT '{}'::jsonb,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_to timestamptz,
    status relationship_status NOT NULL DEFAULT 'pending',
    source text NOT NULL DEFAULT 'platform',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT relationships_parties_distinct_ck CHECK (from_party_id <> to_party_id),
    CONSTRAINT relationships_dates_ck CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT relationships_version_ck CHECK (version > 0)
);

CREATE TABLE properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name text NOT NULL,
    property_type property_type NOT NULL,
    address jsonb NOT NULL,
    time_zone text NOT NULL DEFAULT 'Africa/Kinshasa',
    verification_status verification_status NOT NULL DEFAULT 'not_started',
    publication_status publication_status NOT NULL DEFAULT 'draft',
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT properties_name_ck CHECK (length(trim(name)) > 0),
    CONSTRAINT properties_address_object_ck CHECK (jsonb_typeof(address) = 'object'),
    CONSTRAINT properties_version_ck CHECK (version > 0)
);

CREATE TABLE units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    label text NOT NULL,
    unit_type unit_type NOT NULL,
    bedrooms smallint,
    bathrooms numeric(4,1),
    area numeric(12,2),
    availability_status availability_status NOT NULL DEFAULT 'available',
    publication_status publication_status NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT units_label_ck CHECK (length(trim(label)) > 0),
    CONSTRAINT units_bedrooms_ck CHECK (bedrooms IS NULL OR bedrooms >= 0),
    CONSTRAINT units_bathrooms_ck CHECK (bathrooms IS NULL OR bathrooms >= 0),
    CONSTRAINT units_area_ck CHECK (area IS NULL OR area > 0),
    CONSTRAINT units_version_ck CHECK (version > 0),
    CONSTRAINT units_property_label_uq UNIQUE (property_id, label)
);

CREATE TABLE unit_pricing_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    amount_minor bigint NOT NULL,
    currency char(3) NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    discount_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    CONSTRAINT unit_pricing_amount_ck CHECK (amount_minor >= 0),
    CONSTRAINT unit_pricing_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT unit_pricing_dates_ck CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE viewing_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    requester_party_id uuid REFERENCES parties(id) ON DELETE RESTRICT,
    requester_name text,
    requester_email citext,
    requested_window tstzrange NOT NULL,
    scheduled_window tstzrange,
    status viewing_request_status NOT NULL DEFAULT 'requested',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT viewing_window_ck CHECK (NOT isempty(requested_window)),
    CONSTRAINT viewing_scheduled_window_ck CHECK (scheduled_window IS NULL OR NOT isempty(scheduled_window)),
    CONSTRAINT viewing_requester_ck CHECK (requester_party_id IS NOT NULL OR (requester_name IS NOT NULL AND requester_email IS NOT NULL)),
    CONSTRAINT viewing_version_ck CHECK (version > 0)
);

CREATE TABLE rental_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    applicant_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    state application_state NOT NULL DEFAULT 'draft',
    current_version integer NOT NULL DEFAULT 1,
    decision_reason text,
    decided_by uuid REFERENCES parties(id) ON DELETE RESTRICT,
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT rental_applications_current_version_ck CHECK (current_version > 0),
    CONSTRAINT rental_applications_version_ck CHECK (version > 0)
);

CREATE TABLE rental_application_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    application_id uuid NOT NULL REFERENCES rental_applications(id) ON DELETE RESTRICT,
    version_number integer NOT NULL,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    occupants jsonb NOT NULL DEFAULT '[]'::jsonb,
    income jsonb NOT NULL DEFAULT '{}'::jsonb,
    references_data jsonb NOT NULL DEFAULT '[]'::jsonb,
    requested_move_in date,
    consent jsonb NOT NULL DEFAULT '{}'::jsonb,
    document_ids uuid[] NOT NULL DEFAULT '{}',
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    CONSTRAINT rental_application_versions_number_ck CHECK (version_number > 0),
    CONSTRAINT rental_application_versions_uq UNIQUE (application_id, version_number)
);

CREATE TABLE leases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    state lease_state NOT NULL DEFAULT 'draft',
    term_start date NOT NULL,
    term_end date NOT NULL,
    rent_amount_minor bigint NOT NULL,
    rent_currency char(3) NOT NULL,
    deposit_amount_minor bigint NOT NULL DEFAULT 0,
    advance_rent_amount_minor bigint NOT NULL DEFAULT 0,
    due_day smallint NOT NULL DEFAULT 1,
    grace_period_days smallint NOT NULL DEFAULT 0,
    policy_version text NOT NULL,
    signed_terms_version integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT leases_dates_ck CHECK (term_end > term_start),
    CONSTRAINT leases_money_ck CHECK (rent_amount_minor > 0 AND deposit_amount_minor >= 0 AND advance_rent_amount_minor >= 0),
    CONSTRAINT leases_currency_ck CHECK (rent_currency IN ('USD', 'CDF')),
    CONSTRAINT leases_due_day_ck CHECK (due_day BETWEEN 1 AND 31),
    CONSTRAINT leases_grace_days_ck CHECK (grace_period_days BETWEEN 0 AND 365),
    CONSTRAINT leases_version_ck CHECK (version > 0)
);

CREATE TABLE lease_parties (
    lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
    party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    role text NOT NULL,
    signed_at timestamptz,
    acknowledged_at timestamptz,
    PRIMARY KEY (lease_id, party_id, role),
    CONSTRAINT lease_parties_role_ck CHECK (role IN ('landlord', 'tenant', 'co_tenant', 'guarantor', 'manager'))
);

CREATE TABLE lease_term_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
    version_number integer NOT NULL,
    terms jsonb NOT NULL,
    status term_version_status NOT NULL DEFAULT 'draft',
    content_hash text,
    offered_at timestamptz,
    signed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    CONSTRAINT lease_terms_version_ck CHECK (version_number > 0),
    CONSTRAINT lease_terms_signed_hash_ck CHECK (status <> 'signed' OR content_hash IS NOT NULL),
    CONSTRAINT lease_terms_uq UNIQUE (lease_id, version_number)
);

CREATE TABLE inspections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    lease_id uuid REFERENCES leases(id) ON DELETE RESTRICT,
    inspection_type inspection_type NOT NULL,
    state inspection_state NOT NULL DEFAULT 'draft',
    performed_at timestamptz,
    findings jsonb NOT NULL DEFAULT '[]'::jsonb,
    document_ids uuid[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT inspections_version_ck CHECK (version > 0)
);

CREATE TABLE occupancy_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
    unit_id uuid NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    start_date date NOT NULL,
    end_date date,
    state occupancy_state NOT NULL DEFAULT 'planned',
    move_in_inspection_id uuid REFERENCES inspections(id) ON DELETE RESTRICT,
    move_out_inspection_id uuid REFERENCES inspections(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT occupancy_dates_ck CHECK (end_date IS NULL OR end_date > start_date),
    CONSTRAINT occupancy_version_ck CHECK (version > 0)
);

CREATE TABLE charge_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
    frequency charge_frequency NOT NULL,
    due_day smallint NOT NULL DEFAULT 1,
    effective_from date NOT NULL,
    effective_to date,
    rules jsonb NOT NULL DEFAULT '{}'::jsonb,
    state text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT charge_schedules_state_ck CHECK (state IN ('active', 'closed')),
    CONSTRAINT charge_schedules_due_day_ck CHECK (due_day BETWEEN 1 AND 31),
    CONSTRAINT charge_schedules_dates_ck CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT charge_schedules_version_ck CHECK (version > 0)
);

CREATE TABLE charges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
    schedule_id uuid NOT NULL REFERENCES charge_schedules(id) ON DELETE RESTRICT,
    charge_type text NOT NULL,
    billing_period daterange NOT NULL,
    amount_minor bigint NOT NULL,
    currency char(3) NOT NULL,
    due_date date NOT NULL,
    state charge_state NOT NULL DEFAULT 'scheduled',
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT charges_amount_ck CHECK (amount_minor >= 0),
    CONSTRAINT charges_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT charges_period_ck CHECK (NOT isempty(billing_period)),
    CONSTRAINT charges_version_ck CHECK (version > 0),
    CONSTRAINT charges_schedule_period_uq UNIQUE (schedule_id, billing_period, charge_type)
);

CREATE TABLE ledger_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    account_type ledger_account_type NOT NULL,
    party_id uuid REFERENCES parties(id) ON DELETE RESTRICT,
    lease_id uuid REFERENCES leases(id) ON DELETE RESTRICT,
    currency char(3) NOT NULL,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT ledger_accounts_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT ledger_accounts_status_ck CHECK (status IN ('open', 'closed')),
    CONSTRAINT ledger_accounts_owner_ck CHECK (party_id IS NOT NULL OR lease_id IS NOT NULL),
    CONSTRAINT ledger_accounts_version_ck CHECK (version > 0)
);

CREATE TABLE ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    entry_group_id uuid NOT NULL,
    account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    direction ledger_direction NOT NULL,
    amount_minor bigint NOT NULL,
    currency char(3) NOT NULL,
    source_type text NOT NULL,
    source_id uuid NOT NULL,
    reversal_of_id uuid REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    posted_at timestamptz NOT NULL DEFAULT now(),
    period date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    CONSTRAINT ledger_entries_amount_ck CHECK (amount_minor > 0),
    CONSTRAINT ledger_entries_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT ledger_entries_self_reversal_ck CHECK (reversal_of_id IS NULL OR reversal_of_id <> id)
);

CREATE TABLE payment_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    lease_id uuid REFERENCES leases(id) ON DELETE RESTRICT,
    payer_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    amount_minor bigint NOT NULL,
    currency char(3) NOT NULL,
    method payment_method NOT NULL,
    provider text,
    provider_intent_id text,
    state payment_state NOT NULL DEFAULT 'initiated',
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT payment_intents_amount_ck CHECK (amount_minor > 0),
    CONSTRAINT payment_intents_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT payment_intents_provider_pair_ck CHECK ((provider IS NULL) = (provider_intent_id IS NULL)),
    CONSTRAINT payment_intents_version_ck CHECK (version > 0)
);

CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    lease_id uuid REFERENCES leases(id) ON DELETE RESTRICT,
    payer_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    amount_minor bigint NOT NULL,
    currency char(3) NOT NULL,
    method payment_method NOT NULL,
    provider text,
    provider_reference text,
    state payment_state NOT NULL DEFAULT 'pending',
    received_at timestamptz,
    reconciled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT payments_amount_ck CHECK (amount_minor > 0),
    CONSTRAINT payments_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT payments_provider_pair_ck CHECK ((provider IS NULL) = (provider_reference IS NULL)),
    CONSTRAINT payments_version_ck CHECK (version > 0),
    CONSTRAINT payments_provider_reference_uq UNIQUE (provider, provider_reference)
);

CREATE TABLE payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    charge_id uuid NOT NULL REFERENCES charges(id) ON DELETE RESTRICT,
    amount_minor bigint NOT NULL,
    currency char(3) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    CONSTRAINT payment_allocations_amount_ck CHECK (amount_minor > 0),
    CONSTRAINT payment_allocations_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT payment_allocations_payment_charge_uq UNIQUE (payment_id, charge_id)
);

CREATE TABLE refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    amount_minor bigint NOT NULL,
    currency char(3) NOT NULL,
    reason text NOT NULL,
    provider_refund_id text,
    state refund_state NOT NULL DEFAULT 'requested',
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT refunds_amount_ck CHECK (amount_minor > 0),
    CONSTRAINT refunds_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT refunds_reason_ck CHECK (length(trim(reason)) > 0),
    CONSTRAINT refunds_provider_ref_uq UNIQUE (provider_refund_id)
);

CREATE TABLE reconciliation_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    provider text NOT NULL,
    statement_reference text NOT NULL,
    period daterange NOT NULL,
    state reconciliation_state NOT NULL DEFAULT 'open',
    opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    exception_count integer NOT NULL DEFAULT 0,
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reconciliation_period_ck CHECK (NOT isempty(period)),
    CONSTRAINT reconciliation_exception_count_ck CHECK (exception_count >= 0),
    CONSTRAINT reconciliation_statement_uq UNIQUE (provider, statement_reference)
);

CREATE TABLE service_offers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    categories text[] NOT NULL,
    coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
    rates jsonb NOT NULL DEFAULT '{}'::jsonb,
    availability jsonb NOT NULL DEFAULT '{}'::jsonb,
    verification_status verification_status NOT NULL DEFAULT 'not_started',
    state service_offer_state NOT NULL DEFAULT 'draft',
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    CONSTRAINT service_offers_categories_ck CHECK (cardinality(categories) > 0),
    CONSTRAINT service_offers_version_ck CHECK (version > 0)
);

CREATE TABLE maintenance_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
    requester_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    category text NOT NULL,
    priority text NOT NULL DEFAULT 'normal',
    title text NOT NULL,
    description text NOT NULL,
    state maintenance_request_state NOT NULL DEFAULT 'submitted',
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT maintenance_requests_priority_ck CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT maintenance_requests_title_ck CHECK (length(trim(title)) > 0),
    CONSTRAINT maintenance_requests_description_ck CHECK (length(trim(description)) > 0),
    CONSTRAINT maintenance_requests_version_ck CHECK (version > 0)
);

CREATE TABLE maintenance_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE RESTRICT,
    operator_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    state assignment_state NOT NULL DEFAULT 'assigned',
    assigned_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT maintenance_assignments_dates_ck CHECK (ended_at IS NULL OR ended_at > assigned_at),
    CONSTRAINT maintenance_assignments_version_ck CHECK (version > 0)
);

CREATE TABLE maintenance_access_windows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE RESTRICT,
    operator_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    state access_window_state NOT NULL DEFAULT 'scheduled',
    scope jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT maintenance_access_windows_dates_ck CHECK (ends_at > starts_at),
    CONSTRAINT maintenance_access_windows_version_ck CHECK (version > 0)
);

CREATE TABLE maintenance_quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE RESTRICT,
    operator_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    labor_amount_minor bigint NOT NULL DEFAULT 0,
    materials_amount_minor bigint NOT NULL DEFAULT 0,
    fees_amount_minor bigint NOT NULL DEFAULT 0,
    total_amount_minor bigint NOT NULL,
    currency char(3) NOT NULL,
    valid_until timestamptz NOT NULL,
    state quote_state NOT NULL DEFAULT 'draft',
    reviewed_by uuid REFERENCES parties(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT maintenance_quotes_components_ck CHECK (labor_amount_minor >= 0 AND materials_amount_minor >= 0 AND fees_amount_minor >= 0),
    CONSTRAINT maintenance_quotes_total_ck CHECK (total_amount_minor = labor_amount_minor + materials_amount_minor + fees_amount_minor),
    CONSTRAINT maintenance_quotes_currency_ck CHECK (currency IN ('USD', 'CDF')),
    CONSTRAINT maintenance_quotes_version_ck CHECK (version > 0)
);

CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    owner_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    related_type text NOT NULL,
    related_id uuid NOT NULL,
    document_type text NOT NULL,
    state document_state NOT NULL DEFAULT 'active',
    retention_policy_version text NOT NULL,
    legal_hold boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT documents_version_ck CHECK (version > 0)
);

CREATE TABLE document_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_number integer NOT NULL,
    storage_key text NOT NULL,
    content_hash text NOT NULL,
    media_type text NOT NULL,
    size_bytes bigint NOT NULL,
    review_state document_review_state NOT NULL DEFAULT 'review_pending',
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    uploaded_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    activated_at timestamptz,
    CONSTRAINT document_versions_number_ck CHECK (version_number > 0),
    CONSTRAINT document_versions_size_ck CHECK (size_bytes > 0),
    CONSTRAINT document_versions_storage_key_ck CHECK (storage_key !~ '(^/|\\.\\.|(^|/)public(/|$))'),
    CONSTRAINT document_versions_uq UNIQUE (document_id, version_number),
    CONSTRAINT document_versions_hash_uq UNIQUE (document_id, content_hash)
);

CREATE TABLE document_access_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    grantee_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    scope jsonb NOT NULL DEFAULT '{}'::jsonb,
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz NOT NULL,
    state access_grant_state NOT NULL DEFAULT 'active',
    granted_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT document_access_grants_dates_ck CHECK (ends_at > starts_at),
    CONSTRAINT document_access_grants_revoked_ck CHECK (state <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE TABLE maintenance_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE RESTRICT,
    operator_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    arrival_at timestamptz,
    work_started_at timestamptz,
    completion_at timestamptz,
    work_performed text NOT NULL,
    materials jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_cost_minor bigint,
    currency char(3),
    customer_confirmation jsonb NOT NULL DEFAULT '{}'::jsonb,
    state report_state NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT maintenance_reports_work_ck CHECK (length(trim(work_performed)) > 0),
    CONSTRAINT maintenance_reports_cost_pair_ck CHECK ((total_cost_minor IS NULL AND currency IS NULL) OR (total_cost_minor IS NOT NULL AND total_cost_minor >= 0 AND currency IN ('USD', 'CDF'))),
    CONSTRAINT maintenance_reports_version_ck CHECK (version > 0)
);

CREATE TABLE maintenance_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    report_id uuid NOT NULL REFERENCES maintenance_reports(id) ON DELETE RESTRICT,
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    evidence_type text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT
);

CREATE TABLE conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    subject_type text NOT NULL,
    subject_id uuid NOT NULL,
    state conversation_state NOT NULL DEFAULT 'open',
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
    party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    joined_at timestamptz NOT NULL DEFAULT now(),
    left_at timestamptz,
    PRIMARY KEY (conversation_id, party_id),
    CONSTRAINT conversation_participants_dates_ck CHECK (left_at IS NULL OR left_at > joined_at)
);

CREATE TABLE messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
    sender_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    body text NOT NULL,
    attachment_ids uuid[] NOT NULL DEFAULT '{}',
    sent_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    state message_state NOT NULL DEFAULT 'sent',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messages_body_ck CHECK (length(trim(body)) > 0)
);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    recipient_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    notification_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    channel notification_channel NOT NULL,
    delivery_state notification_delivery_state NOT NULL DEFAULT 'queued',
    provider_reference text,
    retry_count integer NOT NULL DEFAULT 0,
    scheduled_at timestamptz,
    delivered_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notifications_retry_count_ck CHECK (retry_count >= 0),
    CONSTRAINT notifications_title_ck CHECK (length(trim(title)) > 0),
    CONSTRAINT notifications_body_ck CHECK (length(trim(body)) > 0),
    CONSTRAINT notifications_provider_reference_uq UNIQUE (channel, provider_reference)
);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_party_id uuid REFERENCES parties(id) ON DELETE RESTRICT,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id uuid,
    outcome audit_outcome NOT NULL,
    reason text,
    source text NOT NULL,
    request_id text,
    correlation_id text,
    before_state jsonb,
    after_state jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_events_action_ck CHECK (length(trim(action)) > 0),
    CONSTRAINT audit_events_source_ck CHECK (length(trim(source)) > 0)
);

CREATE TABLE support_access_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    support_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    scope jsonb NOT NULL,
    reason text NOT NULL,
    approved_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    state access_grant_state NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    CONSTRAINT support_access_dates_ck CHECK (ends_at > starts_at),
    CONSTRAINT support_access_reason_ck CHECK (length(trim(reason)) > 0),
    CONSTRAINT support_access_revoked_ck CHECK (state <> 'revoked' OR revoked_at IS NOT NULL)
);

CREATE TABLE retention_policies (
    policy_key text PRIMARY KEY,
    data_class text NOT NULL,
    retention_days integer NOT NULL,
    action retention_action NOT NULL,
    legal_basis text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    effective_from date NOT NULL,
    effective_to date,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    CONSTRAINT retention_policies_days_ck CHECK (retention_days >= 0),
    CONSTRAINT retention_policies_dates_ck CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT retention_policies_version_ck CHECK (version > 0)
);

CREATE TABLE legal_holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    reason text NOT NULL,
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz,
    state legal_hold_state NOT NULL DEFAULT 'active',
    created_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    released_by uuid REFERENCES parties(id) ON DELETE RESTRICT,
    released_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT legal_holds_reason_ck CHECK (length(trim(reason)) > 0),
    CONSTRAINT legal_holds_dates_ck CHECK (ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT legal_holds_release_ck CHECK ((state = 'active' AND released_at IS NULL AND released_by IS NULL) OR (state IN ('released', 'expired') AND released_at IS NOT NULL AND released_by IS NOT NULL))
);

CREATE TABLE retention_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_key text NOT NULL REFERENCES retention_policies(policy_key) ON DELETE RESTRICT,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    rows_evaluated bigint NOT NULL DEFAULT 0,
    rows_deleted bigint NOT NULL DEFAULT 0,
    rows_anonymized bigint NOT NULL DEFAULT 0,
    rows_archived bigint NOT NULL DEFAULT 0,
    failure_count integer NOT NULL DEFAULT 0,
    state retention_execution_state NOT NULL DEFAULT 'started',
    error_summary text,
    executed_by uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    CONSTRAINT retention_executions_counts_ck CHECK (rows_evaluated >= 0 AND rows_deleted >= 0 AND rows_anonymized >= 0 AND rows_archived >= 0 AND failure_count >= 0)
);

CREATE TABLE outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    schema_version integer NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
    payload jsonb NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    state outbox_state NOT NULL DEFAULT 'pending',
    attempt_count integer NOT NULL DEFAULT 0,
    last_error text,
    CONSTRAINT outbox_events_schema_version_ck CHECK (schema_version > 0),
    CONSTRAINT outbox_events_attempt_count_ck CHECK (attempt_count >= 0)
);

CREATE TABLE inbox_messages (
    consumer_name text NOT NULL,
    event_id uuid NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    state inbox_state NOT NULL DEFAULT 'received',
    attempt_count integer NOT NULL DEFAULT 0,
    last_error text,
    PRIMARY KEY (consumer_name, event_id),
    CONSTRAINT inbox_messages_attempt_count_ck CHECK (attempt_count >= 0)
);

CREATE TABLE idempotency_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_key text NOT NULL,
    actor_party_id uuid NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
    operation text NOT NULL,
    request_hash text NOT NULL,
    response_status integer,
    response_body jsonb,
    resource_type text,
    resource_id uuid,
    state idempotency_state NOT NULL DEFAULT 'in_progress',
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT idempotency_response_ck CHECK ((state = 'completed') = (response_status IS NOT NULL AND response_body IS NOT NULL)),
    CONSTRAINT idempotency_scope_uq UNIQUE (scope_key, actor_party_id, operation)
);

CREATE TABLE provider_references (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    provider_object_type text NOT NULL,
    provider_object_id text NOT NULL,
    internal_type text NOT NULL,
    internal_id uuid NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT provider_references_external_uq UNIQUE (provider, provider_object_type, provider_object_id),
    CONSTRAINT provider_references_internal_uq UNIQUE (provider, internal_type, internal_id)
);

CREATE TABLE webhook_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    signature_verified boolean NOT NULL DEFAULT false,
    received_at timestamptz NOT NULL DEFAULT now(),
    payload_hash text NOT NULL,
    payload jsonb,
    state webhook_state NOT NULL DEFAULT 'received',
    processed_at timestamptz,
    error_message text,
    CONSTRAINT webhook_receipts_provider_event_uq UNIQUE (provider, provider_event_id),
    CONSTRAINT webhook_receipts_verified_state_ck CHECK (state NOT IN ('verified', 'processed') OR signature_verified)
);

CREATE TABLE reporting_projection_checkpoints (
    projection_name text PRIMARY KEY,
    last_event_id uuid,
    last_occurred_at timestamptz,
    generated_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'healthy',
    error_message text,
    CONSTRAINT reporting_projection_status_ck CHECK (status IN ('healthy', 'degraded', 'rebuilding'))
);

CREATE TABLE reference_currencies (
    code char(3) PRIMARY KEY,
    name text NOT NULL,
    minor_unit smallint NOT NULL,
    active boolean NOT NULL DEFAULT true,
    CONSTRAINT reference_currencies_code_ck CHECK (code IN ('USD', 'CDF')),
    CONSTRAINT reference_currencies_minor_unit_ck CHECK (minor_unit BETWEEN 0 AND 4)
);

CREATE TABLE reference_locales (
    code text PRIMARY KEY,
    display_name text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    CONSTRAINT reference_locales_code_ck CHECK (code IN ('fr-CD', 'en-US', 'ln-CD'))
);

CREATE TABLE reference_roles (
    code text PRIMARY KEY,
    display_name text NOT NULL,
    platform_role boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT true,
    CONSTRAINT reference_roles_code_ck CHECK (code IN ('tenant', 'landlord', 'manager', 'maintenance_operator', 'platform_admin', 'support_agent'))
);

CREATE TABLE reference_policy_keys (
    key text PRIMARY KEY,
    description text NOT NULL,
    value_type text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    CONSTRAINT reference_policy_keys_value_type_ck CHECK (value_type IN ('boolean', 'integer', 'decimal', 'text', 'json'))
);

CREATE TABLE reference_maintenance_categories (
    code text PRIMARY KEY,
    display_name text NOT NULL,
    default_priority text NOT NULL DEFAULT 'normal',
    active boolean NOT NULL DEFAULT true,
    CONSTRAINT reference_maintenance_categories_priority_ck CHECK (default_priority IN ('low', 'normal', 'high', 'urgent'))
);

CREATE TABLE event_schema_versions (
    event_type text NOT NULL,
    schema_version integer NOT NULL,
    description text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_type, schema_version),
    CONSTRAINT event_schema_versions_version_ck CHECK (schema_version > 0)
);

-- Cross-row integrity that PostgreSQL can enforce directly.
ALTER TABLE unit_pricing_versions
    ADD CONSTRAINT unit_pricing_no_overlap_excl
    EXCLUDE USING gist (unit_id WITH =, daterange(effective_from, effective_to, '[)') WITH &&);

ALTER TABLE leases
    ADD CONSTRAINT leases_active_no_overlap_excl
    EXCLUDE USING gist (unit_id WITH =, daterange(term_start, term_end, '[)') WITH &&)
    WHERE (state IN ('signed', 'active'));

ALTER TABLE occupancy_periods
    ADD CONSTRAINT occupancy_active_no_overlap_excl
    EXCLUDE USING gist (unit_id WITH =, daterange(start_date, end_date, '[)') WITH &&)
    WHERE (state IN ('planned', 'active'));

ALTER TABLE charge_schedules
    ADD CONSTRAINT charge_schedules_no_overlap_excl
    EXCLUDE USING gist (lease_id WITH =, daterange(effective_from, effective_to, '[)') WITH &&)
    WHERE (state = 'active');

ALTER TABLE maintenance_assignments
    ADD CONSTRAINT maintenance_assignments_one_active_uq
    UNIQUE (maintenance_request_id, operator_party_id, assigned_at);

-- Index definitions.
CREATE INDEX external_identities_party_idx ON external_identities (party_id);
CREATE INDEX profiles_verification_idx ON profiles (verification_status);
CREATE INDEX memberships_org_status_idx ON memberships (organization_id, status);
CREATE INDEX memberships_party_status_idx ON memberships (party_id, status);
CREATE INDEX invitations_org_status_expiry_idx ON invitations (organization_id, status, expires_at);
CREATE INDEX relationships_subject_idx ON relationships (subject_type, subject_id, status);
CREATE INDEX relationships_parties_idx ON relationships (from_party_id, to_party_id, status);
CREATE INDEX properties_org_publication_idx ON properties (organization_id, publication_status);
CREATE INDEX properties_address_gin_idx ON properties USING gin (address);
CREATE INDEX units_property_availability_idx ON units (property_id, availability_status);
CREATE INDEX units_org_publication_idx ON units (organization_id, publication_status);
CREATE INDEX unit_pricing_unit_effective_idx ON unit_pricing_versions (unit_id, effective_from DESC);
CREATE INDEX viewing_requests_unit_status_idx ON viewing_requests (unit_id, status);
CREATE INDEX applications_org_state_idx ON rental_applications (organization_id, state);
CREATE INDEX applications_unit_state_idx ON rental_applications (unit_id, state);
CREATE INDEX applications_applicant_created_idx ON rental_applications (applicant_party_id, created_at DESC);
CREATE INDEX application_versions_application_idx ON rental_application_versions (application_id, version_number DESC);
CREATE INDEX leases_org_state_idx ON leases (organization_id, state);
CREATE INDEX leases_unit_state_idx ON leases (unit_id, state);
CREATE INDEX lease_parties_party_idx ON lease_parties (party_id, lease_id);
CREATE INDEX inspections_unit_state_idx ON inspections (unit_id, state);
CREATE INDEX occupancy_unit_state_idx ON occupancy_periods (unit_id, state);
CREATE INDEX charge_schedules_lease_state_idx ON charge_schedules (lease_id, state);
CREATE INDEX charges_org_state_due_idx ON charges (organization_id, state, due_date);
CREATE INDEX charges_lease_due_idx ON charges (lease_id, due_date);
CREATE INDEX ledger_accounts_org_type_idx ON ledger_accounts (organization_id, account_type, status);
CREATE INDEX ledger_entries_account_period_idx ON ledger_entries (account_id, period);
CREATE INDEX ledger_entries_source_idx ON ledger_entries (source_type, source_id);
CREATE INDEX ledger_entries_group_idx ON ledger_entries (entry_group_id);
CREATE INDEX payment_intents_lease_state_idx ON payment_intents (lease_id, state);
CREATE INDEX payments_org_state_received_idx ON payments (organization_id, state, received_at);
CREATE INDEX payments_lease_idx ON payments (lease_id, received_at DESC);
CREATE INDEX payment_allocations_charge_idx ON payment_allocations (charge_id);
CREATE INDEX refunds_payment_state_idx ON refunds (payment_id, state);
CREATE INDEX reconciliation_org_state_idx ON reconciliation_batches (organization_id, state);
CREATE INDEX service_offers_categories_gin_idx ON service_offers USING gin (categories);
CREATE INDEX service_offers_state_verification_idx ON service_offers (state, verification_status);
CREATE INDEX maintenance_requests_org_state_priority_idx ON maintenance_requests (organization_id, state, priority);
CREATE INDEX maintenance_requests_unit_idx ON maintenance_requests (unit_id, created_at DESC);
CREATE INDEX maintenance_requests_requester_idx ON maintenance_requests (requester_party_id, created_at DESC);
CREATE INDEX maintenance_assignments_operator_state_idx ON maintenance_assignments (operator_party_id, state);
CREATE UNIQUE INDEX maintenance_assignments_one_active_idx ON maintenance_assignments (maintenance_request_id) WHERE state IN ('assigned', 'accepted');
CREATE INDEX maintenance_access_operator_time_idx ON maintenance_access_windows (operator_party_id, starts_at, ends_at);
CREATE INDEX maintenance_access_request_idx ON maintenance_access_windows (maintenance_request_id, state);
CREATE INDEX maintenance_quotes_request_state_idx ON maintenance_quotes (maintenance_request_id, state);
CREATE INDEX documents_related_idx ON documents (related_type, related_id);
CREATE INDEX documents_owner_type_idx ON documents (owner_party_id, document_type, state);
CREATE INDEX document_versions_document_idx ON document_versions (document_id, version_number DESC);
CREATE INDEX document_versions_review_idx ON document_versions (review_state, uploaded_at);
CREATE INDEX document_access_document_grantee_idx ON document_access_grants (document_id, grantee_party_id, state);
CREATE INDEX conversations_subject_idx ON conversations (subject_type, subject_id, state);
CREATE INDEX conversation_participants_party_idx ON conversation_participants (party_id, conversation_id);
CREATE INDEX messages_conversation_sent_idx ON messages (conversation_id, sent_at);
CREATE INDEX notifications_recipient_state_idx ON notifications (recipient_party_id, delivery_state, scheduled_at);
CREATE INDEX audit_events_org_time_idx ON audit_events (organization_id, occurred_at DESC);
CREATE INDEX audit_events_target_idx ON audit_events (target_type, target_id, occurred_at DESC);
CREATE INDEX audit_events_correlation_idx ON audit_events (correlation_id);
CREATE INDEX support_access_org_state_idx ON support_access_grants (organization_id, state, ends_at);
CREATE INDEX legal_holds_org_target_idx ON legal_holds (organization_id, target_type, target_id, state);
CREATE INDEX legal_holds_active_idx ON legal_holds (target_type, target_id) WHERE state = 'active';
CREATE INDEX retention_policies_active_idx ON retention_policies (active, effective_from);
CREATE INDEX retention_executions_policy_state_idx ON retention_executions (policy_key, state, started_at DESC);
CREATE INDEX outbox_pending_idx ON outbox_events (occurred_at, id) WHERE state IN ('pending', 'failed');
CREATE INDEX outbox_aggregate_order_idx ON outbox_events (aggregate_type, aggregate_id, occurred_at, id);
CREATE INDEX inbox_state_idx ON inbox_messages (state, received_at);
CREATE INDEX idempotency_expiry_idx ON idempotency_records (expires_at);
CREATE INDEX provider_references_internal_idx ON provider_references (internal_type, internal_id);
CREATE INDEX webhook_receipts_state_idx ON webhook_receipts (state, received_at);
CREATE INDEX reference_policy_keys_active_idx ON reference_policy_keys (active);
CREATE INDEX reference_maintenance_categories_active_idx ON reference_maintenance_categories (active);
CREATE INDEX event_schema_versions_active_idx ON event_schema_versions (active, event_type);

COMMIT;
