begin;

create table app_identity.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  reporting_currency char(3) not null default 'TRY'
    check (reporting_currency ~ '^[A-Z]{3}$'),
  locale text not null default 'tr-TR'
    check (char_length(locale) between 2 and 35),
  timezone text not null default 'Europe/Istanbul'
    check (char_length(timezone) between 1 and 80),
  status text not null default 'active'
    check (status in ('active', 'deleting', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function app_identity.ensure_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_identity
as $function$
begin
  insert into app_identity.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end
$function$;

revoke all on function app_identity.ensure_profile_for_auth_user() from public;

create trigger auth_user_ensure_profile
after insert on auth.users
for each row execute function app_identity.ensure_profile_for_auth_user();

insert into app_identity.profiles (id)
select id from auth.users
on conflict (id) do nothing;

alter table app_identity.profiles enable row level security;
alter table app_identity.profiles force row level security;

create policy profiles_runtime_own
  on app_identity.profiles
  for all to pfos_runtime
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on app_identity.profiles from public, anon, authenticated, service_role;
grant usage on schema app_identity to pfos_runtime;
grant select on app_identity.profiles to pfos_runtime;
grant update (reporting_currency, locale, timezone)
  on app_identity.profiles to pfos_runtime;

alter table app_private.ledger_accounts
  add constraint ledger_accounts_profile_fk
  foreign key (user_id) references app_identity.profiles (id);
alter table app_private.transactions
  add constraint transactions_profile_fk
  foreign key (user_id) references app_identity.profiles (id);
alter table app_private.ledger_postings
  add constraint ledger_postings_profile_fk
  foreign key (user_id) references app_identity.profiles (id);
alter table app_private.transaction_links
  add constraint transaction_links_profile_fk
  foreign key (user_id) references app_identity.profiles (id);
alter table app_private.idempotency_keys
  add constraint idempotency_keys_profile_fk
  foreign key (user_id) references app_identity.profiles (id);
alter table app_private.audit_events
  add constraint audit_events_profile_fk
  foreign key (user_id) references app_identity.profiles (id);
alter table app_private.outbox_events
  add constraint outbox_events_profile_fk
  foreign key (user_id) references app_identity.profiles (id);

alter table app_private.ledger_accounts
  alter column system_role drop not null;

comment on column app_private.ledger_accounts.system_role is
  'Fixed domain role for system accounts; NULL for a financial-account-specific subledger.';

create table app_private.institutions (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  institution_type text not null check (
    institution_type in ('bank', 'wallet', 'broker', 'other')
  ),
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

create index institutions_user_active_idx
  on app_private.institutions (user_id, active, name);

create table app_private.categories (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category_type text not null check (category_type in ('income', 'expense')),
  default_ledger_account_id uuid not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name, category_type),
  foreign key (user_id, parent_id)
    references app_private.categories (user_id, id),
  foreign key (user_id, default_ledger_account_id)
    references app_private.ledger_accounts (user_id, id)
);

create index categories_user_type_active_idx
  on app_private.categories (user_id, category_type, active, sort_order, name);
create index categories_user_parent_idx
  on app_private.categories (user_id, parent_id)
  where parent_id is not null;

create table app_private.financial_accounts (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  institution_id uuid,
  ledger_account_id uuid not null,
  name_enc bytea not null check (octet_length(name_enc) > 0),
  name_key_id text not null check (char_length(name_key_id) between 1 and 80),
  name_algorithm text not null default 'AEAD_AES_256_GCM'
    check (name_algorithm = 'AEAD_AES_256_GCM'),
  name_enc_version smallint not null default 1 check (name_enc_version = 1),
  name_nonce bytea not null check (octet_length(name_nonce) = 12),
  name_auth_tag bytea not null check (octet_length(name_auth_tag) = 16),
  name_aad_version smallint not null default 1 check (name_aad_version = 1),
  account_type text not null check (
    account_type in ('bank', 'cash', 'wallet', 'credit_card', 'investment')
  ),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  opening_date date not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, ledger_account_id),
  unique (user_id, id, ledger_account_id),
  foreign key (user_id, institution_id)
    references app_private.institutions (user_id, id),
  foreign key (user_id, ledger_account_id)
    references app_private.ledger_accounts (user_id, id),
  check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  )
);

create index financial_accounts_user_status_idx
  on app_private.financial_accounts (user_id, status, account_type, created_at);
create index financial_accounts_user_institution_idx
  on app_private.financial_accounts (user_id, institution_id)
  where institution_id is not null;

alter table app_private.ledger_postings
  add constraint ledger_postings_financial_account_fk
  foreign key (user_id, financial_account_id, ledger_account_id)
  references app_private.financial_accounts (user_id, id, ledger_account_id);

alter table app_private.transactions
  add constraint transactions_category_fk
  foreign key (user_id, category_id)
  references app_private.categories (user_id, id);

create unique index transactions_single_opening_account_idx
  on app_private.transactions (user_id, ((input_json ->> 'accountId')::uuid))
  where event_type = 'opening_balance' and status = 'posted';

create function app_private.protect_daily_core_entity()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'daily core entities are archived, never hard-deleted';
  end if;

  if tg_table_name = 'financial_accounts' then
    if new.id <> old.id
      or new.user_id <> old.user_id
      or new.ledger_account_id <> old.ledger_account_id
      or new.account_type <> old.account_type
      or new.currency <> old.currency
      or new.opening_date <> old.opening_date
    then
      raise exception using
        errcode = '55000',
        message = 'financial account identity and accounting fields are immutable';
    end if;
  elsif new.id <> old.id or new.user_id <> old.user_id then
    raise exception using
      errcode = '55000',
      message = 'daily core entity ownership is immutable';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_daily_core_entity() from public;

create trigger institutions_protect_lifecycle
before update or delete on app_private.institutions
for each row execute function app_private.protect_daily_core_entity();

create trigger categories_protect_lifecycle
before update or delete on app_private.categories
for each row execute function app_private.protect_daily_core_entity();

create trigger financial_accounts_protect_lifecycle
before update or delete on app_private.financial_accounts
for each row execute function app_private.protect_daily_core_entity();

create function app_private.assert_daily_core_posting()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  target_currency char(3);
  target_status text;
  target_event_type text;
begin
  if new.financial_account_id is null then
    return new;
  end if;

  select currency, status
    into target_currency, target_status
    from app_private.financial_accounts
   where user_id = new.user_id
     and id = new.financial_account_id
     and ledger_account_id = new.ledger_account_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'posting financial account must match its owned ledger account';
  end if;
  select event_type
    into target_event_type
    from app_private.transactions
   where user_id = new.user_id and id = new.transaction_id;

  if target_status <> 'active'
    and target_event_type not in ('void', 'revise')
  then
    raise exception using
      errcode = '55000',
      message = 'archived financial account cannot accept new postings';
  end if;
  if target_currency <> new.currency then
    raise exception using
      errcode = '23514',
      message = 'posting currency must match the financial account currency';
  end if;

  return new;
end
$function$;

revoke all on function app_private.assert_daily_core_posting() from public;

create trigger ledger_postings_daily_core_account
before insert on app_private.ledger_postings
for each row execute function app_private.assert_daily_core_posting();

create function app_private.assert_transaction_category()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  target_type text;
  target_active boolean;
begin
  if new.event_type not in ('expense', 'income') then
    return new;
  end if;
  if new.category_id is null then
    raise exception using
      errcode = '23514',
      message = 'income and expense transactions require a category';
  end if;

  select category_type, active
    into target_type, target_active
    from app_private.categories
   where user_id = new.user_id and id = new.category_id;

  if not found or not target_active or target_type <> new.event_type then
    raise exception using
      errcode = '23514',
      message = 'transaction category must be active, owned, and match event type';
  end if;
  return new;
end
$function$;

revoke all on function app_private.assert_transaction_category() from public;

create trigger transactions_daily_core_category
before insert or update on app_private.transactions
for each row execute function app_private.assert_transaction_category();

alter table app_private.institutions enable row level security;
alter table app_private.institutions force row level security;
alter table app_private.categories enable row level security;
alter table app_private.categories force row level security;
alter table app_private.financial_accounts enable row level security;
alter table app_private.financial_accounts force row level security;

create policy institutions_runtime_own
  on app_private.institutions
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy categories_runtime_own
  on app_private.categories
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy financial_accounts_runtime_own
  on app_private.financial_accounts
  for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on
  app_private.institutions,
  app_private.categories,
  app_private.financial_accounts
from public, anon, authenticated, service_role;

grant select, insert, update on
  app_private.institutions,
  app_private.categories,
  app_private.financial_accounts
to pfos_runtime;
grant insert on app_private.ledger_accounts to pfos_runtime;
grant update (active) on app_private.ledger_accounts to pfos_runtime;

grant pfos_runtime to postgres;

comment on role pfos_runtime is
  'NOLOGIN least-privilege request role. Local/CI database owner may SET LOCAL ROLE; production uses an externally provisioned narrow login member.';

comment on table app_private.financial_accounts is
  'P0-A1 user account with AEAD-encrypted display name and a unique account-specific ledger subaccount.';
comment on table app_private.categories is
  'P0-A1 owned income/expense classification mapped to a fixed system ledger role.';
comment on table app_identity.profiles is
  'Binding user profile and ownership root, bootstrapped from invite-only auth.users.';

commit;
