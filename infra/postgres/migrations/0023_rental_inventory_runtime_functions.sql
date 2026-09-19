begin;

create function app.runtime_public_listing_is_eligible(requested_listing_id uuid)
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
      on property.id = listing.property_id
     and property.organization_id = listing.organization_id
    join lateral (
      select pricing.id, pricing.amount_minor
      from app.unit_pricing_versions as pricing
      where pricing.organization_id = listing.organization_id
        and pricing.unit_id = listing.unit_id
        and pricing.effective_from <= transaction_timestamp()
        and (
          pricing.effective_to is null
          or transaction_timestamp() < pricing.effective_to
        )
      order by pricing.effective_from desc, pricing.id desc
      limit 1
    ) as current_pricing on true
    join lateral (
      select availability.id, availability.status
      from app.unit_availability_versions as availability
      where availability.organization_id = listing.organization_id
        and availability.unit_id = listing.unit_id
        and availability.effective_from <= transaction_timestamp()
        and (
          availability.effective_to is null
          or transaction_timestamp() < availability.effective_to
        )
      order by availability.effective_from desc, availability.id desc
      limit 1
    ) as current_availability on true
    where listing.id = requested_listing_id
      and listing.status = 'published'
      and listing.snapshot is not null
      and listing.published_at is not null
      and listing.withdrawn_at is null
      and property.archived_at is null
      and property.verification_status not in ('rejected', 'expired', 'suspended')
      and property.publication_status in ('draft', 'pending_review', 'paused')
      and unit.archived_at is null
      and unit.publication_status = 'published'
      and current_availability.status = 'available'
      and current_pricing.amount_minor > 0
  )
$$;

create policy published_listing_read on app.public_listings for select
  using (app.runtime_public_listing_is_eligible(id));

create function app.get_public_listing(requested_identifier text)
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
  with matched as (
    select listing.*
    from app.public_listings as listing
    where app.runtime_public_listing_is_eligible(listing.id)
      and (
        listing.id::text = requested_identifier
        or lower((listing.snapshot -> 'projection' ->> 'id')) = lower(requested_identifier)
      )
    order by case when listing.id::text = requested_identifier then 0 else 1 end,
      listing.published_at desc,
      listing.id
    limit 1
  )
  select
    matched.id,
    matched.snapshot -> 'projection' ->> 'id' as slug,
    matched.snapshot -> 'projection' ->> 'name' as title,
    matched.snapshot -> 'projection' ->> 'summary' as summary,
    matched.snapshot -> 'projection' ->> 'city' as city,
    matched.snapshot -> 'projection' ->> 'district' as district,
    ((matched.snapshot -> 'projection' ->> 'bedrooms'))::integer as bedrooms,
    ((matched.snapshot -> 'projection' ->> 'bathrooms'))::integer as bathrooms,
    case
      when matched.snapshot -> 'projection' ? 'areaSquareMeters'
        then ((matched.snapshot -> 'projection' ->> 'areaSquareMeters'))::integer
      else null
    end as area_square_meters,
    ((matched.snapshot -> 'projection' ->> 'monthlyRentMinor'))::bigint as monthly_rent_minor,
    (matched.snapshot -> 'projection' ->> 'currency')::char(3) as currency,
    ((matched.snapshot -> 'projection' ->> 'availableFrom'))::date as available_from,
    coalesce(array(select jsonb_array_elements_text(matched.snapshot -> 'projection' -> 'amenities')), array[]::text[]) as amenities,
    coalesce(array(select jsonb_array_elements_text(matched.snapshot -> 'projection' -> 'imageUrls')), array[]::text[]) as image_urls
  from matched
$$;

create function app.list_public_listings_page(
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
    select
      listing.id,
      listing.created_at,
      listing.snapshot -> 'projection' ->> 'id' as slug,
      listing.snapshot -> 'projection' ->> 'name' as title,
      listing.snapshot -> 'projection' ->> 'summary' as summary,
      listing.snapshot -> 'projection' ->> 'city' as city,
      listing.snapshot -> 'projection' ->> 'district' as district,
      ((listing.snapshot -> 'projection' ->> 'bedrooms'))::integer as bedrooms,
      ((listing.snapshot -> 'projection' ->> 'bathrooms'))::integer as bathrooms,
      case
        when listing.snapshot -> 'projection' ? 'areaSquareMeters'
          then ((listing.snapshot -> 'projection' ->> 'areaSquareMeters'))::integer
        else null
      end as area_square_meters,
      ((listing.snapshot -> 'projection' ->> 'monthlyRentMinor'))::bigint as monthly_rent_minor,
      (listing.snapshot -> 'projection' ->> 'currency')::char(3) as currency,
      ((listing.snapshot -> 'projection' ->> 'availableFrom'))::date as available_from,
      coalesce(array(select jsonb_array_elements_text(listing.snapshot -> 'projection' -> 'amenities')), array[]::text[]) as amenities,
      coalesce(array(select jsonb_array_elements_text(listing.snapshot -> 'projection' -> 'imageUrls')), array[]::text[]) as image_urls
    from app.public_listings as listing
    where app.runtime_public_listing_is_eligible(listing.id)
      and (requested_city is null or lower(listing.snapshot -> 'projection' ->> 'city') = lower(requested_city))
      and (requested_district is null or (listing.snapshot -> 'projection' ->> 'district') ilike '%' || requested_district || '%')
      and (requested_bedrooms is null or ((listing.snapshot -> 'projection' ->> 'bedrooms'))::integer >= requested_bedrooms)
      and (requested_max_rent_minor is null or ((listing.snapshot -> 'projection' ->> 'monthlyRentMinor'))::bigint <= requested_max_rent_minor)
  ), cursor_row as (
    select candidate.created_at, candidate.id, candidate.slug, candidate.title
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
          or (candidate.created_at = (select cursor_row.created_at from cursor_row) and candidate.id > (select cursor_row.id from cursor_row))
        )
      )
      or (
        requested_sort = 'name_asc'
        and (
          candidate.title > (select cursor_row.title from cursor_row)
          or (candidate.title = (select cursor_row.title from cursor_row) and candidate.id > (select cursor_row.id from cursor_row))
        )
      )
      or (
        requested_sort = 'name_desc'
        and (
          candidate.title < (select cursor_row.title from cursor_row)
          or (candidate.title = (select cursor_row.title from cursor_row) and candidate.id > (select cursor_row.id from cursor_row))
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

create function app.create_public_listing_inquiry(
  requested_identifier text,
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
  listing record;
begin
  select projection.id, candidate.organization_id into listing
  from app.get_public_listing(requested_identifier) as projection
  join app.public_listings as candidate on candidate.id = projection.id
  limit 1;

  if not found then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(listing.id::text || ':' || lower(requested_email), 0));
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
  assignment_event_id uuid;
  property_record app.properties%rowtype;
  unit_record app.units%rowtype;
  current_pricing record;
  current_availability record;
  listing_snapshot jsonb;
  event_action text;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted request context is required';
  end if;

  select candidate.* into listing
  from app.public_listings as candidate
  where candidate.id = requested_listing_id
    and candidate.organization_id = organization
  for update of candidate;

  if not found then
    return false;
  end if;

  select event.id into assignment_event_id
  from app.manager_property_assignment_events as event
  join app.memberships as membership
    on membership.organization_id = event.organization_id
   and membership.user_id = event.manager_user_id
  join app.manager_property_assignments as assignment
    on assignment.organization_id = event.organization_id
   and assignment.property_id = event.property_id
   and assignment.manager_user_id = event.manager_user_id
   and assignment.assigned_at = event.occurred_at
   and assignment.revoked_at is null
  where event.organization_id = organization
    and event.property_id = listing.property_id
    and event.manager_user_id = actor
    and event.action = 'assigned'
    and membership.role in ('landlord', 'manager')
    and membership.active
    and membership.effective_from <= transaction_timestamp()
    and (membership.effective_to is null or transaction_timestamp() < membership.effective_to)
  order by event.occurred_at desc, event.id desc
  limit 1;

  if assignment_event_id is null then
    return false;
  end if;

  if requested_published then
    if listing.status = 'published' then
      return false;
    end if;

    select * into property_record
    from app.properties
    where organization_id = organization
      and id = listing.property_id;
    select * into unit_record
    from app.units
    where organization_id = organization
      and id = listing.unit_id
      and property_id = listing.property_id;

    if not found
      or property_record.archived_at is not null
      or property_record.verification_status in ('rejected', 'expired', 'suspended')
      or property_record.publication_status not in ('draft', 'pending_review', 'paused')
      or unit_record.archived_at is not null
      or unit_record.publication_status <> 'published' then
      return false;
    end if;

    select pricing.id, pricing.amount_minor, pricing.currency into current_pricing
    from app.unit_pricing_versions as pricing
    where pricing.organization_id = organization
      and pricing.unit_id = listing.unit_id
      and pricing.effective_from <= transaction_timestamp()
      and (pricing.effective_to is null or transaction_timestamp() < pricing.effective_to)
    order by pricing.effective_from desc, pricing.id desc
    limit 1;

    select availability.id, availability.status, availability.effective_from into current_availability
    from app.unit_availability_versions as availability
    where availability.organization_id = organization
      and availability.unit_id = listing.unit_id
      and availability.effective_from <= transaction_timestamp()
      and (availability.effective_to is null or transaction_timestamp() < availability.effective_to)
    order by availability.effective_from desc, availability.id desc
    limit 1;

    if current_pricing.id is null or current_availability.id is null or current_availability.status <> 'available' then
      return false;
    end if;

    listing_snapshot := jsonb_build_object(
      'propertyId', listing.property_id,
      'propertyVersion', property_record.version,
      'unitId', listing.unit_id,
      'unitVersion', unit_record.version,
      'pricingVersionId', current_pricing.id,
      'availabilityVersionId', current_availability.id,
      'projection', jsonb_build_object(
        'id', listing.id::text,
        'name', property_record.name || ' — ' || unit_record.label,
        'summary', coalesce(listing.snapshot -> 'projection' ->> 'summary', property_record.name || ' listing'),
        'city', property_record.address ->> 'city',
        'district', property_record.address ->> 'quartier',
        'bedrooms', unit_record.bedrooms,
        'bathrooms', unit_record.bathrooms,
        'monthlyRentMinor', current_pricing.amount_minor::text,
        'currency', current_pricing.currency,
        'availableFrom', (current_availability.effective_from at time zone 'UTC')::date,
        'amenities', coalesce(listing.snapshot -> 'projection' -> 'amenities', '[]'::jsonb),
        'imageUrls', coalesce(listing.snapshot -> 'projection' -> 'imageUrls', '[]'::jsonb),
        'areaSquareMeters', unit_record.area_square_meters
      )
    );

    if jsonb_array_length(coalesce(listing_snapshot -> 'projection' -> 'imageUrls', '[]'::jsonb)) < 1 then
      return false;
    end if;

    update app.public_listings
    set status = 'published',
        snapshot = listing_snapshot,
        version = version + 1,
        published_at = transaction_timestamp(),
        withdrawn_at = null,
        updated_at = transaction_timestamp()
    where id = listing.id;
    event_action := 'published';
  else
    if listing.status <> 'published' then
      return false;
    end if;

    update app.public_listings
    set status = 'withdrawn',
        version = version + 1,
        withdrawn_at = transaction_timestamp(),
        updated_at = transaction_timestamp()
    where id = listing.id;
    event_action := 'withdrawn';
  end if;

  insert into app.public_listing_publication_events (
    organization_id, listing_id, property_id, unit_id, actor_id,
    manager_assignment_event_id, manager_assignment_action, listing_version,
    correlation_id, action, source, occurred_at
  ) values (
    organization, listing.id, listing.property_id, listing.unit_id, actor,
    assignment_event_id, 'assigned', listing.version + 1,
    correlation, event_action, 'runtime_api', transaction_timestamp()
  );

  return true;
end
$$;

create function app.runtime_schema_v0023_ready()
returns boolean
language sql
stable
set search_path = pg_catalog, app
as $$
  select true
$$;

revoke all on function app.runtime_public_listing_is_eligible(uuid) from public;
revoke all on function app.get_public_listing(text) from public;
revoke all on function app.list_public_listings_page(text, text, integer, bigint, text, text, integer) from public;
revoke all on function app.create_public_listing_inquiry(text, text, text, text, timestamptz, text, text, text) from public;
revoke all on function app.set_public_listing_publication(uuid, boolean) from public;
revoke all on function app.runtime_schema_v0023_ready() from public;
grant execute on function app.get_public_listing(text) to keyforta_runtime;
grant execute on function app.list_public_listings_page(text, text, integer, bigint, text, text, integer) to keyforta_runtime;
grant execute on function app.create_public_listing_inquiry(text, text, text, text, timestamptz, text, text, text) to keyforta_runtime;
grant execute on function app.set_public_listing_publication(uuid, boolean) to keyforta_runtime;
grant execute on function app.runtime_schema_v0023_ready() to keyforta_runtime;

commit;
