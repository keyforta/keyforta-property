begin;

create type app.lease_source_type as enum ('platform_application', 'external');

alter table app.leases
  add column source_type app.lease_source_type not null default 'external',
  add column application_id uuid references app.tenant_applications(id),
  add column external_justification text not null
    default 'Bail historique enregistré avant le parcours de candidature.';

alter table app.leases
  alter column source_type drop default,
  alter column external_justification drop default,
  alter column external_justification drop not null,
  add constraint leases_source_is_complete check (
    (source_type = 'platform_application'
      and application_id is not null
      and external_justification is null)
    or
    (source_type = 'external'
      and application_id is null
      and length(trim(external_justification)) between 10 and 1000)
  );

create index leases_application_idx
  on app.leases (organization_id, application_id)
  where application_id is not null;

drop function app.create_lease_draft(uuid, uuid, char, bigint, date);

create function app.create_lease_draft(
  requested_unit_id uuid,
  requested_tenant_user_id uuid,
  requested_currency char(3),
  requested_base_rent_minor bigint,
  requested_starts_on date,
  requested_source_type app.lease_source_type,
  requested_application_id uuid,
  requested_external_justification text
) returns app.leases
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := nullif(current_setting('app.correlation_id', true), '');
  created_lease app.leases%rowtype;
begin
  if organization is null or actor is null or correlation is null or not exists (
    select 1 from app.memberships
    where organization_id = organization
      and user_id = actor
      and role = 'landlord'
      and active
  ) then
    raise exception 'landlord context is required';
  end if;
  if requested_base_rent_minor <= 0 then
    raise exception 'base rent must be positive';
  end if;
  if not exists (
    select 1 from app.units
    where organization_id = organization and id = requested_unit_id
  ) or not exists (
    select 1 from app.memberships
    where organization_id = organization
      and user_id = requested_tenant_user_id
      and role = 'tenant'
      and active
  ) then
    return null;
  end if;
  if exists (
    select 1 from app.leases
    where organization_id = organization and unit_id = requested_unit_id
  ) then
    return null;
  end if;

  if requested_source_type = 'platform_application' then
    perform 1
    from app.tenant_applications
    where organization_id = organization
      and id = requested_application_id
      and tenant_user_id = requested_tenant_user_id
      and status = 'approved'
    for update;
    if not found or exists (
      select 1 from app.leases
      where organization_id = organization
        and application_id = requested_application_id
    ) then
      return null;
    end if;
  elsif requested_source_type <> 'external'
    or length(trim(coalesce(requested_external_justification, ''))) not between 10 and 1000
  then
    return null;
  end if;

  insert into app.leases (
    organization_id, unit_id, tenant_user_id, currency,
    base_rent_minor, starts_on, accepted_at, source_type,
    application_id, external_justification
  ) values (
    organization, requested_unit_id, requested_tenant_user_id,
    requested_currency, requested_base_rent_minor, requested_starts_on, null,
    requested_source_type, requested_application_id,
    case when requested_source_type = 'external'
      then trim(requested_external_justification) else null end
  ) returning * into created_lease;

  insert into app.audit_events (
    organization_id, actor_id, correlation_id, action, entity_type, entity_id
  ) values (
    organization, actor, correlation, 'lease.draft_created', 'lease', created_lease.id
  );

  return created_lease;
end
$$;

revoke all on function app.create_lease_draft(
  uuid, uuid, char, bigint, date, app.lease_source_type, uuid, text
) from public;
grant execute on function app.create_lease_draft(
  uuid, uuid, char, bigint, date, app.lease_source_type, uuid, text
) to keyforta_runtime;

commit;