# Uygulama Durumu

- Güncellendi: 2026-08-04 18:36 TRT
- Son tamamlanan ana aşama: P0-B2 B073–B082; ürün PR #24–#27 10/10 CI PASS. Formal G6 kanıt PR'ı devam ediyor.
- Tamamlanan backlog maddeleri: B001–B082 main üzerinde.
- Devam eden backlog maddesi: P0-B2 formal G6 gate kanıtı.
- Henüz başlanmayan backlog maddeleri: B083–B104; P0-B3 ve RC. RC bu görevde başlatılmayacak.
- Son doğrulanmış main SHA: `4e680acb1e19845ee4de1b5a3f3af44cbe958ebb`
- Güncel çalışma branch'i: `docs/p0-b2-g6-gate`
- Açık PR: Formal G6 kanıt commit/push sonrasında açılacak.
- Son PASS sonuçları: PR #27 10/10 CI; `auth / integration` UAT-10 desktop/mobile ve `database / migration-smoke` yatırım acceptance PASS. `pnpm check` (123 unit), OpenAPI, secret/runtime/fixture; gerçek PostgreSQL B073–B077 ve B081 SERIALIZABLE/FOR UPDATE tek-kazanan/partial-state 0; fresh migration ve iki reset checksum `4a233b3e282a588d5acff69e1402af1edbefd3c759f3041ab162b8b2b90d2644`, drift 0; RLS/lifecycle PASS.
- Son FAIL komutu ve kök nedeni: PR #27 ikinci browser çalışması mobil sık-gider senaryosunda yatırım alımı öncesindeki eski banka bakiyesini bekliyordu; canonical nakit bakiyesi UAT-10 alımından sonra 1.320,00 TRY azalarak 22.060,00 TRY oldu. Mobil preview kanıtı doğru yeni nakit bakiyesi 22.047,66 TRY olarak güncellendi. İlk çalışmadaki stale üst özet ürün callback'i de düzeltildi.
- Oluşturulan migration'lar: `20260804213000_p0_b2_instrument_prices.sql`; `20260804230000_p0_b2_investment_trades_lots.sql`. Bu dilimde yeni migration gerekmiyor.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser shared-library eksikliği nedeniyle B082 browser kanıtı CI'da kapanır. Production kaynakları bilinçli olarak oluşturulmadı.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok.
- Bir sonraki kesin adım: G6 kanıtını commit/push/PR/10-of-10 CI ile main'e al; B083–B091 P0-B3 kapsamını bağlayıcı belgeden çıkar.
- Devam etmek için ilk komut: `git diff --check && git status --short --branch`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                            |
| ---------------------- | ------------ | ------------------------------------------------ |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`         |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`      |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 |
| P0-A2 / G4 ön kontrolü | PASS         | `docs/operations/gates/G4-p0-a2-precheck.md`     |
| P0-A3 / formal G4      | PASS         | `docs/operations/gates/G4-p0-a-complete.md`; #20 |
| P0-B1 / G5             | PASS         | PR #21–#23; `G5-p0-b-planning.md`                |
| P0-B2 / G6             | DEVAM EDİYOR | PR #24–#27 PASS; formal gate kanıt branch'i      |
| P0-B3 / G7             | BAŞLANMADI   | G6 ve P0-B1 canonical investable sonucu bağımlı  |
| RC                     | BAŞLANMADI   | PRE-RC denetimi öncesinde başlatılmayacak        |
