begin;

create extension if not exists btree_gist;

alter table app.organizations
  add column jurisdiction_code text,
  add constraint organizations_jurisdiction_code_check
    check (
      jurisdiction_code is null
      or jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,6})?$'
    );

alter table app.properties
  add column jurisdiction_code text,
  add constraint properties_jurisdiction_code_check
    check (
      jurisdiction_code is null
      or jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,6})?$'
    );

create table app.parties (
  id uuid primary key default gen_random_uuid(),
  party_type text not null default 'person'
    check (party_type in ('person', 'legal_entity')),
  legal_name text,
  preferred_name text not null check (length(btrim(preferred_name)) between 1 and 200),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

alter table app.users add column party_id uuid;

insert into app.parties (id, preferred_name, created_at, updated_at)
select users.id, users.display_name, users.created_at, users.created_at
from app.users;

update app.users set party_id = id;

alter table app.users
  alter column party_id set not null,
  add constraint users_party_id_key unique (party_id),
  add constraint users_party_id_fkey
    foreign key (party_id) references app.parties(id) on delete restrict;

create function app.ensure_user_party()
returns trigger
language plpgsql
security definer
set search_path = app, pg_temp
as $$
begin
  if new.party_id is null then
    new.party_id := new.id;
  end if;

  insert into app.parties (id, preferred_name)
  values (new.party_id, new.display_name)
  on conflict (id) do update
    set preferred_name = excluded.preferred_name,
        updated_at = now(),
        version = app.parties.version + 1;

  return new;
end
$$;

create trigger ensure_user_party
before insert or update of display_name, party_id on app.users
for each row execute function app.ensure_user_party();

create table app.profiles (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references app.parties(id) on delete restrict,
  profile_type text not null check (length(btrim(profile_type)) between 1 and 80),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  email text,
  phone text,
  locale text check (locale is null or locale in ('en', 'fr')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (party_id, profile_type)
);

insert into app.profiles (party_id, profile_type, display_name, created_at, updated_at)
select users.party_id, 'identity', users.display_name, users.created_at, users.created_at
from app.users;

create function app.sync_user_identity_profile()
returns trigger
language plpgsql
security definer
set search_path = app, pg_temp
as $$
begin
  insert into app.profiles (party_id, profile_type, display_name)
  values (new.party_id, 'identity', new.display_name)
  on conflict (party_id, profile_type) do update
    set display_name = excluded.display_name,
        updated_at = now(),
        version = app.profiles.version + 1;
  return new;
end
$$;

create trigger sync_user_identity_profile
after insert or update of display_name, party_id on app.users
for each row execute function app.sync_user_identity_profile();

alter table app.memberships
  add column party_id uuid,
  add column effective_from timestamptz,
  add column effective_to timestamptz,
  add constraint memberships_effective_interval_check
    check (effective_to is null or effective_to > effective_from);

update app.memberships
set party_id = users.party_id,
    effective_from = memberships.created_at
from app.users
where users.id = memberships.user_id;

alter table app.memberships
  alter column party_id set not null,
  alter column effective_from set not null,
  alter column effective_from set default now(),
  add constraint memberships_party_id_fkey
    foreign key (party_id) references app.parties(id) on delete restrict,
  add constraint memberships_organization_party_key
    unique (organization_id, party_id);

create function app.sync_membership_party()
returns trigger
language plpgsql
security definer
set search_path = app, pg_temp
as $$
begin
  select users.party_id into new.party_id
  from app.users
  where users.id = new.user_id;

  if new.party_id is null then
    raise exception 'membership user must resolve to a party';
  end if;
  if new.effective_from is null then
    new.effective_from := now();
  end if;
  return new;
end
$$;

create trigger sync_membership_party
before insert or update of user_id on app.memberships
for each row execute function app.sync_membership_party();

create or replace function app.resolve_actor(subject text, requested_organization_id uuid)
returns table (actor_id uuid, organization_id uuid, role app.organization_role)
language plpgsql
security definer
set search_path = app, pg_temp
as $$
begin
  perform set_config('app.organization_id', requested_organization_id::text, true);
  return query
    select users.id, memberships.organization_id, memberships.role
    from app.users
    join app.memberships on memberships.user_id = users.id
    where users.external_subject = subject
      and memberships.organization_id = requested_organization_id
      and memberships.active
      and memberships.effective_from <= transaction_timestamp()
      and (
        memberships.effective_to is null
        or transaction_timestamp() < memberships.effective_to
      );
end
$$;

create function app.current_party_id()
returns uuid
language sql
security definer
stable
set search_path = app, pg_temp
as $$
  select users.party_id
  from app.users
  where users.id = nullif(current_setting('app.actor_id', true), '')::uuid
$$;

alter table app.parties enable row level security;
alter table app.parties force row level security;
alter table app.profiles enable row level security;
alter table app.profiles force row level security;

create policy party_self_access on app.parties
  using (id = app.current_party_id());
create policy profile_self_access on app.profiles
  using (party_id = app.current_party_id());

create table app.jurisdiction_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null check (policy_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  jurisdiction_code text not null
    check (jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,6})?$'),
  version integer not null check (version > 0),
  rule_payload jsonb not null check (jsonb_typeof(rule_payload) = 'object'),
  requires_counsel_approval boolean not null default false,
  created_by_user_id uuid not null references app.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (policy_key, jurisdiction_code, version),
  unique (id, policy_key, jurisdiction_code)
);

create table app.policy_approval_evidence (
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null
    references app.jurisdiction_policy_versions(id) on delete restrict,
  approval_role text not null
    check (approval_role in ('policy_owner', 'qualified_counsel')),
  approved_by_user_id uuid not null references app.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  source_reference text not null
    check (length(btrim(source_reference)) between 1 and 500),
  evidence_hash text,
  created_at timestamptz not null default now()
);

create table app.policy_approval_revocations (
  id uuid primary key default gen_random_uuid(),
  approval_evidence_id uuid not null unique
    references app.policy_approval_evidence(id) on delete restrict,
  revoked_by_user_id uuid not null references app.users(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  correlation_id text not null check (length(correlation_id) between 1 and 200),
  revoked_at timestamptz not null default now()
);

create table app.jurisdiction_policy_activations (
  id uuid primary key default gen_random_uuid(),
  policy_version_id uuid not null,
  policy_key text not null,
  jurisdiction_code text not null,
  owner_evidence_id uuid not null
    references app.policy_approval_evidence(id) on delete restrict,
  counsel_evidence_id uuid
    references app.policy_approval_evidence(id) on delete restrict,
  effective_from timestamptz not null,
  effective_to timestamptz,
  activated_by_user_id uuid not null references app.users(id) on delete restrict,
  correlation_id text not null check (length(correlation_id) between 1 and 200),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  foreign key (policy_version_id, policy_key, jurisdiction_code)
    references app.jurisdiction_policy_versions(id, policy_key, jurisdiction_code)
    on delete restrict,
  exclude using gist (
    policy_key with =,
    jurisdiction_code with =,
    tstzrange(effective_from, effective_to, '[)') with &&
  )
);

create function app.reject_immutable_governance_history()
returns trigger
language plpgsql
set search_path = app, pg_temp
as $$
begin
  raise exception 'governance history is immutable';
end
$$;

create trigger jurisdiction_policy_versions_are_immutable
before update or delete on app.jurisdiction_policy_versions
for each row execute function app.reject_immutable_governance_history();
create trigger policy_approval_evidence_is_immutable
before update or delete on app.policy_approval_evidence
for each row execute function app.reject_immutable_governance_history();
create trigger policy_approval_revocations_are_immutable
before update or delete on app.policy_approval_revocations
for each row execute function app.reject_immutable_governance_history();
create trigger jurisdiction_policy_activations_are_immutable
before update or delete on app.jurisdiction_policy_activations
for each row execute function app.reject_immutable_governance_history();

create function app.activate_jurisdiction_policy(
  requested_policy_version_id uuid,
  requested_owner_evidence_id uuid,
  requested_counsel_evidence_id uuid,
  requested_effective_from timestamptz,
  requested_effective_to timestamptz,
  requested_activated_by_user_id uuid,
  requested_correlation_id text
) returns uuid
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare
  policy app.jurisdiction_policy_versions%rowtype;
  created_activation_id uuid;
begin
  if requested_effective_from is null
    or (requested_effective_to is not null and requested_effective_to <= requested_effective_from)
    or requested_correlation_id is null
    or length(btrim(requested_correlation_id)) = 0 then
    raise exception 'valid activation interval and correlation are required';
  end if;

  select candidate.* into policy
  from app.jurisdiction_policy_versions as candidate
  where candidate.id = requested_policy_version_id;

  if not found then
    raise exception 'policy version not found';
  end if;

  if not exists (
    select 1
    from app.policy_approval_evidence as evidence
    where evidence.id = requested_owner_evidence_id
      and evidence.policy_version_id = policy.id
      and evidence.approval_role = 'policy_owner'
      and not exists (
        select 1 from app.policy_approval_revocations as revocation
        where revocation.approval_evidence_id = evidence.id
      )
  ) then
    raise exception 'valid policy owner approval is required';
  end if;

  if policy.requires_counsel_approval and not exists (
    select 1
    from app.policy_approval_evidence as evidence
    where evidence.id = requested_counsel_evidence_id
      and evidence.policy_version_id = policy.id
      and evidence.approval_role = 'qualified_counsel'
      and not exists (
        select 1 from app.policy_approval_revocations as revocation
        where revocation.approval_evidence_id = evidence.id
      )
  ) then
    raise exception 'qualified counsel approval is required';
  end if;

  insert into app.jurisdiction_policy_activations (
    policy_version_id, policy_key, jurisdiction_code,
    owner_evidence_id, counsel_evidence_id,
    effective_from, effective_to, activated_by_user_id, correlation_id
  ) values (
    policy.id, policy.policy_key, policy.jurisdiction_code,
    requested_owner_evidence_id, requested_counsel_evidence_id,
    requested_effective_from, requested_effective_to,
    requested_activated_by_user_id, requested_correlation_id
  ) returning id into created_activation_id;

  return created_activation_id;
end
$$;

create function app.resolve_active_jurisdiction_policy(
  requested_policy_key text,
  requested_jurisdiction_code text,
  requested_at timestamptz default transaction_timestamp()
) returns table (
  policy_key text,
  version integer,
  rule_payload jsonb
)
language sql
security definer
stable
set search_path = app, pg_temp
as $$
  select policy.policy_key, policy.version, policy.rule_payload
  from app.jurisdiction_policy_activations as activation
  join app.jurisdiction_policy_versions as policy
    on policy.id = activation.policy_version_id
  join app.policy_approval_evidence as owner_evidence
    on owner_evidence.id = activation.owner_evidence_id
   and owner_evidence.policy_version_id = policy.id
   and owner_evidence.approval_role = 'policy_owner'
  left join app.policy_approval_evidence as counsel_evidence
    on counsel_evidence.id = activation.counsel_evidence_id
   and counsel_evidence.policy_version_id = policy.id
   and counsel_evidence.approval_role = 'qualified_counsel'
  where activation.policy_key = requested_policy_key
    and activation.jurisdiction_code = requested_jurisdiction_code
    and activation.effective_from <= requested_at
    and (activation.effective_to is null or requested_at < activation.effective_to)
    and not exists (
      select 1 from app.policy_approval_revocations as revocation
      where revocation.approval_evidence_id = owner_evidence.id
    )
    and (
      not policy.requires_counsel_approval
      or (
        counsel_evidence.id is not null
        and not exists (
          select 1 from app.policy_approval_revocations as revocation
          where revocation.approval_evidence_id = counsel_evidence.id
        )
      )
    )
$$;

revoke all on app.parties, app.profiles,
  app.jurisdiction_policy_versions, app.policy_approval_evidence,
  app.policy_approval_revocations, app.jurisdiction_policy_activations
  from public;
revoke all on function app.ensure_user_party() from public;
revoke all on function app.sync_user_identity_profile() from public;
revoke all on function app.sync_membership_party() from public;
revoke all on function app.current_party_id() from public;
revoke all on function app.reject_immutable_governance_history() from public;
revoke all on function app.activate_jurisdiction_policy(
  uuid, uuid, uuid, timestamptz, timestamptz, uuid, text
) from public;
revoke all on function app.resolve_active_jurisdiction_policy(
  text, text, timestamptz
) from public;

grant select on app.parties, app.profiles to keyforta_runtime;
grant execute on function app.current_party_id() to keyforta_runtime;
grant execute on function app.resolve_active_jurisdiction_policy(
  text, text, timestamptz
) to keyforta_runtime;

commit;
