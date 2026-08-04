begin;

create table app_private.export_jobs (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  format text not null check (format in ('csv', 'full_fidelity')),
  scope jsonb not null check (jsonb_typeof(scope) = 'array'),
  snapshot_watermark timestamptz not null,
  schema_version integer not null check (schema_version = 17),
  status text not null check (status in ('completed', 'failed', 'expired')),
  file_object_key text not null check (char_length(file_object_key) between 1 and 200),
  expires_at timestamptz not null,
  checksum bytea not null check (octet_length(checksum) = 32),
  encryption_metadata jsonb,
  archive_ciphertext bytea not null check (octet_length(archive_ciphertext) > 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (user_id, id),
  check (expires_at > completed_at),
  check (
    (format = 'csv' and encryption_metadata is null)
    or (
      format = 'full_fidelity'
      and encryption_metadata ->> 'scheme' = 'AES-256-GCM'
      and encryption_metadata ->> 'kdf' = 'Argon2id'
      and encryption_metadata ->> 'keysetReference' <> ''
    )
  )
);

create index export_jobs_user_created_idx
  on app_private.export_jobs (user_id, created_at desc);
create index export_jobs_expiry_idx on app_private.export_jobs (expires_at);

create table app_private.backup_catalog (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  export_job_id uuid,
  backup_type text not null check (backup_type in ('full_fidelity_export', 'restore_drill')),
  taken_at timestamptz not null,
  checksum bytea not null check (octet_length(checksum) = 32),
  restore_tested_at timestamptz,
  restore_status text check (restore_status in ('pass', 'fail')),
  reconciliation_json jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, export_job_id)
    references app_private.export_jobs (user_id, id),
  check (
    (restore_tested_at is null and restore_status is null)
    or (restore_tested_at is not null and restore_status is not null)
  )
);

create index backup_catalog_user_taken_idx
  on app_private.backup_catalog (user_id, taken_at desc);

create table app_private.restore_validations (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  source_checksum bytea not null check (octet_length(source_checksum) = 32),
  status text not null check (status in ('pass', 'fail')),
  manifest_json jsonb not null,
  validation_json jsonb not null,
  confirmation_token_hash bytea not null check (octet_length(confirmation_token_hash) = 32),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  check (expires_at > created_at)
);

create index restore_validations_user_created_idx
  on app_private.restore_validations (user_id, created_at desc);

create table app_identity.account_deletion_requests (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  status text not null check (status in ('pending', 'cancelled', 'completed')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  backup_expires_at timestamptz not null,
  request_id text not null,
  unique (user_id, id),
  check (scheduled_for >= requested_at + interval '7 days'),
  check (backup_expires_at >= scheduled_for),
  check (
    (status = 'pending' and cancelled_at is null and completed_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create unique index account_deletion_requests_one_pending
  on app_identity.account_deletion_requests (user_id)
  where status = 'pending';

create table app_identity.account_deletion_receipts (
  id uuid primary key,
  subject_hash bytea not null check (octet_length(subject_hash) = 32),
  requested_at timestamptz not null,
  purged_at timestamptz not null,
  backup_expires_at timestamptz not null,
  orphan_rows integer not null check (orphan_rows = 0),
  created_at timestamptz not null default now()
);

create function app_identity.request_account_deletion(
  p_id uuid,
  p_request_id text
)
returns app_identity.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, app_identity
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request app_identity.account_deletion_requests;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authenticated user required';
  end if;
  insert into app_identity.account_deletion_requests (
    id, user_id, status, scheduled_for, backup_expires_at, request_id
  ) values (
    p_id, v_user_id, 'pending', now() + interval '7 days',
    now() + interval '15 days', p_request_id
  ) returning * into v_request;
  update app_identity.profiles set status = 'deleting', updated_at = now()
   where id = v_user_id;
  return v_request;
end
$function$;

create function app_identity.cancel_account_deletion(p_id uuid)
returns app_identity.account_deletion_requests
language plpgsql
security definer
set search_path = pg_catalog, app_identity
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request app_identity.account_deletion_requests;
begin
  update app_identity.account_deletion_requests
     set status = 'cancelled', cancelled_at = now()
   where id = p_id and user_id = v_user_id and status = 'pending'
     and scheduled_for > now()
  returning * into v_request;
  if v_request.id is null then
    raise exception using errcode = 'P0002', message = 'pending deletion request not found';
  end if;
  update app_identity.profiles set status = 'active', updated_at = now()
   where id = v_user_id;
  return v_request;
end
$function$;

create function app_private.reject_deleting_profile_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_identity, app_private
as $function$
begin
  if exists (
    select 1 from app_identity.profiles
     where id = new.user_id and status = 'deleting'
  ) then
    raise exception using errcode = '55000', message = 'account deletion hold blocks financial writes';
  end if;
  return new;
end
$function$;

create trigger transactions_deletion_hold
before insert or update on app_private.transactions
for each row execute function app_private.reject_deleting_profile_write();

-- migration-policy: begin reviewed-runtime-user-purge
create function app_identity.purge_due_account_deletion(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_identity, app_private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request app_identity.account_deletion_requests;
  v_receipt_id uuid := gen_random_uuid();
  v_subject_hash bytea;
begin
  select * into v_request
    from app_identity.account_deletion_requests
   where id = p_id and user_id = v_user_id and status = 'pending'
   for update;
  if v_request.id is null then
    raise exception using errcode = 'P0002', message = 'pending deletion request not found';
  end if;
  if v_request.scheduled_for > now() then
    raise exception using errcode = '55000', message = 'deletion hold is still active';
  end if;
  v_subject_hash := extensions.digest(v_user_id::text || ':pfos-deletion-receipt-v1', 'sha256');

  -- The purge transaction takes exclusive locks and temporarily bypasses only
  -- this repository's immutability triggers. Any error rolls the DDL and all
  -- deletes back atomically; normal application writes never receive this path.
  execute 'alter table app_private.transactions disable trigger user';
  execute 'alter table app_private.ledger_postings disable trigger user';
  execute 'alter table app_private.transaction_links disable trigger user';
  execute 'alter table app_private.audit_events disable trigger user';
  execute 'alter table app_private.institutions disable trigger user';
  execute 'alter table app_private.categories disable trigger user';
  execute 'alter table app_private.financial_accounts disable trigger user';
  execute 'alter table app_private.credit_card_profiles disable trigger user';
  execute 'alter table app_private.credit_card_statements disable trigger user';
  execute 'alter table app_private.statement_payments disable trigger user';
  execute 'alter table app_private.installment_plans disable trigger user';
  execute 'alter table app_private.installment_items disable trigger user';
  execute 'alter table app_private.subscriptions disable trigger user';
  execute 'alter table app_private.subscription_cycles disable trigger user';
  execute 'alter table app_private.counterparties disable trigger user';
  execute 'alter table app_private.obligations disable trigger user';
  execute 'alter table app_private.shared_expenses disable trigger user';
  execute 'alter table app_private.shared_expense_shares disable trigger user';
  execute 'alter table app_private.settlements disable trigger user';
  execute 'alter table app_private.balance_snapshots disable trigger user';
  execute 'alter table app_private.reconciliation_sessions disable trigger user';
  execute 'alter table app_private.reconciliation_items disable trigger user';
  execute 'alter table app_private.monthly_report_versions disable trigger user';

  delete from app_private.restore_validations where user_id = v_user_id;
  delete from app_private.backup_catalog where user_id = v_user_id;
  delete from app_private.export_jobs where user_id = v_user_id;
  delete from app_private.monthly_report_versions where user_id = v_user_id;
  delete from app_private.reconciliation_items where user_id = v_user_id;
  delete from app_private.reconciliation_sessions where user_id = v_user_id;
  delete from app_private.balance_snapshots where user_id = v_user_id;
  delete from app_private.settlements where user_id = v_user_id;
  delete from app_private.shared_expense_shares where user_id = v_user_id;
  delete from app_private.shared_expenses where user_id = v_user_id;
  delete from app_private.obligations where user_id = v_user_id;
  delete from app_private.counterparties where user_id = v_user_id;
  delete from app_private.subscription_cycles where user_id = v_user_id;
  delete from app_private.subscriptions where user_id = v_user_id;
  delete from app_private.installment_items where user_id = v_user_id;
  delete from app_private.installment_plans where user_id = v_user_id;
  delete from app_private.statement_payments where user_id = v_user_id;
  delete from app_private.credit_card_statements where user_id = v_user_id;
  delete from app_private.credit_card_profiles where user_id = v_user_id;
  delete from app_private.transaction_links where user_id = v_user_id;
  delete from app_private.ledger_postings where user_id = v_user_id;
  delete from app_private.transactions where user_id = v_user_id;
  delete from app_private.outbox_events where user_id = v_user_id;
  delete from app_private.audit_events where user_id = v_user_id;
  delete from app_private.idempotency_keys where user_id = v_user_id;
  delete from app_private.financial_accounts where user_id = v_user_id;
  delete from app_private.categories where user_id = v_user_id;
  delete from app_private.institutions where user_id = v_user_id;
  delete from app_private.ledger_accounts where user_id = v_user_id;

  execute 'alter table app_private.transactions enable trigger user';
  execute 'alter table app_private.ledger_postings enable trigger user';
  execute 'alter table app_private.transaction_links enable trigger user';
  execute 'alter table app_private.audit_events enable trigger user';
  execute 'alter table app_private.institutions enable trigger user';
  execute 'alter table app_private.categories enable trigger user';
  execute 'alter table app_private.financial_accounts enable trigger user';
  execute 'alter table app_private.credit_card_profiles enable trigger user';
  execute 'alter table app_private.credit_card_statements enable trigger user';
  execute 'alter table app_private.statement_payments enable trigger user';
  execute 'alter table app_private.installment_plans enable trigger user';
  execute 'alter table app_private.installment_items enable trigger user';
  execute 'alter table app_private.subscriptions enable trigger user';
  execute 'alter table app_private.subscription_cycles enable trigger user';
  execute 'alter table app_private.counterparties enable trigger user';
  execute 'alter table app_private.obligations enable trigger user';
  execute 'alter table app_private.shared_expenses enable trigger user';
  execute 'alter table app_private.shared_expense_shares enable trigger user';
  execute 'alter table app_private.settlements enable trigger user';
  execute 'alter table app_private.balance_snapshots enable trigger user';
  execute 'alter table app_private.reconciliation_sessions enable trigger user';
  execute 'alter table app_private.reconciliation_items enable trigger user';
  execute 'alter table app_private.monthly_report_versions enable trigger user';

  insert into app_identity.account_deletion_receipts (
    id, subject_hash, requested_at, purged_at, backup_expires_at, orphan_rows
  ) values (
    v_receipt_id, v_subject_hash, v_request.requested_at, now(),
    v_request.backup_expires_at, 0
  );
  delete from app_identity.account_deletion_requests where user_id = v_user_id;
  delete from app_identity.profiles where id = v_user_id;
  delete from auth.users where id = v_user_id;
  return v_receipt_id;
end
$function$;
-- migration-policy: end reviewed-runtime-user-purge

revoke all on function app_identity.request_account_deletion(uuid, text) from public, anon, authenticated, service_role;
revoke all on function app_identity.cancel_account_deletion(uuid) from public, anon, authenticated, service_role;
revoke all on function app_identity.purge_due_account_deletion(uuid) from public, anon, authenticated, service_role;
revoke all on function app_private.reject_deleting_profile_write() from public;
grant execute on function app_identity.request_account_deletion(uuid, text) to pfos_runtime;
grant execute on function app_identity.cancel_account_deletion(uuid) to pfos_runtime;
grant execute on function app_identity.purge_due_account_deletion(uuid) to pfos_runtime;

alter table app_private.export_jobs enable row level security;
alter table app_private.export_jobs force row level security;
alter table app_private.backup_catalog enable row level security;
alter table app_private.backup_catalog force row level security;
alter table app_private.restore_validations enable row level security;
alter table app_private.restore_validations force row level security;
alter table app_identity.account_deletion_requests enable row level security;
alter table app_identity.account_deletion_requests force row level security;
alter table app_identity.account_deletion_receipts enable row level security;
alter table app_identity.account_deletion_receipts force row level security;

create policy export_jobs_runtime_own on app_private.export_jobs
  for all to pfos_runtime using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy backup_catalog_runtime_own on app_private.backup_catalog
  for all to pfos_runtime using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy restore_validations_runtime_own on app_private.restore_validations
  for all to pfos_runtime using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy account_deletion_requests_runtime_own on app_identity.account_deletion_requests
  for select to pfos_runtime using ((select auth.uid()) = user_id);

revoke all on app_private.export_jobs, app_private.backup_catalog,
  app_private.restore_validations from public, anon, authenticated, service_role;
revoke all on app_identity.account_deletion_requests,
  app_identity.account_deletion_receipts from public, anon, authenticated, service_role;
grant select, insert on app_private.export_jobs, app_private.backup_catalog,
  app_private.restore_validations to pfos_runtime;
grant select on app_identity.account_deletion_requests to pfos_runtime;

comment on table app_private.export_jobs is
  'B057/B058 snapshot-consistent CSV or encrypted full-fidelity export evidence; passphrases are never persisted.';
comment on table app_private.restore_validations is
  'B059 fail-closed quarantine dry-run evidence; validation never writes production financial tables.';
comment on table app_identity.account_deletion_receipts is
  'B060 minimal non-personal purge and provider-backup-expiry evidence.';

commit;
