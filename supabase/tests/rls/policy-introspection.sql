\set ON_ERROR_STOP on

select json_build_object(
  'rls_table_count', (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'app_identity'
      and relation.relname in ('rls_probe_parents', 'rls_probe_children')
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  'policy_count', (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'app_identity'
      and tablename in ('rls_probe_parents', 'rls_probe_children')
      and roles = array['authenticated']::name[]
  ),
  'authenticated_table_grants', (
    select count(*)
    from (values
      ('app_identity.rls_probe_parents'),
      ('app_identity.rls_probe_children')
    ) as tables(qualified_name)
    where has_table_privilege(
      'authenticated',
      tables.qualified_name,
      'select,insert,update,delete'
    )
  ),
  'anon_table_grants', (
    select count(*)
    from (values
      ('app_identity.rls_probe_parents'),
      ('app_identity.rls_probe_children')
    ) as tables(qualified_name)
    where has_table_privilege(
      'anon',
      tables.qualified_name,
      'select,insert,update,delete'
    )
  ),
  'composite_ownership_fk_count', (
    select count(*)
    from pg_catalog.pg_constraint
    where conrelid = 'app_identity.rls_probe_children'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like
        'FOREIGN KEY (user_id, parent_id) REFERENCES app_identity.rls_probe_parents(user_id, id)%'
  ),
  'security_definer', (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'app_identity.create_rls_probe_parent(uuid,text)'::regprocedure
  ),
  'fixed_search_path', (
    select coalesce(
      proconfig @> array['search_path=pg_catalog, app_identity'],
      false
    )
    from pg_catalog.pg_proc
    where oid = 'app_identity.create_rls_probe_parent(uuid,text)'::regprocedure
  ),
  'rpc_has_user_id_argument', (
    select pg_get_function_identity_arguments(oid) ilike '%user_id%'
    from pg_catalog.pg_proc
    where oid = 'app_identity.create_rls_probe_parent(uuid,text)'::regprocedure
  ),
  'authenticated_rpc_execute', has_function_privilege(
    'authenticated',
    'app_identity.create_rls_probe_parent(uuid,text)',
    'execute'
  ),
  'anon_rpc_execute', has_function_privilege(
    'anon',
    'app_identity.create_rls_probe_parent(uuid,text)',
    'execute'
  )
)::text;
