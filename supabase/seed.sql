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
  ) then
    raise exception
      'B004 seed refuses application tables; financial/reference rows belong to later tasks.';
  end if;

  raise notice
    'B004 seed complete: zero user, bank, account, transaction, or financial rows.';
end
$seed$;

commit;
