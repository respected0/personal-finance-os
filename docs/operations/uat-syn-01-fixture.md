# UAT-SYN-01 fixture contract

## Purpose and boundary

UAT-SYN-01 is the deterministic input oracle shared by future UAT-01–UAT-16
tests. It is not a production domain implementation, automatic database seed,
UI feature, or real user/finance dataset. The loader rejects production and is
available only through `pnpm fixture:check` in local, test, or CI environments.

Production application packages have zero dependencies on
`@personal-finance-os/test-kit`; production source and `supabase/seed.sql` must
contain no UAT-SYN-01 import. The test-kit package is never bundled by the
application build.

## Fixed contract

- Fixture ID: `UAT-SYN-01`
- Schema version: `1.0.0`
- Timezone: `Europe/Istanbul`
- As-of date: `2026-07-29`
- Fixed timestamp: `2026-07-29T12:00:00+03:00`
- IDs: fixed UUIDs under the synthetic `01980f42-...` namespace
- Numeric values: canonical decimal strings only
- Active physical gold records: `0`
- Active bank-gold records: `1`, with quantity exactly `1.31` grams and a
  dated synthetic reference price
- Doubtful receivable: nominal `10000.00` TRY, with
  `include_in_net_worth=false` and `include_in_planning=false`
- Gold-linked goals: `0`

## Determinism evidence

Objects are schema-validated, recursively key-sorted, serialized without
environment-dependent values, and hashed with SHA-256. The committed normalized
hash is:

`ff547da776b711c3999b58ff712e89d4c2decbfd3e99430d56906a56aee53536`

Contract tests compare two independent normalizations, enforce the fixed hash,
verify all gold/receivable invariants, and scan the production dependency and
seed paths for fixture leakage.
