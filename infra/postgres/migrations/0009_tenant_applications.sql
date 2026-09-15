begin;

create type app.tenant_application_status as enum ('draft', 'submitted');

create table app.tenant_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  tenant_user_id uuid not null references app.users(id),
  identity jsonb not null,
  household_members jsonb not null check (jsonb_typeof(household_members) = 'array'),
  employment jsonb not null,
  current_housing jsonb not null,
  emergency_contact jsonb not null,
  desired_move_in_date date not null,
  occupants integer not null check (occupants between 1 and 30),
  pets text,
  notes text,
  declarations jsonb not null,
  evidence text[] not null default array['identity', 'income', 'address', 'reference'],
  status app.tenant_application_status not null default 'draft',
  submitted_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, tenant_user_id),
  check ((status = 'draft' and submitted_at is null) or (status = 'submitted' and submitted_at is not null)),
  check ((employment->>'monthlyIncomeMinor') ~ '^\d+$'),
  check ((employment->>'currency') ~ '^[A-Z]{3}$')
);

alter table app.tenant_applications enable row level security;
alter table app.tenant_applications force row level security;

create policy organization_isolation on app.tenant_applications
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

grant select, insert on app.tenant_applications to keyforta_runtime;
grant update (
  identity, household_members, employment, current_housing,
  emergency_contact, desired_move_in_date, occupants, pets, notes,
  declarations, status, submitted_at, version, updated_at
) on app.tenant_applications to keyforta_runtime;

commit;