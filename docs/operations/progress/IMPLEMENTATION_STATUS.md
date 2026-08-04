# Uygulama Durumu

- Güncellendi: 2026-08-04 17:17 TRT
- Son tamamlanan ana aşama: P0-B1 B062–B072 / G5 PASS.
- Tamamlanan backlog maddeleri: B001–B072 main üzerinde. G5 ürün PR'ları #21 ve #22, formal kanıt PR'ı #23; her üçü de 10/10 CI PASS.
- Devam eden backlog maddesi: P0-B2 B073 — instrument registry ve zaman damgalı manuel/reference fiyat geçmişi.
- Henüz başlanmayan backlog maddeleri: B074–B104; P0-B2'nin kalanı, P0-B3 ve RC. RC bu görevde başlatılmayacak.
- Son doğrulanmış main SHA: `c775d7e667de08db4f03e35ab34c546ee1c8e193`
- Güncel çalışma branch'i: `feat/p0-b2-instrument-prices`
- Açık PR: Yok; B073 doğrulaması tamamlandıktan sonra açılacak.
- Son PASS sonuçları: G5 PR #23 10/10 CI; B073 `pnpm check` (120 unit), OpenAPI 3.1 lint/bundle/additive diff, secret/runtime/browser-storage taramaları; gerçek PostgreSQL B073 exact `numeric(28,10)`, price timestamp/source/estimated görünürlüğü, aynı sembolde append-only iki fiyat, latest projection ve cross-user RLS PASS. Fresh migration ve iki reset checksum `415e1c001373a49d58e578fd1bf8cf60192574528f78c0d72e5b28337e05c585`, drift 0; genel RLS ve lifecycle regresyonları PASS.
- Son FAIL komutu ve kök nedeni: İlk `pnpm contracts:check`, B073 GET `/api/v1/market-prices` için Redocly'nin zorunlu 4XX yanıtı bulunmadığından FAIL oldu. Mevcut Problem Details `401` yanıtı eklendi; yeniden çalıştırma PASS. Yerel browser host `libnspr4.so` eksikliği eski çevre uyarısıdır; CI browser çalışmaktadır.
- Oluşturulan migration'lar: Öncekilere ek P0-B2 `20260804213000_p0_b2_instrument_prices.sql`.
- Bilinen teknik borç ve uyarılar: `goal_allocations.instrument_id` B073 ile gerçek instrument registry'ye bağlanabilir hale geliyor; bağlayıcı allocation davranışı sonraki ilgili dilimde ele alınacak. Yerel Linux browser `libnspr4.so` eksikliği nedeniyle browser kabulü GitHub Ubuntu runner'ında doğrulanır.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok. Production kaynakları bilinçli olarak oluşturulmadı.
- Bir sonraki kesin adım: B073 değişikliklerini commit/push/PR/10-of-10 CI/merge et; B074–B075'e geç.
- Devam etmek için ilk komut: `git diff --check && git status --short --branch`

## Bağlayıcı kapılar

| Kapı                   | Durum        | Kanıt                                                    |
| ---------------------- | ------------ | -------------------------------------------------------- |
| G1 Foundation          | PASS         | `docs/operations/gates/G1-foundation.md`                 |
| G2 P0-A0 Ledger Kernel | PASS         | `docs/operations/gates/G2-ledger-kernel.md`              |
| P0-A1 / G3             | PASS         | `docs/operations/gates/G3-p0-a-daily.md`; PR #10         |
| P0-A2 / G4 ön kontrolü | PASS         | `docs/operations/gates/G4-p0-a2-precheck.md`; PR #11–#16 |
| P0-A3 / formal G4      | PASS         | `docs/operations/gates/G4-p0-a-complete.md`; PR #20      |
| P0-B1 / G5             | PASS         | PR #21–#23; `G5-p0-b-planning.md`                        |
| P0-B2 / G6             | DEVAM EDİYOR | B073 çalışma branch'i; B074–B082 bekliyor                |
| P0-B3 / G7             | BAŞLANMADI   | P0-B1 canonical investable sonucu bağımlılığı            |
| RC                     | BAŞLANMADI   | PRE-RC denetimi öncesinde başlatılmayacak                |
