begin;

create table app_private.recommendation_rules (
  code text not null check (code ~ '^R-(0[1-9]|1[0-5])$'),
  version integer not null check (version > 0),
  default_threshold numeric(19,4) not null check (default_threshold >= 0),
  default_enabled boolean not null default false,
  lookback interval not null check (lookback > interval '0'),
  evidence_schema jsonb not null check (
    jsonb_typeof(evidence_schema) = 'object'
    and evidence_schema @> '{"required":["period","threshold","observedAmount","differenceAmount","alternativeAmount","investableRunId"]}'::jsonb
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (code, version)
);

insert into app_private.recommendation_rules (
  code, version, default_threshold, default_enabled, lookback, evidence_schema
)
select format('R-%s', lpad(rule_no::text, 2, '0')), 1, 0.0000,
  rule_no = 1, interval '1 month',
  '{"type":"object","required":["period","threshold","observedAmount","differenceAmount","alternativeAmount","investableRunId"]}'::jsonb
from generate_series(1, 15) as rule_no;

create table app_private.recommendation_settings (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  rule_code text not null,
  rule_version integer not null,
  threshold numeric(19,4) not null check (threshold >= 0),
  enabled boolean not null,
  effective_from date not null,
  effective_to date,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, rule_code, rule_version, effective_from),
  foreign key (rule_code, rule_version)
    references app_private.recommendation_rules (code, version),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index recommendation_settings_one_open_idx
  on app_private.recommendation_settings (user_id, rule_code, rule_version)
  where effective_to is null;

create table app_private.recommendation_runs (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  source_watermark timestamptz not null,
  engine_version text not null check (engine_version = 'recommendation-engine-1.0.0'),
  investable_run_id uuid not null,
  scenario_reserve_amount numeric(19,4) not null check (scenario_reserve_amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, period, investable_run_id, scenario_reserve_amount),
  foreign key (user_id, investable_run_id)
    references app_private.planning_investable_runs (user_id, id)
);

create table app_private.recommendations (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  run_id uuid not null,
  rule_code text not null,
  rule_version integer not null,
  used_threshold numeric(19,4) not null check (used_threshold >= 0),
  observed_amount numeric(19,4) not null check (observed_amount >= 0),
  difference_amount numeric(19,4) not null,
  impact_amount numeric(19,4) not null check (impact_amount >= 0),
  alternative_amount numeric(19,4) not null check (alternative_amount >= 0),
  evidence_json jsonb not null check (
    jsonb_typeof(evidence_json) = 'object'
    and evidence_json ?& array[
      'period','threshold','observedAmount','differenceAmount',
      'alternativeAmount','investableRunId','formula','sourceWatermark'
    ]
  ),
  status text not null default 'active'
    check (status in ('active','later','dismissed','done')),
  cooldown_until timestamptz,
  feedback text check (feedback is null or feedback in ('helpful','later','dismissed','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, run_id, rule_code, rule_version),
  foreign key (user_id, run_id)
    references app_private.recommendation_runs (user_id, id) on delete cascade,
  foreign key (rule_code, rule_version)
    references app_private.recommendation_rules (code, version)
);

create index recommendation_settings_effective_idx
  on app_private.recommendation_settings
  (user_id, rule_code, rule_version, effective_from desc);
create index recommendation_runs_user_period_idx
  on app_private.recommendation_runs (user_id, period desc, created_at desc);
create index recommendations_user_status_idx
  on app_private.recommendations (user_id, status, created_at desc);

alter table app_private.recommendation_settings enable row level security;
alter table app_private.recommendation_settings force row level security;
alter table app_private.recommendation_runs enable row level security;
alter table app_private.recommendation_runs force row level security;
alter table app_private.recommendations enable row level security;
alter table app_private.recommendations force row level security;

create policy recommendation_settings_runtime_own
  on app_private.recommendation_settings for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy recommendation_runs_runtime_own
  on app_private.recommendation_runs for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy recommendations_runtime_own
  on app_private.recommendations for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on app_private.recommendation_rules,
  app_private.recommendation_settings,
  app_private.recommendation_runs,
  app_private.recommendations
from public, anon, authenticated, service_role;

grant select on app_private.recommendation_rules to pfos_runtime;
grant select, insert, update on app_private.recommendation_settings to pfos_runtime;
grant select, insert on app_private.recommendation_runs to pfos_runtime;
grant select, insert, update on app_private.recommendations to pfos_runtime;

comment on table app_private.recommendation_rules is
  'B083 versioned R-01 through R-15 reference registry and evidence schema. Only R-01 is enabled by default; remaining rules are inert until an approved effective user setting.';
comment on table app_private.recommendation_runs is
  'B085 consumes one immutable P0-B1 investable_run_id and canonical amount; it does not recompute the canonical formula.';

commit;
