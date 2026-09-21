begin;

-- Read-only portfolio feed for issue #114: a landlord/manager currently must
-- know and type an internal PublicListing ID to publish or withdraw it. This
-- migration adds a single read-only function returning the listings a given
-- actor is authorized to manage, so the portal UI can offer a picker instead
-- of a manual ID field.
--
-- This does NOT implement REQ-035 (PublicListing creation, publication, and
-- media): it only reads existing app.public_listings rows (pre-launch
-- synthetic fixtures today). Authorization mirrors
-- app.set_public_listing_publication (migration 0023) exactly: an active
-- manager_property_assignment_events "assigned" event, correlated to a
-- still-active manager_property_assignments row and an active
-- landlord/manager membership, is required for every actor including
-- landlords — org-ownership alone does not grant listing-publication
-- authority (unlike app.list_rental_properties_for_actor in migration 0028,
-- which governs Property/Unit inventory ownership, a different authority
-- domain). A feed that showed listings the actor cannot actually
-- publish/withdraw would let the UI offer an action that the command then
-- silently rejects as not-found.

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
  result jsonb;
begin
  if organization is null or actor is null then
    raise exception 'trusted request context is required';
  end if;

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
      and exists (
        select 1
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
          and event.property_id = l.property_id
          and event.manager_user_id = actor
          and event.action = 'assigned'
          and membership.role in ('landlord', 'manager')
          and membership.active
          and membership.effective_from <= transaction_timestamp()
          and (membership.effective_to is null or transaction_timestamp() < membership.effective_to)
        order by event.occurred_at desc, event.id desc
        limit 1
      )
  ) listings;

  return result;
end
$$;

revoke all on function app.list_public_listings_for_actor() from public;
grant execute on function app.list_public_listings_for_actor() to keyforta_runtime;

commit;
