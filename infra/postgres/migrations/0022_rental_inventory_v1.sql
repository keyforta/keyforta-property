begin;

set local lock_timeout = '5s';

lock table app.organizations, app.users, app.parties,
  app.landlord_onboarding_applications in access exclusive mode;

do $$
begin
  if exists (select 1 from app.organizations)
    or exists (select 1 from app.users)
    or exists (select 1 from app.parties)
    or exists (select 1 from app.landlord_onboarding_applications) then
    raise exception '0022 blocked: database contains organization or customer data; use the separately authorized non-production reset before retrying';
  end if;
end
$$;

drop function if exists app.set_public_listing_publication(uuid, boolean);
drop function if exists app.list_public_listings_page(text, text, integer, bigint, text, text, integer);
drop function if exists app.create_public_listing_inquiry(text, text, text, text, timestamptz, text, text, text);
drop function if exists app.get_public_listing(text);
drop function if exists app.list_public_listings(text, integer, bigint);
drop policy published_listing_read on app.public_listings;
drop function if exists app.public_listing_is_eligible(uuid);
drop function app.runtime_schema_v0021_ready();

drop table app.public_listing_publication_events;
drop table app.public_listings cascade;

alter table app.properties
  drop constraint properties_jurisdiction_code_check,
  drop constraint properties_verification_status_check,
  drop constraint properties_publication_status_check,
  drop column jurisdiction_code,
  drop column address,
  add column property_type text not null,
  add column address jsonb not null,
  add column time_zone text not null,
  add column updated_at timestamptz not null default transaction_timestamp(),
  add column archived_by uuid references app.users(id),
  add column archive_reason text,
  add constraint properties_name_check
    check (char_length(name) between 1 and 160 and name = btrim(name)),
  add constraint properties_type_check
    check (property_type in (
      'apartment_building', 'single_family', 'townhouse', 'mixed_use', 'other'
    )),
  add constraint properties_address_check check (
    jsonb_typeof(address) = 'object'
    and address ?& array[
      'avenueOrStreet', 'number', 'quartier', 'commune', 'city', 'province',
      'countryCode'
    ]
    and (address - array[
      'avenueOrStreet', 'number', 'quartier', 'commune', 'city', 'province',
      'countryCode', 'postalCode'
    ]) = '{}'::jsonb
    and jsonb_typeof(address -> 'avenueOrStreet') = 'string'
    and char_length(btrim(address ->> 'avenueOrStreet')) between 1 and 160
    and address ->> 'avenueOrStreet' = btrim(address ->> 'avenueOrStreet')
    and jsonb_typeof(address -> 'number') = 'string'
    and char_length(btrim(address ->> 'number')) between 1 and 160
    and address ->> 'number' = btrim(address ->> 'number')
    and jsonb_typeof(address -> 'quartier') = 'string'
    and char_length(btrim(address ->> 'quartier')) between 1 and 160
    and address ->> 'quartier' = btrim(address ->> 'quartier')
    and jsonb_typeof(address -> 'commune') = 'string'
    and char_length(btrim(address ->> 'commune')) between 1 and 160
    and address ->> 'commune' = btrim(address ->> 'commune')
    and jsonb_typeof(address -> 'city') = 'string'
    and char_length(btrim(address ->> 'city')) between 1 and 160
    and address ->> 'city' = btrim(address ->> 'city')
    and jsonb_typeof(address -> 'province') = 'string'
    and char_length(btrim(address ->> 'province')) between 1 and 160
    and address ->> 'province' = btrim(address ->> 'province')
    and jsonb_typeof(address -> 'countryCode') = 'string'
    and (address ->> 'countryCode') ~ '^[A-Z]{2}$'
    and (
      not address ? 'postalCode'
      or (
        jsonb_typeof(address -> 'postalCode') = 'string'
        and char_length(btrim(address ->> 'postalCode')) between 1 and 160
        and address ->> 'postalCode' = btrim(address ->> 'postalCode')
      )
    )
  ),
  add constraint properties_time_zone_check
    check (char_length(btrim(time_zone)) between 1 and 100),
  add constraint properties_verification_status_check
    check (verification_status in (
      'not_started', 'pending', 'changes_requested', 'rejected', 'expired',
      'suspended'
    )),
  add constraint properties_publication_status_check
    check (publication_status in ('draft', 'pending_review', 'paused', 'archived')),
  add constraint properties_archive_metadata_check check (
    (
      archived_at is null
      and archived_by is null
      and archive_reason is null
      and publication_status <> 'archived'
    )
    or (
      archived_at is not null
      and archived_by is not null
      and char_length(btrim(archive_reason)) between 1 and 1000
      and publication_status = 'archived'
    )
  );

create function app.reject_unknown_property_time_zone()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1 from pg_timezone_names where name = new.time_zone
  ) then
    raise exception 'unknown Property time zone';
  end if;
  return new;
end
$$;

create trigger properties_require_known_time_zone
before insert or update of time_zone on app.properties
for each row execute function app.reject_unknown_property_time_zone();

drop index app.units_active_label_key;

alter table app.units
  drop constraint units_availability_status_check,
  drop constraint units_publication_status_check,
  add column canonical_label text not null,
  add column unit_type text not null,
  add column bedrooms smallint not null,
  add column bathrooms smallint not null,
  add column area_square_meters integer,
  add column floor_label text,
  add column furnishing_status text not null,
  add column updated_at timestamptz not null default transaction_timestamp(),
  add column archived_by uuid references app.users(id),
  add column archive_reason text,
  add constraint units_label_check
    check (char_length(label) between 1 and 80 and label = btrim(label)),
  add constraint units_canonical_label_check
    check (
      char_length(canonical_label) between 1 and 320
      and canonical_label !~ '^[[:space:]]*$'
    ),
  add constraint units_type_check
    check (unit_type in ('studio', 'apartment', 'house', 'townhouse', 'commercial', 'other')),
  add constraint units_bedrooms_check check (bedrooms between 0 and 20),
  add constraint units_bathrooms_check check (bathrooms between 1 and 20),
  add constraint units_area_check
    check (area_square_meters is null or area_square_meters between 1 and 100000),
  add constraint units_floor_label_check
    check (
      floor_label is null
      or (char_length(btrim(floor_label)) between 1 and 40 and floor_label = btrim(floor_label))
    ),
  add constraint units_furnishing_status_check
    check (furnishing_status in ('unfurnished', 'part_furnished', 'furnished')),
  add constraint units_availability_status_check
    check (availability_status in ('unavailable', 'available', 'occupied')),
  add constraint units_publication_status_check
    check (publication_status in ('draft', 'pending_review', 'published', 'paused', 'archived')),
  add constraint units_archive_metadata_check check (
    (
      archived_at is null
      and archived_by is null
      and archive_reason is null
      and publication_status <> 'archived'
    )
    or (
      archived_at is not null
      and archived_by is not null
      and char_length(btrim(archive_reason)) between 1 and 1000
      and publication_status = 'archived'
    )
  ),
  add constraint units_lifetime_label_key
    unique (organization_id, property_id, canonical_label);

alter table app.units
  add constraint units_organization_property_id_key
    unique (organization_id, property_id, id);

alter table app.manager_property_assignment_events
  add constraint manager_assignment_events_publication_evidence_key
    unique (organization_id, id, property_id, manager_user_id, action);

create table app.unit_pricing_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  unit_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency in ('CDF', 'USD')),
  billing_period text not null check (billing_period = 'month'),
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_by uuid not null references app.users(id),
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  source text not null check (char_length(btrim(source)) between 1 and 64),
  created_at timestamptz not null default transaction_timestamp(),
  foreign key (organization_id, unit_id)
    references app.units(organization_id, id),
  unique (organization_id, id),
  constraint unit_pricing_versions_effective_period_check check (
    isfinite(effective_from)
    and (
      effective_to is null
      or (isfinite(effective_to) and effective_to > effective_from)
    )
  ),
  constraint unit_pricing_no_overlap exclude using gist (
    organization_id with =,
    unit_id with =,
    tstzrange(effective_from, effective_to, '[)') with &&
  )
);

create table app.unit_availability_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  unit_id uuid not null,
  status text not null constraint unit_availability_versions_status_check
    check (status in ('unavailable', 'available')),
  reason_code text,
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_by uuid not null references app.users(id),
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  source text not null check (char_length(btrim(source)) between 1 and 64),
  created_at timestamptz not null default transaction_timestamp(),
  foreign key (organization_id, unit_id)
    references app.units(organization_id, id),
  unique (organization_id, id),
  constraint unit_availability_versions_effective_period_check
    check (
      isfinite(effective_from)
      and (
        effective_to is null
        or (isfinite(effective_to) and effective_to > effective_from)
      )
    ),
  constraint unit_availability_versions_reason_check check (
    (
      status <> 'unavailable'
      or (
        reason_code is not null
        and char_length(btrim(reason_code)) between 1 and 64
      )
    )
    and (status <> 'available' or reason_code is null)
  ),
  constraint unit_availability_no_overlap exclude using gist (
    organization_id with =,
    unit_id with =,
    tstzrange(effective_from, effective_to, '[)') with &&
  )
);

create table app.public_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  property_id uuid not null,
  unit_id uuid not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'withdrawn')),
  version integer not null default 1 check (version > 0),
  snapshot jsonb,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  foreign key (organization_id, property_id)
    references app.properties(organization_id, id),
  foreign key (organization_id, property_id, unit_id)
    references app.units(organization_id, property_id, id),
  unique (organization_id, id),
  unique (organization_id, id, property_id, unit_id),
  unique (organization_id, unit_id),
  check (snapshot is null or jsonb_typeof(snapshot) = 'object'),
  check (
    (status = 'published' and snapshot is not null and published_at is not null and withdrawn_at is null)
    or (status = 'withdrawn' and withdrawn_at is not null)
    or (status = 'draft' and withdrawn_at is null)
  )
);

alter table app.public_listing_inquiries
  add constraint public_listing_inquiries_organization_listing_fkey
    foreign key (organization_id, listing_id)
    references app.public_listings(organization_id, id);

create table app.public_listing_publication_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  listing_id uuid not null,
  property_id uuid not null,
  unit_id uuid not null,
  actor_id uuid not null references app.users(id),
  manager_assignment_event_id uuid not null,
  manager_assignment_action text not null default 'assigned'
    check (manager_assignment_action = 'assigned'),
  listing_version integer not null check (listing_version > 0),
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  action text not null check (action in ('published', 'withdrawn')),
  source text not null check (char_length(btrim(source)) between 1 and 64),
  occurred_at timestamptz not null default transaction_timestamp(),
  foreign key (organization_id, listing_id, property_id, unit_id)
    references app.public_listings(organization_id, id, property_id, unit_id),
  foreign key (
    organization_id, manager_assignment_event_id, property_id, actor_id,
    manager_assignment_action
  ) references app.manager_property_assignment_events (
    organization_id, id, property_id, manager_user_id, action
  )
);

create table app.rental_inventory_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  aggregate_type text not null
    check (aggregate_type in ('property', 'unit', 'pricing_version', 'availability_version', 'public_listing')),
  aggregate_id uuid not null,
  aggregate_version integer not null check (aggregate_version > 0),
  actor_id uuid not null references app.users(id),
  correlation_id text not null check (char_length(btrim(correlation_id)) between 1 and 128),
  action text not null check (char_length(btrim(action)) between 1 and 100),
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 1000),
  source text not null check (char_length(btrim(source)) between 1 and 64),
  occurred_at timestamptz not null default transaction_timestamp(),
  unique (organization_id, aggregate_type, aggregate_id, aggregate_version, action)
);

create function app.enforce_rental_inventory_interval_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and old.effective_to is null
    and new.effective_to is not null
    and to_jsonb(new) - 'effective_to' = to_jsonb(old) - 'effective_to' then
    return new;
  end if;
  raise exception 'rental inventory history is immutable';
end
$$;

create function app.reject_rental_inventory_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'rental inventory history is immutable';
end
$$;

create trigger unit_pricing_versions_preserve_history
before update or delete on app.unit_pricing_versions
for each row execute function app.enforce_rental_inventory_interval_mutation();

create trigger unit_availability_versions_preserve_history
before update or delete on app.unit_availability_versions
for each row execute function app.enforce_rental_inventory_interval_mutation();

create trigger public_listing_publication_events_are_append_only
before update or delete on app.public_listing_publication_events
for each row execute function app.reject_rental_inventory_history_mutation();

create trigger rental_inventory_events_are_append_only
before update or delete on app.rental_inventory_events
for each row execute function app.reject_rental_inventory_history_mutation();

create trigger unit_pricing_versions_reject_truncate
before truncate on app.unit_pricing_versions
for each statement execute function app.reject_rental_inventory_history_mutation();

create trigger unit_availability_versions_reject_truncate
before truncate on app.unit_availability_versions
for each statement execute function app.reject_rental_inventory_history_mutation();

create trigger public_listing_publication_events_reject_truncate
before truncate on app.public_listing_publication_events
for each statement execute function app.reject_rental_inventory_history_mutation();

create trigger rental_inventory_events_reject_truncate
before truncate on app.rental_inventory_events
for each statement execute function app.reject_rental_inventory_history_mutation();

alter table app.public_listings enable row level security;
alter table app.public_listings force row level security;
alter table app.public_listing_publication_events enable row level security;
alter table app.public_listing_publication_events force row level security;
alter table app.unit_pricing_versions enable row level security;
alter table app.unit_pricing_versions force row level security;
alter table app.unit_availability_versions enable row level security;
alter table app.unit_availability_versions force row level security;
alter table app.rental_inventory_events enable row level security;
alter table app.rental_inventory_events force row level security;

create policy organization_isolation on app.public_listings
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.public_listing_publication_events
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.unit_pricing_versions
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.unit_availability_versions
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.rental_inventory_events
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

create index properties_organization_publication_idx
  on app.properties (organization_id, publication_status, id);
create index units_property_availability_idx
  on app.units (organization_id, property_id, availability_status, id);
create index unit_pricing_versions_effective_idx
  on app.unit_pricing_versions (organization_id, unit_id, effective_from desc, id);
create index unit_availability_versions_effective_idx
  on app.unit_availability_versions (organization_id, unit_id, effective_from desc, id);
create index public_listing_publication_events_listing_idx
  on app.public_listing_publication_events (organization_id, listing_id, occurred_at, id);
create index rental_inventory_events_aggregate_idx
  on app.rental_inventory_events (
    organization_id, aggregate_type, aggregate_id, occurred_at, id
  );

revoke all on app.public_listings from public, keyforta_runtime;
revoke all on app.public_listing_publication_events from public, keyforta_runtime;
revoke all on app.unit_pricing_versions from public, keyforta_runtime;
revoke all on app.unit_availability_versions from public, keyforta_runtime;
revoke all on app.rental_inventory_events from public, keyforta_runtime;
revoke insert, update on app.properties, app.units from keyforta_runtime;

grant select on app.public_listings, app.unit_pricing_versions,
  app.unit_availability_versions to keyforta_runtime;

create function app.runtime_schema_v0022_ready()
returns boolean
language sql
stable
set search_path = pg_catalog, app
as $$
  select true
$$;

revoke all on function app.runtime_schema_v0022_ready() from public;
grant execute on function app.runtime_schema_v0022_ready() to keyforta_runtime;

commit;