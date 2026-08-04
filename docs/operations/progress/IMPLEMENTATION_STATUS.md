# Uygulama Durumu

- Güncellendi: 2026-08-04 15:06 TRT
- Son tamamlanan ana aşama: P0-A3 B051–B060 ürün kapsamı main üzerinde; B061
  formal G4 kanıtı çalışma branch'inde PASS
- Tamamlanan backlog maddeleri: B001–B060 main üzerinde. PR #19 B057–B060
  secure data lifecycle dilimini 10/10 CI PASS ile
  `b3cf7ae4a0c2d3b7733d8bae9766d906d445f9b2` olarak birleştirdi. B061 formal
  P0-A QA paketi oluşturuldu.
- Devam eden backlog maddesi: B061 gate kanıtının PR/CI/merge kapanışı
- Henüz başlanmayan backlog maddeleri: B062–B104; P0-B1, P0-B2, P0-B3 ve RC
- Son doğrulanmış main SHA: `b3cf7ae4a0c2d3b7733d8bae9766d906d445f9b2`
- Güncel çalışma branch'i: `docs/p0-a3-formal-g4`
- Açık PR: Yok; B061 gate kanıtı commit/push sonrasında açılacak.
- Son PASS sonuçları: PR #19 10/10 CI. Database job fresh migration, iki eşit
  checksum `d1543af423b85834d9be298396be2db3dcb6c9baabafac569c74a992cb75349b`,
  drift 0, ledger UAT 16/16, daily/card/subscription/sharing/reconciliation/report/
  data-lifecycle acceptance PASS. Auth job gerçek Chromium desktop+390×844
  UAT-01/02/03/04/05/06/07/12/13/15/16 PASS. RLS, OpenAPI, fixture, unit,
  format, lint, typecheck ve secret-scan PASS. B061 formal G4 incelemesi kritik/
  yüksek açık `0` sonucuyla PASS.
- Son FAIL komutu ve kök nedeni: PR #19 güncel head'inde FAIL yok. B057–B060
  geliştirme sırasında JSON binding, snapshot ve token-storage sınırı hataları
  minimum düzeltmelerden sonra tam CI'da PASS oldu.
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`,
  `00000000000001_m0_rls_harness.sql`; P0-A0 `20260801173000_p0_a0_ledger_kernel.sql`;
  P0-A1 `20260801212000_p0_a1_daily_core.sql`; P0-A2
  `20260801231500_p0_a2_card_flows.sql`, `20260801234500_p0_a2_subscriptions.sql`,
  `20260803000000_p0_a2_sharing_receivables.sql`; P0-A3
  `20260804130000_p0_a3_reconciliation_reversal.sql`,
  `20260804143000_p0_a3_monthly_reports.sql`,
  `20260804160000_p0_a3_data_lifecycle.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser `libnspr4.so` eksikliği
  nedeniyle browser kabulü GitHub Ubuntu runner'ında doğrulanır. UAT-09 G4
  kapsamı ledger oracle/INV-08'dir; persistent expected-payment CRUD ve kanonik
  investable amount bağlayıcı sırayla B068–B072 P0-B1'de kalır.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production kaynakları
  bilinçli olarak oluşturulmadı.
- Bir sonraki kesin adım: B061 gate belgesini commit et, push/PR aç, 10/10 CI
  PASS sonrası merge et; güncel main'den P0-B1 B062–B072 kapsamını çıkar.
- Devam etmek için ilk komut: `git diff --check && pnpm check`

## Bağlayıcı kapılar

| Kapı                   | Durum      | Kanıt                                                       |
| ---------------------- | ---------- | ----------------------------------------------------------- |
| G1 Foundation          | PASS       | `docs/operations/gates/G1-foundation.md`                    |
| G2 P0-A0 Ledger Kernel | PASS       | `docs/operations/gates/G2-ledger-kernel.md`                 |
| P0-A1 / G3             | PASS       | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 CI 10/10   |
| P0-A2 / G4 ön kontrolü | PASS       | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#16    |
| P0-A3 / formal G4      | PASS/PR    | `docs/operations/gates/G4-p0-a-complete.md`; merge bekliyor |
| P0-B1                  | BAŞLANMADI | Formal G4 kanıt merge bağımlılığı                           |
| P0-B2                  | BAŞLANMADI | P0-B1 gate bağımlılığı                                      |
| P0-B3                  | BAŞLANMADI | P0-B1 kanonik çıktısını tüketir                             |
| RC                     | BAŞLANMADI | Önceki kapılar sonrasında                                   |
