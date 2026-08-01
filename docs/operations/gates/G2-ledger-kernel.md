# G2 Ledger Kernel gate evidence

## Result

- Gate: `G2 — P0-A0 Ledger Kernel`
- Local result: **PASS**
- Required GitHub CI: **PENDING**
- Evidence date: `2026-08-01`
- Evaluated branch: `feat/p0-a0-ledger-kernel`
- Evaluated implementation commit:
  `374899a92fa0aa752ed1ad55a4d871415bbae1d5`
- Pull request: [#8](https://github.com/respected0/personal-finance-os/pull/8)
  (**DRAFT / OPEN**; required checks in progress)
- Binding scope: `B011`–`B024`, `INV-01`–`INV-10`, UAT financial rules
  engine+DB `16/16`, and JavaScript financial float boundary `0`

G2 is not declared complete until every required GitHub check passes on the
latest pull-request head. The local implementation and runtime acceptance are
complete; the CI result and implementation SHA are recorded before merge.

## Backlog completion

| Item | Delivered P0-A0 behavior                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B011 | `decimal.js` Money value object with string-only exact add/subtract/compare/product and `numeric(19,4)` bounds                                                                                                      |
| B012 | Turkish `427,50` / `1.234,56` parser and formatter; blank, zero, negative and malformed input rejection                                                                                                             |
| B013 | Typed internal command union for every P0 financial event; public Zod requests exclude owner, postings and trusted server state                                                                                     |
| B014 | Thirteen fixed per-user system ledger roles, one unique database account per role and deterministic role resolution                                                                                                 |
| B015 | Pure command-to-posting engine for expense, income, transfer, card payment, refund/cashback, shared expense, receivable settlement, expected realization, investment buy/sell, opening, adjustment, void and revise |
| B016 | Reviewed forward SQL migration plus Drizzle query mirror for ledger, idempotency, audit and outbox tables and indexes                                                                                               |
| B017 | Deferred exact base-currency debit/credit constraint; at least two positive postings; no rounding tolerance                                                                                                         |
| B018 | Narrow grants and triggers reject posted header update/hard-delete, posting/link mutation and later append                                                                                                          |
| B019 | User-scoped key plus request hash, stored response, sequential/concurrent replay and different-payload conflict                                                                                                     |
| B020 | Pure deterministic preview using the production posting engine, engine/schema trace and SHA-256 preview hash; writes `0`                                                                                            |
| B021 | Bounded three-attempt `SERIALIZABLE` repository commit for header, postings, links, audit, outbox and idempotency result                                                                                            |
| B022 | Redacted append-only audit event with actor/session/request/time and SHA-256 previous-event chain                                                                                                                   |
| B023 | Versioned transactional outbox with unique aggregate/event/version source                                                                                                                                           |
| B024 | Fast-check property suite, direct branch suite, real PostgreSQL invariant negatives and UAT engine+DB matrix                                                                                                        |

## Exact dependencies activated

All direct dependency versions are exact and the frozen lockfile passes.

| Package               | Version  | P0-A0 use                                                |
| --------------------- | -------- | -------------------------------------------------------- |
| `decimal.js`          | `10.6.0` | Exact money and decimal calculation                      |
| `drizzle-orm`         | `0.45.2` | Type-safe query schema mirror; never migration authority |
| `postgres`            | `3.4.9`  | Parameterized server-only SERIALIZABLE repository        |
| `fast-check`          | `4.9.0`  | Money, balance and reversal property tests               |
| `@vitest/coverage-v8` | `4.1.10` | Binding domain coverage gate                             |

No P0-A1 or later dependency was added. `testcontainers` remains absent because
the pinned local Supabase PostgreSQL 17 stack already supplies the required real
database acceptance environment.

## Financial invariant evidence

| Invariant                                 | Result | Kernel evidence                                                                                                                                                 |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-01 debit equals credit                | PASS   | Pure/property assertions and deferred DB constraint; unbalanced COMMIT rejected `23514` and rolled back                                                         |
| INV-02 positive amount and side direction | PASS   | String Money positive checks plus DB `CHECK`; negative/zero and invalid side paths rejected                                                                     |
| INV-03 posted immutability                | PASS   | Header/posting/link triggers and grants; UPDATE, hard-delete and late append rejected `55000`                                                                   |
| INV-04 owner consistency                  | PASS   | Composite `(user_id,id)` foreign keys, forced RLS and cross-owner negative DB test                                                                              |
| INV-05 idempotency                        | PASS   | Unique user/key and user/client request, canonical request hash, stored response, concurrent same-key single result and different-payload `409`                 |
| INV-06 settlement cap                     | PASS   | Trusted server-enriched outstanding precondition in the engine and SERIALIZABLE commit boundary; over-settlement rejected before write                          |
| INV-07 allocation cap                     | PASS   | Eligible-value precondition; over-allocation rejected and valid allocation produces zero ledger postings                                                        |
| INV-08 single realization                 | PASS   | Server-enriched realization-state precondition rejects repeated realization; persistent expected-payment unique link remains owned by its later table migration |
| INV-09 no hidden FX rounding              | PASS   | Explicit string FX rate, `numeric(28,12)`, exact base amount check and reserved `fx_rounding` role                                                              |
| INV-10 reversal, never delete             | PASS   | Exact side inversion, unique reversal relationship, immutable original and rejected hard-delete                                                                 |

Feature-owned obligation, goal, expected-payment, financial-account and
investment-lot tables are deliberately not created in P0-A0. Their later
migrations must attach the binding composite FKs/locks/unique constraints to
these kernel preconditions without changing the ledger authority.

## UAT financial rule evidence

The real PostgreSQL runner reports `P0-A0 UAT financial rules engine+DB: 16/16
PASS` using synthetic UUIDs and `example.test` identities only.

| UAT | Rule evidence                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| 01  | Bank expense debits expense and credits bank asset                                                                  |
| 02  | Transfer moves asset to asset and produces no income/expense/net-worth delta                                        |
| 03  | Card expense credits card liability and does not change bank asset                                                  |
| 04  | Card payment debits liability, credits bank and creates no second expense                                           |
| 05  | Subscription cashback/refund credits linked expense offset, not normal income                                       |
| 06  | Shared payment expense equals owner share and other shares become receivable postings                               |
| 07  | Receivable settlement moves receivable to cash without income or net-worth delta                                    |
| 08  | Doubtful receivable remains nominally tracked while net-worth/planning policies stay independent; ledger writes `0` |
| 09  | Expected realization becomes income exactly through the realized command precondition                               |
| 10  | Investment buy capitalizes gross plus fee and creates consumption expense `0`                                       |
| 11  | Goal allocation is bounded and virtual; ledger postings `0`                                                         |
| 12  | Reconciliation adjustment uses adjustment equity and requires an explicit reason                                    |
| 13  | Reporting source aggregate derives from the exactly balanced posted ledger                                          |
| 14  | Recommendation evidence carries explicit rule code/version and writes no ledger event                               |
| 15  | Mobile quick expense uses the identical production command/posting engine                                           |
| 16  | User/type/date transaction filter returns owned rows through the binding composite index                            |

## Test and runtime report

| Check                            | Result | Evidence                                                                                          |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | PASS   | Lockfile current; supply-chain policy passed                                                      |
| `pnpm test:ledger:coverage`      | PASS   | Statements `99.31%`, branches `98.24%`, functions `100%`, lines `99.30%`                          |
| Financial float boundary         | PASS   | Money/amount/quantity/price/rate fields use strings; forbidden JS number calculation patterns `0` |
| Property tests                   | PASS   | Random valid money/balance `1,000` runs; exact reversal `500` runs; counterexamples `0`           |
| `pnpm ledger:integration`        | PASS   | UAT `16/16`; INV-01–10; sequential/concurrent idempotency; audit/outbox/RLS negatives             |
| `pnpm db:smoke`                  | PASS   | Empty fresh migration, two resets and schema drift `0`                                            |
| `pnpm rls:check`                 | PASS   | Existing two-user matrix unaffected; cross-user CRUD rows `0`                                     |
| OpenAPI lint/bundle/diff         | PASS   | OpenAPI 3.1 bundle; breaking changes versus main `0`; negative fixture rejected                   |
| `pnpm security:secret-scan`      | PASS   | Gitleaks leaks `0`                                                                                |
| Runtime credential scan          | PASS   | Browser/BFF service-role references `0`                                                           |
| `pnpm check`                     | PASS   | Format, lint, typecheck, 89 unit tests, build and all M0 policy gates                             |

## Database evidence

- Running PostgreSQL server: `17.6` (required major `17`).
- Repository Supabase CLI: `2.110.0`.
- Fresh migration from an empty environment: **PASS**.
- Migration count: `3`; P0-A0 migration:
  `20260801173000_p0_a0_ledger_kernel.sql`.
- Reset 1 schema SHA-256:
  `0ba741ebfe18587f13c1381049a8201e95daa0eee6c62f8d74f96f7edc0de1e2`.
- Reset 2 schema SHA-256:
  `0ba741ebfe18587f13c1381049a8201e95daa0eee6c62f8d74f96f7edc0de1e2`.
- Equality: **PASS**; schema drift: `0`.
- Seed rows in ledger/account/transaction/posting/idempotency/audit/outbox
  tables: `0`.
- SQL migration remains the only schema authority. `drizzle push`, dashboard
  changes, remote Supabase flags and destructive migration patterns remain
  forbidden.
- Local containers and volumes were removed after each acceptance run;
  `docker ps -a` returned zero containers.

## API and security boundary

The OpenAPI surface adds only health plus transaction preview, commit, void and
revise paths. A public request cannot carry `user_id`, postings, original
postings, outstanding/eligibility/cost-basis values or realization state.
Preview/commit require AAL2 by contract; commit paths require a UUID
`Idempotency-Key`. Money, quantity, price and FX JSON fields are strings.
Errors retain `application/problem+json` and request correlation.

Every P0-A0 user-owned table has forced RLS. `anon`, `authenticated`,
`service_role` and public receive no direct ledger-table write grant. The
server-only runtime role sees only `auth.uid()` rows; owner injection into the
fixed-search-path provisioning function is rejected. Production secret,
production migration, cloud project, real user, real bank/account/finance data,
paid resource and deployment counts are all `0`.

## Resolved failures and residual scope

Three implementation errors were found and fixed before this evidence:

1. the M0 seed guard initially rejected approved P0-A0 tables; it now permits
   only the approved tables and asserts all remain empty;
2. a polymorphic posting/link trigger referenced both possible `NEW` columns in
   one CASE; separate table branches removed PostgreSQL `42703`;
3. initial domain branch coverage was `68.15%`; direct edge/negative tests
   raised it to `98.24%` without lowering the binding threshold.

The known non-blocking Next.js middleware deprecation warning is unchanged from
G1. Later feature-owned FKs and tables are an explicit backlog boundary, not an
untracked P0-A0 defect. No production or paid external resource is required for
G2.
