begin;

create table app.membership_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  invited_by_user_id uuid not null references app.users(id),
  recipient_email text not null check (recipient_email = lower(trim(recipient_email))),
  role app.organization_role not null check (role in ('manager', 'tenant')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references app.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);

create unique index membership_invitations_pending_recipient_key
  on app.membership_invitations (organization_id, lower(recipient_email), role)
  where accepted_at is null and revoked_at is null;

create table app.membership_invitation_tokens (
  token_hash text primary key,
  invitation_id uuid not null unique references app.membership_invitations(id) on delete cascade,
  organization_id uuid not null references app.organizations(id)
);

create function app.register_membership_invitation_token()
returns trigger
language plpgsql
security definer
set search_path = app, pg_temp
as $$
begin
  insert into app.membership_invitation_tokens (
    token_hash, invitation_id, organization_id
  ) values (
    new.token_hash, new.id, new.organization_id
  );
  return new;
end
$$;

create trigger register_membership_invitation_token
after insert on app.membership_invitations
for each row execute function app.register_membership_invitation_token();

alter table app.membership_invitations enable row level security;
alter table app.membership_invitations force row level security;

create policy organization_isolation on app.membership_invitations
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

create function app.accept_membership_invitation(
  requested_token_hash text,
  requested_subject text,
  requested_email text,
  requested_display_name text,
  requested_correlation_id text
) returns table (
  invitation_id uuid,
  organization_id uuid,
  user_id uuid,
  role app.organization_role,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare
  invitation app.membership_invitations%rowtype;
  accepted_user app.users%rowtype;
  trusted_organization_id uuid;
begin
  if requested_subject is null or length(trim(requested_subject)) = 0
    or requested_email is null or length(trim(requested_email)) = 0
    or requested_correlation_id is null or length(trim(requested_correlation_id)) = 0 then
    raise exception 'verified identity and correlation are required';
  end if;

  select token.organization_id into trusted_organization_id
  from app.membership_invitation_tokens as token
  where token.token_hash = requested_token_hash;

  if not found then
    return;
  end if;

  perform set_config('app.organization_id', trusted_organization_id::text, true);

  select candidate.* into invitation
  from app.membership_invitations as candidate
  where candidate.token_hash = requested_token_hash
  for update;

  if not found
    or invitation.accepted_at is not null
    or invitation.revoked_at is not null
    or invitation.expires_at <= now()
    or invitation.recipient_email <> lower(trim(requested_email)) then
    return;
  end if;

  insert into app.users (external_subject, display_name)
  values (trim(requested_subject), coalesce(nullif(trim(requested_display_name), ''), lower(trim(requested_email))))
  on conflict (external_subject) do update
    set display_name = excluded.display_name
  returning * into accepted_user;

  insert into app.memberships (organization_id, user_id, role, active)
  values (invitation.organization_id, accepted_user.id, invitation.role, true)
  on conflict on constraint memberships_pkey do update
    set role = excluded.role, active = true;

  update app.membership_invitations
  set accepted_at = now(), accepted_by_user_id = accepted_user.id
  where id = invitation.id
  returning membership_invitations.accepted_at into accepted_at;

  insert into app.audit_events (
    organization_id, actor_id, correlation_id, action, entity_type, entity_id
  ) values (
    invitation.organization_id, accepted_user.id, requested_correlation_id,
    'invitation.accepted', 'membership_invitation', invitation.id
  );

  invitation_id := invitation.id;
  organization_id := invitation.organization_id;
  user_id := accepted_user.id;
  role := invitation.role;
  return next;
end
$$;

revoke all on function app.accept_membership_invitation(text, text, text, text, text) from public;
revoke all on function app.register_membership_invitation_token() from public;
grant usage on schema app to keyforta_runtime;
grant select, insert on app.membership_invitations to keyforta_runtime;
grant update (revoked_at) on app.membership_invitations to keyforta_runtime;
grant execute on function app.accept_membership_invitation(text, text, text, text, text) to keyforta_runtime;

commit;