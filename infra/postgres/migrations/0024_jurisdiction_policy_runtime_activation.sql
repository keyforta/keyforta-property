begin;

alter table app.properties
  add column jurisdiction_code text,
  add constraint properties_jurisdiction_code_check
    check (
      jurisdiction_code is null
      or jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,6})?$'
    );

create function app.set_property_verification_status(
  requested_property_id uuid,
  requested_status text,
  requested_actor_user_id uuid
) returns table (
  property_id uuid,
  verification_status text
)
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  property_organization_id uuid;
  property_jurisdiction_code text;
begin
  if requested_property_id is null
    or requested_actor_user_id is null
    or requested_status is null
    or requested_status not in (
      'not_started', 'pending', 'changes_requested', 'verified',
      'rejected', 'expired', 'suspended'
    ) then
    raise exception 'valid property, status, and actor are required';
  end if;

  select organization_id, jurisdiction_code
  into property_organization_id, property_jurisdiction_code
  from app.properties
  where id = requested_property_id;

  if not found then
    return;
  end if;

  if requested_status = 'verified' then
    if property_jurisdiction_code is null then
      raise exception 'verified properties require a jurisdiction code';
    end if;

    if not exists (
      select 1
      from app.resolve_active_jurisdiction_policy(
        'property_verification',
        property_jurisdiction_code,
        transaction_timestamp()
      )
    ) then
      raise exception 'verified properties require an active jurisdiction policy';
    end if;
  end if;

  update app.properties
  set verification_status = requested_status,
    updated_at = transaction_timestamp(),
    version = version + 1
  where id = requested_property_id;

  insert into app.audit_events (
    organization_id,
    actor_id,
    correlation_id,
    action,
    entity_type,
    entity_id
  ) values (
    property_organization_id,
    requested_actor_user_id,
    coalesce(nullif(current_setting('app.correlation_id', true), ''), gen_random_uuid()::text),
    'property.verification_status_set',
    'property',
    requested_property_id
  );

  return query
  select requested_property_id, requested_status;
end
$$;

grant execute on function app.activate_jurisdiction_policy(
  uuid, uuid, uuid, timestamptz, timestamptz, uuid, text
) to keyforta_runtime;

grant execute on function app.set_property_verification_status(
  uuid, text, uuid
) to keyforta_runtime;

commit;
