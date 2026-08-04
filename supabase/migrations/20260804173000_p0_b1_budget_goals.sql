begin;

create table app_private.budgets (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  period date not null,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, period),
  check (period = date_trunc('month', period)::date)
);

create table app_private.budget_lines (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  budget_id uuid not null,
  category_id uuid not null,
  planned_amount numeric(19,4) not null check (planned_amount >= 0),
  rollover_policy text not null default 'none' check (rollover_policy in ('none', 'carry_remaining')),
  warning_threshold numeric(7,4) not null default 0.8000 check (warning_threshold > 0 and warning_threshold <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, budget_id, category_id),
  foreign key (user_id, budget_id) references app_private.budgets (user_id, id) on delete cascade,
  foreign key (user_id, category_id) references app_private.categories (user_id, id) on delete cascade
);

create index budgets_user_period_idx on app_private.budgets (user_id, period);
create index budget_lines_user_budget_idx on app_private.budget_lines (user_id, budget_id, category_id);

create table app_private.goals (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  title_enc bytea not null,
  title_key_id text not null,
  title_algorithm text not null,
  title_enc_version smallint not null,
  title_nonce bytea not null,
  title_auth_tag bytea not null,
  title_aad_version smallint not null,
  target_amount numeric(19,4) not null check (target_amount > 0),
  target_date date not null,
  priority smallint not null check (priority between 1 and 5),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (
    octet_length(title_enc) > 0
    and char_length(title_key_id) between 1 and 80
    and title_algorithm = 'AEAD_AES_256_GCM'
    and title_enc_version = 1
    and octet_length(title_nonce) = 12
    and octet_length(title_auth_tag) = 16
    and title_aad_version = 1
  )
);

create table app_private.goal_allocations (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  goal_id uuid not null,
  account_id uuid,
  instrument_id uuid,
  allocated_value numeric(19,4) not null check (allocated_value >= 0),
  allocated_quantity numeric(31,12) check (allocated_quantity >= 0),
  effective_from date not null,
  effective_to date,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, goal_id) references app_private.goals (user_id, id) on delete cascade,
  foreign key (user_id, account_id) references app_private.financial_accounts (user_id, id) on delete cascade,
  check ((account_id is not null)::integer + (instrument_id is not null)::integer = 1),
  check ((instrument_id is null and allocated_quantity is null) or (instrument_id is not null and allocated_quantity is not null)),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index goal_allocations_active_account_goal_unique
  on app_private.goal_allocations (user_id, goal_id, account_id)
  where account_id is not null and effective_to is null;
create unique index goal_allocations_active_instrument_goal_unique
  on app_private.goal_allocations (user_id, goal_id, instrument_id)
  where instrument_id is not null and effective_to is null;
create index goal_allocations_user_account_active_idx
  on app_private.goal_allocations (user_id, account_id, effective_from)
  where account_id is not null and effective_to is null;

create table app_private.goal_contribution_events (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  goal_id uuid not null,
  event_month date not null,
  planned_amount numeric(19,4) not null default 0 check (planned_amount >= 0),
  actual_amount numeric(19,4) not null default 0 check (actual_amount >= 0),
  actual_transaction_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, goal_id, event_month),
  foreign key (user_id, goal_id) references app_private.goals (user_id, id) on delete cascade,
  foreign key (user_id, actual_transaction_id) references app_private.transactions (user_id, id) on delete cascade,
  check (event_month = date_trunc('month', event_month)::date),
  check ((actual_amount = 0 and actual_transaction_id is null) or (actual_amount > 0 and actual_transaction_id is not null))
);

create index goals_user_status_priority_idx on app_private.goals (user_id, status, priority, target_date);
create index goal_contributions_user_goal_idx on app_private.goal_contribution_events (user_id, goal_id, event_month);
create unique index goal_contributions_actual_transaction_unique
  on app_private.goal_contribution_events (user_id, actual_transaction_id)
  where actual_transaction_id is not null;

create function app_private.enforce_goal_allocation_bound()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $function$
declare
  v_account_type text;
  v_status text;
  v_eligible numeric(19,4);
  v_allocated numeric(19,4);
begin
  if new.instrument_id is not null then
    raise exception using errcode = '23514', message = 'investment allocations require the P0-B2 instrument registry';
  end if;

  select account_type, status into v_account_type, v_status
    from app_private.financial_accounts
   where user_id = new.user_id and id = new.account_id
   for update;
  if v_account_type is null or v_status <> 'active' or v_account_type = 'credit_card' then
    raise exception using errcode = '23514', message = 'goal allocation source is not eligible';
  end if;

  select greatest(coalesce(sum(
    case when posting.side = 'debit' then posting.amount_base else -posting.amount_base end
  ) filter (where transaction.status = 'posted'), 0), 0)::numeric(19,4)
    into v_eligible
    from app_private.financial_accounts account
    left join app_private.ledger_postings posting
      on posting.user_id = account.user_id and posting.financial_account_id = account.id
    left join app_private.transactions transaction
      on transaction.user_id = posting.user_id and transaction.id = posting.transaction_id
   where account.user_id = new.user_id and account.id = new.account_id
   group by account.id;

  select coalesce(sum(allocation.allocated_value), 0)::numeric(19,4)
    into v_allocated
    from app_private.goal_allocations allocation
   where allocation.user_id = new.user_id
     and allocation.account_id = new.account_id
     and allocation.effective_to is null
     and allocation.id <> new.id;

  if v_allocated + new.allocated_value > v_eligible then
    raise exception using errcode = '23514', message = 'goal_allocation_exceeds_eligible';
  end if;
  return new;
end
$function$;

revoke all on function app_private.enforce_goal_allocation_bound() from public;

create trigger goal_allocations_enforce_bound
before insert or update of account_id, instrument_id, allocated_value, effective_to
on app_private.goal_allocations
for each row when (new.effective_to is null)
execute function app_private.enforce_goal_allocation_bound();

alter table app_private.budgets enable row level security;
alter table app_private.budgets force row level security;
alter table app_private.budget_lines enable row level security;
alter table app_private.budget_lines force row level security;
alter table app_private.goals enable row level security;
alter table app_private.goals force row level security;
alter table app_private.goal_allocations enable row level security;
alter table app_private.goal_allocations force row level security;
alter table app_private.goal_contribution_events enable row level security;
alter table app_private.goal_contribution_events force row level security;

create policy budgets_runtime_own on app_private.budgets for all to pfos_runtime
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy budget_lines_runtime_own on app_private.budget_lines for all to pfos_runtime
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy goals_runtime_own on app_private.goals for all to pfos_runtime
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy goal_allocations_runtime_own on app_private.goal_allocations for all to pfos_runtime
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy goal_contributions_runtime_own on app_private.goal_contribution_events for all to pfos_runtime
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on app_private.budgets, app_private.budget_lines, app_private.goals,
  app_private.goal_allocations, app_private.goal_contribution_events
from public, anon, authenticated, service_role;
grant select, insert, update, delete on app_private.budgets, app_private.budget_lines,
  app_private.goals, app_private.goal_allocations, app_private.goal_contribution_events
to pfos_runtime;

comment on table app_private.budgets is 'B062 monthly category plans; SQL migrations remain schema authority.';
comment on table app_private.goal_allocations is 'B066 virtual allocations: no ledger posting, balance, or net-worth mutation.';
comment on function app_private.enforce_goal_allocation_bound() is 'INV-07 locks the eligible account and prevents concurrent over-allocation.';

commit;
