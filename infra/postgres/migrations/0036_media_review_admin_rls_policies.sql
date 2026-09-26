begin;

-- Migration 0030 (extended by 0032/0033) owns the three platform-admin
-- media-review functions (app.review_public_listing_media,
-- app.list_public_listings_pending_media_review,
-- app.get_public_listing_image_content_for_review) by
-- `keyforta_media_review_admin`, a role created with BYPASSRLS so those
-- functions can read/write across every organization despite the tables
-- below all being FORCE ROW LEVEL SECURITY. That role creation statement
-- can never succeed on Azure Database for PostgreSQL Flexible Server: only
-- Microsoft's internal `azuresu` role is ever granted BYPASSRLS there, and
-- migrations run through a Microsoft Entra (managed-identity) admin, which
-- Azure explicitly withholds BYPASSRLS from -- see
-- `apps/api/src/migrate.ts`'s `provisionMediaReviewAdminRole`, which now
-- pre-creates this role *without* BYPASSRLS before migrations run, so
-- 0030's own idempotent existence check skips its create-role statement
-- entirely instead of failing.
--
-- Without BYPASSRLS, `keyforta_media_review_admin` needs an alternative,
-- equally narrow way to see rows across organizations. Rather than
-- widening the blast radius by dropping FORCE ROW LEVEL SECURITY (which
-- would also expose every *other* owner-run script/connection on these
-- shared, heavily-used tables, not just these three functions), this adds
-- one additional PERMISSIVE policy per table, scoped `to
-- keyforta_media_review_admin` specifically. PostgreSQL only evaluates a
-- role-scoped policy for sessions whose current effective role is that
-- role (or a member of it); nothing here is settable by a client session,
-- and `keyforta_runtime` (the only role ordinary API requests ever run
-- as) is never a member of `keyforta_media_review_admin`, so normal
-- request handling remains exactly as RLS-restricted as before. Multiple
-- PERMISSIVE policies combine with OR, so these are purely additive and do
-- not change any existing policy's behavior for any other role.
create policy media_review_admin_select on app.public_listings
  for select to keyforta_media_review_admin using (true);
create policy media_review_admin_update on app.public_listings
  for update to keyforta_media_review_admin using (true) with check (true);

create policy media_review_admin_select on app.public_listing_media_review_events
  for select to keyforta_media_review_admin using (true);
create policy media_review_admin_insert on app.public_listing_media_review_events
  for insert to keyforta_media_review_admin with check (true);

create policy media_review_admin_access on app.properties
  for select to keyforta_media_review_admin using (true);

create policy media_review_admin_access on app.units
  for select to keyforta_media_review_admin using (true);

create policy media_review_admin_access on app.manager_property_assignments
  for select to keyforta_media_review_admin using (true);

create policy media_review_admin_access on app.manager_property_assignment_events
  for select to keyforta_media_review_admin using (true);

create policy media_review_admin_access on app.memberships
  for select to keyforta_media_review_admin using (true);

create policy media_review_admin_access on app.unit_pricing_versions
  for select to keyforta_media_review_admin using (true);

create policy media_review_admin_access on app.unit_availability_versions
  for select to keyforta_media_review_admin using (true);

create policy media_review_admin_select on app.public_listing_publication_events
  for select to keyforta_media_review_admin using (true);
create policy media_review_admin_insert on app.public_listing_publication_events
  for insert to keyforta_media_review_admin with check (true);

create policy media_review_admin_access on app.public_listing_images
  for select to keyforta_media_review_admin using (true);

commit;
