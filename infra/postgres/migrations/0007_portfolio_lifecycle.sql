begin;

alter table app.properties
  add column archived_at timestamptz;

alter table app.units
  add column archived_at timestamptz;

alter table app.leases
  add column lease_series_id uuid,
  add column supersedes_lease_id uuid references app.leases(id),
  add column archived_at timestamptz;

update app.leases set lease_series_id = id;

alter table app.leases
  alter column lease_series_id set not null,
  add constraint leases_series_version_key
    unique (organization_id, lease_series_id, version);

create function app.set_initial_lease_series() returns trigger
language plpgsql
as $$
begin
  if new.lease_series_id is null then new.lease_series_id := new.id; end if;
  return new;
end
$$;

create trigger leases_initialize_series
before insert on app.leases
for each row execute function app.set_initial_lease_series();

create trigger leases_are_append_only
before update or delete on app.leases
for each row execute function app.reject_financial_mutation();

create function app.reverse_payment(
  requested_payment_id uuid,
  requested_reason text
) returns table (
  payment_id uuid,
  lease_id uuid,
  amount_minor bigint,
  currency char(3),
  correlation_id text,
  reverses_payment_id uuid,
  reason text
)
language plpgsql
set search_path = app, pg_temp
as $$
declare
  organization uuid := app.current_organization_id();
  actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  correlation text := nullif(current_setting('app.correlation_id', true), '');
  original app.payments%rowtype;
  reversal app.payments%rowtype;
begin
  if organization is null or actor is null or correlation is null then
    raise exception 'trusted audit context is required';
  end if;
  if length(trim(requested_reason)) < 3 then
    raise exception 'reversal reason is required';
  end if;

  select * into original
  from app.payments
  where organization_id = organization
    and id = requested_payment_id
    and status = 'posted';
  if not found then return; end if;

  select payment.* into reversal
  from app.payments as payment
  where payment.organization_id = organization
    and payment.reverses_payment_id = original.id;
  if found then
    return query select reversal.id, reversal.lease_id,
      reversal.amount_minor, reversal.currency, reversal.correlation_id,
      reversal.reverses_payment_id, reversal.reason;
    return;
  end if;

  insert into app.payments (
    organization_id, lease_id, amount_minor, currency, status,
    idempotency_key, provider_reference, reverses_payment_id, reason,
    actor_id, correlation_id
  ) values (
    organization, original.lease_id, -original.amount_minor,
    original.currency, 'reversal', 'reversal:' || original.id,
    'reversal:' || original.id, original.id, trim(requested_reason),
    actor, correlation
  ) returning * into reversal;

  insert into app.ledger_entries (
    organization_id, payment_id, account_code, amount_minor, currency
  ) values
    (organization, reversal.id, 'CASH_CLEARING', reversal.amount_minor, reversal.currency),
    (organization, reversal.id, 'TENANT_UNAPPLIED', -reversal.amount_minor, reversal.currency);

  insert into app.audit_events (
    organization_id, actor_id, correlation_id, action, entity_type, entity_id
  ) values (
    organization, actor, correlation, 'payment.reversed', 'payment', reversal.id
  );

  return query select reversal.id, reversal.lease_id,
    reversal.amount_minor, reversal.currency, reversal.correlation_id,
    reversal.reverses_payment_id, reversal.reason;
end
$$;

revoke all on function app.reverse_payment(uuid, text) from public;
grant execute on function app.reverse_payment(uuid, text) to keyforta_runtime;

alter table app.units
  drop constraint units_organization_id_property_id_label_key;

create unique index units_active_label_key
  on app.units (organization_id, property_id, label)
  where archived_at is null;

create index properties_active_organization_idx
  on app.properties (organization_id, name, id)
  where archived_at is null;

create index units_active_organization_idx
  on app.units (organization_id, property_id, label, id)
  where archived_at is null;

grant insert, update on app.properties, app.units to keyforta_runtime;
grant insert on app.leases to keyforta_runtime;

commit;