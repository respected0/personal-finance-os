# Uygulama Durumu

- Güncellendi: 2026-08-01 23:34 TRT
- Son tamamlanan ana aşama: P0-A1 Daily Core (B025–B036; G3 PASS,
  PR #10 merged)
- Tamamlanan backlog maddeleri: B001–B036
- Devam eden backlog maddesi: P0-A2 B038/B039 kart harcaması ve kart ödemesi
  web akışı; B037/B040/B041 backend dilimi branch üzerinde tamamlandı
- Henüz başlanmayan backlog maddeleri: B042–B104
- Son doğrulanmış main SHA: `887b075a2a5a556c3cea1a86eaa0a6f92410f6f2`
- Güncel çalışma branch'i: `feat/p0-a2-card-flows`
- Açık PR: Yok; P0-A2 kart backend dilimi PR'a hazır
- Son PASS sonuçları: `pnpm check`; 105 unit test; OpenAPI 3.1
  lint/bundle/main breaking diff; P0-A0 ledger regresyonu UAT 16/16 ve INV-01–10;
  P0-A1 gerçek DB ve BFF/Auth/TOTP kabulü; desktop + 390×844 gerçek Chromium
  preview/commit/history/dashboard kabulü; Auth ve RLS regresyonu;
  fresh migration; iki reset checksum
  `8f79bd27f9d72ae77a1fe417a47cfd5ac8296b3d362bb78e943cce90861758a0`;
  P0-A2 gerçek DB UAT03/UAT04 ve B037/B040/B041 PASS; fresh migration ve iki
  reset checksum
  `0e4e12fcc30fb6f6c5cd395538f065d61f330833b23532f484839616d3c0aee0`;
  schema drift 0; PostgreSQL 17.6; Supabase CLI 2.110.0; secret scan 0
- Son FAIL komutu ve kök nedeni: İlk P0-A2 DB kabulünde runtime rolünün
  `valid_minimum_payment_rule` constraint yardımcısını çalıştırma izni yoktu;
  dar `pfos_runtime` EXECUTE grant'i eklendi. İkinci denemede taksit satırı UUID'si
  için `extensions` şemasına erişim gerekiyordu; UUID uygulamada üretildi. Üçüncü
  denemede ortak deferred trigger fonksiyonunun `CASE` ifadesi iki farklı NEW
  record alanını birlikte çözümledi; tabloya göre `IF` dalına ayrıldı. Sonraki
  gerçek PostgreSQL akışı tamamen PASS.
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`,
  `00000000000001_m0_rls_harness.sql`; P0-A0
  `20260801173000_p0_a0_ledger_kernel.sql`; P0-A1
  `20260801212000_p0_a1_daily_core.sql`; P0-A2
  `20260801231500_p0_a2_card_flows.sql`
- Bilinen teknik borç ve uyarılar: Next.js middleware deprecation warning G1'den
  beri değişmedi. P0-A2 görünür ara kontrol formal G4 değildir; formal G4 P0-A3
  sonunda kapanır.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok
- Bir sonraki kesin adım: Kart backend dilimini commit/PR/CI ile main'e al;
  ardından B038/B039 mobile-first kart harcaması/ödemesi UI ve browser kabulünü
  uygula
- Devam etmek için ilk komut: `git diff --check && git status --short --branch`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                                                                |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------ |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`                                             |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`; INV-01–10, UAT motor+DB 16/16, CI 10/10 |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 CI 10/10 ve main merge PASS         |
| P0-A2                  | DEVAM EDİYOR | B037/B040/B041 DB PASS; UAT03/UAT04 backend PASS; B038/B039 web akışı sırada         |
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
