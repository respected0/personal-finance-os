# B008 RLS test harness

## Scope

The RLS harness uses two local synthetic `example.test` identities and two
non-financial ownership probe tables. It creates no production identity,
credential, remote Supabase resource, account, ledger, transaction, budget, or
investment record.

SQL migrations remain the only schema authority. Both exposed probe tables use
RLS plus FORCE RLS, explicit authenticated CRUD policies derived from
`auth.uid()`, and no anonymous table grants. The child probe uses a composite
`(user_id, parent_id)` foreign key so an otherwise valid user cannot link a
child to another owner’s parent.

## Negative matrix

`pnpm rls:check` starts the local Supabase Auth/PostgREST stack and proves:

| Test        | Attempt                                                 | Expected result |
| ----------- | ------------------------------------------------------- | --------------- |
| SEC-RLS-06  | A reads, updates, or deletes B’s parent/child rows      | affected rows 0 |
| SEC-RLS-06  | A inserts a row carrying B’s `user_id`                  | rejected        |
| SEC-RLS-06  | A links its child to B’s parent                         | FK rejected     |
| SEC-RPC-07  | A adds a client `user_id` or search-path RPC parameter  | rejected        |
| SEC-ROLE-08 | A sends a local privileged value in an arbitrary header | bypass rows 0   |

The runtime credential scan separately requires service-role references to be
absent from browser and normal BFF/package source. The local privileged key is
read only inside the integration harness for synthetic user administration and
is never printed or committed.

## Catalog evidence

`supabase/tests/rls/policy-introspection.sql` checks the live PostgreSQL catalog:

- two probe tables have RLS and FORCE RLS;
- eight authenticated CRUD policies are present;
- authenticated table grants cover both tables and anonymous grants cover none;
- exactly one composite ownership FK is present;
- the SECURITY DEFINER RPC has a fixed `pg_catalog, app_identity` search path,
  accepts no `user_id`, grants EXECUTE to authenticated, and denies anon.

Every test run deletes the synthetic identities and stops the local stack with
`--no-backup`, removing its local volumes.
