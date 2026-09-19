begin;

create function app.resolve_platform_actor(subject text)
returns table (actor_id uuid, party_id uuid)
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare
  resolved_actor_id uuid;
  resolved_party_id uuid;
begin
  perform set_config('app.organization_id', '', true);
  perform set_config('app.actor_id', '', true);
  perform set_config('app.party_id', '', true);

  select users.id, users.party_id
  into resolved_actor_id, resolved_party_id
  from app.users
  where users.external_subject = subject;

  if found then
    perform set_config('app.actor_id', resolved_actor_id::text, true);
    perform set_config('app.party_id', resolved_party_id::text, true);
    actor_id := resolved_actor_id;
    party_id := resolved_party_id;
    return next;
  end if;
end
$$;

revoke all on function app.resolve_platform_actor(text) from public;

grant execute on function app.resolve_platform_actor(text) to keyforta_runtime;

commit;
