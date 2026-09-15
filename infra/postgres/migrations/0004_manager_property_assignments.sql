begin;

alter table app.properties
  add constraint properties_organization_id_id_key
  unique (organization_id, id);

create table app.manager_property_assignments (
  organization_id uuid not null,
  property_id uuid not null,
  manager_user_id uuid not null references app.users(id),
  assigned_by_user_id uuid not null references app.users(id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (organization_id, property_id, manager_user_id),
  foreign key (organization_id, property_id)
    references app.properties(organization_id, id),
  check (revoked_at is null or revoked_at >= assigned_at)
);

alter table app.manager_property_assignments enable row level security;
alter table app.manager_property_assignments force row level security;

create policy organization_isolation on app.manager_property_assignments
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

create function app.set_manager_property_assignment(
  requested_property_id uuid,
  requested_manager_user_id uuid,
  requested_assigned boolean
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := nullif(current_setting('app.correlation_id', true), '');
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  if not exists (
    select 1
    from app.properties
    join app.memberships
      on memberships.organization_id = properties.organization_id
    where properties.id = requested_property_id
      and properties.organization_id = organization
      and memberships.user_id = requested_manager_user_id
      and memberships.role = 'manager'
      and memberships.active
  ) then
    return false;
  end if;

  if requested_assigned then
    insert into app.manager_property_assignments (
      organization_id, property_id, manager_user_id, assigned_by_user_id
    ) values (
      organization, requested_property_id, requested_manager_user_id, actor
    )
    on conflict (organization_id, property_id, manager_user_id)
    do update set assigned_by_user_id = excluded.assigned_by_user_id,
                  assigned_at = now(), revoked_at = null;
  else
    update app.manager_property_assignments
    set revoked_at = now()
    where organization_id = organization
      and property_id = requested_property_id
      and manager_user_id = requested_manager_user_id
      and revoked_at is null;
    if not found then
      return false;
    end if;
  end if;

  insert into app.audit_events (
    organization_id, actor_id, correlation_id, action, entity_type, entity_id
  ) values (
    organization,
    actor,
    correlation,
    case when requested_assigned
      then 'manager_property_assigned'
      else 'manager_property_revoked'
    end,
    'manager_property_assignment',
    requested_property_id
  );
  return true;
end
$$;

revoke all on function app.set_manager_property_assignment(uuid, uuid, boolean)
  from public;
grant select on app.manager_property_assignments to keyforta_runtime;
grant execute on function app.set_manager_property_assignment(uuid, uuid, boolean)
  to keyforta_runtime;

commit;