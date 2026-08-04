begin;

create table app_private.monthly_report_versions (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  period date not null,
  version integer not null check (version > 0),
  source_high_watermark timestamptz not null,
  engine_version text not null check (engine_version = 'monthly-report-1.0.0'),
  rule_version text not null check (rule_version = 'monthly-rules-1.0.0'),
  metrics_json jsonb not null,
  checksum bytea not null check (octet_length(checksum) = 32),
  generation_reason_enc bytea not null,
  generation_reason_key_id text not null,
  generation_reason_algorithm text not null,
  generation_reason_enc_version smallint not null,
  generation_reason_nonce bytea not null,
  generation_reason_auth_tag bytea not null,
  generation_reason_aad_version smallint not null,
  generated_at timestamptz not null default now(),
  stale_at timestamptz,
  stale_reason text,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, period, version),
  check (period = date_trunc('month', period)::date),
  check (jsonb_typeof(metrics_json) = 'object'),
  check (
    octet_length(generation_reason_enc) > 0
    and char_length(generation_reason_key_id) between 1 and 80
    and generation_reason_algorithm = 'AEAD_AES_256_GCM'
    and generation_reason_enc_version = 1
    and octet_length(generation_reason_nonce) = 12
    and octet_length(generation_reason_auth_tag) = 16
    and generation_reason_aad_version = 1
  ),
  check (
    metrics_json ?& array[
      'income', 'gross_expense', 'refunds', 'net_expense',
      'outflow', 'savings', 'breakdown', 'trend'
    ]
  ),
  check (
    (metrics_json ->> 'income') ~ '^-?[0-9]+\.[0-9]{4}$'
    and (metrics_json ->> 'gross_expense') ~ '^-?[0-9]+\.[0-9]{4}$'
    and (metrics_json ->> 'refunds') ~ '^-?[0-9]+\.[0-9]{4}$'
    and (metrics_json ->> 'net_expense') ~ '^-?[0-9]+\.[0-9]{4}$'
    and (metrics_json ->> 'outflow') ~ '^-?[0-9]+\.[0-9]{4}$'
    and (metrics_json ->> 'savings') ~ '^-?[0-9]+\.[0-9]{4}$'
    and jsonb_typeof(metrics_json -> 'breakdown') = 'array'
    and jsonb_typeof(metrics_json -> 'trend') = 'array'
  ),
  check (
    (stale_at is null and stale_reason is null)
    or (stale_at is not null and char_length(stale_reason) between 1 and 200)
  )
);

create index monthly_report_versions_user_period_latest_idx
  on app_private.monthly_report_versions (user_id, period, version desc);
create index monthly_report_versions_user_valid_idx
  on app_private.monthly_report_versions (user_id, period, version desc)
  where stale_at is null;

create function app_private.protect_monthly_report_version()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'monthly report versions are retained evidence';
  end if;
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.period <> old.period
    or new.version <> old.version
    or new.source_high_watermark <> old.source_high_watermark
    or new.engine_version <> old.engine_version
    or new.rule_version <> old.rule_version
    or new.metrics_json <> old.metrics_json
    or new.checksum <> old.checksum
    or new.generation_reason_enc <> old.generation_reason_enc
    or new.generation_reason_key_id <> old.generation_reason_key_id
    or new.generation_reason_algorithm <> old.generation_reason_algorithm
    or new.generation_reason_enc_version <> old.generation_reason_enc_version
    or new.generation_reason_nonce <> old.generation_reason_nonce
    or new.generation_reason_auth_tag <> old.generation_reason_auth_tag
    or new.generation_reason_aad_version <> old.generation_reason_aad_version
    or new.generated_at <> old.generated_at
  then
    raise exception using errcode = '55000', message = 'monthly report snapshot is immutable';
  end if;
  if old.stale_at is not null
    and (new.stale_at is distinct from old.stale_at
      or new.stale_reason is distinct from old.stale_reason)
  then
    raise exception using errcode = '55000', message = 'stale monthly report evidence is immutable';
  end if;
  return new;
end
$function$;

revoke all on function app_private.protect_monthly_report_version() from public;

create trigger monthly_report_versions_protect_evidence
before update or delete on app_private.monthly_report_versions
for each row execute function app_private.protect_monthly_report_version();

create function app_private.mark_monthly_reports_stale()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $function$
begin
  if new.status = 'posted' and (tg_op = 'INSERT' or old.status <> 'posted') then
    update app_private.monthly_report_versions
       set stale_at = now(),
           stale_reason = 'posted transaction changed the report period'
     where user_id = new.user_id
       and period = date_trunc('month', new.economic_date)::date
       and stale_at is null
       and source_high_watermark < new.posted_at;
  end if;
  return null;
end
$function$;

revoke all on function app_private.mark_monthly_reports_stale() from public;

create trigger transactions_stale_monthly_reports
after insert or update of status on app_private.transactions
for each row execute function app_private.mark_monthly_reports_stale();

alter table app_private.monthly_report_versions enable row level security;
alter table app_private.monthly_report_versions force row level security;

create policy monthly_report_versions_runtime_own
  on app_private.monthly_report_versions for select to pfos_runtime
  using ((select auth.uid()) = user_id);
create policy monthly_report_versions_runtime_insert
  on app_private.monthly_report_versions for insert to pfos_runtime
  with check ((select auth.uid()) = user_id);

revoke all on app_private.monthly_report_versions
from public, anon, authenticated, service_role;

grant select, insert on app_private.monthly_report_versions to pfos_runtime;

comment on table app_private.monthly_report_versions is
  'B056 immutable monthly metric snapshots with transaction watermark, engine/rule versions, checksum, and monotonic stale evidence.';

commit;
