# Uygulama Durumu

- Güncellendi: 2026-08-01 22:34 TRT
- Son tamamlanan ana aşama: P0-A0 Ledger Kernel (G2 PASS; PR #8 merged)
- Tamamlanan backlog maddeleri: B001–B024
- Devam eden backlog maddesi: P0-A1 B025–B036; backend/API dilimi B025–B029,
  B032 ve B034 için uygulama ve yerel kabul PASS, UI/E2E dilimi bekliyor
- Henüz başlanmayan backlog maddeleri: B030–B031, B033, B035–B104
- Son doğrulanmış main SHA: `b58c1d8a202a4ec4455ae97b1c6ea5a4c4a09083`
- Güncel çalışma branch'i: `feat/p0-a1-daily-core-backend`
- Açık PR: #9; backend/API dilimi, ilk temiz-runner build düzeltmesi yerelde
  doğrulanıyor
- Son PASS sonuçları: `pnpm check`; 100 unit test; OpenAPI 3.1
  lint/bundle/main breaking diff; P0-A0 ledger regresyonu UAT 16/16 ve INV-01–10;
  P0-A1 gerçek DB kabulü; gerçek BFF/Auth/TOTP kabulü; Auth ve RLS regresyonu;
  fresh migration; iki reset checksum
  `8f79bd27f9d72ae77a1fe417a47cfd5ac8296b3d362bb78e943cce90861758a0`;
  schema drift 0; PostgreSQL 17.6; Supabase CLI 2.110.0; secret scan 0
- Son FAIL komutu ve kök nedeni: PR #9 ilk `auth / integration` CI çalışmasında
  temiz runner'da workspace `dist` çıktıları henüz yokken doğrudan `next build`
  çalıştırdığı için `@personal-finance-os/db` ve domain çözümleyemedi; web build
  scripti kendi workspace build öncüllerini çalıştıracak şekilde düzeltildi.
  Daha önce `pnpm daily:api:integration` ilk denemelerinde
  proxy origin karşılaştırması ve test cookie'sinin bağlayıcı `pfos_session` adını
  kullanmaması nedeniyle 403/401 üretti; host-origin doğrulaması ve aynı cookie
  politikasıyla düzeltildi, tekrar PASS. Profil ekinden sonraki ilk `db:smoke`,
  seed allowlist'inde `profiles` eksikliği nedeniyle FAIL oldu; seed guard
  genişletildi ve iki-reset drift akışı PASS oldu.
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`,
  `00000000000001_m0_rls_harness.sql`; P0-A0
  `20260801173000_p0_a0_ledger_kernel.sql`; P0-A1
  `20260801212000_p0_a1_daily_core.sql`
- Bilinen teknik borç ve uyarılar: Next.js middleware deprecation warning G1'den
  beri değişmedi. P0-A1 gate, bağlayıcı dinamik form/history/dashboard ve
  desktop+390×844 E2E tamamlanmadan PASS sayılmayacak.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok
- Bir sonraki kesin adım: PR #9 düzeltmesini push et, zorunlu CI kontrollerinin
  tamamını doğrula ve main'e birleştir; ardından P0-A1 UI/E2E branch'i aç
- Devam etmek için ilk komut: `git status --short --branch && gh pr checks 9`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                                                                |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------ |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`                                             |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`; INV-01–10, UAT motor+DB 16/16, CI 10/10 |
| P0-A1                  | DEVAM EDİYOR | Backend/API/DB yerel kabul PASS; B030–B031, B033, B035–B036 ve G3 bekliyor           |
| P0-A2                  | BAŞLANMADI   | Bağlayıcı bağımlılık sırasında                                                       |
| P0-A3                  | BAŞLANMADI   | Bağlayıcı bağımlılık sırasında                                                       |
| P0-B1                  | BAŞLANMADI   | Bağlayıcı bağımlılık sırasında                                                       |
| P0-B2                  | BAŞLANMADI   | Bağlayıcı bağımlılık sırasında                                                       |
| P0-B3                  | BAŞLANMADI   | P0-B1 çıktısını tüketir                                                              |
| RC                     | BAŞLANMADI   | Önceki kapılar sonrasında                                                            |

## P0-A0 bağlayıcı kapsam özeti

- B011–B015: decimal Money, TR ayrıştırıcı/biçimlendirici, typed command union, sistem ledger rolleri ve saf posting motoru.
- B016–B023: transactions/postings şeması, deferred denge, posted immutability, idempotency, preview/commit, append-only audit ve transactional outbox.
- B024: property/invariant test paketi; INV-01–10 ve 16 UAT finans kuralı için motor+DB kanıtı.
- Doğrudan yeni dependency: `fast-check@4.9.0` (exact).
