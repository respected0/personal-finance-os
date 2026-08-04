# Uygulama Durumu

- Güncellendi: 2026-08-04 19:38 TRT
- Son tamamlanan ana aşama: P0-B2 B073–B082 ve formal G6; PR #24–#28 10/10 CI PASS.
- Tamamlanan backlog maddeleri: B001–B082 main üzerinde.
- Devam eden backlog maddesi: P0-B3 B083–B085 versioned recommendation registry/settings/consumer engine.
- Henüz başlanmayan backlog maddeleri: B086–B104; P0-B3 UI/review/gate ve RC. RC bu görevde başlatılmayacak.
- Son doğrulanmış main SHA: `82c483adecd91e4b2962640e7629eee234bf3106`
- Güncel çalışma branch'i: `feat/p0-b3-recommendation-engine`
- Açık PR: Yok; B083–B085 tam yerel kapıdan sonra açılacak.
- Son PASS sonuçları: PR #28 10/10 CI ve formal G6 PASS. B083–B085 `pnpm check` (126 unit), OpenAPI 3.1 lint/bundle/breaking, migration policy (15 SQL), secret/runtime/fixture taramaları ve gerçek PostgreSQL acceptance PASS. Fresh migration + iki reset checksum `2afe45a905c9de8a5503176535ec6434adad7269248cf07f087ed2c5ada852fb`, drift 0; exact R-01–R-15 registry, effective threshold history/stale If-Match, canonical `investable_run_id` tüketimi, exact evidence/idempotency/cross-user RLS PASS.
- Son FAIL komutu ve kök nedeni: İlk recommendation stack reset'i seed allow-list'inde yeni reference/product tabloları olmadığı için reddedildi; allow-list yalnız tabloları tanıyacak, ürün satırlarını yine yasaklayacak biçimde genişletildi. Sonraki koşuda immutable planning run üzerinde `FOR SHARE` runtime UPDATE ayrıcalığı gerektirdi; immutable kaynağa gereksiz kilit kaldırıldı, ayrıcalık genişletilmedi. Son gerçek PostgreSQL koşusu PASS.
- Oluşturulan migration'lar: `20260804213000_p0_b2_instrument_prices.sql`; `20260804230000_p0_b2_investment_trades_lots.sql`; devam eden `20260805000000_p0_b3_recommendations.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser shared-library eksikliği nedeniyle B082 browser kanıtı CI'da kapanır. Production kaynakları bilinçli olarak oluşturulmadı.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok.
- Bir sonraki kesin adım: B083–B085 tam `pnpm check`, DB smoke/reset/drift ve security taramalarını kapat; commit/push/PR ve 10/10 CI sonrası merge et.
- Devam etmek için ilk komut: `pnpm check`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                            |
| ---------------------- | ------------ | ------------------------------------------------ |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`         |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`      |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10 |
| P0-A2 / G4 ön kontrolü | PASS         | `docs/operations/gates/G4-p0-a2-precheck.md`     |
| P0-A3 / formal G4      | PASS         | `docs/operations/gates/G4-p0-a-complete.md`; #20 |
| P0-B1 / G5             | PASS         | PR #21–#23; `G5-p0-b-planning.md`                |
| P0-B2 / G6             | PASS         | PR #24–#28; `G6-p0-b-investment.md`              |
| P0-B3 / G7             | DEVAM EDİYOR | B083–B085 branch; PostgreSQL acceptance PASS     |
| RC                     | BAŞLANMADI   | PRE-RC denetimi öncesinde başlatılmayacak        |
