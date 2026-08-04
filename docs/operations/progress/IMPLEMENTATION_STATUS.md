# Uygulama Durumu

- Güncellendi: 2026-08-04 20:02 TRT
- Son tamamlanan ana aşama: P0-B2 B073–B082 ve formal G6; PR #24–#28 10/10 CI PASS.
- Tamamlanan backlog maddeleri: B001–B085 main üzerinde; PR #29 10/10 PASS.
- Devam eden backlog maddesi: B091 formal G7 ve UAT-14 browser kanıtı.
- Henüz başlanmayan backlog maddeleri: B092–B104 RC. RC bu görevde başlatılmayacak.
- Son doğrulanmış main SHA: `1877aef7a6adc2f0ec2f27cfefdedde7b815697b`
- Güncel çalışma branch'i: `test/p0-b3-uat14-g7`
- Açık PR: UAT-14/G7 commit sonrasında açılacak.
- Son PASS sonuçları: PR #29 10/10 CI. B086–B090 `pnpm check` (127 unit + 200 property boundary), OpenAPI 3.1 lint/bundle/breaking, secret/runtime/fixture ve gerçek PostgreSQL feedback/review acceptance PASS. Fresh migration + iki reset checksum `998787558c5f0eca306f3996ebbfce925f4e675e58538a9efa606547ddd8d226`, drift 0.
- Son FAIL komutu ve kök nedeni: İlk recommendation stack reset'i seed allow-list'inde yeni reference/product tabloları olmadığı için reddedildi; allow-list yalnız tabloları tanıyacak, ürün satırlarını yine yasaklayacak biçimde genişletildi. Sonraki koşuda immutable planning run üzerinde `FOR SHARE` runtime UPDATE ayrıcalığı gerektirdi; immutable kaynağa gereksiz kilit kaldırıldı, ayrıcalık genişletilmedi. Son gerçek PostgreSQL koşusu PASS.
- Oluşturulan migration'lar: `20260804213000_p0_b2_instrument_prices.sql`; `20260804230000_p0_b2_investment_trades_lots.sql`; devam eden `20260805000000_p0_b3_recommendations.sql`.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser shared-library eksikliği nedeniyle B082 browser kanıtı CI'da kapanır. Production kaynakları bilinçli olarak oluşturulmadı.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok.
- Bir sonraki kesin adım: UAT-14 browser/G7 kanıtını `pnpm check`, PR ve 10/10 CI ile main'e al; ardından PRE-RC audit yap.
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
