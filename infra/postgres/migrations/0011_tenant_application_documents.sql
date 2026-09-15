begin;

create type app.application_document_type as enum (
  'identity',
  'income',
  'address',
  'reference'
);

create table app.tenant_application_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  application_id uuid not null references app.tenant_applications(id),
  uploaded_by_user_id uuid not null references app.users(id),
  document_type app.application_document_type not null,
  blob_name text not null unique,
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null check (version > 0),
  uploaded_at timestamptz not null default now(),
  unique (application_id, document_type, version)
);

alter table app.tenant_application_documents enable row level security;
alter table app.tenant_application_documents force row level security;

create policy organization_isolation on app.tenant_application_documents
  using (organization_id = app.current_organization_id())
  with check (organization_id = app.current_organization_id());

grant select, insert on app.tenant_application_documents to keyforta_runtime;

commit;