-- KEYFORTA V002: database security, RLS, and immutable-record protections
-- The API must set these LOCAL transaction settings after validating the token
-- and membership; clients must never be allowed to set them directly.

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keyforta_runtime') THEN
        CREATE ROLE keyforta_runtime NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keyforta_worker') THEN
        CREATE ROLE keyforta_worker NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keyforta_reporting') THEN
        CREATE ROLE keyforta_reporting NOLOGIN;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION app.current_party_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(current_setting('app.party_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.is_platform_operator()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT current_setting('app.platform_access', true) = 'true'
$$;

CREATE OR REPLACE FUNCTION app.org_visible(row_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app.is_platform_operator() OR (
        row_organization_id IS NOT NULL
        AND row_organization_id = app.current_organization_id()
    )
$$;

CREATE OR REPLACE FUNCTION app.nullable_org_visible(row_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT app.is_platform_operator() OR (
        row_organization_id IS NOT NULL
        AND row_organization_id = app.current_organization_id()
    )
$$;

CREATE OR REPLACE FUNCTION app.reject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'immutable_record: % cannot be changed after insertion', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END
$$;

GRANT USAGE ON SCHEMA app TO keyforta_runtime, keyforta_worker, keyforta_reporting;
GRANT EXECUTE ON FUNCTION app.current_party_id(), app.current_organization_id(), app.is_platform_operator(), app.org_visible(uuid), app.nullable_org_visible(uuid) TO keyforta_runtime, keyforta_worker, keyforta_reporting;

-- Organization-owned tables. All ordinary reads/writes require the trusted
-- organization session context. There are deliberately no DELETE policies.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'organizations', 'memberships', 'invitations', 'properties', 'buildings',
        'units', 'unit_pricing_versions', 'rental_applications',
        'rental_application_versions', 'leases', 'lease_term_versions',
        'inspections', 'occupancy_periods', 'charge_schedules', 'charges',
        'ledger_accounts', 'ledger_entries', 'payment_intents', 'payments',
        'payment_allocations', 'refunds', 'reconciliation_batches',
        'maintenance_requests', 'maintenance_assignments', 'maintenance_access_windows',
        'maintenance_quotes', 'maintenance_reports', 'maintenance_evidence',
        'idempotency_records', 'support_access_grants', 'legal_holds', 'outbox_events'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.org_visible(organization_id))', table_name || '_select_rls', table_name);
        EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.org_visible(organization_id))', table_name || '_insert_rls', table_name);
        EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app.org_visible(organization_id)) WITH CHECK (app.org_visible(organization_id))', table_name || '_update_rls', table_name);
    END LOOP;
END
$$;

-- Tables whose organization_id is nullable: NULL means platform scope and is
-- available only to an explicitly elevated platform transaction.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'relationships', 'viewing_requests', 'documents', 'document_versions',
        'document_access_grants', 'conversations', 'notifications', 'audit_events'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.nullable_org_visible(organization_id))', table_name || '_select_rls', table_name);
        EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app.nullable_org_visible(organization_id))', table_name || '_insert_rls', table_name);
        EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app.nullable_org_visible(organization_id)) WITH CHECK (app.nullable_org_visible(organization_id))', table_name || '_update_rls', table_name);
    END LOOP;
END
$$;

-- Platform-scoped and self-scoped tables.
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties FORCE ROW LEVEL SECURITY;
CREATE POLICY parties_self_or_platform_select_rls ON parties
    FOR SELECT USING (app.is_platform_operator() OR id = app.current_party_id());
CREATE POLICY parties_self_or_platform_insert_rls ON parties
    FOR INSERT WITH CHECK (app.is_platform_operator() OR id = app.current_party_id());
CREATE POLICY parties_self_or_platform_update_rls ON parties
    FOR UPDATE USING (app.is_platform_operator() OR id = app.current_party_id())
    WITH CHECK (app.is_platform_operator() OR id = app.current_party_id());

ALTER TABLE external_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY external_identities_self_or_platform_select_rls ON external_identities
    FOR SELECT USING (app.is_platform_operator() OR party_id = app.current_party_id());
CREATE POLICY external_identities_self_or_platform_insert_rls ON external_identities
    FOR INSERT WITH CHECK (app.is_platform_operator() OR party_id = app.current_party_id());
CREATE POLICY external_identities_self_or_platform_update_rls ON external_identities
    FOR UPDATE USING (app.is_platform_operator() OR party_id = app.current_party_id())
    WITH CHECK (app.is_platform_operator() OR party_id = app.current_party_id());

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_self_or_platform_select_rls ON profiles
    FOR SELECT USING (app.is_platform_operator() OR party_id = app.current_party_id());
CREATE POLICY profiles_self_or_platform_insert_rls ON profiles
    FOR INSERT WITH CHECK (app.is_platform_operator() OR party_id = app.current_party_id());
CREATE POLICY profiles_self_or_platform_update_rls ON profiles
    FOR UPDATE USING (app.is_platform_operator() OR party_id = app.current_party_id())
    WITH CHECK (app.is_platform_operator() OR party_id = app.current_party_id());

ALTER TABLE service_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_offers FORCE ROW LEVEL SECURITY;
CREATE POLICY service_offers_self_or_platform_select_rls ON service_offers
    FOR SELECT USING (app.is_platform_operator() OR operator_party_id = app.current_party_id());
CREATE POLICY service_offers_self_or_platform_insert_rls ON service_offers
    FOR INSERT WITH CHECK (app.is_platform_operator() OR operator_party_id = app.current_party_id());
CREATE POLICY service_offers_self_or_platform_update_rls ON service_offers
    FOR UPDATE USING (app.is_platform_operator() OR operator_party_id = app.current_party_id())
    WITH CHECK (app.is_platform_operator() OR operator_party_id = app.current_party_id());

ALTER TABLE lease_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_parties FORCE ROW LEVEL SECURITY;
CREATE POLICY lease_parties_lease_scope_select_rls ON lease_parties
    FOR SELECT USING (app.is_platform_operator() OR EXISTS (
        SELECT 1 FROM leases l WHERE l.id = lease_id AND app.org_visible(l.organization_id)
    ));
CREATE POLICY lease_parties_lease_scope_insert_rls ON lease_parties
    FOR INSERT WITH CHECK (app.is_platform_operator() OR EXISTS (
        SELECT 1 FROM leases l WHERE l.id = lease_id AND app.org_visible(l.organization_id)
    ));
CREATE POLICY lease_parties_lease_scope_update_rls ON lease_parties
    FOR UPDATE USING (app.is_platform_operator() OR EXISTS (
        SELECT 1 FROM leases l WHERE l.id = lease_id AND app.org_visible(l.organization_id)
    )) WITH CHECK (app.is_platform_operator() OR EXISTS (
        SELECT 1 FROM leases l WHERE l.id = lease_id AND app.org_visible(l.organization_id)
    ));

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants FORCE ROW LEVEL SECURITY;
CREATE POLICY conversation_participants_scope_select_rls ON conversation_participants
    FOR SELECT USING (app.is_platform_operator() OR party_id = app.current_party_id() OR EXISTS (
        SELECT 1 FROM conversations c WHERE c.id = conversation_id AND app.nullable_org_visible(c.organization_id)
    ));
CREATE POLICY conversation_participants_scope_insert_rls ON conversation_participants
    FOR INSERT WITH CHECK (app.is_platform_operator() OR EXISTS (
        SELECT 1 FROM conversations c WHERE c.id = conversation_id AND app.nullable_org_visible(c.organization_id)
    ));
CREATE POLICY conversation_participants_scope_update_rls ON conversation_participants
    FOR UPDATE USING (app.is_platform_operator() OR party_id = app.current_party_id() OR EXISTS (
        SELECT 1 FROM conversations c WHERE c.id = conversation_id AND app.nullable_org_visible(c.organization_id)
    )) WITH CHECK (app.is_platform_operator() OR EXISTS (
        SELECT 1 FROM conversations c WHERE c.id = conversation_id AND app.nullable_org_visible(c.organization_id)
    ));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY messages_conversation_scope_select_rls ON messages
    FOR SELECT USING (app.is_platform_operator() OR sender_party_id = app.current_party_id() OR EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
          AND cp.party_id = app.current_party_id()
          AND cp.left_at IS NULL
    ));
CREATE POLICY messages_conversation_scope_insert_rls ON messages
    FOR INSERT WITH CHECK (app.is_platform_operator() OR sender_party_id = app.current_party_id() OR EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
          AND cp.party_id = app.current_party_id()
          AND cp.left_at IS NULL
    ));
CREATE POLICY messages_conversation_scope_update_rls ON messages
    FOR UPDATE USING (app.is_platform_operator() OR sender_party_id = app.current_party_id())
    WITH CHECK (app.is_platform_operator() OR sender_party_id = app.current_party_id());

-- Integration and projection internals are not directly user-readable.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'inbox_messages', 'provider_references', 'webhook_receipts',
        'reporting_projection_checkpoints', 'reference_currencies',
        'reference_locales', 'reference_roles', 'reference_policy_keys',
        'reference_maintenance_categories', 'event_schema_versions',
        'retention_policies', 'retention_executions'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (app.is_platform_operator()) WITH CHECK (app.is_platform_operator())', table_name || '_platform_rls', table_name);
    END LOOP;
END
$$;

-- Immutable records are protected both by permissions and by triggers so a
-- future elevated role cannot silently rewrite history.
CREATE TRIGGER audit_events_immutable_trg
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_mutation();
CREATE TRIGGER ledger_entries_immutable_trg
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_mutation();
CREATE TRIGGER document_versions_immutable_trg
    BEFORE UPDATE OR DELETE ON document_versions
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_mutation();

REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM keyforta_runtime, keyforta_worker, keyforta_reporting;
REVOKE UPDATE, DELETE ON audit_events, ledger_entries, document_versions FROM keyforta_runtime, keyforta_worker, keyforta_reporting;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO keyforta_runtime;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO keyforta_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO keyforta_reporting;

COMMIT;
