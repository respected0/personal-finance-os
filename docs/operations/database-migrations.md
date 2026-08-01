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

## Local Commands

```bash
pnpm db:start
pnpm db:status
pnpm db:reset
pnpm db:checksum
pnpm db:smoke
pnpm db:stop
```

These commands invoke the repository-pinned Supabase CLI and refuse linked,
remote or explicit database URL operations.
