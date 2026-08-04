begin;

create table app_private.investment_instruments (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  symbol text not null check (symbol = upper(symbol) and char_length(symbol) between 1 and 24),
  name text not null check (char_length(name) between 1 and 120),
  instrument_type text not null check (instrument_type in ('fund', 'stock', 'bond', 'bank_gold', 'crypto', 'other')),
  unit text not null check (unit in ('unit', 'gram')),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, symbol)
);

create table app_private.market_prices (
  id uuid primary key,
  user_id uuid not null,
  instrument_id uuid not null,
  price_at timestamptz not null,
  price numeric(28,10) not null check (price > 0),
  source_type text not null check (source_type in ('manual', 'reference_fixture')),
  is_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, instrument_id, price_at),
  foreign key (user_id, instrument_id)
    references app_private.investment_instruments (user_id, id) on delete cascade
);

create index market_prices_latest_idx
  on app_private.market_prices (user_id, instrument_id, price_at desc, id desc);

alter table app_private.investment_instruments enable row level security;
alter table app_private.investment_instruments force row level security;
alter table app_private.market_prices enable row level security;
alter table app_private.market_prices force row level security;
create policy investment_instruments_runtime_own on app_private.investment_instruments
  for all to pfos_runtime using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy market_prices_runtime_own on app_private.market_prices
  for all to pfos_runtime using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on app_private.investment_instruments, app_private.market_prices
from public, anon, authenticated, service_role;
grant select, insert, update on app_private.investment_instruments to pfos_runtime;
grant select, insert on app_private.market_prices to pfos_runtime;

comment on table app_private.market_prices is
  'B073 manually timestamped prices; source and estimated status remain visible.';

commit;
