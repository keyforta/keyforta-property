begin;

create or replace function app.create_public_listing_inquiry(
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

commit;