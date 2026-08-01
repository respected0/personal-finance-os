# API contract

The authoritative REST contract starts at
`packages/contracts/openapi/openapi.yaml`. It is OpenAPI 3.1. M0 owns the
health surface; P0-A0 adds the typed transaction preview/commit and
reversal/revision command contracts.

## Commands

```bash
pnpm contracts:lint
pnpm contracts:bundle
pnpm contracts:diff --base main
pnpm contracts:test-breaking
pnpm contracts:check
```

The bundle is written under ignored `.tmp/contracts/` with a SHA-256 checksum.
Redocly CLI 2.41.1 performs lint and bundle. oasdiff 1.26.1 runs from an
immutable Docker digest and rejects breaking changes relative to `main`.

## Contract rules

- Paths are versioned under `/api/v1`.
- Errors use `application/problem+json` and carry the same UUID `request_id` as
  the response header and structured log event.
- Monetary and decimal quantities are canonical JSON strings, never JavaScript
  numbers.
- Dates are ISO 8601 and identifiers are UUIDs.
- Provider access/refresh credentials are not part of the public contract.
- Financial requests contain typed commands only. They never contain
  `user_id`, ledger postings, trusted outstanding/eligibility values, cost
  basis, realization state or another server-derived invariant input.
- Preview and commit use the same production ledger engine. Preview writes
  nothing; commit recomputes server-side and returns the actual preview hash,
  posting summary and effects.
- Transaction commits require AAL2 and a UUID `Idempotency-Key`; same payload
  replay returns the stored result, while a different payload returns
  `idempotency_conflict`.
- Void/revise public inputs carry only the reason and optional replacement
  command. The server reads original postings and produces the exact reversal.
