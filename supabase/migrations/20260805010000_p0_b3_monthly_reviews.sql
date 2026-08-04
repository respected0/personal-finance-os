begin;

create table app_private.monthly_reviews (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  report_version_id uuid not null,
  investable_run_id uuid not null,
  checklist_json jsonb not null check (
    jsonb_typeof(checklist_json) = 'object'
    and checklist_json ?& array['report','budget','goals','investments','recommendations']
  ),
  decision text not null check (decision in ('hold','adjust_budget','adjust_goal','review_investment')),
  review_version text not null check (review_version = 'monthly-review-1.0.0'),
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, period, report_version_id, investable_run_id),
  foreign key (user_id, report_version_id)
    references app_private.monthly_report_versions (user_id, id),
  foreign key (user_id, investable_run_id)
    references app_private.planning_investable_runs (user_id, id)
);

create index monthly_reviews_user_period_idx
  on app_private.monthly_reviews (user_id, period desc, completed_at desc);

create function app_private.protect_monthly_review_links()
returns trigger language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if new.user_id <> old.user_id
    or new.period <> old.period
    or new.report_version_id <> old.report_version_id
    or new.investable_run_id <> old.investable_run_id
    or new.review_version <> old.review_version
  then
    raise exception using errcode = '55000',
      message = 'monthly review source links and version are immutable';
  end if;
  return new;
end
$function$;

revoke all on function app_private.protect_monthly_review_links() from public;
create trigger monthly_reviews_protect_links
before update on app_private.monthly_reviews
for each row execute function app_private.protect_monthly_review_links();

alter table app_private.monthly_reviews enable row level security;
alter table app_private.monthly_reviews force row level security;
create policy monthly_reviews_runtime_own on app_private.monthly_reviews
  for all to pfos_runtime using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on app_private.monthly_reviews
from public, anon, authenticated, service_role;
grant select, insert, update on app_private.monthly_reviews to pfos_runtime;

comment on table app_private.monthly_reviews is
  'B087 immutable report_version_id and investable_run_id trace; a historical review never detaches from its original evidence.';

commit;
