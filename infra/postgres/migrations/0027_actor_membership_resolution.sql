begin;

create function app.resolve_actor_memberships(subject text)
returns table (organization_id uuid, role app.organization_role, actor_id uuid)
language plpgsql
security definer
set search_path = app, pg_temp
as $$
begin
  return query
    select memberships.organization_id, memberships.role, users.id as actor_id
    from app.users
    join app.memberships on memberships.user_id = users.id
    where users.external_subject = subject
      and memberships.active;
end
$$;

revoke all on function app.resolve_actor_memberships(text) from public;

grant execute on function app.resolve_actor_memberships(text) to keyforta_runtime;

commit;
