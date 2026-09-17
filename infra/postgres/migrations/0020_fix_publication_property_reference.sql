begin;

create or replace function app.set_public_listing_publication(
  requested_listing_id uuid,
  requested_published boolean
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := nullif(current_setting('app.correlation_id', true), '');
  listing app.public_listings%rowtype;
  resolved_property_id uuid;
  assignment_started_at timestamptz;
  event_action text;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  select candidate.* into listing
  from app.public_listings as candidate
  join app.units as unit
    on unit.id = candidate.unit_id
   and unit.organization_id = candidate.organization_id
  where candidate.id = requested_listing_id
    and candidate.organization_id = organization
  for update of candidate;

  if not found then
    return false;
  end if;

  select unit.property_id into resolved_property_id
  from app.units as unit
  where unit.id = listing.unit_id
    and unit.organization_id = listing.organization_id;

  select assignment.assigned_at into assignment_started_at
  from app.memberships as membership
  join app.manager_property_assignments as assignment
    on assignment.organization_id = membership.organization_id
   and assignment.manager_user_id = membership.user_id
  where membership.organization_id = organization
    and membership.user_id = actor
    and membership.role in ('landlord', 'manager')
    and membership.active
    and membership.effective_from <= transaction_timestamp()
    and (
      membership.effective_to is null
      or transaction_timestamp() < membership.effective_to
    )
    and assignment.property_id = resolved_property_id
    and assignment.assigned_at <= transaction_timestamp()
    and assignment.revoked_at is null;

  if assignment_started_at is null then
    return false;
  end if;

  if requested_published then
    if listing.status = 'published' then
      return false;
    end if;
    if not exists (
      select 1
      from app.units as unit
      join app.properties as property
        on property.id = unit.property_id
       and property.organization_id = unit.organization_id
      where unit.id = listing.unit_id
        and unit.organization_id = organization
        and unit.archived_at is null
        and unit.publication_status = 'published'
        and unit.availability_status = 'available'
        and property.archived_at is null
        and property.verification_status = 'verified'
        and property.publication_status = 'published'
    ) then
      return false;
    end if;

    update app.public_listings
    set status = 'published',
        published_at = transaction_timestamp(),
        updated_at = transaction_timestamp()
    where id = listing.id;
    event_action := 'published';
  else
    if listing.status <> 'published' then
      return false;
    end if;

    update app.public_listings
    set status = 'withdrawn',
        updated_at = transaction_timestamp()
    where id = listing.id;
    event_action := 'withdrawn';
  end if;

  insert into app.public_listing_publication_events (
    organization_id, listing_id, property_id, unit_id, actor_id,
    manager_assignment_started_at, correlation_id, action, occurred_at
  ) values (
    organization, listing.id, resolved_property_id, listing.unit_id, actor,
    assignment_started_at, correlation, event_action, transaction_timestamp()
  );

  return true;
end
$$;

create function app.runtime_schema_v0020_ready()
returns boolean
language sql
stable
set search_path = pg_catalog, app
as $$
  select true
$$;

revoke all on function app.set_public_listing_publication(uuid, boolean) from public;
grant execute on function app.set_public_listing_publication(uuid, boolean) to keyforta_runtime;
revoke all on function app.runtime_schema_v0020_ready() from public;
grant execute on function app.runtime_schema_v0020_ready() to keyforta_runtime;

commit;
