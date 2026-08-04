begin;

create table app_private.balance_snapshots (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  account_id uuid not null,
  observed_at timestamptz not null,
  stated_balance numeric(19,4) not null,
  calculated_balance numeric(19,4) not null,
  difference numeric(19,4)
    generated always as (stated_balance - calculated_balance) stored,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'ignored')),
  note_enc bytea,
  note_key_id text,
  note_algorithm text,
  note_enc_version smallint,
  note_nonce bytea,
  note_auth_tag bytea,
  note_aad_version smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, account_id, observed_at),
  foreign key (user_id, account_id)
    references app_private.financial_accounts (user_id, id),
  check (
    (note_enc is null and note_key_id is null and note_algorithm is null
      and note_enc_version is null and note_nonce is null
      and note_auth_tag is null and note_aad_version is null)
    or
    (octet_length(note_enc) > 0
      and char_length(note_key_id) between 1 and 80
      and note_algorithm = 'AEAD_AES_256_GCM'
      and note_enc_version = 1
      and octet_length(note_nonce) = 12
      and octet_length(note_auth_tag) = 16
      and note_aad_version = 1)
  )
);

create index balance_snapshots_user_account_observed_idx
  on app_private.balance_snapshots (user_id, account_id, observed_at desc, id);
create index balance_snapshots_user_status_idx
  on app_private.balance_snapshots (user_id, status, observed_at desc, id);

create table app_private.reconciliation_sessions (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  account_id uuid not null,
  period daterange not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'resolved')),
  unresolved_count integer not null check (unresolved_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, account_id)
    references app_private.financial_accounts (user_id, id),
  check (not isempty(period)),
  check (
    (status = 'open' and completed_at is null and unresolved_count > 0)
    or
    (status = 'resolved' and completed_at is not null and unresolved_count = 0)
  )
);

create index reconciliation_sessions_user_period_idx
  on app_private.reconciliation_sessions using gist (period);
create index reconciliation_sessions_user_status_idx
  on app_private.reconciliation_sessions (user_id, status, started_at desc, id);

create table app_private.reconciliation_items (
  id uuid primary key,
  user_id uuid not null references app_identity.profiles (id),
  session_id uuid not null,
  snapshot_id uuid not null,
  resolution_type text
    check (resolution_type in ('missing_transaction', 'adjustment', 'accepted')),
  transaction_id uuid,
  reason_enc bytea,
  reason_key_id text,
  reason_algorithm text,
  reason_enc_version smallint,
  reason_nonce bytea,
  reason_auth_tag bytea,
  reason_aad_version smallint,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, session_id, snapshot_id),
  foreign key (user_id, session_id)
    references app_private.reconciliation_sessions (user_id, id),
  foreign key (user_id, snapshot_id)
    references app_private.balance_snapshots (user_id, id),
  foreign key (user_id, transaction_id)
    references app_private.transactions (user_id, id),
  check (
    (resolution_type is null and transaction_id is null and resolved_at is null
      and reason_enc is null and reason_key_id is null
      and reason_algorithm is null and reason_enc_version is null
      and reason_nonce is null and reason_auth_tag is null
      and reason_aad_version is null)
    or
    (resolution_type is not null and resolved_at is not null
      and octet_length(reason_enc) > 0
      and char_length(reason_key_id) between 1 and 80
      and reason_algorithm = 'AEAD_AES_256_GCM'
      and reason_enc_version = 1
      and octet_length(reason_nonce) = 12
      and octet_length(reason_auth_tag) = 16
      and reason_aad_version = 1
      and (
        (resolution_type = 'accepted' and transaction_id is null)
        or
        (resolution_type in ('missing_transaction', 'adjustment')
          and transaction_id is not null)
      ))
  )
);

create index reconciliation_items_user_session_idx
  on app_private.reconciliation_items (user_id, session_id, resolved_at, id);
create index reconciliation_items_user_transaction_idx
  on app_private.reconciliation_items (user_id, transaction_id)
  where transaction_id is not null;

create function app_private.protect_balance_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'balance snapshots are retained reconciliation evidence';
  end if;
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.account_id <> old.account_id
    or new.observed_at <> old.observed_at
    or new.stated_balance <> old.stated_balance
    or new.calculated_balance <> old.calculated_balance
  then
    raise exception using errcode = '55000', message = 'balance snapshot financial evidence is immutable';
  end if;
  if old.status <> 'open' and new.status <> old.status then
    raise exception using errcode = '55000', message = 'resolved balance snapshot cannot be reopened';
  end if;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_balance_snapshot() from public;

create trigger balance_snapshots_protect_evidence
before update or delete on app_private.balance_snapshots
for each row execute function app_private.protect_balance_snapshot();

create function app_private.protect_reconciliation_evidence()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'reconciliation evidence is retained';
  end if;
  if new.id <> old.id or new.user_id <> old.user_id then
    raise exception using errcode = '55000', message = 'reconciliation identity and owner are immutable';
  end if;
  if tg_table_name = 'reconciliation_sessions' then
    if new.account_id <> old.account_id or new.period <> old.period then
      raise exception using errcode = '55000', message = 'reconciliation scope is immutable';
    end if;
    if old.status = 'resolved' and new.status <> old.status then
      raise exception using errcode = '55000', message = 'resolved reconciliation cannot be reopened';
    end if;
  else
    if new.session_id <> old.session_id or new.snapshot_id <> old.snapshot_id then
      raise exception using errcode = '55000', message = 'reconciliation item scope is immutable';
    end if;
    if old.resolved_at is not null and to_jsonb(new) <> to_jsonb(old) then
      raise exception using errcode = '55000', message = 'resolved reconciliation item is immutable';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$function$;

revoke all on function app_private.protect_reconciliation_evidence() from public;

create trigger reconciliation_sessions_protect_evidence
before update or delete on app_private.reconciliation_sessions
for each row execute function app_private.protect_reconciliation_evidence();
create trigger reconciliation_items_protect_evidence
before update or delete on app_private.reconciliation_items
for each row execute function app_private.protect_reconciliation_evidence();

create function app_private.assert_reconciliation_invariants()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  target_session_id uuid;
  target_user_id uuid;
  target_account_id uuid;
  target_status text;
  target_unresolved integer;
  actual_unresolved integer;
  target_item app_private.reconciliation_items%rowtype;
  target_snapshot app_private.balance_snapshots%rowtype;
  linked_event_type text;
begin
  target_session_id := (
    to_jsonb(new) ->> case
      when tg_table_name = 'reconciliation_sessions' then 'id'
      else 'session_id'
    end
  )::uuid;

  select user_id, account_id, status, unresolved_count
    into target_user_id, target_account_id, target_status, target_unresolved
    from app_private.reconciliation_sessions
   where id = target_session_id;
  if not found then
    raise exception using errcode = '23503', message = 'reconciliation session was not found';
  end if;

  select count(*) filter (where resolved_at is null)::integer
    into actual_unresolved
    from app_private.reconciliation_items
   where user_id = target_user_id and session_id = target_session_id;

  if actual_unresolved <> target_unresolved then
    raise exception using errcode = '23514', message = 'reconciliation unresolved count is inconsistent';
  end if;
  if (target_status = 'open') <> (actual_unresolved > 0) then
    raise exception using errcode = '23514', message = 'reconciliation status does not match unresolved items';
  end if;

  for target_item in
    select * from app_private.reconciliation_items
     where user_id = target_user_id and session_id = target_session_id
  loop
    select * into target_snapshot
      from app_private.balance_snapshots
     where user_id = target_user_id and id = target_item.snapshot_id;
    if not found or target_snapshot.account_id <> target_account_id then
      raise exception using errcode = '23514', message = 'reconciliation item snapshot is outside the session account';
    end if;
    if target_item.resolved_at is null then
      if target_snapshot.status <> 'open' then
        raise exception using errcode = '23514', message = 'open reconciliation item requires open snapshot';
      end if;
      continue;
    end if;
    if target_item.resolution_type = 'accepted' then
      if target_snapshot.status <> 'ignored' or target_item.transaction_id is not null then
        raise exception using errcode = '23514', message = 'accepted difference must be ignored without a transaction';
      end if;
    else
      if target_snapshot.status <> 'resolved' or target_item.transaction_id is null then
        raise exception using errcode = '23514', message = 'corrected difference requires a linked transaction';
      end if;
      select event_type into linked_event_type
        from app_private.transactions
       where user_id = target_user_id
         and id = target_item.transaction_id
         and status = 'posted';
      if not found or not exists (
        select 1 from app_private.ledger_postings
         where user_id = target_user_id
           and transaction_id = target_item.transaction_id
           and financial_account_id = target_account_id
      ) then
        raise exception using errcode = '23514', message = 'reconciliation correction must post to the reconciled account';
      end if;
      if target_item.resolution_type = 'adjustment'
        and linked_event_type <> 'balance_adjustment'
      then
        raise exception using errcode = '23514', message = 'adjustment resolution requires a balance adjustment transaction';
      end if;
    end if;
  end loop;
  return null;
end
$function$;

revoke all on function app_private.assert_reconciliation_invariants() from public;

create constraint trigger reconciliation_sessions_deferred_invariants
after insert or update on app_private.reconciliation_sessions
deferrable initially deferred
for each row execute function app_private.assert_reconciliation_invariants();
create constraint trigger reconciliation_items_deferred_invariants
after insert or update on app_private.reconciliation_items
deferrable initially deferred
for each row execute function app_private.assert_reconciliation_invariants();

create function app_private.assert_revision_invariants()
returns trigger
language plpgsql
set search_path = pg_catalog, app_private
as $function$
declare
  original_id uuid;
  original_user_id uuid;
  original_group_id uuid;
  original_count integer;
  revision_count integer;
begin
  if new.status <> 'posted' or new.reverses_transaction_id is null then
    return null;
  end if;
  if new.event_type not in ('void', 'revise') then
    raise exception using errcode = '23514', message = 'only void or revise may reverse a transaction';
  end if;
  original_id := new.reverses_transaction_id;
  select user_id, revision_group_id
    into original_user_id, original_group_id
    from app_private.transactions
   where id = original_id and status = 'posted';
  if not found or original_user_id <> new.user_id or original_group_id <> new.revision_group_id then
    raise exception using errcode = '23514', message = 'revision must retain the owned original revision group';
  end if;
  select count(*)::integer into original_count
    from app_private.ledger_postings where transaction_id = original_id;
  select count(*)::integer into revision_count
    from app_private.ledger_postings where transaction_id = new.id;
  if original_count < 2
    or (new.event_type = 'void' and revision_count <> original_count)
    or (new.event_type = 'revise' and revision_count <= original_count)
    or exists (
      select 1
        from app_private.ledger_postings as original
       where original.transaction_id = original_id
         and not exists (
           select 1
             from app_private.ledger_postings as reversal
            where reversal.transaction_id = new.id
              and reversal.sequence_no = original.sequence_no
              and reversal.ledger_account_id = original.ledger_account_id
              and reversal.financial_account_id is not distinct from original.financial_account_id
              and reversal.side = case original.side when 'debit' then 'credit' else 'debit' end
              and reversal.amount_original = original.amount_original
              and reversal.currency = original.currency
              and reversal.fx_rate = original.fx_rate
              and reversal.amount_base = original.amount_base
              and reversal.role = original.role
         )
    )
  then
    raise exception using errcode = '23514', message = 'revision does not exactly reverse the original postings';
  end if;
  if not exists (
    select 1 from app_private.transaction_links
     where user_id = new.user_id
       and from_transaction_id = new.id
       and to_transaction_id = original_id
       and link_type = 'reverses'
  ) then
    raise exception using errcode = '23514', message = 'revision reversal link is missing';
  end if;
  return null;
end
$function$;

revoke all on function app_private.assert_revision_invariants() from public;

create constraint trigger transactions_deferred_revision
after insert or update on app_private.transactions
deferrable initially deferred
for each row execute function app_private.assert_revision_invariants();

alter table app_private.balance_snapshots enable row level security;
alter table app_private.balance_snapshots force row level security;
alter table app_private.reconciliation_sessions enable row level security;
alter table app_private.reconciliation_sessions force row level security;
alter table app_private.reconciliation_items enable row level security;
alter table app_private.reconciliation_items force row level security;

create policy balance_snapshots_runtime_own
  on app_private.balance_snapshots for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy reconciliation_sessions_runtime_own
  on app_private.reconciliation_sessions for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy reconciliation_items_runtime_own
  on app_private.reconciliation_items for all to pfos_runtime
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on
  app_private.balance_snapshots,
  app_private.reconciliation_sessions,
  app_private.reconciliation_items
from public, anon, authenticated, service_role;

grant select, insert, update on
  app_private.balance_snapshots,
  app_private.reconciliation_sessions,
  app_private.reconciliation_items
to pfos_runtime;

comment on table app_private.balance_snapshots is
  'B051 immutable stated-versus-ledger balance evidence with exact numeric difference.';
comment on table app_private.reconciliation_sessions is
  'B051 owned reconciliation scope and monotonic completion state.';
comment on table app_private.reconciliation_items is
  'B052 encrypted reason and required correction link; no financial write for accepted differences.';

commit;
