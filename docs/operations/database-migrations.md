# Database Migration Policy

## Authority

Reviewed, ordered and immutable SQL files under `supabase/migrations/` are the
only schema authority. The first file is
`00000000000000_m0_foundation.sql`.

Drizzle is a query/schema authoring aid only. `drizzle push` is forbidden in
local, CI, staging and production environments. Generated Drizzle output is
review material and cannot replace a numbered SQL migration.

Supabase Studio is disabled in `supabase/config.toml`. Dashboard-only or other
unrecorded schema changes are forbidden. Every schema change must enter the
repository as a reviewed SQL migration before it is applied.

## B004 Boundary

The foundation migration may create only application namespaces, NOLOGIN role
foundations, comments and permission boundaries. It must not create finance,
ledger, transaction, account, card, budget, investment or recommendation
objects.

The B004 seed writes no application rows. Later reference or synthetic data must
remain separate from production data and must pass the migration policy check.

## P0-A0 Ledger Kernel

`20260801173000_p0_a0_ledger_kernel.sql` is the first finance migration. It is
limited to the shared ledger kernel owned by B016–B023:

- fixed per-user system ledger roles;
- transaction headers, exact postings and transaction links;
- user-scoped idempotency results;
- append-only audit events and transactional outbox events;
- forced RLS, narrow runtime grants, posted immutability and deferred exact
  debit/credit balance enforcement.

The application commits a server-generated posting plan in a `SERIALIZABLE`
transaction. A new transaction remains `draft` only inside that database
transaction, receives its postings and links, and is then promoted to `posted`.
Once posted, header mutation, hard delete, posting/link mutation and later
posting/link append are rejected. Corrections create an exact reversal and,
for revision, a separate replacement plan.

`packages/db/src/schema.ts` mirrors the reviewed SQL for type-safe queries; it
is not allowed to create or push schema. Foreign keys owned by later domain
tables, such as `financial_accounts`, are added only by those tables' owning
migrations.

The seed remains data-free. It permits the approved P0-A0 tables only after
asserting that every ledger, idempotency, audit and outbox table is empty.

## Local Commands

```bash
pnpm db:start
pnpm db:status
pnpm db:reset
pnpm db:checksum
pnpm db:smoke
pnpm db:stop
pnpm ledger:integration
pnpm test:ledger:coverage
```

These commands invoke the repository-pinned Supabase CLI and refuse linked,
remote or explicit database URL operations.
