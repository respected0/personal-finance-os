# Uygulama Durumu

- Güncellendi: 2026-08-04 12:33 TRT
- Son tamamlanan ana aşama: P0-A2 B037–B050; G4 ön kontrolü PASS
- Tamamlanan backlog maddeleri: B001–B050 (`c216c23c07667f4bb478303bec438051bf4c8c0c` üzerinde)
- Devam eden backlog maddesi: P0-A3 B051 reconciliation snapshot/difference engine hazırlığı
- Henüz başlanmayan backlog maddeleri: B051–B104; P0-A3, P0-B1, P0-B2, P0-B3, RC
- Son doğrulanmış main SHA: `c216c23c07667f4bb478303bec438051bf4c8c0c`
- Güncel çalışma branch'i: `docs/p0-a2-g4-precheck`
- Açık PR: Yok. PR [#15](https://github.com/respected0/personal-finance-os/pull/15)
  head `f443a113653cc0fc0ee18202c9b321462ee4fcda` üzerinde 10/10 CI PASS ile
  `c216c23c07667f4bb478303bec438051bf4c8c0c` olarak main'e birleşti.
- Son PASS sonuçları: PR #14 ve #15 10/10 CI; PostgreSQL 17.6; Supabase CLI
  2.110.0; UAT-03–08; B048 `SERIALIZABLE`/`FOR UPDATE` concurrency; fresh
  migration, iki reset, eşit checksum, drift 0; Auth/RLS/OpenAPI/fixture/secret
  scan ve browser PASS. Geçici Node 24.18.0 + pnpm 11.18.0 ile frozen install ve
  tam `pnpm check` yerelde PASS.
- Son FAIL komutu ve kök nedeni: Yerel `pnpm daily:browser`, Chromium Linux
  runtime'ında `libnspr4.so` bulunmadığı için browser açılışından önce FAIL.
  Paket yükleme yönetici parolası gerektirdiğinden işletim sistemi değiştirilmedi.
  Aynı browser acceptance PR #15 izole GitHub Ubuntu runner'ında PASS; ürün kodu,
  fixture veya kanonik beklenti hatası yoktur.
- Oluşturulan migration'lar: M0 `00000000000000_m0_foundation.sql`,
  `00000000000001_m0_rls_harness.sql`; P0-A0 `20260801173000_p0_a0_ledger_kernel.sql`;
  P0-A1 `20260801212000_p0_a1_daily_core.sql`; P0-A2
  `20260801231500_p0_a2_card_flows.sql`, `20260801234500_p0_a2_subscriptions.sql`,
  `20260803000000_p0_a2_sharing_receivables.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser shared-library bağımlılığı
  yalnız CI ile doğrulanan browser testini yerelde çalıştırmayı engelliyor. SQL
  migration tek şema otoritesi olarak korunuyor; ürün teknik borcu kaydedilmedi.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production kaynakları
  bilinçli olarak oluşturulmadı.
- Bir sonraki kesin adım: P0-A3 B051 snapshot/difference engine bağlayıcı DB ve
  contract kapsamını çıkarıp ilk uygulama dilimini başlat.
- Devam etmek için ilk komut: `git fetch --prune origin && git switch main && git pull --ff-only`

## Bağlayıcı kapılar

| Kapı                   | Durum      | Kanıt                                                     |
| ---------------------- | ---------- | --------------------------------------------------------- |
| G1 Foundation          | PASS       | `docs/operations/gates/G1-foundation.md`                  |
| G2 P0-A0 Ledger Kernel | PASS       | `docs/operations/gates/G2-ledger-kernel.md`               |
| P0-A1 / G3             | PASS       | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 CI 10/10 |
| P0-A2 / G4 ön kontrolü | PASS       | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#15  |
| P0-A3 / formal G4      | BAŞLANMADI | B051–B061; P0-A2 ön kontrolü PASS                         |
| P0-B1                  | BAŞLANMADI | P0-A3 gate bağımlılığı                                    |
| P0-B2                  | BAŞLANMADI | P0-B1 gate bağımlılığı                                    |
| P0-B3                  | BAŞLANMADI | P0-B1 çıktısını tüketir                                   |
| RC                     | BAŞLANMADI | Önceki kapılar sonrasında                                 |
