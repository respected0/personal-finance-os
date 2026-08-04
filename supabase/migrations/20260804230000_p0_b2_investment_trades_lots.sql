begin;

create table app_private.investment_trades (
  id uuid primary key,
  user_id uuid not null,
  transaction_id uuid not null,
  account_id uuid not null,
  instrument_id uuid not null,
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(28,10) not null check (quantity > 0),
  unit_price numeric(28,10) not null check (unit_price > 0),
  fee_amount numeric(19,4) not null check (fee_amount >= 0),
  cost_basis_including_fee numeric(19,4) not null check (cost_basis_including_fee >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, transaction_id),
  foreign key (user_id, transaction_id)
    references app_private.transactions (user_id, id),
  foreign key (user_id, account_id)
    references app_private.financial_accounts (user_id, id),
  foreign key (user_id, instrument_id)
    references app_private.investment_instruments (user_id, id)
);

create index investment_trades_instrument_idx
  on app_private.investment_trades (user_id, instrument_id, created_at, id);

create table app_private.investment_lots (
  id uuid primary key,
  user_id uuid not null,
  instrument_id uuid not null,
  buy_trade_id uuid not null,
  quantity_open numeric(28,10) not null check (quantity_open >= 0),
  unit_cost numeric(28,10) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, buy_trade_id),
  foreign key (user_id, instrument_id)
    references app_private.investment_instruments (user_id, id),
  foreign key (user_id, buy_trade_id)
    references app_private.investment_trades (user_id, id)
);

create index investment_lots_open_idx
  on app_private.investment_lots (user_id, instrument_id, created_at, id)
  where quantity_open > 0;

create table app_private.investment_lot_consumptions (
  id uuid primary key,
  user_id uuid not null,
  sell_trade_id uuid not null,
  lot_id uuid not null,
  quantity numeric(28,10) not null check (quantity > 0),
  unit_cost numeric(28,10) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, sell_trade_id, lot_id),
  foreign key (user_id, sell_trade_id)
    references app_private.investment_trades (user_id, id),
  foreign key (user_id, lot_id)
    references app_private.investment_lots (user_id, id)
);

alter table app_private.investment_trades enable row level security;
alter table app_private.investment_trades force row level security;
alter table app_private.investment_lots enable row level security;
alter table app_private.investment_lots force row level security;
alter table app_private.investment_lot_consumptions enable row level security;
alter table app_private.investment_lot_consumptions force row level security;

create policy investment_trades_runtime_own on app_private.investment_trades
  for select to pfos_runtime using ((select auth.uid()) = user_id);
create policy investment_trades_runtime_insert on app_private.investment_trades
  for insert to pfos_runtime with check ((select auth.uid()) = user_id);
create policy investment_lots_runtime_own on app_private.investment_lots
  for select to pfos_runtime using ((select auth.uid()) = user_id);
create policy investment_lots_runtime_insert on app_private.investment_lots
  for insert to pfos_runtime with check ((select auth.uid()) = user_id);
create policy investment_lots_runtime_update on app_private.investment_lots
  for update to pfos_runtime using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy investment_lot_consumptions_runtime_own on app_private.investment_lot_consumptions
  for select to pfos_runtime using ((select auth.uid()) = user_id);
create policy investment_lot_consumptions_runtime_insert on app_private.investment_lot_consumptions
  for insert to pfos_runtime with check ((select auth.uid()) = user_id);

revoke all on app_private.investment_trades,
  app_private.investment_lots,
  app_private.investment_lot_consumptions
from public, anon, authenticated, service_role;
grant select, insert on app_private.investment_trades to pfos_runtime;
grant select, insert, update on app_private.investment_lots to pfos_runtime;
grant select, insert on app_private.investment_lot_consumptions to pfos_runtime;

comment on table app_private.investment_trades is
  'B074 ledger-linked investment trades; financial writes are SERIALIZABLE and idempotent.';
comment on table app_private.investment_lots is
  'B075 exact open quantity and fee-inclusive unit cost lots.';

commit;
