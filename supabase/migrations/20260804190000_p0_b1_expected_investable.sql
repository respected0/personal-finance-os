begin;

create table app_private.expected_payments (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  source_enc bytea not null,
  source_key_id text not null,
  source_algorithm text not null,
  source_enc_version smallint not null,
  source_nonce bytea not null,
  source_auth_tag bytea not null,
  source_aad_version smallint not null,
  expected_amount numeric(19,4) not null check (expected_amount > 0),
  expected_date date not null,
  certainty_level text not null check (certainty_level in ('certain', 'likely', 'uncertain')),
  status text not null default 'expected' check (status in ('expected', 'overdue', 'received', 'cancelled')),
  realized_transaction_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, realized_transaction_id),
  foreign key (user_id, realized_transaction_id)
    references app_private.transactions (user_id, id) on delete cascade,
  check (
    octet_length(source_enc) > 0
    and char_length(source_key_id) between 1 and 80
    and source_algorithm = 'AEAD_AES_256_GCM'
    and source_enc_version = 1
    and octet_length(source_nonce) = 12
    and octet_length(source_auth_tag) = 16
    and source_aad_version = 1
  ),
  check (
    (status = 'received' and realized_transaction_id is not null)
    or (status <> 'received' and realized_transaction_id is null)
  )
);

create index expected_payments_user_status_date_idx
  on app_private.expected_payments (user_id, status, expected_date, id);

create function app_private.protect_expected_realization()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if old.status = 'received' and (
    new.status is distinct from old.status
    or new.realized_transaction_id is distinct from old.realized_transaction_id
    or new.expected_amount is distinct from old.expected_amount
  ) then
    raise exception using errcode = '55000', message = 'received expected payment is immutable';
  end if;
  return new;
end
$function$;

revoke all on function app_private.protect_expected_realization() from public;
create trigger expected_payments_protect_realization
before update on app_private.expected_payments
for each row execute function app_private.protect_expected_realization();

create table app_private.planning_investable_runs (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  as_of date not null,
  source_watermark timestamptz not null,
  formula_version text not null check (formula_version = 'investable-formula-1.0.0'),
  policy_version text not null check (policy_version = 'planning-policy-1.0.0'),
  liquid_verified_amount numeric(19,4) not null check (liquid_verified_amount >= 0),
  committed_outflow_amount numeric(19,4) not null check (committed_outflow_amount >= 0),
  operating_buffer_amount numeric(19,4) not null check (operating_buffer_amount >= 0),
  near_term_goal_reserve_amount numeric(19,4) not null check (near_term_goal_reserve_amount >= 0),
  excluded_expected_amount numeric(19,4) not null check (excluded_expected_amount >= 0),
  excluded_doubtful_receivable_amount numeric(19,4) not null check (excluded_doubtful_receivable_amount >= 0),
  canonical_investable_amount numeric(19,4) not null check (canonical_investable_amount >= 0),
  evidence_json jsonb not null check (jsonb_typeof(evidence_json) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  check (
    canonical_investable_amount = greatest(
      liquid_verified_amount - committed_outflow_amount
      - operating_buffer_amount - near_term_goal_reserve_amount,
      0
    )::numeric(19,4)
  ),
  check (
    evidence_json @> '{"expected":{"includedAmount":"0.0000"}}'::jsonb
    and evidence_json @> '{"doubtfulReceivable":{"includedAmount":"0.0000"}}'::jsonb
  )
);

create index planning_investable_runs_user_as_of_idx
  on app_private.planning_investable_runs (user_id, as_of desc, created_at desc, id desc);

create function app_private.protect_planning_investable_run()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  raise exception using errcode = '55000', message = 'planning investable run is immutable evidence';
end
$function$;

revoke all on function app_private.protect_planning_investable_run() from public;
create trigger planning_investable_runs_immutable
before update or delete on app_private.planning_investable_runs
for each row execute function app_private.protect_planning_investable_run();

alter table app_private.expected_payments enable row level security;
alter table app_private.expected_payments force row level security;
alter table app_private.planning_investable_runs enable row level security;
alter table app_private.planning_investable_runs force row level security;

create policy expected_payments_runtime_own on app_private.expected_payments
  for all to pfos_runtime using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy planning_investable_runs_runtime_select on app_private.planning_investable_runs
  for select to pfos_runtime using ((select auth.uid()) = user_id);
create policy planning_investable_runs_runtime_insert on app_private.planning_investable_runs
  for insert to pfos_runtime with check ((select auth.uid()) = user_id);

revoke all on app_private.expected_payments, app_private.planning_investable_runs
from public, anon, authenticated, service_role;
grant select, insert, update on app_private.expected_payments to pfos_runtime;
grant select, insert on app_private.planning_investable_runs to pfos_runtime;

comment on table app_private.expected_payments is
  'B068 future entries have no ledger, income, net-worth, or investable effect until B069 realization.';
comment on table app_private.planning_investable_runs is
  'B070 sole canonical versioned investable result; P0-B3 must consume id and amount without recomputation.';

commit;
