# Uygulama Durumu

- Güncellendi: 2026-08-04 17:36 TRT
- Son tamamlanan ana aşama: P0-B1 B062–B072 / G5 PASS.
- Tamamlanan backlog maddeleri: B001–B073 main üzerinde. B073 PR #24 10/10 CI PASS ile birleşti.
- Devam eden backlog maddesi: P0-B2 B074–B075 — atomik yatırım alımı, ledger ve ücret dahil maliyet lotu.
- Henüz başlanmayan backlog maddeleri: B076–B104; P0-B2'nin kalanı, P0-B3 ve RC. RC bu görevde başlatılmayacak.
- Son doğrulanmış main SHA: `b3037361079460a59839f8001db508a98edd5156`
- Güncel çalışma branch'i: `feat/p0-b2-investment-buy-lots`
- Açık PR: Yok; B074–B075 doğrulaması tamamlandıktan sonra açılacak.
- Son PASS sonuçları: B073 PR #24 10/10 CI; B074–B075 `pnpm check` (122 unit), OpenAPI additive diff, secret/runtime/browser-storage taramaları; gerçek PostgreSQL atomik buy+ledger+lot, expense/income/net-worth 0, fee-inclusive cost, idempotency ve invalid-instrument rollback PASS. Fresh migration ve iki reset checksum `4a233b3e282a588d5acff69e1402af1edbefd3c759f3041ab162b8b2b90d2644`, drift 0; genel RLS ve lifecycle regresyonları PASS.
- Son FAIL komutu ve kök nedeni: İlk B074–B075 integration fixture sentetik institution audit çağrısında `requestId` vermediği için audit NOT NULL tarafından reddedildi. Fixture'a sentetik request kimlikleri eklendi; yeniden çalışma PASS. Yerel browser host `libnspr4.so` eksikliği eski çevre uyarısıdır; CI browser çalışmaktadır.
- Oluşturulan migration'lar: P0-B2 `20260804213000_p0_b2_instrument_prices.sql`; çalışma branch'inde `20260804230000_p0_b2_investment_trades_lots.sql`.
- Bilinen teknik borç ve uyarılar: `goal_allocations.instrument_id` B073 ile gerçek instrument registry'ye bağlanabilir hale geliyor; bağlayıcı allocation davranışı sonraki ilgili dilimde ele alınacak. Yerel Linux browser `libnspr4.so` eksikliği nedeniyle browser kabulü GitHub Ubuntu runner'ında doğrulanır.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production kaynakları bilinçli olarak oluşturulmadı.
- Bir sonraki kesin adım: B074–B075 tam check/migration/reset/drift/security zincirini tamamla; commit/push/PR/10-of-10 CI/merge et; B076–B077'ye geç.
- Devam etmek için ilk komut: `pnpm check`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                                    |
| ---------------------- | ------------ | -------------------------------------------------------- |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`                 |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`              |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10         |
| P0-A2 / G4 ön kontrolü | PASS         | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#16 |
| P0-A3 / formal G4      | PASS         | `docs/operations/gates/G4-p0-a-complete.md`; PR #20      |
| P0-B1 / G5             | PASS         | PR #21–#23; `G5-p0-b-planning.md`                        |
| P0-B2 / G6             | DEVAM EDİYOR | B073 PR #24; B074–B075 çalışma branch'i                  |
| P0-B3 / G7             | BAŞLANMADI   | P0-B1 canonical investable sonucu bağımlılığı            |
| RC                     | BAŞLANMADI   | PRE-RC denetimi öncesinde başlatılmayacak                |
