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
          'rls_probe_children',
          'account_deletion_requests',
          'account_deletion_receipts'
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
          'installment_items',
          'subscriptions',
          'subscription_cycles',
          'counterparties',
          'obligations',
          'shared_expenses',
          'shared_expense_shares',
          'settlements',
          'balance_snapshots',
          'reconciliation_sessions',
          'reconciliation_items',
          'monthly_report_versions',
          'budgets',
          'budget_lines',
          'goals',
          'goal_allocations',
          'goal_contribution_events',
          'expected_payments',
          'planning_investable_runs',
          'investment_instruments',
          'market_prices',
          'export_jobs',
          'backup_catalog',
          'restore_validations'
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
    or exists (select 1 from app_private.subscriptions)
    or exists (select 1 from app_private.subscription_cycles)
    or exists (select 1 from app_private.counterparties)
    or exists (select 1 from app_private.obligations)
    or exists (select 1 from app_private.shared_expenses)
    or exists (select 1 from app_private.shared_expense_shares)
    or exists (select 1 from app_private.settlements)
    or exists (select 1 from app_private.balance_snapshots)
    or exists (select 1 from app_private.reconciliation_sessions)
    or exists (select 1 from app_private.reconciliation_items)
    or exists (select 1 from app_private.monthly_report_versions)
    or exists (select 1 from app_private.budgets)
    or exists (select 1 from app_private.budget_lines)
    or exists (select 1 from app_private.goals)
    or exists (select 1 from app_private.goal_allocations)
    or exists (select 1 from app_private.goal_contribution_events)
    or exists (select 1 from app_private.expected_payments)
    or exists (select 1 from app_private.planning_investable_runs)
    or exists (select 1 from app_private.investment_instruments)
    or exists (select 1 from app_private.market_prices)
    or exists (select 1 from app_private.export_jobs)
    or exists (select 1 from app_private.backup_catalog)
    or exists (select 1 from app_private.restore_validations)
    or exists (select 1 from app_identity.account_deletion_requests)
    or exists (select 1 from app_identity.account_deletion_receipts)
  then
    raise exception 'Seed must not populate P0-A financial or operational rows.';
  end if;

  raise notice
    'P0-B1 seed complete: zero identity, counterparty, account, planning, transaction, posting, audit, outbox, or finance rows.';
end
$seed$;

commit;
