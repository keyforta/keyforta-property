-- KEYFORTA V003: idempotent reference/seed data
-- This file contains no real users, tenants, payments, documents, or secrets.

BEGIN;

INSERT INTO reference_currencies (code, name, minor_unit) VALUES
    ('USD', 'United States dollar', 2),
    ('CDF', 'Congolese franc', 2)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, minor_unit = EXCLUDED.minor_unit, active = true;

INSERT INTO reference_locales (code, display_name) VALUES
    ('fr-CD', 'Français — République démocratique du Congo'),
    ('en-US', 'English — United States'),
    ('ln-CD', 'Lingála — République démocratique du Congo')
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name, active = true;

INSERT INTO reference_roles (code, display_name, platform_role) VALUES
    ('tenant', 'Tenant', false),
    ('landlord', 'Landlord', false),
    ('manager', 'Property manager', false),
    ('maintenance_operator', 'Maintenance operator', false),
    ('platform_admin', 'Platform administrator', true),
    ('support_agent', 'Support agent', true)
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name, platform_role = EXCLUDED.platform_role, active = true;

INSERT INTO reference_policy_keys (key, description, value_type) VALUES
    ('lease.deposit.max_months', 'Maximum deposit months; remains disabled until jurisdiction policy approval.', 'decimal'),
    ('lease.advance_rent.max_months', 'Maximum advance-rent months; remains disabled until jurisdiction policy approval.', 'decimal'),
    ('lease.notice.period_days', 'Notice period; remains disabled until jurisdiction policy approval.', 'integer'),
    ('privacy.application.retention_days', 'Application retention period after the business purpose ends.', 'integer'),
    ('privacy.document.retention_days', 'Default document retention period before legal-hold evaluation.', 'integer'),
    ('privacy.legal_hold.enabled', 'Whether legal hold blocks ordinary deletion/anonymization.', 'boolean'),
    ('payments.automated_collection.enabled', 'Whether automated payment collection is enabled.', 'boolean'),
    ('verification.human_approval.required', 'Whether a human approval is required before verification becomes active.', 'boolean'),
    ('notifications.whatsapp.enabled', 'Whether WhatsApp delivery is enabled after consent/provider approval.', 'boolean')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description, value_type = EXCLUDED.value_type, active = true;

INSERT INTO reference_maintenance_categories (code, display_name, default_priority) VALUES
    ('plumbing', 'Plumbing', 'high'),
    ('electrical', 'Electrical', 'high'),
    ('hvac', 'Heating, ventilation, and air conditioning', 'normal'),
    ('appliance', 'Appliance', 'normal'),
    ('structural', 'Structural', 'urgent'),
    ('security', 'Security', 'urgent'),
    ('cleaning', 'Cleaning', 'normal'),
    ('other', 'Other', 'normal')
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name, default_priority = EXCLUDED.default_priority, active = true;

INSERT INTO event_schema_versions (event_type, schema_version, description) VALUES
    ('PropertyPublished', 1, 'A property became publicly discoverable.'),
    ('UnitAvailabilityChanged', 1, 'Unit availability or publication state changed.'),
    ('RentalApplicationSubmitted', 1, 'A versioned rental application was submitted.'),
    ('ApplicationApproved', 1, 'An authorized human approved an application.'),
    ('LeaseSigned', 1, 'A lease terms version was signed or acknowledged.'),
    ('LeaseActivated', 1, 'A lease became active.'),
    ('ChargeGenerated', 1, 'A deterministic charge was generated for a billing period.'),
    ('LedgerEntryPosted', 1, 'An immutable ledger entry group was posted.'),
    ('PaymentRecorded', 1, 'A payment was recorded after provider/cash validation.'),
    ('PaymentAllocated', 1, 'A payment was allocated to one or more charges.'),
    ('PaymentReconciled', 1, 'A payment was reconciled to a provider statement.'),
    ('MaintenanceRequestSubmitted', 1, 'A maintenance request was submitted.'),
    ('MaintenanceRequestAssigned', 1, 'An eligible operator was assigned.'),
    ('MaintenanceRequestCompleted', 1, 'Required maintenance work and evidence were submitted.'),
    ('DocumentVersionUploaded', 1, 'A private document version was uploaded and registered.'),
    ('DocumentAccessGranted', 1, 'Time-bounded document access was granted.'),
    ('NotificationQueued', 1, 'A notification was queued for asynchronous delivery.')
ON CONFLICT (event_type, schema_version) DO UPDATE
SET description = EXCLUDED.description, active = true;

COMMIT;
