begin;

create extension if not exists pgcrypto;
create schema if not exists app;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'keyforta_runtime') then
    create role keyforta_runtime nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end
$$;

create type app.organization_role as enum ('landlord', 'manager', 'tenant', 'auditor');
create type app.payment_status as enum ('posted', 'reversal');

create table app.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table app.users (
  id uuid primary key default gen_random_uuid(),
  external_subject text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table app.memberships (
  organization_id uuid not null references app.organizations(id),
  user_id uuid not null references app.users(id),
  role app.organization_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table app.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  name text not null,
  address text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now()
);

create table app.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  property_id uuid not null references app.properties(id),
  label text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, property_id, label),
  unique (organization_id, id)
);

create table app.leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  unit_id uuid not null,
  tenant_user_id uuid not null references app.users(id),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  base_rent_minor bigint not null check (base_rent_minor > 0),
  starts_on date not null,
  version integer not null default 1 check (version > 0),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, unit_id) references app.units(organization_id, id),
  unique (organization_id, id)
);

create table app.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  lease_id uuid not null,
  amount_minor bigint not null check (amount_minor <> 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status app.payment_status not null,
  idempotency_key text not null,
  provider_reference text not null,
  reverses_payment_id uuid references app.payments(id),
  reason text,
  actor_id uuid not null references app.users(id),
  correlation_id text not null,
  posted_at timestamptz not null default now(),
  foreign key (organization_id, lease_id) references app.leases(organization_id, id),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  unique (organization_id, provider_reference)
);

create table app.receipt_counters (
  organization_id uuid primary key references app.organizations(id),
  next_number bigint not null check (next_number > 0)
);

create table app.receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  payment_id uuid not null unique references app.payments(id),
  receipt_number text not null,
  issued_at timestamptz not null default now(),
  foreign key (organization_id, payment_id) references app.payments(organization_id, id),
  unique (organization_id, receipt_number)
);

create table app.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  payment_id uuid not null references app.payments(id),
  account_code text not null,
  amount_minor bigint not null check (amount_minor <> 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  posted_at timestamptz not null default now(),
  foreign key (organization_id, payment_id) references app.payments(organization_id, id)
);

create table app.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  actor_id uuid not null references app.users(id),
  correlation_id text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  occurred_at timestamptz not null default now()
);

create function app.current_organization_id() returns uuid
language sql stable
return nullif(current_setting('app.organization_id', true), '')::uuid;

create function app.reject_financial_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception 'posted financial records are immutable';
end
$$;

create trigger payments_are_immutable
before update or delete on app.payments
for each row execute function app.reject_financial_mutation();

create trigger receipts_are_immutable
before update or delete on app.receipts
for each row execute function app.reject_financial_mutation();

create trigger ledger_entries_are_immutable
before update or delete on app.ledger_entries
for each row execute function app.reject_financial_mutation();

alter table app.memberships enable row level security;
alter table app.memberships force row level security;
alter table app.properties enable row level security;
alter table app.properties force row level security;
alter table app.units enable row level security;
alter table app.units force row level security;
alter table app.leases enable row level security;
alter table app.leases force row level security;
alter table app.payments enable row level security;
alter table app.payments force row level security;
alter table app.receipt_counters enable row level security;
alter table app.receipt_counters force row level security;
alter table app.receipts enable row level security;
alter table app.receipts force row level security;
alter table app.ledger_entries enable row level security;
alter table app.ledger_entries force row level security;
alter table app.audit_events enable row level security;
alter table app.audit_events force row level security;

create policy organization_isolation on app.memberships
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.properties
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.units
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.leases
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.payments
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.receipt_counters
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.receipts
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.ledger_entries
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());
create policy organization_isolation on app.audit_events
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

create function app.resolve_actor(subject text, requested_organization_id uuid)
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
      and memberships.active;
end
$$;

create function app.post_payment(
  requested_lease_id uuid,
  requested_amount_minor bigint,
  requested_currency char(3),
  requested_idempotency_key text,
  requested_provider_reference text
) returns table (
  payment_id uuid,
  lease_id uuid,
  amount_minor bigint,
  currency char(3),
  correlation_id text,
  receipt_id uuid,
  receipt_number text
)
language plpgsql
set search_path = app, pg_temp
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := nullif(current_setting('app.correlation_id', true), '');
  existing_payment app.payments%rowtype;
  created_payment app.payments%rowtype;
  created_receipt app.receipts%rowtype;
  sequence_number bigint;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted audit context is required';
  end if;
  if requested_amount_minor <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  if not exists (
    select 1 from app.memberships
    where organization_id = organization
      and user_id = actor
      and active
      and role in ('landlord', 'manager')
  ) then
    raise exception 'actor cannot post payments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(organization::text || ':' || requested_provider_reference, 0));
  select * into existing_payment
  from app.payments
  where organization_id = organization
    and (
      idempotency_key = requested_idempotency_key
      or provider_reference = requested_provider_reference
    );

  if found then
    if existing_payment.lease_id <> requested_lease_id
      or existing_payment.amount_minor <> requested_amount_minor
      or existing_payment.currency <> requested_currency then
      raise exception 'idempotency conflict';
    end if;
    select receipts.* into created_receipt
    from app.receipts as receipts
    where receipts.payment_id = existing_payment.id;
    return query select existing_payment.id, existing_payment.lease_id,
      existing_payment.amount_minor, existing_payment.currency,
      existing_payment.correlation_id, created_receipt.id, created_receipt.receipt_number;
    return;
  end if;

  insert into app.payments (
    organization_id, lease_id, amount_minor, currency, status,
    idempotency_key, provider_reference, actor_id, correlation_id
  ) values (
    organization, requested_lease_id, requested_amount_minor, requested_currency,
    'posted', requested_idempotency_key, requested_provider_reference, actor, correlation
  ) returning * into created_payment;

  insert into app.receipt_counters (organization_id, next_number)
  values (organization, 2)
  on conflict (organization_id) do update
    set next_number = app.receipt_counters.next_number + 1
  returning next_number - 1 into sequence_number;

  insert into app.receipts (organization_id, payment_id, receipt_number)
  values (
    organization,
    created_payment.id,
    'RCT-' || extract(year from now())::integer || '-' || lpad(sequence_number::text, 6, '0')
  ) returning * into created_receipt;

  insert into app.ledger_entries (
    organization_id, payment_id, account_code, amount_minor, currency
  ) values
    (organization, created_payment.id, 'CASH_CLEARING', requested_amount_minor, requested_currency),
    (organization, created_payment.id, 'TENANT_UNAPPLIED', -requested_amount_minor, requested_currency);

  insert into app.audit_events (
    organization_id, actor_id, correlation_id, action, entity_type, entity_id
  ) values (organization, actor, correlation, 'payment.posted', 'payment', created_payment.id);

  return query select created_payment.id, created_payment.lease_id,
    created_payment.amount_minor, created_payment.currency,
    created_payment.correlation_id, created_receipt.id, created_receipt.receipt_number;
end
$$;

grant usage on schema app to keyforta_runtime;
revoke all on function app.resolve_actor(text, uuid) from public;
revoke all on function app.post_payment(uuid, bigint, char, text, text) from public;
grant select on app.memberships, app.properties, app.units, app.leases,
  app.payments, app.receipt_counters, app.receipts, app.ledger_entries,
  app.audit_events to keyforta_runtime;
grant insert on app.payments, app.receipt_counters, app.receipts,
  app.ledger_entries, app.audit_events to keyforta_runtime;
grant update on app.receipt_counters to keyforta_runtime;
grant execute on function app.current_organization_id() to keyforta_runtime;
grant execute on function app.resolve_actor(text, uuid) to keyforta_runtime;
grant execute on function app.post_payment(uuid, bigint, char, text, text) to keyforta_runtime;

commit;