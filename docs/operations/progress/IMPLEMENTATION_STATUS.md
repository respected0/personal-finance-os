# Uygulama Durumu

- Güncellendi: 2026-08-04 16:20 TRT
- Son tamamlanan ana aşama: P0-A3 B051–B061/formal G4; P0-B1 B062–B067 main üzerinde PASS.
- Tamamlanan backlog maddeleri: B001–B067 main üzerinde; PR #21 10/10 CI PASS ile
  `a6aab8dfd682ebafd415347779c1d57e8f543784` olarak birleşti.
- Devam eden backlog maddesi: B068–B072 expected payment, tam bir kez realization ve kanonik yatırılabilir tutar.
- Henüz başlanmayan backlog maddeleri: B073–B104; P0-B2, P0-B3 ve
  RC. RC bu görevde başlatılmayacak.
- Son doğrulanmış main SHA: `a6aab8dfd682ebafd415347779c1d57e8f543784`
- Güncel çalışma branch'i: `feat/p0-b1-expected-investable`
- Açık PR: Yok; B068–B072 doğrulaması sonrası açılacak.
- Son PASS sonuçları: `pnpm check` (118 unit), OpenAPI additive diff, secret/runtime scan, B062–B072 gerçek PostgreSQL, RLS ve lifecycle PASS. Fresh migration ve iki reset checksum `186931110f4d76515e618578556944500b20af651a6ccd3ed9e499af36c99afb`, drift 0. Expected/doubtful dahil edilen tutar 0; canonical 600.0000 sentetik senaryo; exactly-once realization/replay/conflict PASS.
- Son FAIL komutu ve kök nedeni: PR #22 ilk head `auth / integration` mobil akışı, desktop UAT-09'un gerçekleştirdiği 5.000 TRY geliri eski net-servet fixture beklentisine eklemiyordu. Ürün davranışı doğruydu; mobil ardışık senaryo beklentileri +5.000 TRY olarak düzeltildi. Yerel browser host `libnspr4.so` eksikliğiyle çalışmıyor.
- Oluşturulan migration'lar: Öncekilere ek P0-B1 `20260804173000_p0_b1_budget_goals.sql` ve `20260804190000_p0_b1_expected_investable.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser `libnspr4.so` eksikliği
  nedeniyle yeni B064/B065/UAT-11 browser akışı GitHub Ubuntu runner’ında
  doğrulanacak. `goal_allocations.instrument_id` P0-B2 instrument registry için
  ayrıldı ve B073 gelene kadar DB tarafından fail-closed reddediliyor.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production kaynakları
  bilinçli olarak oluşturulmadı.
- Bir sonraki kesin adım: B068–B072 tam check, migration/reset/drift ve security zincirini tamamla; commit/push/PR/10-of-10 CI/merge ile G5'i kapat, B073'e geç.
- Devam etmek için ilk komut: `git diff --check && pnpm check`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                                    |
| ---------------------- | ------------ | -------------------------------------------------------- |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`                 |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`              |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10         |
| P0-A2 / G4 ön kontrolü | PASS         | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#16 |
| P0-A3 / formal G4      | PASS         | `docs/operations/gates/G4-p0-a-complete.md`; PR #20      |
| P0-B1 / G5             | DEVAM EDİYOR | B062–B067 main; B068–B072 yerel PostgreSQL PASS          |
| P0-B2 / G6             | BAŞLANMADI   | G5 bağımlılığı                                           |
| P0-B3 / G7             | BAŞLANMADI   | P0-B1 canonical investable sonucu bağımlılığı            |
| RC                     | BAŞLANMADI   | PRE-RC denetimi öncesinde başlatılmayacak                |
