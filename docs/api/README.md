# Foundation API contract

The authoritative REST contract starts at
`packages/contracts/openapi/openapi.yaml`. It is OpenAPI 3.1 and exposes only
the M0 health surface. Financial endpoints remain absent until their owning
backlog tasks begin.

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
