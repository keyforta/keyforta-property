begin;

create table app.public_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  unit_id uuid not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 120),
  summary text not null check (char_length(summary) between 20 and 1000),
  city text not null,
  district text not null,
  bedrooms integer not null check (bedrooms >= 0),
  bathrooms integer not null check (bathrooms > 0),
  area_square_meters integer check (area_square_meters > 0),
  monthly_rent_minor bigint not null check (monthly_rent_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  available_from date not null,
  amenities text[] not null default '{}',
  image_urls text[] not null check (cardinality(image_urls) > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'reserved', 'rented', 'withdrawn')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, unit_id) references app.units(organization_id, id),
  unique (organization_id, unit_id)
);

create table app.public_listing_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  listing_id uuid not null references app.public_listings(id),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (char_length(btrim(phone)) between 7 and 30),
  message text check (message is null or char_length(message) <= 1000),
  correlation_id text not null check (char_length(correlation_id) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table app.public_listings enable row level security;
alter table app.public_listings force row level security;
alter table app.public_listing_inquiries enable row level security;
alter table app.public_listing_inquiries force row level security;

create policy organization_isolation on app.public_listings
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy published_listing_read on app.public_listings for select
  using (status = 'published' and published_at is not null);
create policy organization_isolation on app.public_listing_inquiries
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

create function app.list_public_listings(
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
set search_path = app, pg_temp
as $$
  select listing.id, listing.slug, listing.title, listing.summary,
    listing.city, listing.district, listing.bedrooms, listing.bathrooms,
    listing.area_square_meters, listing.monthly_rent_minor, listing.currency,
    listing.available_from, listing.amenities, listing.image_urls
  from app.public_listings as listing
  where listing.status = 'published'
    and listing.published_at is not null
    and (requested_district is null or listing.district ilike '%' || requested_district || '%')
    and (requested_bedrooms is null or listing.bedrooms >= requested_bedrooms)
    and (requested_max_rent_minor is null or listing.monthly_rent_minor <= requested_max_rent_minor)
  order by listing.published_at desc, listing.id
$$;

create function app.get_public_listing(requested_slug text)
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
set search_path = app, pg_temp
as $$
  select listing.id, listing.slug, listing.title, listing.summary,
    listing.city, listing.district, listing.bedrooms, listing.bathrooms,
    listing.area_square_meters, listing.monthly_rent_minor, listing.currency,
    listing.available_from, listing.amenities, listing.image_urls
  from app.public_listings as listing
  where listing.slug = requested_slug
    and listing.status = 'published'
    and listing.published_at is not null
$$;

create function app.create_public_listing_inquiry(
  requested_slug text,
  requested_full_name text,
  requested_email text,
  requested_phone text,
  requested_message text,
  requested_correlation_id text
) returns boolean
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare
  listing app.public_listings%rowtype;
begin
  select candidate.* into listing
  from app.public_listings as candidate
  where candidate.slug = requested_slug
    and candidate.status = 'published'
    and candidate.published_at is not null;

  if not found then
    return false;
  end if;

  perform set_config('app.organization_id', listing.organization_id::text, true);

  if not exists (
    select 1 from app.public_listing_inquiries as inquiry
    where inquiry.listing_id = listing.id
      and lower(inquiry.email) = lower(requested_email)
      and inquiry.created_at > now() - interval '1 hour'
  ) then
    insert into app.public_listing_inquiries (
      organization_id, listing_id, full_name, email, phone, message,
      correlation_id
    ) values (
      listing.organization_id, listing.id, requested_full_name,
      requested_email, requested_phone, requested_message,
      requested_correlation_id
    );
  end if;

  return true;
end
$$;

revoke all on app.public_listings from public;
revoke all on app.public_listing_inquiries from public;
revoke all on function app.list_public_listings(text, integer, bigint) from public;
revoke all on function app.get_public_listing(text) from public;
revoke all on function app.create_public_listing_inquiry(text, text, text, text, text, text) from public;

grant execute on function app.list_public_listings(text, integer, bigint) to keyforta_runtime;
grant execute on function app.get_public_listing(text) to keyforta_runtime;
grant execute on function app.create_public_listing_inquiry(text, text, text, text, text, text) to keyforta_runtime;

commit;