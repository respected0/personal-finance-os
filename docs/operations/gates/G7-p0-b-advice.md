# G7 — P0-B3 Advice and Monthly Review Gate

Durum: **PASS adayı — PR CI kanıtı bekleniyor**

## Kapsam

- B083: R-01–R-15 versioned rule registry and evidence schema.
- B084: user threshold overrides, effective dates and visible used threshold.
- B085: recommendation runs consume immutable P0-B1 `investable_run_id`; canonical formula recomputation count is zero.
- B086: rule version, canonical amount, threshold, difference, impact, alternative and source run are visible; helpful/later/dismissed/done feedback is AAL2 and cooldown is bounded.
- B087: monthly review fixes `report_version_id` and `investable_run_id`; historical links are database-protected from reassignment.
- B088: report → budget → goals → investments → recommendations checklist and decision are completed in one focused flow.
- B089: desktop P0-B decision surface composes planning, investment and explainable advice.
- B090: exact snapshot, threshold boundary and 200-case property tests avoid JavaScript floating point.
- B091: UAT-08–11 and UAT-14 plus planning/investment regression chain.

## Evidence

- PR #29: B083–B085, 10/10 CI PASS, merge `1877aef7a6adc2f0ec2f27cfefdedde7b815697b`.
- PR #30: B086–B090 product slice, 10/10 CI PASS, merge `ebe38baa69b7b1b8e3419cf6f2c120bb830b8dd2`.
- PostgreSQL 17.6 acceptance: registry 15/15; effective history and stale If-Match rejection; canonical run identity; idempotency; cross-user result 0; feedback/cooldown; immutable review source link negative.
- Fresh migration and two resets: checksum `998787558c5f0eca306f3996ebbfce925f4e675e58538a9efa606547ddd8d226` twice, schema drift 0.
- `pnpm check`: 127 unit tests, exact 200-case recommendation property, OpenAPI lint/bundle/breaking, typecheck, build, secret/runtime/fixture scans PASS.
- UAT-14 browser scenario verifies rule version, used threshold, difference, alternative, canonical source run and feedback intent. Final CI result is recorded by this gate PR.

## Security and scope

- Recommendation settings, runs, recommendations and monthly reviews use forced owner RLS.
- Composite owner foreign keys prevent cross-user P0-B1/report evidence injection.
- Financial writes remain SERIALIZABLE; reviewed SQL migrations remain the sole schema authority.
- No production credential, remote Supabase/Vercel resource, real user or real financial data was created.

## Exit decision

G7 becomes **PASS** only after this evidence branch has all 10 required GitHub checks PASS and is merged to `main`. RC B092+ is not started by this gate.
