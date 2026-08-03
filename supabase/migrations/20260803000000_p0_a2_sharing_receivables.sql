begin;

create table app_private.counterparties (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  type text not null check (type in ('person', 'merchant', 'employer', 'provider')),
  name_enc bytea not null check (octet_length(name_enc) > 0),
  name_search_hash bytea not null check (octet_length(name_search_hash) = 32),
  name_key_id text not null check (char_length(name_key_id) between 1 and 80),
  name_algorithm text not null default 'AEAD_AES_256_GCM'
    check (name_algorithm = 'AEAD_AES_256_GCM'),
  name_enc_version smallint not null default 1 check (name_enc_version = 1),
  name_nonce bytea not null check (octet_length(name_nonce) = 12),
  name_auth_tag bytea not null check (octet_length(name_auth_tag) = 16),
  name_aad_version smallint not null default 1 check (name_aad_version = 1),
  contact_note_enc bytea,
  active boolean not null default true,
  archived_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (
    (active and archived_at is null)
    or (not active and archived_at is not null)
  )
);

create index counterparties_user_type_active_idx
  on app_private.counterparties (user_id, type, active, id);
create index counterparties_user_name_search_hash_idx
  on app_private.counterparties (user_id, name_search_hash);

alter table app_private.transactions
  add constraint transactions_counterparty_fk
  foreign key (user_id, counterparty_id)
  references app_private.counterparties (user_id, id);

create table app_private.obligations (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  person_id uuid not null,
  direction text not null check (direction in ('receivable', 'payable')),
  origin_type text not null check (origin_type in ('shared_expense', 'manual')),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  nominal_amount numeric(19,4) not null check (nominal_amount > 0),
  collected_amount numeric(19,4) not null default 0
    check (collected_amount >= 0 and collected_amount <= nominal_amount),
  collectability_status text not null
    check (collectability_status in ('collectible', 'doubtful', 'waived', 'closed')),
  estimated_collectible_amount numeric(19,4) not null
    check (estimated_collectible_amount >= 0),
  include_in_net_worth boolean not null,
  include_in_planning boolean not null,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, person_id)
    references app_private.counterparties (user_id, id),
  check (estimated_collectible_amount <= nominal_amount - collected_amount),
  check (
    (collectability_status <> 'closed')
    or collected_amount = nominal_amount
  )
);

create index obligations_user_receivable_idx
  on app_private.obligations (
    user_id, direction, collectability_status, person_id, id
  );

create table app_private.shared_expenses (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  payment_transaction_id uuid not null,
  total_paid numeric(19,4) not null check (total_paid > 0),
  owner_share numeric(19,4) not null check (owner_share >= 0),
  rounding_amount numeric(19,4) not null default 0,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  sharing_status text not null default 'pending'
    check (sharing_status in ('pending', 'split', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, payment_transaction_id),
  foreign key (user_id, payment_transaction_id)
    references app_private.transactions (user_id, id),
  check (owner_share + rounding_amount >= 0)
);

create index shared_expenses_user_status_idx
  on app_private.shared_expenses (user_id, sharing_status, id);

create table app_private.shared_expense_shares (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  shared_expense_id uuid not null,
  person_id uuid not null,
  share_amount numeric(19,4) not null check (share_amount > 0),
  receivable_id uuid not null,
  settled_amount numeric(19,4) not null default 0
    check (settled_amount >= 0 and settled_amount <= share_amount),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, shared_expense_id, person_id),
  unique (user_id, receivable_id),
  foreign key (user_id, shared_expense_id)
    references app_private.shared_expenses (user_id, id),
  foreign key (user_id, person_id)
    references app_private.counterparties (user_id, id),
  foreign key (user_id, receivable_id)
    references app_private.obligations (user_id, id)
);

create index shared_expense_shares_user_expense_idx
  on app_private.shared_expense_shares (user_id, shared_expense_id, id);

create table app_private.settlements (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  obligation_id uuid not null,
  transaction_id uuid not null,
  amount numeric(19,4) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, transaction_id),
  foreign key (user_id, obligation_id)
    references app_private.obligations (user_id, id),
  foreign key (user_id, transaction_id)
    references app_private.transactions (user_id, id)
);

create index settlements_user_obligation_idx
  on app_private.settlements (user_id, obligation_id, created_at, id);

create function app_private.protect_counterparty_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'counterparties are archived, never deleted';
  end if;
  if new.id <> old.id or new.user_id <> old.user_id or new.type <> old.type then
    raise exception using errcode = '55000', message = 'counterparty identity and owner are immutable';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_counterparty_lifecycle() from public;

create trigger counterparties_protect_lifecycle
before update or delete on app_private.counterparties
for each row execute function app_private.protect_counterparty_lifecycle();

create function app_private.protect_obligation_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'obligations are append-only financial records';
  end if;
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.person_id <> old.person_id
    or new.direction <> old.direction
    or new.origin_type <> old.origin_type
    or new.currency <> old.currency
    or new.nominal_amount <> old.nominal_amount
  then
    raise exception using errcode = '55000', message = 'obligation identity and nominal amount are immutable';
  end if;
  if new.collected_amount < old.collected_amount then
    raise exception using errcode = '55000', message = 'obligation collection is monotonic';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_obligation_lifecycle() from public;

create trigger obligations_protect_lifecycle
before update or delete on app_private.obligations
for each row execute function app_private.protect_obligation_lifecycle();

create function app_private.protect_shared_expense_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'shared expenses are append-only financial records';
  end if;
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.payment_transaction_id <> old.payment_transaction_id
    or new.total_paid <> old.total_paid
    or new.owner_share <> old.owner_share
    or new.rounding_amount <> old.rounding_amount
    or new.currency <> old.currency
  then
    raise exception using errcode = '55000', message = 'shared expense identity and split amounts are immutable';
  end if;
  if (case old.sharing_status when 'pending' then 1 when 'split' then 2 else 3 end)
     > (case new.sharing_status when 'pending' then 1 when 'split' then 2 else 3 end)
  then
    raise exception using errcode = '55000', message = 'shared expense lifecycle is monotonic';
  end if;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_shared_expense_lifecycle() from public;

create trigger shared_expenses_protect_lifecycle
before update or delete on app_private.shared_expenses
for each row execute function app_private.protect_shared_expense_lifecycle();

create function app_private.protect_shared_expense_share()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'shared expense shares are append-only financial records';
  end if;
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.shared_expense_id <> old.shared_expense_id
    or new.person_id <> old.person_id
    or new.share_amount <> old.share_amount
    or new.receivable_id <> old.receivable_id
  then
    raise exception using errcode = '55000', message = 'share identity and amount are immutable';
  end if;
  if new.settled_amount < old.settled_amount then
    raise exception using errcode = '55000', message = 'share settlement is monotonic';
  end if;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_shared_expense_share() from public;

create trigger shared_expense_shares_protect_lifecycle
before update or delete on app_private.shared_expense_shares
for each row execute function app_private.protect_shared_expense_share();

create function app_private.protect_settlement_lifecycle()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '55000', message = 'settlements are append-only financial records';
  end if;
  return new;
end
$function$;

revoke all on function app_private.protect_settlement_lifecycle() from public;

create trigger settlements_protect_lifecycle
before update or delete on app_private.settlements
for each row execute function app_private.protect_settlement_lifecycle();

create function app_private.assert_shared_expense_invariants()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  target_expense_id uuid;
  target_user_id uuid;
  target_total numeric(19,4);
  target_owner numeric(19,4);
  target_rounding numeric(19,4);
  target_currency char(3);
  target_status text;
  share_total numeric(19,4);
  payment_amount numeric(19,4);
  payment_type text;
  payment_currency char(3);
  payment_input jsonb;
  posting_receivable numeric(19,4);
  posting_expense numeric(19,4);
begin
  target_expense_id := case
    when tg_table_name = 'shared_expenses' then new.id
    else new.shared_expense_id
  end;
  select user_id, total_paid, owner_share, rounding_amount, currency, sharing_status
    into target_user_id, target_total, target_owner, target_rounding, target_currency, target_status
    from app_private.shared_expenses
   where id = target_expense_id;
  if not found then
    raise exception using errcode = '23503', message = 'shared expense parent was not found';
  end if;
  select coalesce(sum(share_amount), 0)
    into share_total
    from app_private.shared_expense_shares
   where user_id = target_user_id and shared_expense_id = target_expense_id;
  if target_owner + target_rounding + share_total <> target_total then
    raise exception using errcode = '23514', message = 'owner share plus shares plus rounding must equal total paid';
  end if;
  select primary_amount, event_type, primary_currency, input_json
    into payment_amount, payment_type, payment_currency, payment_input
    from app_private.transactions
   where user_id = target_user_id
     and id = (select payment_transaction_id from app_private.shared_expenses where id = target_expense_id);
  if not found
    or payment_type <> 'shared_expense'
    or payment_amount <> target_total
    or payment_currency <> target_currency
  then
    raise exception using errcode = '23514', message = 'shared expense must match its payment transaction';
  end if;
  select coalesce(sum(amount_base) filter (where role = 'receivable_asset' and side = 'debit'), 0),
         coalesce(sum(amount_base) filter (where role = 'expense' and side = 'debit'), 0)
    into posting_receivable, posting_expense
    from app_private.ledger_postings
   where user_id = target_user_id
     and transaction_id = (select payment_transaction_id from app_private.shared_expenses where id = target_expense_id);
  if posting_receivable <> share_total or posting_expense <> target_owner + target_rounding then
    raise exception using errcode = '23514', message = 'shared expense postings must match personal and receivable split amounts';
  end if;
  if target_status = 'closed' and exists (
    select 1
      from app_private.shared_expense_shares
     where user_id = target_user_id
       and shared_expense_id = target_expense_id
       and settled_amount <> share_amount
  ) then
    raise exception using errcode = '23514', message = 'closed shared expense requires every share to be settled';
  end if;
  return null;
end
$function$;

revoke all on function app_private.assert_shared_expense_invariants() from public;

create constraint trigger shared_expenses_deferred_invariants
after insert or update on app_private.shared_expenses
deferrable initially deferred
for each row execute function app_private.assert_shared_expense_invariants();

create constraint trigger shared_expense_shares_deferred_invariants
after insert or update on app_private.shared_expense_shares
deferrable initially deferred
for each row execute function app_private.assert_shared_expense_invariants();

create function app_private.assert_settlement_invariants()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  target_obligation_id uuid;
  target_user_id uuid;
  nominal numeric(19,4);
  collected numeric(19,4);
  settlement_total numeric(19,4);
  transaction_amount numeric(19,4);
  transaction_type text;
  transaction_input jsonb;
begin
  target_obligation_id := case
    when tg_table_name = 'obligations' then new.id
    else new.obligation_id
  end;
  select user_id, nominal_amount, collected_amount
    into target_user_id, nominal, collected
    from app_private.obligations
   where id = target_obligation_id;
  if not found then
    raise exception using errcode = '23503', message = 'settlement obligation was not found';
  end if;
  select coalesce(sum(amount), 0)
    into settlement_total
    from app_private.settlements
   where user_id = target_user_id and obligation_id = target_obligation_id;
  if settlement_total <> collected or collected > nominal then
    raise exception using errcode = '23514', message = 'obligation collected amount must equal valid settlements without overpayment';
  end if;
  if tg_table_name = 'settlements' then
    select primary_amount, event_type, input_json
      into transaction_amount, transaction_type, transaction_input
      from app_private.transactions
     where user_id = target_user_id and id = new.transaction_id;
    if not found
      or transaction_type <> 'receivable_settlement'
      or transaction_amount <> new.amount
      or (transaction_input ->> 'receivableId')::uuid <> target_obligation_id
    then
      raise exception using errcode = '23514', message = 'settlement must match its receivable ledger transaction';
    end if;
  end if;
  return null;
end
$function$;

revoke all on function app_private.assert_settlement_invariants() from public;

create constraint trigger obligations_deferred_settlements
after insert or update on app_private.obligations
deferrable initially deferred
for each row execute function app_private.assert_settlement_invariants();

create constraint trigger settlements_deferred_invariants
after insert on app_private.settlements
deferrable initially deferred
for each row execute function app_private.assert_settlement_invariants();

alter table app_private.counterparties enable row level security;
alter table app_private.counterparties force row level security;
alter table app_private.obligations enable row level security;
alter table app_private.obligations force row level security;
alter table app_private.shared_expenses enable row level security;
alter table app_private.shared_expenses force row level security;
alter table app_private.shared_expense_shares enable row level security;
alter table app_private.shared_expense_shares force row level security;
alter table app_private.settlements enable row level security;
alter table app_private.settlements force row level security;

create policy counterparties_runtime_own
  on app_private.counterparties for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy obligations_runtime_own
  on app_private.obligations for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy shared_expenses_runtime_own
  on app_private.shared_expenses for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy shared_expense_shares_runtime_own
  on app_private.shared_expense_shares for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy settlements_runtime_own
  on app_private.settlements for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on
  app_private.counterparties,
  app_private.obligations,
  app_private.shared_expenses,
  app_private.shared_expense_shares,
  app_private.settlements
from public, anon, authenticated, service_role;

grant select, insert, update on
  app_private.counterparties,
  app_private.obligations,
  app_private.shared_expenses,
  app_private.shared_expense_shares
to pfos_runtime;
grant select, insert on app_private.settlements to pfos_runtime;

comment on table app_private.shared_expenses is
  'B044/B045 one payment transaction split exactly into personal expense, receivables, and explicit rounding.';
comment on table app_private.obligations is
  'B046/B047 nominal receivable or payable with independent net-worth and planning policy flags.';
comment on table app_private.settlements is
  'B047 append-only settlement link: cash increases while the receivable asset decreases with no normal income.';

commit;
