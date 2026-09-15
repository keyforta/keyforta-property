begin;

create function app.list_portfolio_tenants()
returns table (tenant_user_id uuid, display_name text)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if organization is null or actor is null or not exists (
    select 1 from app.memberships
    where organization_id = organization
      and user_id = actor
      and role = 'landlord'
      and active
  ) then
    raise exception 'landlord context is required';
  end if;

  return query
  select users.id, users.display_name
  from app.memberships
  join app.users on users.id = memberships.user_id
  where memberships.organization_id = organization
    and memberships.role = 'tenant'
    and memberships.active
  order by users.display_name, users.id;
end
$$;

create function app.create_lease_draft(
  requested_unit_id uuid,
  requested_tenant_user_id uuid,
  requested_currency char(3),
  requested_base_rent_minor bigint,
  requested_starts_on date
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

  insert into app.leases (
    organization_id, unit_id, tenant_user_id, currency,
    base_rent_minor, starts_on, accepted_at
  ) values (
    organization, requested_unit_id, requested_tenant_user_id,
    requested_currency, requested_base_rent_minor, requested_starts_on, null
  ) returning * into created_lease;

  insert into app.audit_events (
    organization_id, actor_id, correlation_id, action, entity_type, entity_id
  ) values (
    organization, actor, correlation, 'lease.draft_created', 'lease', created_lease.id
  );

  return created_lease;
end
$$;

revoke all on function app.list_portfolio_tenants() from public;
revoke all on function app.create_lease_draft(uuid, uuid, char, bigint, date)
  from public;
grant execute on function app.list_portfolio_tenants() to keyforta_runtime;
grant execute on function app.create_lease_draft(uuid, uuid, char, bigint, date)
  to keyforta_runtime;

commit;