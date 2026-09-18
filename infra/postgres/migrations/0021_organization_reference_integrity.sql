begin;

set local lock_timeout = '5s';

alter table app.properties no force row level security;
alter table app.units no force row level security;
alter table app.payments no force row level security;
alter table app.public_listings no force row level security;
alter table app.public_listing_inquiries no force row level security;
alter table app.membership_invitations no force row level security;
alter table app.memberships no force row level security;
alter table app.tenant_applications no force row level security;
alter table app.tenant_application_reviews no force row level security;
alter table app.tenant_application_documents no force row level security;
alter table app.leases no force row level security;
alter table app.audit_events no force row level security;

alter table app.units
  drop constraint units_property_id_fkey,
  add constraint units_organization_property_fkey
    foreign key (organization_id, property_id)
    references app.properties(organization_id, id);

alter table app.tenant_applications
  add constraint tenant_applications_organization_id_id_key
    unique (organization_id, id);

alter table app.payments
  drop constraint payments_reverses_payment_id_fkey,
  add constraint payments_organization_reversal_fkey
    foreign key (organization_id, reverses_payment_id)
    references app.payments(organization_id, id);

alter table app.public_listing_inquiries
  drop constraint public_listing_inquiries_listing_id_fkey,
  add constraint public_listing_inquiries_organization_listing_fkey
    foreign key (organization_id, listing_id)
    references app.public_listings(organization_id, id);

alter table app.membership_invitations
  add constraint membership_invitations_organization_id_id_key
    unique (organization_id, id);

alter table app.membership_invitation_tokens
  drop constraint membership_invitation_tokens_invitation_id_fkey,
  add constraint membership_invitation_tokens_organization_invitation_fkey
    foreign key (organization_id, invitation_id)
    references app.membership_invitations(organization_id, id)
    on delete cascade;

alter table app.memberships
  add constraint memberships_organization_id_id_key
    unique (organization_id, id);

alter table app.landlord_onboarding_decisions
  drop constraint landlord_onboarding_decisions_membership_id_fkey,
  add constraint landlord_onboarding_decisions_organization_membership_fkey
    foreign key (organization_id, membership_id)
    references app.memberships(organization_id, id);

alter table app.tenant_application_reviews
  drop constraint tenant_application_reviews_application_id_fkey,
  add constraint tenant_application_reviews_organization_application_fkey
    foreign key (organization_id, application_id)
    references app.tenant_applications(organization_id, id);

alter table app.tenant_application_documents
  drop constraint tenant_application_documents_application_id_fkey,
  add constraint tenant_application_documents_organization_application_fkey
    foreign key (organization_id, application_id)
    references app.tenant_applications(organization_id, id);

alter table app.leases
  drop constraint leases_application_id_fkey,
  drop constraint leases_supersedes_lease_id_fkey,
  add constraint leases_organization_application_fkey
    foreign key (organization_id, application_id)
    references app.tenant_applications(organization_id, id),
  add constraint leases_organization_superseded_lease_fkey
    foreign key (organization_id, supersedes_lease_id)
    references app.leases(organization_id, id);

create function app.reject_audit_event_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception 'audit history is immutable';
end
$$;

create trigger audit_events_are_immutable
before update or delete on app.audit_events
for each row execute function app.reject_audit_event_mutation();

create trigger audit_events_reject_truncate
before truncate on app.audit_events
for each statement execute function app.reject_audit_event_mutation();

alter table app.properties force row level security;
alter table app.units force row level security;
alter table app.payments force row level security;
alter table app.public_listings force row level security;
alter table app.public_listing_inquiries force row level security;
alter table app.membership_invitations force row level security;
alter table app.memberships force row level security;
alter table app.tenant_applications force row level security;
alter table app.tenant_application_reviews force row level security;
alter table app.tenant_application_documents force row level security;
alter table app.leases force row level security;
alter table app.audit_events force row level security;

create function app.runtime_schema_v0021_ready()
returns boolean
language sql
stable
set search_path = pg_catalog, app
as $$
  select true
$$;

revoke all on function app.runtime_schema_v0021_ready() from public;
grant execute on function app.runtime_schema_v0021_ready() to keyforta_runtime;

commit;