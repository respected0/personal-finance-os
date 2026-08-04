# Uygulama Durumu

- Güncellendi: 2026-08-04 15:41 TRT
- Son tamamlanan ana aşama: P0-A3 B051–B061 ve formal G4 main üzerinde PASS.
- Tamamlanan backlog maddeleri: B001–B061 main üzerinde. PR #20 formal G4
  kanıtını 10/10 CI PASS ile `1712869160c2e46700b8cd44da51fb8ccf388c1d`
  olarak birleştirdi. B062–B067 yerel acceptance seviyesinde tamamlandı.
- Devam eden backlog maddesi: B062–B067 commit/push/PR/CI/merge kapanışı.
- Henüz başlanmayan backlog maddeleri: B068–B104; P0-B1 kalan, P0-B2, P0-B3 ve
  RC. RC bu görevde başlatılmayacak.
- Son doğrulanmış main SHA: `1712869160c2e46700b8cd44da51fb8ccf388c1d`
- Güncel çalışma branch'i: `feat/p0-b1-budget-goal-planning`
- Açık PR: Yok; B062–B067 commit/push sonrasında açılacak.
- Son PASS sonuçları: B062–B067 typed/static kapı ve `pnpm check` (115 unit)
  PASS. Gerçek PostgreSQL bütçe actual projection, RLS cross-user 0, şifreli goal
  title, UAT-11 ledger/bakiye/NW etkisi 0 ve eşzamanlı iki tahsiste tek bounded
  winner PASS. Fresh migration, iki reset, eşit checksum
  `3daee384e6459e8e05fc161e3838ca390d47f84387bff475bdb686e25d819b8b`,
  drift 0. Data lifecycle/export restore, OpenAPI, secret/runtime scans PASS.
- Son FAIL komutu ve kök nedeni: `pnpm planning:integration` ilk çalışmada seed
  whitelist yeni tabloları reddetti; güvenli whitelist/sıfır-row kontrolü
  güncellendi. İlk OpenAPI diff’te export schemaVersion 18 breaking bulundu;
  archive formatı 17’de tutuldu. Yeniden testler PASS.
- Oluşturulan migration'lar: Önceki M0/P0-A migration’larına ek olarak P0-B1
  `20260804173000_p0_b1_budget_goals.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser `libnspr4.so` eksikliği
  nedeniyle yeni B064/B065/UAT-11 browser akışı GitHub Ubuntu runner’ında
  doğrulanacak. `goal_allocations.instrument_id` P0-B2 instrument registry için
  ayrıldı ve B073 gelene kadar DB tarafından fail-closed reddediliyor.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production kaynakları
  bilinçli olarak oluşturulmadı.
- Bir sonraki kesin adım: browser değişikliğiyle tam check’i yenile, B062–B067’yi
  commit/push/PR yap, 10/10 CI PASS sonrası merge et; B068–B072’ye geç.
- Devam etmek için ilk komut: `git diff --check && pnpm check`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                                    |
| ---------------------- | ------------ | -------------------------------------------------------- |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`                 |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`              |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10         |
| P0-A2 / G4 ön kontrolü | PASS         | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#16 |
| P0-A3 / formal G4      | PASS         | `docs/operations/gates/G4-p0-a-complete.md`; PR #20      |
| P0-B1 / G5             | DEVAM EDİYOR | B062–B067 yerel PASS; PR/CI bekliyor                     |
| P0-B2 / G6             | BAŞLANMADI   | G5 bağımlılığı                                           |
| P0-B3 / G7             | BAŞLANMADI   | P0-B1 canonical investable sonucu bağımlılığı            |
| RC                     | BAŞLANMADI   | PRE-RC denetimi öncesinde başlatılmayacak                |
