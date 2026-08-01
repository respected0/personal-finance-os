# G1 Foundation gate evidence

## Result

- Gate: `G1 — Foundation`
- Result: **PASS**
- Evidence date: `2026-08-01`
- Evaluated implementation commit:
  `edd8650c1d52bf2bd831bc036f3e99cb529a04ac`
- Binding gate scope: CI, environments, auth/RLS skeleton, migration smoke,
  and zero secret leaks
- Backlog scope: `B001`–`B010`; P0 financial features are not included

The evaluated commit is present on both `main` and `origin/main`. All ten
required GitHub checks passed on that exact commit.

## Backlog completion

| Item         | Delivered foundation                                              | Main evidence                                                                                                          |
| ------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| B001         | ADR-001–ADR-016 accepted decision records                         | `ef752f4`                                                                                                              |
| B002         | pnpm workspace, package topology, and import boundaries           | `ef752f4`                                                                                                              |
| B003         | Required CI, secret scan, negative gates, and branch protection   | `9dcb82c`, `04e4dba`, `cf6778b`, `e5bdeb5`; [negative PR #1](https://github.com/respected0/personal-finance-os/pull/1) |
| B004         | Local PostgreSQL 17/Supabase migration authority and drift checks | `48a7513`                                                                                                              |
| B005         | OpenAPI 3.1, Problem Details, bundle, and breaking-change guard   | `4161dea`; [PR #2](https://github.com/respected0/personal-finance-os/pull/2)                                           |
| B006         | Threat model, data classification, and control ownership          | `ef752f4`                                                                                                              |
| B007         | Invite-only Supabase Auth, TOTP AAL2, and server-cookie skeleton  | `607f53e`; [PR #3](https://github.com/respected0/personal-finance-os/pull/3)                                           |
| B008         | Default-deny RLS and cross-user/RPC/role isolation harness        | `f68bc9b`; [PR #4](https://github.com/respected0/personal-finance-os/pull/4)                                           |
| B009         | Structured `request_id` logging and redaction foundation          | `4161dea`; [PR #2](https://github.com/respected0/personal-finance-os/pull/2)                                           |
| B010         | Deterministic, production-isolated UAT-SYN-01 contract            | `fe1df73`; [PR #5](https://github.com/respected0/personal-finance-os/pull/5)                                           |
| CI hardening | Preserve database smoke exit status through artifact log pipeline | `edd8650`; [PR #6](https://github.com/respected0/personal-finance-os/pull/6)                                           |

## Toolchain and exact dependencies

The frozen lockfile installation passes. Repository manifests use exact
versions without `^`, `~`, `*`, or `latest` ranges.

| Area       | Exact versions                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Toolchain  | Node.js `24.18.0`; pnpm `11.18.0`; Supabase CLI `2.110.0`                                             |
| TypeScript | `@typescript/native` `7.0.2`; TypeScript 6 compatibility alias `6.0.2`                                |
| Web        | Next.js `16.2.12`; React/React DOM `19.2.8`; `@types/node` `24.13.3`; `@types/react` `19.2.18`        |
| Supabase   | `@supabase/supabase-js` `2.111.0`; `@supabase/ssr` `0.12.4`; Drizzle Kit `0.31.10`                    |
| Test       | Vitest `4.1.10`; Playwright `1.62.0`; Zod `4.4.3`                                                     |
| Quality    | ESLint `10.8.0`; `eslint-config-next` `16.2.12`; `eslint-plugin-boundaries` `7.1.0`; Prettier `3.9.6` |
| Contracts  | Redocly CLI `2.41.1`; oasdiff `1.26.1`                                                                |
| Logging    | Pino `10.3.1`; pino-pretty `13.1.3`                                                                   |
| Security   | Gitleaks `8.30.1`; immutable GitHub Action SHAs and container digests                                 |

## Acceptance test report

The evaluated implementation SHA has three successful GitHub workflow runs:

- [Quality, auth, RLS, contracts, and fixture run](https://github.com/respected0/personal-finance-os/actions/runs/30701761763)
- [Secret-scan run](https://github.com/respected0/personal-finance-os/actions/runs/30701761766)
- [Fresh migration and deterministic reset run](https://github.com/respected0/personal-finance-os/actions/runs/30701761773)

| Acceptance area                              | Result | Evidence                                                               |
| -------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`             | PASS   | Local clean install and every required CI job                          |
| Format, lint, typecheck, unit, build         | PASS   | Local `pnpm check`; 13 files and 40 unit tests; final Quality run      |
| ADR, threat, boundary, and version policies  | PASS   | Local `pnpm check` and final Quality run                               |
| OpenAPI lint, bundle, diff, negative fixture | PASS   | Final `contracts / openapi` check                                      |
| Auth integration and browser storage         | PASS   | Final `auth / integration` check                                       |
| RLS isolation and catalog introspection      | PASS   | Final `security / rls` check                                           |
| UAT-SYN-01 fixture contract                  | PASS   | Final `fixtures / contract` check                                      |
| Repository secret scan                       | PASS   | Final `security / secret-scan`; committed leak count `0`               |
| Fresh migration, two resets, drift           | PASS   | Final `database / migration-smoke`; unmasked command exit status       |
| Local container cleanup                      | PASS   | `docker ps -a` returned zero containers after the local acceptance run |

## Database and migration evidence

- Running PostgreSQL server: `17.6` (required major `17`; Supabase image build
  `17.6.1.143`).
- Repository Supabase CLI: `2.110.0`.
- Fresh migration from an empty local environment: **PASS**.
- Applied SQL migrations: foundation schema/role/identity base and the
  non-financial B008 RLS harness only.
- Reset 1 schema SHA-256:
  `c3877936590910c7ee23712f126562e843d8b0641a2ac0406a0c6556883459a8`.
- Reset 2 schema SHA-256:
  `c3877936590910c7ee23712f126562e843d8b0641a2ac0406a0c6556883459a8`.
- Equality: **PASS**; schema drift: `0`.
- Migration policy: destructive/floating SQL patterns rejected; SQL migration
  files remain the only schema authority; `drizzle push`, remote schema
  mutation, and dashboard-only unrecorded changes are prohibited.
- Seed DML rows: `0`. The seed contains no real user, bank, account, or finance
  data.

The CI log pipeline uses `set -o pipefail`, so an unsuccessful `db:smoke`
cannot be hidden by artifact capture through `tee`. The controlled destructive
migration [run 30701731288](https://github.com/respected0/personal-finance-os/actions/runs/30701731288)
failed with exit code `1`, while the final unmodified `main` migration run
passed.

## Auth and RLS evidence

The B007 runtime flow rejects public signup, creates only a synthetic invited
identity, performs password login, enrolls/verifies TOTP, reaches AAL2, and
removes the identity. Browser tests cover desktop and `390×844`; token material
in browser local/session storage and visible cookies is `0`. Session policy is
30-minute idle, 12-hour absolute AAL2, and 5-minute freshness for sensitive
operations.

The B008 two-user negative matrix passed: cross-user CRUD affected `0` rows;
cross-owner composite FK was rejected; client `user_id`/search-path RPC misuse
was rejected; an arbitrary privileged header affected `0` rows. Live catalog
introspection confirmed two forced-RLS probe tables, eight authenticated CRUD
policies, two authenticated table grants, zero anonymous table grants, one
composite ownership FK, fixed SECURITY DEFINER search path, no RPC `user_id`
argument, authenticated RPC execution, and no anonymous RPC execution.

## Fixture evidence

UAT-SYN-01 normalized SHA-256 is
`ff547da776b711c3999b58ff712e89d4c2decbfd3e99430d56906a56aee53536`.
It contains zero active physical-gold records, one synthetic bank-gold record
with exactly `1.31` grams, and one synthetic doubtful receivable of
`10000.00 TRY` excluded from both net worth and planning. Production consumers
of the fixture: `0`.

## Required gate enforcement

`main` requires pull requests, strict up-to-date checks, conversation
resolution, linear history, and administrator enforcement. Force-push and
branch deletion are disabled. The exact required contexts are:

- `quality / format`
- `quality / lint`
- `quality / typecheck`
- `quality / unit`
- `contracts / openapi`
- `auth / integration`
- `security / rls`
- `fixtures / contract`
- `security / secret-scan`
- `database / migration-smoke`

The controlled format-failure [PR #1](https://github.com/respected0/personal-finance-os/pull/1)
was `BLOCKED`, was closed without merge, and retained the failed
[`quality / format` run](https://github.com/respected0/personal-finance-os/actions/runs/30698205769).
The branch-protection API confirms all ten contexts, strict mode, PR required,
administrator enforcement, linear history, and disabled force-push/deletion.

## Security, scope, and open risks

- Production credentials, production migrations, deployments, paid resources,
  and remote Supabase/Vercel projects created by M0: `0`.
- Real identities or real financial data: `0`.
- Service-role references in normal browser/BFF/package source: `0`.
- P0-A/P0-B financial tables and features: `0`; M0 did not cross the approved
  backlog boundary.
- The only known non-blocking warning is Next.js `16.2.12` deprecating the
  `middleware.ts` convention in favor of `proxy`. The approved M0 auth skeleton
  retains its required middleware boundary; build and browser tests pass.
- Production runtime assurance remains intentionally outside G1. This gate
  proves local and CI foundations only and creates no cloud resource.

There is no blocking residual risk or manual action for G1. The M0 Foundation
quality gate is **PASS**.
