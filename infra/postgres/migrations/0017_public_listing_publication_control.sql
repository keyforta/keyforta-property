begin;

alter table app.properties
  add column verification_status text not null default 'not_started'
    check (verification_status in (
      'not_started', 'pending', 'changes_requested', 'verified',
      'rejected', 'expired', 'suspended'
    )),
  add column publication_status text not null default 'draft'
    check (publication_status in (
      'draft', 'pending_review', 'published', 'paused', 'archived'
    ));

alter table app.units
  add column publication_status text not null default 'draft'
    check (publication_status in (
      'draft', 'pending_review', 'published', 'paused', 'archived'
    )),
  add column availability_status text not null default 'unavailable'
    check (availability_status in (
      'available', 'reserved', 'occupied', 'unavailable'
    ));

alter table app.public_listings
  add constraint public_listings_organization_id_id_key
  unique (organization_id, id);

create unique index manager_property_one_active_assignment
  on app.manager_property_assignments (organization_id, property_id)
  where revoked_at is null;

create table app.manager_property_assignment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  property_id uuid not null,
  manager_user_id uuid not null references app.users(id),
  actor_id uuid not null references app.users(id),
  correlation_id text not null check (char_length(correlation_id) between 1 and 200),
  action text not null check (action in ('assigned', 'revoked')),
  occurred_at timestamptz not null default transaction_timestamp(),
  foreign key (organization_id, property_id)
    references app.properties(organization_id, id)
);

create function app.reject_assignment_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'manager assignment history is immutable';
end
$$;

create trigger manager_property_assignment_events_are_append_only
before update or delete on app.manager_property_assignment_events
for each row execute function app.reject_assignment_history_mutation();

alter table app.manager_property_assignment_events enable row level security;
alter table app.manager_property_assignment_events force row level security;

create policy organization_isolation on app.manager_property_assignment_events
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

create or replace function app.set_manager_property_assignment(
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
    from app.memberships as membership
    where membership.organization_id = organization
      and membership.user_id = actor
      and membership.role = 'landlord'
      and membership.active
      and membership.effective_from <= transaction_timestamp()
      and (
        membership.effective_to is null
        or transaction_timestamp() < membership.effective_to
      )
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from app.properties as property
    join app.memberships as membership
      on membership.organization_id = property.organization_id
    where property.id = requested_property_id
      and property.organization_id = organization
      and property.archived_at is null
      and membership.user_id = requested_manager_user_id
      and membership.role in ('landlord', 'manager')
      and membership.active
      and membership.effective_from <= transaction_timestamp()
      and (
        membership.effective_to is null
        or transaction_timestamp() < membership.effective_to
      )
  ) then
    return false;
  end if;

  if requested_assigned then
    if exists (
      select 1 from app.manager_property_assignments
      where organization_id = organization
        and property_id = requested_property_id
        and manager_user_id = requested_manager_user_id
        and revoked_at is null
    ) then
      return false;
    end if;

    insert into app.manager_property_assignment_events (
      organization_id, property_id, manager_user_id, actor_id,
      correlation_id, action
    )
    select organization, requested_property_id, manager_user_id, actor,
      correlation, 'revoked'
    from app.manager_property_assignments
    where organization_id = organization
      and property_id = requested_property_id
      and revoked_at is null;

    update app.manager_property_assignments
    set revoked_at = transaction_timestamp()
    where organization_id = organization
      and property_id = requested_property_id
      and revoked_at is null;

    insert into app.manager_property_assignments (
      organization_id, property_id, manager_user_id, assigned_by_user_id
    ) values (
      organization, requested_property_id, requested_manager_user_id, actor
    )
    on conflict (organization_id, property_id, manager_user_id)
    do update set assigned_by_user_id = excluded.assigned_by_user_id,
                  assigned_at = transaction_timestamp(), revoked_at = null;

    insert into app.manager_property_assignment_events (
      organization_id, property_id, manager_user_id, actor_id,
      correlation_id, action
    ) values (
      organization, requested_property_id, requested_manager_user_id, actor,
      correlation, 'assigned'
    );
  else
    if not exists (
      select 1 from app.manager_property_assignments
      where organization_id = organization
        and property_id = requested_property_id
        and manager_user_id = requested_manager_user_id
        and revoked_at is null
    ) then
      return false;
    end if;

    update app.manager_property_assignments
    set revoked_at = transaction_timestamp()
    where organization_id = organization
      and property_id = requested_property_id
      and manager_user_id = requested_manager_user_id
      and revoked_at is null;

    insert into app.manager_property_assignment_events (
      organization_id, property_id, manager_user_id, actor_id,
      correlation_id, action
    ) values (
      organization, requested_property_id, requested_manager_user_id, actor,
      correlation, 'revoked'
    );
  end if;

  insert into app.audit_events (
    organization_id, actor_id, correlation_id, action, entity_type, entity_id
  ) values (
    organization, actor, correlation,
    case when requested_assigned
      then 'manager_property_assigned'
      else 'manager_property_revoked'
    end,
    'manager_property_assignment', requested_property_id
  );
  return true;
end
$$;

create table app.public_listing_publication_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  listing_id uuid not null references app.public_listings(id),
  property_id uuid not null references app.properties(id),
  unit_id uuid not null references app.units(id),
  actor_id uuid not null references app.users(id),
  manager_assignment_started_at timestamptz not null,
  correlation_id text not null check (char_length(correlation_id) between 1 and 200),
  action text not null check (action in ('published', 'withdrawn')),
  occurred_at timestamptz not null default transaction_timestamp(),
  foreign key (organization_id, listing_id)
    references app.public_listings(organization_id, id),
  foreign key (organization_id, property_id)
    references app.properties(organization_id, id),
  foreign key (organization_id, unit_id)
    references app.units(organization_id, id)
);

create index public_listing_publication_events_listing_idx
  on app.public_listing_publication_events (listing_id, occurred_at, id);
create index public_listing_publication_events_org_idx
  on app.public_listing_publication_events (organization_id, occurred_at, id);

create function app.reject_publication_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'publication history is immutable';
end
$$;

create trigger public_listing_publication_events_are_append_only
before update or delete on app.public_listing_publication_events
for each row execute function app.reject_publication_history_mutation();

alter table app.public_listing_publication_events enable row level security;
alter table app.public_listing_publication_events force row level security;

create policy organization_isolation on app.public_listing_publication_events
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

create function app.public_listing_is_eligible(requested_listing_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, app
as $$
  select exists (
    select 1
    from app.public_listings as listing
    join app.units as unit
      on unit.id = listing.unit_id
     and unit.organization_id = listing.organization_id
    join app.properties as property
      on property.id = unit.property_id
     and property.organization_id = listing.organization_id
    where listing.id = requested_listing_id
      and listing.status = 'published'
      and listing.published_at is not null
      and property.archived_at is null
      and property.verification_status = 'verified'
      and property.publication_status = 'published'
      and unit.archived_at is null
      and unit.publication_status = 'published'
      and unit.availability_status = 'available'
  )
$$;

drop policy published_listing_read on app.public_listings;
create policy published_listing_read on app.public_listings for select
  using (app.public_listing_is_eligible(id));

create or replace function app.list_public_listings(
  requested_district text default null,
  requested_bedrooms integer default null,
  requested_max_rent_minor bigint default null
) returns table (
  id uuid,
  slug text,
  title text,
  summary text,
  city text,
  district text,
  bedrooms integer,
  bathrooms integer,
  area_square_meters integer,
  monthly_rent_minor bigint,
  currency char(3),
  available_from date,
  amenities text[],
  image_urls text[]
)
language sql
security definer
stable
set search_path = pg_catalog, app
as $$
  select listing.id, listing.slug, listing.title, listing.summary,
    listing.city, listing.district, listing.bedrooms, listing.bathrooms,
    listing.area_square_meters, listing.monthly_rent_minor, listing.currency,
    listing.available_from, listing.amenities, listing.image_urls
  from app.public_listings as listing
  where app.public_listing_is_eligible(listing.id)
    and (requested_district is null or listing.district ilike '%' || requested_district || '%')
    and (requested_bedrooms is null or listing.bedrooms >= requested_bedrooms)
    and (requested_max_rent_minor is null or listing.monthly_rent_minor <= requested_max_rent_minor)
  order by listing.created_at desc, listing.id
$$;

create or replace function app.get_public_listing(requested_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  summary text,
  city text,
  district text,
  bedrooms integer,
  bathrooms integer,
  area_square_meters integer,
  monthly_rent_minor bigint,
  currency char(3),
  available_from date,
  amenities text[],
  image_urls text[]
)
language sql
security definer
stable
set search_path = pg_catalog, app
as $$
  select listing.id, listing.slug, listing.title, listing.summary,
    listing.city, listing.district, listing.bedrooms, listing.bathrooms,
    listing.area_square_meters, listing.monthly_rent_minor, listing.currency,
    listing.available_from, listing.amenities, listing.image_urls
  from app.public_listings as listing
  where listing.slug = requested_slug
    and app.public_listing_is_eligible(listing.id)
$$;

create or replace function app.create_public_listing_inquiry(
  requested_slug text,
  requested_full_name text,
  requested_email text,
  requested_phone text,
  requested_preferred_at timestamptz,
  requested_message text,
  requested_locale text,
  requested_correlation_id text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, app
as $$
declare
  listing app.public_listings%rowtype;
begin
  select candidate.* into listing
  from app.public_listings as candidate
  where candidate.slug = requested_slug
    and app.public_listing_is_eligible(candidate.id);

  if not found then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(listing.id::text || ':' || lower(requested_email), 0)
  );
  perform set_config('app.organization_id', listing.organization_id::text, true);

  if not exists (
    select 1 from app.public_listing_inquiries as inquiry
    where inquiry.listing_id = listing.id
      and lower(inquiry.email) = lower(requested_email)
      and inquiry.created_at > transaction_timestamp() - interval '1 hour'
  ) then
    insert into app.public_listing_inquiries (
      organization_id, listing_id, full_name, email, phone, preferred_at,
      message, locale, correlation_id
    ) values (
      listing.organization_id, listing.id, requested_full_name,
      requested_email, requested_phone, requested_preferred_at,
      requested_message, requested_locale, requested_correlation_id
    );
  end if;

  return true;
end
$$;

create or replace function app.list_public_listings_page(
  requested_city text,
  requested_district text,
  requested_bedrooms integer,
  requested_max_rent_minor bigint,
  requested_sort text,
  requested_cursor text,
  requested_limit integer
) returns table (
  items jsonb,
  total_count bigint,
  next_cursor text,
  cursor_valid boolean
)
language plpgsql
security definer
stable
set search_path = pg_catalog, app
as $$
begin
  if requested_sort not in ('created_at_desc', 'name_asc', 'name_desc') then
    raise exception 'unsupported public listing sort';
  end if;
  if requested_limit is null or requested_limit < 1 or requested_limit > 100 then
    raise exception 'public listing limit must be between 1 and 100';
  end if;

  return query
  with filtered as materialized (
    select listing.*
    from app.public_listings as listing
    where app.public_listing_is_eligible(listing.id)
      and (requested_city is null or lower(listing.city) = lower(requested_city))
      and (requested_district is null or listing.district ilike '%' || requested_district || '%')
      and (requested_bedrooms is null or listing.bedrooms >= requested_bedrooms)
      and (requested_max_rent_minor is null or listing.monthly_rent_minor <= requested_max_rent_minor)
  ), cursor_row as (
    select candidate.created_at, candidate.id, candidate.title
    from filtered as candidate
    where candidate.slug = requested_cursor
  ), eligible as (
    select candidate.*
    from filtered as candidate
    where requested_cursor is null
      or (
        requested_sort = 'created_at_desc'
        and (
          candidate.created_at < (select cursor_row.created_at from cursor_row)
          or (
            candidate.created_at = (select cursor_row.created_at from cursor_row)
            and candidate.id > (select cursor_row.id from cursor_row)
          )
        )
      )
      or (
        requested_sort = 'name_asc'
        and (
          candidate.title > (select cursor_row.title from cursor_row)
          or (
            candidate.title = (select cursor_row.title from cursor_row)
            and candidate.id > (select cursor_row.id from cursor_row)
          )
        )
      )
      or (
        requested_sort = 'name_desc'
        and (
          candidate.title < (select cursor_row.title from cursor_row)
          or (
            candidate.title = (select cursor_row.title from cursor_row)
            and candidate.id > (select cursor_row.id from cursor_row)
          )
        )
      )
  ), ordered as (
    select candidate.*,
      row_number() over (
        order by
          case when requested_sort = 'created_at_desc' then candidate.created_at end desc,
          case when requested_sort = 'name_asc' then candidate.title end asc,
          case when requested_sort = 'name_desc' then candidate.title end desc,
          candidate.id asc
      ) as ordinal
    from eligible as candidate
    order by
      case when requested_sort = 'created_at_desc' then candidate.created_at end desc,
      case when requested_sort = 'name_asc' then candidate.title end asc,
      case when requested_sort = 'name_desc' then candidate.title end desc,
      candidate.id asc
    limit requested_limit + 1
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slug', page.slug,
          'title', page.title,
          'summary', page.summary,
          'city', page.city,
          'district', page.district,
          'bedrooms', page.bedrooms,
          'bathrooms', page.bathrooms,
          'area_square_meters', page.area_square_meters,
          'monthly_rent_minor', page.monthly_rent_minor::text,
          'currency', page.currency,
          'available_from', page.available_from,
          'amenities', page.amenities,
          'image_urls', page.image_urls
        ) order by page.ordinal
      ) filter (where page.ordinal <= requested_limit),
      '[]'::jsonb
    ),
    (select count(*) from filtered),
    case when count(*) > requested_limit then
      (array_agg(page.slug order by page.ordinal) filter (where page.ordinal <= requested_limit))[requested_limit]
    else null end,
    requested_cursor is null or exists (select 1 from cursor_row)
  from ordered as page;
end
$$;

create function app.set_public_listing_publication(
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
  property_id uuid;
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

  select unit.property_id into property_id
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
    and assignment.property_id = property_id
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
    organization, listing.id, property_id, listing.unit_id, actor,
    assignment_started_at, correlation, event_action, transaction_timestamp()
  );

  return true;
end
$$;

revoke all on app.public_listing_publication_events from public;
revoke all on app.public_listing_publication_events from keyforta_runtime;
revoke all on app.manager_property_assignment_events from public;
revoke all on app.manager_property_assignment_events from keyforta_runtime;
revoke insert, update, delete on app.public_listings from keyforta_runtime;
revoke all on function app.public_listing_is_eligible(uuid) from public;
revoke all on function app.set_public_listing_publication(uuid, boolean) from public;
grant execute on function app.set_public_listing_publication(uuid, boolean)
  to keyforta_runtime;

commit;