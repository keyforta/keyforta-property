begin;

alter table app.public_listing_inquiries
  alter column phone drop not null,
  add column preferred_at timestamptz,
  add column locale text check (locale is null or locale in ('en', 'fr'));

alter table app.public_listing_inquiries
  drop constraint public_listing_inquiries_phone_check,
  add constraint public_listing_inquiries_phone_check
    check (phone is null or char_length(btrim(phone)) between 7 and 40);

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
  order by listing.created_at desc, listing.id
$$;

revoke execute on function app.create_public_listing_inquiry(
  text, text, text, text, text, text
) from keyforta_runtime;
drop function app.create_public_listing_inquiry(text, text, text, text, text, text);

create function app.create_public_listing_inquiry(
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

  perform pg_advisory_xact_lock(
    hashtextextended(listing.id::text || ':' || lower(requested_email), 0)
  );
  perform set_config('app.organization_id', listing.organization_id::text, true);

  if not exists (
    select 1 from app.public_listing_inquiries as inquiry
    where inquiry.listing_id = listing.id
      and lower(inquiry.email) = lower(requested_email)
      and inquiry.created_at > now() - interval '1 hour'
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

revoke all on function app.create_public_listing_inquiry(
  text, text, text, text, timestamptz, text, text, text
) from public;
grant execute on function app.create_public_listing_inquiry(
  text, text, text, text, timestamptz, text, text, text
) to keyforta_runtime;

commit;