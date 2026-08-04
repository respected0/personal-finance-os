# Uygulama Durumu

- Güncellendi: 2026-08-04 18:36 TRT
- Son tamamlanan ana aşama: P0-B1 B062–B072 / G5 PASS.
- Tamamlanan backlog maddeleri: B001–B077 main üzerinde. P0-B2 B073 PR #24, B074–B075 PR #25 ve B076–B077 PR #26, her biri 10/10 CI PASS ile birleşti.
- Devam eden backlog maddesi: P0-B2 B078–B082 — yatırım UI, 1,31 g kapsam invariantı, atomic concurrency acceptance, UAT-10 ve G6 kanıtı.
- Henüz başlanmayan backlog maddeleri: B083–B104; P0-B3 ve RC. RC bu görevde başlatılmayacak.
- Son doğrulanmış main SHA: `d0918bad190608d45cda71c979598a8e72353c11`
- Güncel çalışma branch'i: `feat/p0-b2-investment-ui-g6`
- Açık PR: Yok; B078–B082 yerel kapısı tamamlandıktan sonra açılacak.
- Son PASS sonuçları: `pnpm check` (123 unit), OpenAPI lint/bundle/additive breaking, secret/runtime/browser-storage ve fixture scope; gerçek PostgreSQL B073–B077 ile B081 SERIALIZABLE/FOR UPDATE eşzamanlı tek-kazanan/partial-state 0; fresh migration ve iki reset checksum `4a233b3e282a588d5acff69e1402af1edbefd3c759f3041ab162b8b2b90d2644`, drift 0; RLS/lifecycle PASS. B078–B080/B082 browser senaryosu CI runner doğrulamasını bekliyor.
- Son FAIL komutu ve kök nedeni: Yerel `pnpm daily:browser`, Linux hostta Playwright Chromium için `libnspr4.so` bulunmadığından ürün koduna ulaşmadan FAIL. Ürün/test kodu veya Docker kaynaklı değil; aynı senaryo CI Ubuntu runner'ında zorunlu check olarak çalışacak. İlk 60 saniyelik komut sınırı yalnız build sonrası timeout oluşturdu ve daha uzun yeniden çalıştırmada gerçek host kök nedeni kanıtlandı.
- Oluşturulan migration'lar: `20260804213000_p0_b2_instrument_prices.sql`; `20260804230000_p0_b2_investment_trades_lots.sql`. Bu dilimde yeni migration gerekmiyor.
- Bilinen teknik borç ve uyarılar: Yerel Linux browser shared-library eksikliği nedeniyle B082 browser kanıtı CI'da kapanır. Production kaynakları bilinçli olarak oluşturulmadı.
- Dış kaynak veya kullanıcı kararı bekleyen maddeler: Yok.
- Bir sonraki kesin adım: B078–B082 değişikliklerini commit/push/PR yap; 10 zorunlu CI check'i sonuca kadar izle; PASS ise merge et ve ayrı G6 gate kanıtını kapat.
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
| P0-B2 / G6             | DEVAM EDİYOR | PR #24–#26; B078–B082 çalışma branch'i           |
| P0-B3 / G7             | BAŞLANMADI   | G6 ve P0-B1 canonical investable sonucu bağımlı  |
| RC                     | BAŞLANMADI   | PRE-RC denetimi öncesinde başlatılmayacak        |
