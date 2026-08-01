begin;

create table app_private.subscriptions (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  name text not null check (length(trim(name)) between 1 and 120),
  billing_day smallint not null check (billing_day between 1 and 31),
  payment_account_id uuid not null,
  expected_gross numeric(19,4) not null check (expected_gross >= 0),
  cashback_rate numeric(9,8) not null check (cashback_rate between 0 and 1),
  cashback_cap numeric(19,4) not null check (cashback_cap >= 0),
  active boolean not null default true,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, payment_account_id)
    references app_private.financial_accounts (user_id, id)
);

create index subscriptions_user_active_billing_idx
  on app_private.subscriptions (user_id, active, billing_day, id);

create table app_private.subscription_cycles (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  subscription_id uuid not null,
  period date not null check (period = date_trunc('month', period)::date),
  charge_transaction_id uuid,
  cashback_total numeric(19,4) not null default 0 check (cashback_total >= 0),
  actual_net numeric(19,4) not null default 0 check (actual_net >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, subscription_id, period),
  foreign key (user_id, subscription_id)
    references app_private.subscriptions (user_id, id),
  foreign key (user_id, charge_transaction_id)
    references app_private.transactions (user_id, id)
);

create index subscription_cycles_user_period_idx
  on app_private.subscription_cycles (user_id, period desc, id);

create function app_private.assert_subscription_account()
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
   where user_id = new.user_id and id = new.payment_account_id;
  if not found
    or target_status <> 'active'
    or target_type not in ('bank', 'cash', 'credit_card')
  then
    raise exception using
      errcode = '23514',
      message = 'subscription requires an active owned payment account';
  end if;
  return new;
end
$function$;

revoke all on function app_private.assert_subscription_account() from public;

create trigger subscriptions_account_guard
before insert or update on app_private.subscriptions
for each row execute function app_private.assert_subscription_account();

create function app_private.protect_subscription_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'subscriptions are archived, never deleted';
  end if;
  if new.id <> old.id or new.user_id <> old.user_id then
    raise exception using errcode = '55000', message = 'subscription ownership is immutable';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_subscription_lifecycle() from public;

create trigger subscriptions_protect_lifecycle
before update or delete on app_private.subscriptions
for each row execute function app_private.protect_subscription_lifecycle();

create function app_private.protect_subscription_cycle()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'subscription cycles are immutable financial records';
  end if;
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.subscription_id <> old.subscription_id
    or new.period <> old.period
    or (old.charge_transaction_id is not null
      and new.charge_transaction_id is distinct from old.charge_transaction_id)
    or new.cashback_total < old.cashback_total
  then
    raise exception using errcode = '55000', message = 'subscription cycle identity and recognized amounts are monotonic';
  end if;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_subscription_cycle() from public;

create trigger subscription_cycles_protect_lifecycle
before update or delete on app_private.subscription_cycles
for each row execute function app_private.protect_subscription_cycle();

create function app_private.assert_subscription_cycle_net()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  charge_amount numeric(19,4);
  charge_event text;
  charge_account uuid;
  payment_account uuid;
  cap numeric(19,4);
begin
  select payment_account_id, cashback_cap
    into payment_account, cap
    from app_private.subscriptions
   where user_id = new.user_id and id = new.subscription_id;
  if not found then
    raise exception using errcode = '23503', message = 'subscription cycle owner was not found';
  end if;

  if new.charge_transaction_id is null then
    if new.cashback_total <> 0 or new.actual_net <> 0 then
      raise exception using errcode = '23514', message = 'uncharged subscription cycle must have zero actual amounts';
    end if;
    return null;
  end if;

  select primary_amount, event_type, (input_json ->> 'sourceAccountId')::uuid
    into charge_amount, charge_event, charge_account
    from app_private.transactions
   where user_id = new.user_id and id = new.charge_transaction_id;
  if not found
    or charge_event <> 'expense'
    or charge_account is distinct from payment_account
    or new.cashback_total > charge_amount
    or new.cashback_total > cap
    or new.actual_net <> charge_amount - new.cashback_total
  then
    raise exception using
      errcode = '23514',
      message = 'subscription gross, cashback and actual net must match linked transactions and cap';
  end if;
  return null;
end
$function$;

revoke all on function app_private.assert_subscription_cycle_net() from public;

create constraint trigger subscription_cycles_deferred_net
after insert or update on app_private.subscription_cycles
deferrable initially deferred
for each row execute function app_private.assert_subscription_cycle_net();

alter table app_private.subscriptions enable row level security;
alter table app_private.subscriptions force row level security;
alter table app_private.subscription_cycles enable row level security;
alter table app_private.subscription_cycles force row level security;

create policy subscriptions_runtime_own
  on app_private.subscriptions for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy subscription_cycles_runtime_own
  on app_private.subscription_cycles for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on app_private.subscriptions, app_private.subscription_cycles
from public, anon, authenticated, service_role;
grant select, insert, update on
  app_private.subscriptions,
  app_private.subscription_cycles
to pfos_runtime;

comment on table app_private.subscriptions is
  'B042 subscription contract with exact expected gross, cashback and renewal inputs.';
comment on table app_private.subscription_cycles is
  'B042/B043 monthly unique cycle: one gross charge plus linked cashback transactions equals actual_net.';

commit;
