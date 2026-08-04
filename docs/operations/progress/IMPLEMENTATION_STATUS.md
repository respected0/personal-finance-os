# Uygulama Durumu

- Güncellendi: 2026-08-04 13:29 TRT
- Son tamamlanan ana aşama: P0-A2 B037–B050; G4 ön kontrolü PASS
- Tamamlanan backlog maddeleri: B001–B050 main üzerinde. P0-A3 B051–B053
  çalışma branch'inde uygulanıp yerel kabul zincirinden geçti; CI/merge bekliyor.
- Devam eden backlog maddesi: P0-A3 B051–B053 reconciliation ve immutable
  reversal diliminin PR/CI kapanışı
- Henüz başlanmayan backlog maddeleri: B054–B104; P0-A3 kalan rapor/export/
  restore/delete/gate, P0-B1, P0-B2, P0-B3 ve RC
- Son doğrulanmış main SHA: `e7809b187429877ddb0c025feb864e28b41e8dbe`
- Güncel çalışma branch'i: `feat/p0-a3-reconciliation-reversal`
- Açık PR: Yok; B051–B053 PR'ı yerel kapanıştan sonra açılacak.
- Son PASS sonuçları: PostgreSQL 17.6 üzerinde B051 exact stated-calculated
  snapshot, cross-user negatif, B052 encrypted reason, accepted/adjustment/
  missing-transaction UAT-12, `SERIALIZABLE`/`FOR UPDATE` concurrency, B053
  immutable exact void/revise ve DB negatifleri PASS. AAL1 write rejection,
  AAL2 API, owner/original-posting injection rejection PASS. Fresh migration,
  iki reset checksum `5e990c89861690d002ed5564a3080abf3a33c2399db0c88b2bb853dcd49d26c0`,
  drift 0; 110 unit ve tam `pnpm check` PASS.
- Son FAIL komutu ve kök nedeni: İlk `pnpm db:smoke`, P0-A3 tabloları seed
  güvenlik beyaz listesine henüz eklenmediği için `LegacyMigrationSeedError`
  verdi; seed veri eklemeden üç yeni tabloyu sıfır-satır politikasıyla kabul
  edecek şekilde düzeltildi ve smoke PASS oldu. Yerel browser ayrıca sistemde
  `libnspr4.so` bulunmadığı için açılamıyor; aynı browser zinciri CI'da çalışır.
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`,
  `00000000000001_m0_rls_harness.sql`; P0-A0 `20260801173000_p0_a0_ledger_kernel.sql`;
  P0-A1 `20260801212000_p0_a1_daily_core.sql`; P0-A2
  `20260801231500_p0_a2_card_flows.sql`, `20260801234500_p0_a2_subscriptions.sql`,
  `20260803000000_p0_a2_sharing_receivables.sql`; P0-A3
  `20260804130000_p0_a3_reconciliation_reversal.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser shared-library
  bağımlılığı browser kabulünü yalnız GitHub Ubuntu runner'ında doğrulatıyor.
  SQL migration tek şema otoritesidir; yeni ürün teknik borcu kaydedilmedi.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production kaynakları
  bilinçli olarak oluşturulmadı.
- Bir sonraki kesin adım: B051–B053 secret scan/diff kontrolü ve checkpoint
  commit'i; ardından PR CI 10/10 PASS ve merge, sonra B054–B056 raporlama dilimi.
- Devam etmek için ilk komut: `git diff --check && pnpm security:secret-scan`

## Bağlayıcı kapılar

| Kapı                   | Durum      | Kanıt                                                     |
| ---------------------- | ---------- | --------------------------------------------------------- |
| G1 Foundation          | PASS       | `docs/operations/gates/G1-foundation.md`                  |
| G2 P0-A0 Ledger Kernel | PASS       | `docs/operations/gates/G2-ledger-kernel.md`               |
| P0-A1 / G3             | PASS       | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 CI 10/10 |
| P0-A2 / G4 ön kontrolü | PASS       | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#16  |
| P0-A3 / formal G4      | DEVAM      | B051–B053 local PASS; B054–B061 ve CI/merge bekliyor      |
| P0-B1                  | BAŞLANMADI | Formal G4 bağımlılığı                                     |
| P0-B2                  | BAŞLANMADI | P0-B1 gate bağımlılığı                                    |
| P0-B3                  | BAŞLANMADI | P0-B1 kanonik çıktısını tüketir                           |
| RC                     | BAŞLANMADI | Önceki kapılar sonrasında                                 |
