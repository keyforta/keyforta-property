begin;

create function app.runtime_schema_ready()
returns boolean
language sql
stable
set search_path = pg_catalog, app
as $$
  select true
$$;

revoke all on function app.runtime_schema_ready() from public;
grant execute on function app.runtime_schema_ready() to keyforta_runtime;

commit;