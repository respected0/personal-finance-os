begin;

create schema if not exists app_identity;
create schema if not exists app_private;

comment on schema app_identity is
  'B004 identity namespace; auth objects are deferred to B007.';
comment on schema app_private is
  'B004 private namespace; financial objects are outside this migration.';

revoke all on schema app_identity from public;
revoke all on schema app_private from public;
revoke create on schema public from public;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'pfos_runtime'
  ) then
    create role pfos_runtime
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'pfos_migrator'
  ) then
    create role pfos_migrator
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication;
  end if;
end
$migration$;

alter role pfos_runtime
  nologin
  noinherit
  nocreatedb
  nocreaterole;

alter role pfos_migrator
  nologin
  noinherit
  nocreatedb
  nocreaterole;

comment on role pfos_runtime is
  'B004 NOLOGIN role foundation; grants are deferred to later tasks.';
comment on role pfos_migrator is
  'B004 NOLOGIN migration ownership boundary.';

commit;
