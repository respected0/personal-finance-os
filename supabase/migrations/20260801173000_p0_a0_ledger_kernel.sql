begin;

create table app_private.ledger_accounts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  name text not null check (char_length(name) between 1 and 120),
  account_class text not null check (
    account_class in ('asset', 'liability', 'equity', 'income', 'expense')
  ),
  normal_side text not null check (normal_side in ('debit', 'credit')),
  system_role text not null check (
    system_role in (
      'bank_asset',
      'cash_asset',
      'card_liability',
      'expense',
      'income',
      'receivable_asset',
      'investment_asset',
      'opening_equity',
      'adjustment_equity',
      'realized_gain',
      'realized_loss',
      'fee_expense',
      'fx_rounding'
    )
  ),
  hidden boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, code),
  unique (user_id, system_role)
);

create index ledger_accounts_user_active_idx
  on app_private.ledger_accounts (user_id, active);

create table app_private.transactions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_request_id uuid not null,
  event_type text not null check (
    event_type in (
      'expense',
      'income',
      'transfer',
      'card_payment',
      'cashback_refund',
      'shared_expense',
      'receivable_settlement',
      'expected_realization',
      'investment_buy',
      'investment_sell',
      'opening_balance',
      'balance_adjustment',
      'void',
      'revise'
    )
  ),
  status text not null check (status in ('draft', 'posted', 'voided')),
  occurred_at timestamptz not null,
  economic_date date not null,
  primary_amount numeric(19,4) not null check (primary_amount > 0),
  primary_currency char(3) not null check (primary_currency ~ '^[A-Z]{3}$'),
  category_id uuid,
  counterparty_id uuid,
  engine_version text not null check (char_length(engine_version) between 1 and 40),
  input_schema_version integer not null check (input_schema_version > 0),
  input_json jsonb not null check (jsonb_typeof(input_json) = 'object'),
  preview_hash char(64) not null check (preview_hash ~ '^[a-f0-9]{64}$'),
  revision_group_id uuid not null,
  reverses_transaction_id uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, client_request_id),
  unique (user_id, reverses_transaction_id),
  foreign key (user_id, reverses_transaction_id)
    references app_private.transactions (user_id, id),
  check (
    (status = 'posted' and posted_at is not null)
    or (status <> 'posted' and posted_at is null)
  )
);

create index transactions_user_economic_date_idx
  on app_private.transactions (user_id, economic_date desc, id desc);
create index transactions_user_occurred_at_idx
  on app_private.transactions (user_id, occurred_at desc, id desc);
create index transactions_user_event_date_idx
  on app_private.transactions (user_id, event_type, economic_date desc);
create index transactions_user_revision_group_idx
  on app_private.transactions (user_id, revision_group_id);
create index transactions_user_category_date_idx
  on app_private.transactions (user_id, category_id, economic_date desc)
  where category_id is not null;
create index transactions_user_counterparty_date_idx
  on app_private.transactions (user_id, counterparty_id, economic_date desc)
  where counterparty_id is not null;
create index transactions_reverses_idx
  on app_private.transactions (user_id, reverses_transaction_id)
  where reverses_transaction_id is not null;

create table app_private.ledger_postings (
  id uuid primary key,
  user_id uuid not null,
  transaction_id uuid not null,
  ledger_account_id uuid not null,
  financial_account_id uuid,
  side text not null check (side in ('debit', 'credit')),
  amount_original numeric(19,4) not null check (amount_original > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  fx_rate numeric(28,12) not null check (fx_rate > 0),
  amount_base numeric(19,4) not null check (amount_base > 0),
  role text not null check (
    role in (
      'bank_asset',
      'cash_asset',
      'card_liability',
      'expense',
      'income',
      'receivable_asset',
      'investment_asset',
      'opening_equity',
      'adjustment_equity',
      'realized_gain',
      'realized_loss',
      'fee_expense',
      'fx_rounding'
    )
  ),
  sequence_no smallint not null check (sequence_no > 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, transaction_id)
    references app_private.transactions (user_id, id),
  foreign key (user_id, ledger_account_id)
    references app_private.ledger_accounts (user_id, id),
  unique (transaction_id, sequence_no),
  check (
    role = 'fx_rounding'
    or amount_base = round(amount_original * fx_rate, 4)
  )
);

comment on column app_private.ledger_postings.financial_account_id is
  'Composite financial account FK is added by its owning P0-A1 migration.';

create index ledger_postings_user_transaction_idx
  on app_private.ledger_postings (user_id, transaction_id);
create index ledger_postings_user_ledger_account_idx
  on app_private.ledger_postings (user_id, ledger_account_id);
create index ledger_postings_user_financial_account_idx
  on app_private.ledger_postings (user_id, financial_account_id)
  where financial_account_id is not null;

create table app_private.transaction_links (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  from_transaction_id uuid not null,
  to_transaction_id uuid not null,
  link_type text not null check (
    link_type in (
      'refund_of',
      'cashback_for',
      'repayment_of',
      'reverses',
      'fee_for',
      'realizes'
    )
  ),
  allocated_amount numeric(19,4) check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, from_transaction_id)
    references app_private.transactions (user_id, id),
  foreign key (user_id, to_transaction_id)
    references app_private.transactions (user_id, id),
  unique (user_id, from_transaction_id, to_transaction_id, link_type),
  check (
    (link_type in ('refund_of', 'cashback_for', 'repayment_of') and allocated_amount is not null)
    or (link_type in ('reverses', 'fee_for', 'realizes'))
  )
);

create index transaction_links_user_from_idx
  on app_private.transaction_links (user_id, from_transaction_id);
create index transaction_links_user_to_idx
  on app_private.transaction_links (user_id, to_transaction_id);
create unique index transaction_links_single_reversal_idx
  on app_private.transaction_links (user_id, to_transaction_id)
  where link_type = 'reverses';

create table app_private.idempotency_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 128),
  request_hash bytea not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  response_code integer check (response_code between 100 and 599),
  response_body jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  check (
    (status = 'completed' and response_code is not null and response_body is not null)
    or status <> 'completed'
  )
);

create index idempotency_keys_expires_at_idx
  on app_private.idempotency_keys (expires_at);

create table app_private.audit_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid not null,
  action text not null check (char_length(action) between 1 and 80),
  before_json jsonb,
  after_json jsonb,
  actor_session_id uuid,
  request_id text not null check (char_length(request_id) between 1 and 128),
  occurred_at timestamptz not null default now(),
  prev_hash bytea,
  event_hash bytea not null,
  unique (user_id, id)
);

create index audit_events_user_entity_idx
  on app_private.audit_events (user_id, entity_type, entity_id, occurred_at);
create index audit_events_user_request_idx
  on app_private.audit_events (user_id, request_id);
create index audit_events_user_occurred_at_idx
  on app_private.audit_events (user_id, occurred_at desc, id desc);

create table app_private.outbox_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  aggregate_type text not null check (char_length(aggregate_type) between 1 and 80),
  aggregate_id uuid not null,
  event_type text not null check (char_length(event_type) between 1 and 120),
  event_version integer not null check (event_version > 0),
  schema_version integer not null check (schema_version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  unique (aggregate_id, event_type, event_version)
);

create index outbox_events_pending_idx
  on app_private.outbox_events (created_at, id)
  where processed_at is null;
create index outbox_events_user_aggregate_idx
  on app_private.outbox_events (user_id, aggregate_type, aggregate_id);

create function app_private.reject_posted_transaction_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if old.status = 'posted' then
    raise exception using
      errcode = '55000',
      message = 'posted transaction is immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger transactions_reject_posted_mutation
before update or delete on app_private.transactions
for each row execute function app_private.reject_posted_transaction_mutation();

create function app_private.reject_immutable_ledger_row()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'append-only ledger row is immutable';
end
$function$;

create trigger ledger_postings_reject_mutation
before update or delete on app_private.ledger_postings
for each row execute function app_private.reject_immutable_ledger_row();
create trigger transaction_links_reject_mutation
before update or delete on app_private.transaction_links
for each row execute function app_private.reject_immutable_ledger_row();
create trigger audit_events_reject_mutation
before update or delete on app_private.audit_events
for each row execute function app_private.reject_immutable_ledger_row();

create function app_private.assert_parent_transaction_editable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $function$
declare
  parent_transaction_id uuid;
  parent_status text;
begin
  if tg_table_name = 'ledger_postings' then
    parent_transaction_id := new.transaction_id;
  else
    parent_transaction_id := new.from_transaction_id;
  end if;
  select status
    into parent_status
    from app_private.transactions
   where id = parent_transaction_id;
  if parent_status <> 'draft' then
    raise exception using
      errcode = '55000',
      message = 'posted transaction cannot accept new ledger rows';
  end if;
  return new;
end
$function$;

revoke all on function app_private.assert_parent_transaction_editable() from public;

create trigger ledger_postings_require_draft_parent
before insert on app_private.ledger_postings
for each row execute function app_private.assert_parent_transaction_editable();

create trigger transaction_links_require_draft_parent
before insert on app_private.transaction_links
for each row execute function app_private.assert_parent_transaction_editable();

create function app_private.assert_transaction_balanced()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $function$
declare
  target_transaction_id uuid;
  target_status text;
  posting_count bigint;
  debit_total numeric(19,4);
  credit_total numeric(19,4);
begin
  if tg_table_name = 'transactions' then
    target_transaction_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_transaction_id := case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end;
  end if;

  select status
    into target_status
    from app_private.transactions
   where id = target_transaction_id;

  if target_status = 'posted' then
    select
      count(*),
      coalesce(sum(amount_base) filter (where side = 'debit'), 0),
      coalesce(sum(amount_base) filter (where side = 'credit'), 0)
    into posting_count, debit_total, credit_total
    from app_private.ledger_postings
    where transaction_id = target_transaction_id;

    if posting_count < 2 or debit_total <> credit_total then
      raise exception using
        errcode = '23514',
        message = 'INV-01 posted transaction must contain at least two exactly balanced postings';
    end if;
  end if;

  return null;
end
$function$;

revoke all on function app_private.assert_transaction_balanced() from public;

create constraint trigger transactions_deferred_balance
after insert or update on app_private.transactions
deferrable initially deferred
for each row execute function app_private.assert_transaction_balanced();

create constraint trigger ledger_postings_deferred_balance
after insert or update or delete on app_private.ledger_postings
deferrable initially deferred
for each row execute function app_private.assert_transaction_balanced();

create function app_private.provision_system_ledger_accounts(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $function$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception using
      errcode = '42501',
      message = 'ledger account owner must match authenticated identity';
  end if;

  insert into app_private.ledger_accounts (
    id,
    user_id,
    code,
    name,
    account_class,
    normal_side,
    system_role
  )
  values
    (extensions.gen_random_uuid(), p_user_id, '1100', 'Bank asset', 'asset', 'debit', 'bank_asset'),
    (extensions.gen_random_uuid(), p_user_id, '1110', 'Cash asset', 'asset', 'debit', 'cash_asset'),
    (extensions.gen_random_uuid(), p_user_id, '1200', 'Receivable asset', 'asset', 'debit', 'receivable_asset'),
    (extensions.gen_random_uuid(), p_user_id, '1300', 'Investment asset', 'asset', 'debit', 'investment_asset'),
    (extensions.gen_random_uuid(), p_user_id, '2100', 'Card liability', 'liability', 'credit', 'card_liability'),
    (extensions.gen_random_uuid(), p_user_id, '3100', 'Opening equity', 'equity', 'credit', 'opening_equity'),
    (extensions.gen_random_uuid(), p_user_id, '3200', 'Adjustment equity', 'equity', 'credit', 'adjustment_equity'),
    (extensions.gen_random_uuid(), p_user_id, '3900', 'Explicit FX rounding', 'equity', 'credit', 'fx_rounding'),
    (extensions.gen_random_uuid(), p_user_id, '4100', 'Normal income', 'income', 'credit', 'income'),
    (extensions.gen_random_uuid(), p_user_id, '4200', 'Realized investment gain', 'income', 'credit', 'realized_gain'),
    (extensions.gen_random_uuid(), p_user_id, '5100', 'Personal expense', 'expense', 'debit', 'expense'),
    (extensions.gen_random_uuid(), p_user_id, '5200', 'Fee expense', 'expense', 'debit', 'fee_expense'),
    (extensions.gen_random_uuid(), p_user_id, '5300', 'Realized investment loss', 'expense', 'debit', 'realized_loss')
  on conflict (user_id, system_role) do nothing;
end
$function$;

revoke all
  on function app_private.provision_system_ledger_accounts(uuid)
  from public, anon, authenticated, service_role;
grant execute
  on function app_private.provision_system_ledger_accounts(uuid)
  to pfos_runtime;

alter table app_private.ledger_accounts enable row level security;
alter table app_private.ledger_accounts force row level security;
alter table app_private.transactions enable row level security;
alter table app_private.transactions force row level security;
alter table app_private.ledger_postings enable row level security;
alter table app_private.ledger_postings force row level security;
alter table app_private.transaction_links enable row level security;
alter table app_private.transaction_links force row level security;
alter table app_private.idempotency_keys enable row level security;
alter table app_private.idempotency_keys force row level security;
alter table app_private.audit_events enable row level security;
alter table app_private.audit_events force row level security;
alter table app_private.outbox_events enable row level security;
alter table app_private.outbox_events force row level security;

create policy ledger_accounts_runtime_own
  on app_private.ledger_accounts
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy transactions_runtime_own
  on app_private.transactions
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy ledger_postings_runtime_own
  on app_private.ledger_postings
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy transaction_links_runtime_own
  on app_private.transaction_links
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy idempotency_keys_runtime_own
  on app_private.idempotency_keys
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy audit_events_runtime_own
  on app_private.audit_events
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy outbox_events_runtime_own
  on app_private.outbox_events
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on
  app_private.ledger_accounts,
  app_private.transactions,
  app_private.ledger_postings,
  app_private.transaction_links,
  app_private.idempotency_keys,
  app_private.audit_events,
  app_private.outbox_events
from public, anon, authenticated, service_role;

grant usage on schema app_private to pfos_runtime;
grant select on
  app_private.ledger_accounts,
  app_private.transactions,
  app_private.ledger_postings,
  app_private.transaction_links,
  app_private.idempotency_keys,
  app_private.audit_events,
  app_private.outbox_events
to pfos_runtime;
grant insert on
  app_private.transactions,
  app_private.ledger_postings,
  app_private.transaction_links,
  app_private.idempotency_keys,
  app_private.audit_events,
  app_private.outbox_events
to pfos_runtime;
grant update (status, posted_at)
  on app_private.transactions to pfos_runtime;
grant update (status, response_code, response_body, updated_at)
  on app_private.idempotency_keys to pfos_runtime;

comment on table app_private.transactions is
  'P0-A0 single immutable financial event header; clients submit typed commands, never postings.';
comment on table app_private.ledger_postings is
  'P0-A0 exact append-only debit and credit legs in reporting currency.';
comment on table app_private.audit_events is
  'P0-A0 append-only redacted audit chain; financial values are not copied into logs.';
comment on table app_private.outbox_events is
  'P0-A0 transactional outbox with versioned redacted payloads.';

commit;
