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
        and relation.relname in ('rls_probe_parents', 'rls_probe_children')
      )
  ) then
    raise exception
      'M0 seed refuses unexpected application tables; finance rows belong to later tasks.';
  end if;

  if exists (select 1 from app_identity.rls_probe_parents)
    or exists (select 1 from app_identity.rls_probe_children)
  then
    raise exception 'M0 seed must not populate B008 ownership probes.';
  end if;

  raise notice
    'M0 seed complete: zero identity probe, user, account, transaction, or finance rows.';
end
$seed$;

commit;
