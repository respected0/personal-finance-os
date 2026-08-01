# Uygulama Durumu

- Güncellendi: 2026-08-01 21:00 TRT
- Son tamamlanan ana aşama: M0 Foundation (G1 PASS); P0-A0 local acceptance PASS, CI pending
- Tamamlanan backlog maddeleri: B001–B024 locally; B011–B024 await required PR CI
- Devam eden backlog maddesi: P0-A0 G2 GitHub PR/CI verification
- Henüz başlanmayan backlog maddeleri: P0-A1, P0-A2, P0-A3, P0-B1, P0-B2, P0-B3, RC
- Son doğrulanmış main SHA: `3904aa57df003071d35237c6eb67362d6c706076`
- Güncel çalışma branch'i: `feat/p0-a0-ledger-kernel`
- Açık PR: Yok; implementation commit and PR are the next step
- Son PASS sonuçları: `pnpm check`; domain coverage statements %99,31 / branches %98,24 / functions %100 / lines %99,30; UAT motor+DB 16/16; INV-01–10; fresh migration and reset drift; OpenAPI lint/bundle/breaking diff; exact dependency and CI policy checks
- Son FAIL komutu ve kök nedeni: Initial coverage `68.15%` branch due unexercised edge/negative branches; direct tests raised it to `98.24%`. Earlier local RLS role membership `42501`, trigger `42703` and seed guard failures were fixed and all related reruns PASS
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`, `00000000000001_m0_rls_harness.sql`; P0-A0 `20260801173000_p0_a0_ledger_kernel.sql`
- Bilinen teknik borç ve uyarılar: `financial_accounts` composite FK is owned by P0-A1 and is intentionally deferred; no P0-A1 table or behavior was added
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok
- Bir sonraki kesin adım: Final P0-A0 fresh/reset, ledger, RLS, secret and frozen-lock gates; then G2 evidence, commit, PR and CI
- Devam etmek için ilk komut: `pnpm db:smoke`

## Bağlayıcı kapılar

| Kapı                   | Durum                   | Kanıt                                                                                      |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| G1 Foundation          | PASS                    | `docs/operations/gates/G1-foundation.md`                                                   |
| G2 P0-A0 Ledger Kernel | LOCAL PASS / CI PENDING | `docs/operations/gates/G2-ledger-kernel.md`; INV-01–10, UAT motor+DB 16/16, float sınırı 0 |
| P0-A1                  | BAŞLANMADI              | G2 PASS sonrasında                                                                         |
| P0-A2                  | BAŞLANMADI              | Bağlayıcı bağımlılık sırasında                                                             |
| P0-A3                  | BAŞLANMADI              | Bağlayıcı bağımlılık sırasında                                                             |
| P0-B1                  | BAŞLANMADI              | Bağlayıcı bağımlılık sırasında                                                             |
| P0-B2                  | BAŞLANMADI              | Bağlayıcı bağımlılık sırasında                                                             |
| P0-B3                  | BAŞLANMADI              | P0-B1 çıktısını tüketir                                                                    |
| RC                     | BAŞLANMADI              | Önceki kapılar sonrasında                                                                  |

## P0-A0 bağlayıcı kapsam özeti

- B011–B015: decimal Money, TR ayrıştırıcı/biçimlendirici, typed command union, sistem ledger rolleri ve saf posting motoru.
- B016–B023: transactions/postings şeması, deferred denge, posted immutability, idempotency, preview/commit, append-only audit ve transactional outbox.
- B024: property/invariant test paketi; INV-01–10 ve 16 UAT finans kuralı için motor+DB kanıtı.
- Doğrudan yeni dependency: `fast-check@4.9.0` (exact).
