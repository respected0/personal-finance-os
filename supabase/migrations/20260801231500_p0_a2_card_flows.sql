begin;

create function app_private.valid_minimum_payment_rule(rule jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select case rule ->> 'type'
    when 'percentage' then
      jsonb_typeof(rule) = 'object'
      and rule ?& array['type', 'rate', 'minimumAmount']
      and (rule ->> 'rate') ~ '^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$'
      and (rule ->> 'minimumAmount') ~ '^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})$'
    when 'fixed' then
      jsonb_typeof(rule) = 'object'
      and rule ?& array['type', 'amount']
      and (rule ->> 'amount') ~ '^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,4})$'
    else false
  end
$function$;

revoke all on function app_private.valid_minimum_payment_rule(jsonb) from public;
grant execute on function app_private.valid_minimum_payment_rule(jsonb) to pfos_runtime;

create table app_private.credit_card_profiles (
  account_id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  credit_limit numeric(19,4) not null check (credit_limit >= 0),
  statement_day smallint not null check (statement_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  minimum_payment_rule jsonb not null
    check (app_private.valid_minimum_payment_rule(minimum_payment_rule)),
  active boolean not null default true,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id),
  foreign key (user_id, account_id)
    references app_private.financial_accounts (user_id, id)
);

create index credit_card_profiles_user_active_idx
  on app_private.credit_card_profiles (user_id, active, account_id);

create table app_private.credit_card_statements (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  card_account_id uuid not null,
  period_start date not null,
  period_end date not null,
  closing_balance numeric(19,4) not null check (closing_balance >= 0),
  minimum_due numeric(19,4) not null check (minimum_due >= 0),
  paid_amount numeric(19,4) not null default 0 check (paid_amount >= 0),
  due_date date not null,
  status text not null default 'open'
    check (status in ('open', 'partially_paid', 'paid', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, card_account_id, period_start, period_end),
  foreign key (user_id, card_account_id)
    references app_private.credit_card_profiles (user_id, account_id),
  check (period_start <= period_end),
  check (due_date >= period_end),
  check (minimum_due <= closing_balance),
  check (paid_amount <= closing_balance)
);

create index credit_card_statements_user_card_period_idx
  on app_private.credit_card_statements
  (user_id, card_account_id, period_end desc, id);
create index credit_card_statements_user_due_status_idx
  on app_private.credit_card_statements (user_id, status, due_date);

create table app_private.statement_payments (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  statement_id uuid not null,
  transaction_id uuid not null,
  amount numeric(19,4) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, statement_id, transaction_id),
  foreign key (user_id, statement_id)
    references app_private.credit_card_statements (user_id, id),
  foreign key (user_id, transaction_id)
    references app_private.transactions (user_id, id)
);

create index statement_payments_user_transaction_idx
  on app_private.statement_payments (user_id, transaction_id);

create table app_private.installment_plans (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  purchase_transaction_id uuid not null,
  card_account_id uuid not null,
  purchase_total numeric(19,4) not null check (purchase_total > 0),
  installment_count smallint not null check (installment_count between 2 and 60),
  recognition_policy text not null default 'full_at_purchase'
    check (recognition_policy = 'full_at_purchase'),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, purchase_transaction_id),
  foreign key (user_id, purchase_transaction_id)
    references app_private.transactions (user_id, id),
  foreign key (user_id, card_account_id)
    references app_private.credit_card_profiles (user_id, account_id)
);

create index installment_plans_user_card_idx
  on app_private.installment_plans (user_id, card_account_id, created_at desc);

create table app_private.installment_items (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  plan_id uuid not null,
  sequence smallint not null check (sequence > 0),
  due_date date not null,
  cash_flow_amount numeric(19,4) not null check (cash_flow_amount > 0),
  statement_id uuid,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'statement', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, plan_id, sequence),
  foreign key (user_id, plan_id)
    references app_private.installment_plans (user_id, id),
  foreign key (user_id, statement_id)
    references app_private.credit_card_statements (user_id, id)
);

create index installment_items_user_due_status_idx
  on app_private.installment_items (user_id, status, due_date, id);

create function app_private.assert_credit_card_profile_account()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  target_type text;
  target_status text;
begin
  select account_type, status
    into target_type, target_status
    from app_private.financial_accounts
   where user_id = new.user_id and id = new.account_id;
  if not found or target_type <> 'credit_card' or target_status <> 'active' then
    raise exception using
      errcode = '23514',
      message = 'credit card profile requires an active owned credit-card account';
  end if;
  return new;
end
$function$;

revoke all on function app_private.assert_credit_card_profile_account() from public;

create trigger credit_card_profiles_account_guard
before insert or update on app_private.credit_card_profiles
for each row execute function app_private.assert_credit_card_profile_account();

create function app_private.protect_credit_card_profile()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'credit card profiles are archived, never deleted';
  end if;
  if new.account_id <> old.account_id or new.user_id <> old.user_id then
    raise exception using errcode = '55000', message = 'credit card profile ownership is immutable';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_credit_card_profile() from public;

create trigger credit_card_profiles_protect_lifecycle
before update or delete on app_private.credit_card_profiles
for each row execute function app_private.protect_credit_card_profile();

create function app_private.protect_credit_card_statement()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'credit card statements are immutable financial records';
  end if;
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.card_account_id <> old.card_account_id
    or new.period_start <> old.period_start
    or new.period_end <> old.period_end
    or new.closing_balance <> old.closing_balance
    or new.minimum_due <> old.minimum_due
    or new.due_date <> old.due_date
  then
    raise exception using errcode = '55000', message = 'credit card statement identity and amounts are immutable';
  end if;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_credit_card_statement() from public;

create trigger credit_card_statements_protect_lifecycle
before update or delete on app_private.credit_card_statements
for each row execute function app_private.protect_credit_card_statement();

create trigger statement_payments_reject_mutation
before update or delete on app_private.statement_payments
for each row execute function app_private.reject_immutable_ledger_row();
create trigger installment_plans_reject_mutation
before update or delete on app_private.installment_plans
for each row execute function app_private.reject_immutable_ledger_row();
create trigger installment_items_reject_mutation
before update or delete on app_private.installment_items
for each row execute function app_private.reject_immutable_ledger_row();

create function app_private.assert_installment_plan_total()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  target_plan_id uuid;
  expected_count integer;
  expected_total numeric(19,4);
  actual_count integer;
  actual_total numeric(19,4);
begin
  if tg_table_name = 'installment_plans' then
    target_plan_id := new.id;
  else
    target_plan_id := new.plan_id;
  end if;
  select installment_count, purchase_total
    into expected_count, expected_total
    from app_private.installment_plans
   where id = target_plan_id;
  select count(*)::integer, coalesce(sum(cash_flow_amount), 0)::numeric(19,4)
    into actual_count, actual_total
    from app_private.installment_items
   where plan_id = target_plan_id;
  if expected_count <> actual_count or expected_total <> actual_total then
    raise exception using
      errcode = '23514',
      message = 'installment items must exactly match plan count and purchase total';
  end if;
  return null;
end
$function$;

revoke all on function app_private.assert_installment_plan_total() from public;

create constraint trigger installment_plans_deferred_total
after insert on app_private.installment_plans
deferrable initially deferred
for each row execute function app_private.assert_installment_plan_total();
create constraint trigger installment_items_deferred_total
after insert on app_private.installment_items
deferrable initially deferred
for each row execute function app_private.assert_installment_plan_total();

alter table app_private.credit_card_profiles enable row level security;
alter table app_private.credit_card_profiles force row level security;
alter table app_private.credit_card_statements enable row level security;
alter table app_private.credit_card_statements force row level security;
alter table app_private.statement_payments enable row level security;
alter table app_private.statement_payments force row level security;
alter table app_private.installment_plans enable row level security;
alter table app_private.installment_plans force row level security;
alter table app_private.installment_items enable row level security;
alter table app_private.installment_items force row level security;

create policy credit_card_profiles_runtime_own
  on app_private.credit_card_profiles for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy credit_card_statements_runtime_own
  on app_private.credit_card_statements for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy statement_payments_runtime_own
  on app_private.statement_payments for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy installment_plans_runtime_own
  on app_private.installment_plans for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy installment_items_runtime_own
  on app_private.installment_items for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on
  app_private.credit_card_profiles,
  app_private.credit_card_statements,
  app_private.statement_payments,
  app_private.installment_plans,
  app_private.installment_items
from public, anon, authenticated, service_role;

grant select, insert, update on
  app_private.credit_card_profiles,
  app_private.credit_card_statements
to pfos_runtime;
grant select, insert on
  app_private.statement_payments,
  app_private.installment_plans,
  app_private.installment_items
to pfos_runtime;

comment on table app_private.credit_card_profiles is
  'B037 credit-card metadata; credit_limit is operational capacity and never net worth.';
comment on table app_private.statement_payments is
  'B040 exact partial allocation from one card-payment transaction to one or more statements.';
comment on table app_private.installment_plans is
  'B041 full-at-purchase economic recognition with a separate exact cash-flow schedule.';

commit;
