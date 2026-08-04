# Uygulama Durumu

- Güncellendi: 2026-08-04 14:06 TRT
- Son tamamlanan ana aşama: P0-A2 B037–B050; G4 ön kontrolü PASS
- Tamamlanan backlog maddeleri: B001–B053 main üzerinde; PR #17 head `9765007`
  10/10 CI PASS ile `ace0d72` olarak birleşti. P0-A3 B054–B056 çalışma branch'inde
  uygulanıp yerel kabul zincirinden geçti; CI/merge bekliyor.
- Devam eden backlog maddesi: P0-A3 B054–B056 aylık rapor aggregate/API/UI/versioning
- Henüz başlanmayan backlog maddeleri: B057–B104; P0-A3 kalan export/
  restore/delete/gate, P0-B1, P0-B2, P0-B3 ve RC
- Son doğrulanmış main SHA: `ace0d72cdce8828157df4b87a287b1be28826199`
- Güncel çalışma branch'i: `feat/p0-a3-monthly-reports`
- Açık PR: Yok; B054–B056 PR'ı yerel kapanıştan sonra açılacak.
- Son PASS sonuçları: PR #17 10/10 CI. PostgreSQL 17.6 üzerinde B054 UAT-13
  income/gross/refund/net/outflow/savings `5000/310/25/285/285/4715`,
  transfer/kart ödeme/yatırım/tahsilat çift sayım 0; B055 hesap/kategori
  filtresi, kırılım, trend ve dashboard aynı kanonik endpoint; B056 encrypted
  reason, watermark, checksum, v1 stale-preserve/live/v2 PASS. Fresh migration,
  iki reset checksum `22cc94f7c20bda1108af7629d4a90b74dd07c2a51e00dc5f782e3c646979b247`,
  drift 0; AAL1/AAL2 API, 110 unit ve tam `pnpm check` PASS.
- Son FAIL komutu ve kök nedeni: Bu dilimde FAIL yok. Önceki PR #17 browser
  canlı-bölge semantiği düzeltmesi yeni head'de Auth/browser PASS oldu. Yerel
  browser sistemde `libnspr4.so` bulunmadığı için açılamıyor; aynı browser zinciri
  GitHub CI'da çalışır.
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`,
  `00000000000001_m0_rls_harness.sql`; P0-A0 `20260801173000_p0_a0_ledger_kernel.sql`;
  P0-A1 `20260801212000_p0_a1_daily_core.sql`; P0-A2
  `20260801231500_p0_a2_card_flows.sql`, `20260801234500_p0_a2_subscriptions.sql`,
  `20260803000000_p0_a2_sharing_receivables.sql`; P0-A3
  `20260804130000_p0_a3_reconciliation_reversal.sql`,
  `20260804143000_p0_a3_monthly_reports.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser shared-library
  bağımlılığı browser kabulünü yalnız GitHub Ubuntu runner'ında doğrulatıyor.
  SQL migration tek şema otoritesidir; yeni ürün teknik borcu kaydedilmedi.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production kaynakları
  bilinçli olarak oluşturulmadı.
- Bir sonraki kesin adım: B054–B056 secret scan/diff kontrolü ve checkpoint
  commit'i; ardından PR CI 10/10 PASS ve merge, sonra B057–B060 export/restore/delete dilimi.
- Devam etmek için ilk komut: `git diff --check && pnpm security:secret-scan`

## Bağlayıcı kapılar

| Kapı                   | Durum      | Kanıt                                                       |
| ---------------------- | ---------- | ----------------------------------------------------------- |
| G1 Foundation          | PASS       | `docs/operations/gates/G1-foundation.md`                    |
| G2 P0-A0 Ledger Kernel | PASS       | `docs/operations/gates/G2-ledger-kernel.md`                 |
| P0-A1 / G3             | PASS       | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 CI 10/10   |
| P0-A2 / G4 ön kontrolü | PASS       | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#16    |
| P0-A3 / formal G4      | DEVAM      | B051–B053 CI PASS; B054–B056 local PASS; B057–B061 bekliyor |
| P0-B1                  | BAŞLANMADI | Formal G4 bağımlılığı                                       |
| P0-B2                  | BAŞLANMADI | P0-B1 gate bağımlılığı                                      |
| P0-B3                  | BAŞLANMADI | P0-B1 kanonik çıktısını tüketir                             |
| RC                     | BAŞLANMADI | Önceki kapılar sonrasında                                   |
