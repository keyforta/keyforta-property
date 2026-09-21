begin;

-- Read-only portfolio feed for issue #114: a landlord/manager currently must
-- know and type an internal PublicListing ID to publish or withdraw it. This
-- migration adds a single read-only function returning the listings a given
-- actor is authorized to manage, so the portal UI can offer a picker instead
-- of a manual ID field.
--
-- This does NOT implement REQ-035 (PublicListing creation, publication, and
-- media): it only reads existing app.public_listings rows (pre-launch
-- synthetic fixtures today) using the same actor_is_active_landlord /
-- manager_property_assignments authorization already enforced by
-- app.set_public_listing_publication (migration 0023). No new listing rows
-- are created and no publication authority changes.

create function app.list_public_listings_for_actor()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, app
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  is_landlord boolean;
  result jsonb;
begin
  if organization is null or actor is null then
    raise exception 'trusted request context is required';
  end if;

  is_landlord := app.actor_is_active_landlord(organization, actor);

  select coalesce(jsonb_agg(listing_row order by listing_row ->> 'title'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', l.id,
      'title', p.name || ' — ' || u.label,
      'status', l.status,
      'note', concat_ws(', ', p.address ->> 'commune', p.address ->> 'city')
    ) as listing_row
    from app.public_listings l
    join app.properties p
      on p.organization_id = l.organization_id and p.id = l.property_id
    join app.units u
      on u.organization_id = l.organization_id and u.id = l.unit_id
    where l.organization_id = organization
      and (
        is_landlord
        or exists (
          select 1
          from app.manager_property_assignments a
          join app.memberships m
            on m.organization_id = a.organization_id
            and m.user_id = a.manager_user_id
          where a.organization_id = organization
            and a.property_id = l.property_id
            and a.manager_user_id = actor
            and a.revoked_at is null
            and m.role in ('landlord', 'manager')
            and m.active
            and m.effective_from <= transaction_timestamp()
            and (m.effective_to is null or transaction_timestamp() < m.effective_to)
        )
      )
  ) listings;

  return result;
end
$$;

revoke all on function app.list_public_listings_for_actor() from public;
grant execute on function app.list_public_listings_for_actor() to keyforta_runtime;

commit;
