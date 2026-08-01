begin;

do $seed$
begin
  if exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname in ('app_identity', 'app_private')
      and relation.relkind in ('r', 'p')
      and not (
        namespace.nspname = 'app_identity'
        and relation.relname in (
          'profiles',
          'rls_probe_parents',
          'rls_probe_children'
        )
      )
      and not (
        namespace.nspname = 'app_private'
        and relation.relname in (
          'ledger_accounts',
          'transactions',
          'ledger_postings',
          'transaction_links',
          'idempotency_keys',
          'audit_events',
          'outbox_events',
          'institutions',
          'categories',
          'financial_accounts',
          'credit_card_profiles',
          'credit_card_statements',
          'statement_payments',
          'installment_plans',
          'installment_items'
        )
      )
  ) then
    raise exception
      'Seed refuses tables outside the approved M0 and P0-A0 schema.';
  end if;

  if exists (select 1 from app_identity.profiles)
    or exists (select 1 from app_identity.rls_probe_parents)
    or exists (select 1 from app_identity.rls_probe_children)
  then
    raise exception 'Seed must not populate profiles or B008 ownership probes.';
  end if;

  if exists (select 1 from app_private.ledger_accounts)
    or exists (select 1 from app_private.transactions)
    or exists (select 1 from app_private.ledger_postings)
    or exists (select 1 from app_private.transaction_links)
    or exists (select 1 from app_private.idempotency_keys)
    or exists (select 1 from app_private.audit_events)
    or exists (select 1 from app_private.outbox_events)
    or exists (select 1 from app_private.institutions)
    or exists (select 1 from app_private.categories)
    or exists (select 1 from app_private.financial_accounts)
    or exists (select 1 from app_private.credit_card_profiles)
    or exists (select 1 from app_private.credit_card_statements)
    or exists (select 1 from app_private.statement_payments)
    or exists (select 1 from app_private.installment_plans)
    or exists (select 1 from app_private.installment_items)
  then
    raise exception 'Seed must not populate P0-A financial or operational rows.';
  end if;

  raise notice
    'P0-A2 seed complete: zero identity, institution, account, card, category, transaction, posting, audit, outbox, or finance rows.';
end
$seed$;

commit;
