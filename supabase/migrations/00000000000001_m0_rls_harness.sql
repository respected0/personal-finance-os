begin;

create table app_identity.rls_probe_parents (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  unique (user_id, id)
);

comment on table app_identity.rls_probe_parents is
  'B008 synthetic ownership probe only; not a finance domain table.';

create table app_identity.rls_probe_children (
  id uuid primary key,
  user_id uuid not null,
  parent_id uuid not null,
  label text not null check (char_length(label) between 1 and 80),
  foreign key (user_id, parent_id)
    references app_identity.rls_probe_parents (user_id, id)
    on delete cascade
);

comment on table app_identity.rls_probe_children is
  'B008 synthetic composite-ownership probe only; not a finance domain table.';

create index rls_probe_children_owner_parent_idx
  on app_identity.rls_probe_children (user_id, parent_id);

alter table app_identity.rls_probe_parents enable row level security;
alter table app_identity.rls_probe_parents force row level security;
alter table app_identity.rls_probe_children enable row level security;
alter table app_identity.rls_probe_children force row level security;

create policy rls_probe_parents_select_own
  on app_identity.rls_probe_parents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy rls_probe_parents_insert_own
  on app_identity.rls_probe_parents
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy rls_probe_parents_update_own
  on app_identity.rls_probe_parents
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy rls_probe_parents_delete_own
  on app_identity.rls_probe_parents
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy rls_probe_children_select_own
  on app_identity.rls_probe_children
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy rls_probe_children_insert_own
  on app_identity.rls_probe_children
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy rls_probe_children_update_own
  on app_identity.rls_probe_children
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy rls_probe_children_delete_own
  on app_identity.rls_probe_children
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema app_identity to authenticated;
grant select, insert, update, delete
  on app_identity.rls_probe_parents, app_identity.rls_probe_children
  to authenticated;

revoke all
  on app_identity.rls_probe_parents, app_identity.rls_probe_children
  from public, anon, service_role;

create function app_identity.create_rls_probe_parent(
  p_id uuid,
  p_label text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, app_identity
as $function$
declare
  authenticated_user_id uuid := auth.uid();
begin
  if authenticated_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authenticated identity required';
  end if;

  insert into app_identity.rls_probe_parents (id, user_id, label)
  values (p_id, authenticated_user_id, p_label);

  return p_id;
end
$function$;

comment on function app_identity.create_rls_probe_parent(uuid, text) is
  'B008 ownership RPC: user_id is derived only from auth.uid().';

revoke all
  on function app_identity.create_rls_probe_parent(uuid, text)
  from public, anon, service_role;
grant execute
  on function app_identity.create_rls_probe_parent(uuid, text)
  to authenticated;

commit;
