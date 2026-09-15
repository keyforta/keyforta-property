begin;

create function app.list_portfolio_managers()
returns table (
  manager_user_id uuid,
  display_name text,
  property_ids uuid[]
)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if organization is null or actor is null or not exists (
    select 1
    from app.memberships
    where organization_id = organization
      and user_id = actor
      and role = 'landlord'
      and active
  ) then
    raise exception 'landlord context is required';
  end if;

  return query
  select
    users.id,
    users.display_name,
    coalesce(
      array_agg(assignments.property_id order by assignments.property_id)
        filter (where assignments.revoked_at is null),
      array[]::uuid[]
    )
  from app.memberships
  join app.users on users.id = memberships.user_id
  left join app.manager_property_assignments as assignments
    on assignments.organization_id = memberships.organization_id
    and assignments.manager_user_id = memberships.user_id
  where memberships.organization_id = organization
    and memberships.role = 'manager'
    and memberships.active
  group by users.id, users.display_name
  order by users.display_name, users.id;
end
$$;

revoke all on function app.list_portfolio_managers() from public;
grant execute on function app.list_portfolio_managers() to keyforta_runtime;

commit;