begin;

create table app.landlord_onboarding_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_subject text not null check (char_length(btrim(applicant_subject)) between 1 and 500),
  applicant_object_id uuid not null,
  applicant_name text not null check (char_length(btrim(applicant_name)) between 2 and 120),
  proposed_organization_name text not null
    check (char_length(btrim(proposed_organization_name)) between 2 and 160),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_correlation_id text not null
    check (char_length(submitted_correlation_id) between 1 and 200),
  submitted_at timestamptz not null default transaction_timestamp(),
  decided_at timestamptz
);

create unique index landlord_onboarding_one_application_per_applicant
  on app.landlord_onboarding_applications (applicant_object_id);
create index landlord_onboarding_review_queue
  on app.landlord_onboarding_applications (status, submitted_at, id);

create table app.landlord_onboarding_decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique
    references app.landlord_onboarding_applications(id),
  applicant_subject text not null,
  applicant_object_id uuid not null,
  applicant_name text not null,
  administrator_subject text not null,
  administrator_object_id uuid not null,
  outcome text not null check (outcome in ('approved', 'rejected')),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  correlation_id text not null check (char_length(correlation_id) between 1 and 200),
  organization_id uuid references app.organizations(id),
  user_id uuid references app.users(id),
  membership_id uuid references app.memberships(id),
  decided_at timestamptz not null default transaction_timestamp(),
  check (
    (outcome = 'approved' and organization_id is not null and user_id is not null and membership_id is not null)
    or (outcome = 'rejected' and organization_id is null and user_id is null and membership_id is null)
  )
);

create function app.reject_landlord_onboarding_decision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'landlord onboarding decisions are immutable';
end
$$;

create trigger landlord_onboarding_decisions_are_append_only
before update or delete on app.landlord_onboarding_decisions
for each row execute function app.reject_landlord_onboarding_decision_mutation();

create function app.submit_landlord_onboarding_application(
  requested_applicant_subject text,
  requested_applicant_object_id uuid,
  requested_applicant_name text,
  requested_organization_name text,
  requested_correlation_id text
) returns setof app.landlord_onboarding_applications
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  application app.landlord_onboarding_applications%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_applicant_object_id::text, 0));

  if exists (
    select 1 from app.landlord_onboarding_applications
    where applicant_object_id = requested_applicant_object_id
  ) then
    return;
  end if;

  insert into app.landlord_onboarding_applications (
    applicant_subject, applicant_object_id, applicant_name,
    proposed_organization_name, submitted_correlation_id
  ) values (
    btrim(requested_applicant_subject), requested_applicant_object_id,
    btrim(requested_applicant_name), btrim(requested_organization_name),
    requested_correlation_id
  ) returning * into application;

  return next application;
end
$$;

create function app.list_landlord_onboarding_applications()
returns table (
  id uuid,
  applicant_name text,
  proposed_organization_name text,
  status text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decision_reason text
)
language sql
security definer
stable
set search_path = pg_catalog, app
as $$
  select application.id, application.applicant_name,
    application.proposed_organization_name, application.status,
    application.submitted_at, application.decided_at, decision.reason
  from app.landlord_onboarding_applications as application
  left join app.landlord_onboarding_decisions as decision
    on decision.application_id = application.id
  order by application.submitted_at, application.id
$$;

create function app.decide_landlord_onboarding_application(
  requested_application_id uuid,
  requested_administrator_subject text,
  requested_administrator_object_id uuid,
  requested_outcome text,
  requested_reason text,
  requested_correlation_id text
) returns setof app.landlord_onboarding_applications
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  application app.landlord_onboarding_applications%rowtype;
  provisioned_organization_id uuid;
  provisioned_user app.users%rowtype;
  provisioned_membership_id uuid;
  decision_timestamp timestamptz := transaction_timestamp();
begin
  if requested_outcome not in ('approved', 'rejected') then
    raise exception 'invalid landlord onboarding decision';
  end if;

  select candidate.* into application
  from app.landlord_onboarding_applications as candidate
  where candidate.id = requested_application_id
  for update;

  if not found or application.status <> 'pending' then
    return;
  end if;

  if requested_outcome = 'approved' then
    insert into app.organizations (name)
    values (application.proposed_organization_name)
    returning id into provisioned_organization_id;

    insert into app.users (external_subject, display_name)
    values (application.applicant_subject, application.applicant_name)
    on conflict (external_subject) do nothing
    returning * into provisioned_user;

    if provisioned_user.id is null then
      select existing.* into provisioned_user
      from app.users as existing
      where existing.external_subject = application.applicant_subject;
    end if;

    insert into app.memberships (
      organization_id, user_id, party_id, role, active, effective_from
    ) values (
      provisioned_organization_id, provisioned_user.id,
      provisioned_user.party_id, 'landlord', true, decision_timestamp
    ) returning id into provisioned_membership_id;
  end if;

  insert into app.landlord_onboarding_decisions (
    application_id, applicant_subject, applicant_object_id, applicant_name,
    administrator_subject, administrator_object_id, outcome, reason,
    correlation_id, organization_id, user_id, membership_id, decided_at
  ) values (
    application.id, application.applicant_subject, application.applicant_object_id,
    application.applicant_name, btrim(requested_administrator_subject),
    requested_administrator_object_id, requested_outcome, btrim(requested_reason),
    requested_correlation_id, provisioned_organization_id, provisioned_user.id,
    provisioned_membership_id, decision_timestamp
  );

  update app.landlord_onboarding_applications
  set status = requested_outcome, decided_at = decision_timestamp
  where id = application.id
  returning * into application;

  return next application;
end
$$;

revoke all on app.landlord_onboarding_applications from public;
revoke all on app.landlord_onboarding_applications from keyforta_runtime;
revoke all on app.landlord_onboarding_decisions from public;
revoke all on app.landlord_onboarding_decisions from keyforta_runtime;
revoke all on function app.submit_landlord_onboarding_application(text, uuid, text, text, text) from public;
revoke all on function app.list_landlord_onboarding_applications() from public;
revoke all on function app.decide_landlord_onboarding_application(uuid, text, uuid, text, text, text) from public;
grant execute on function app.submit_landlord_onboarding_application(text, uuid, text, text, text) to keyforta_runtime;
grant execute on function app.list_landlord_onboarding_applications() to keyforta_runtime;
grant execute on function app.decide_landlord_onboarding_application(uuid, text, uuid, text, text, text) to keyforta_runtime;

commit;