begin;

alter type app.tenant_application_status add value if not exists 'approved';
alter type app.tenant_application_status add value if not exists 'declined';

create type app.tenant_application_decision as enum ('approve', 'decline');

create table app.tenant_application_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  application_id uuid not null unique references app.tenant_applications(id),
  reviewer_user_id uuid not null references app.users(id),
  decision app.tenant_application_decision not null,
  notes text not null check (length(trim(notes)) between 1 and 2000),
  decided_at timestamptz not null default now()
);

alter table app.tenant_application_reviews enable row level security;
alter table app.tenant_application_reviews force row level security;

create policy organization_isolation on app.tenant_application_reviews
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

grant select, insert on app.tenant_application_reviews to keyforta_runtime;

commit;