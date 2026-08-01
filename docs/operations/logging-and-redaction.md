# Structured logging and redaction

## Policy

Application logs are allowlist-based JSON in test and production. Local
development may opt into `pino-pretty`; pretty output is never selected for
test or production. Every request and problem-details response carries the same
UUID `request_id`.

Allowed application metadata is limited to event name, request ID, outcome,
redacted error class, duration, timestamp, and level. Raw request bodies, query
values, headers, cookies, authorization values, provider tokens, TOTP codes,
email addresses, descriptions, amounts, and key material are never copied into
the safe record.

## Error classes

- Expected domain/validation failures use `expected_error` and a public error
  class such as `validation_error`.
- Unexpected failures use `server_error` and a generic redacted class. Stack
  traces and raw exception messages are not part of the application event.
- The public problem response remains non-enumerating and contains a valid
  `request_id` for support correlation.

## Verification

`pnpm test:unit` runs canary tests for email, token, TOTP, amount, description,
and key material. PASS requires zero canary matches, no raw-body field, an exact
allowlisted JSON key set, and request ID equality between logs and problem
details.
