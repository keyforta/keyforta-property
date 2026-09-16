begin;

create index public_listings_published_created_idx
  on app.public_listings (created_at desc, id)
  where status = 'published' and published_at is not null;
create index public_listings_published_title_idx
  on app.public_listings (title, id)
  where status = 'published' and published_at is not null;

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
set search_path = app, pg_temp
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
    where listing.status = 'published'
      and listing.published_at is not null
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

revoke all on function app.list_public_listings_page(
  text, text, integer, bigint, text, text, integer
) from public;
grant execute on function app.list_public_listings_page(
  text, text, integer, bigint, text, text, integer
) to keyforta_runtime;

commit;