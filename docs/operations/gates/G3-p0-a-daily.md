# G3 — P0-A Daily Gate Kanıtı

- Tarih: 2026-08-01
- Kapsam: P0-A1 / B025–B036
- Sonuç: **PASS**
- Branch: `feat/p0-a1-daily-core-ui`
- Ön koşul: G2 Ledger Kernel PASS

## Bağlayıcı kapsam

| Backlog | Uygulanan davranış                                                                                                 | Kabul kanıtı                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| B025    | Kullanıcıya ait kurum ve banka/nakit/cüzdan/kart/yatırım hesapları; AEAD hesap adı; forced RLS; optimistic archive | Gerçek PostgreSQL CRUD/RLS/archive/encryption testi PASS                     |
| B026    | Opening equity karşılıklı kaydıyla açılış bakiyesi                                                                 | Dönem gelir ve gider etkisi `0.00`                                           |
| B027    | Serbest gelir command/form/API                                                                                     | Banka, normal gelir ve net servet etkisi exact PASS                          |
| B028    | Banka/nakit serbest gider command/form/API                                                                         | `427,50 TRY` exact preview, commit ve projection PASS                        |
| B029    | Kaynak/hedef/ücretli transfer                                                                                      | Anapara gelir/gider/net servet `0`; `2,50 TRY` ücret ayrı gider              |
| B030    | React Hook Form + Zod dinamik işlem kabuğu                                                                         | Tür bazlı alanlar ve erişilebilir zorunlu-alan hataları browser PASS         |
| B031    | Kullanıcı tutarından gerçek zamanlı server preview                                                                 | Hesap before/after ve gelir/gider/net-servet deltaları kayıttan önce görünür |
| B032    | Cursor list/detail ve dönem/hesap/tür/kategori filtresi                                                            | Gerçek DB ve BFF aggregate/filter testi PASS                                 |
| B033    | URL state kullanan banka dökümü benzeri geçmiş                                                                     | Filtre bağlamı URL'de korunur; browser filtresi PASS                         |
| B034    | Opening + posting ledger projection hesabı                                                                         | Account/history/report farkı `0`                                             |
| B035    | Net servet, aylık gelir/gider/net, hesaplar ve son hareket dashboard'u                                             | Tek ledger/projection kaynağı; desktop browser PASS                          |
| B036    | UAT-01/02/15/16 desktop + 390×844                                                                                  | Serbest `427,50`, transfer, filtre, mobil layout ve commit PASS              |

## Gerçek runtime kanıtı

- `pnpm daily:integration`: PASS; PostgreSQL `17.6`; B025–B029, B032 ve B034.
- `pnpm daily:api:integration`: PASS; AAL1 write reddi, AAL2 write, owner enjeksiyonu ve cross-site write reddi; account/opening/preview/commit/history/balance.
- `pnpm daily:browser`: PASS; gerçek Chromium, local Supabase, sentetik kullanıcı ve TOTP AAL2 oturumu.
- Desktop: serbest `427,50 TRY` preview/commit; ücretli transfer; account/history/dashboard sonucu tutarlı.
- Mobil `390×844`: yatay taşma `0`; birincil dokunma hedefi en az `44×44`; before/after ve üç metric delta kırpılmadan görünür; sık gider akışı `<20 saniye`.
- Testler yalnız `example.test` sentetik kullanıcı ve sentetik kurum/hesap/kategori verisi kullandı; cleanup sonunda kullanıcı, container ve local volume bırakılmadı.

Yerel WSL imajında Playwright Chromium için üç paylaşımlı kütüphane kurulu değildi. İşletim sistemi değiştirilmeden `libnspr4`, `libnss3` ve `libasound2t64` paketleri `/tmp` altına çıkarıldı ve yalnız test sürecinin `LD_LIBRARY_PATH` değerine verildi. GitHub'ın `ubuntu-24.04` runner'ında mevcut `playwright install --with-deps chromium` adımı aynı runtime bağımlılıklarını izole CI ortamında kurar.

## Kalite ve güvenlik kanıtı

- `pnpm install --frozen-lockfile`: PASS.
- `pnpm check`: PASS; format, lint, typecheck, 101 unit test, production build, ADR/threat/boundary/version/migration/CI policy, OpenAPI 3.1 + breaking diff, auth storage, runtime credential ve fixture.
- `pnpm security:secret-scan`: PASS; leak `0`.
- `git diff --check`: PASS.
- Doğrudan yeni dependency'ler exact: `react-hook-form@7.83.0`, `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`.
- JavaScript floating-point finans hesabı eklenmedi; UI tüm parasal ayrıştırma, aritmetik ve gösterimde bağlayıcı `Money`/decimal politikasını kullanır.
- SQL migration otoritesi, RLS deny-by-default, BFF cookie session ve Problem Details sözleşmesi korunmuştur.
- Production secret, remote Supabase/Vercel kaynağı, gerçek finans verisi veya P0-A2 davranışı oluşturulmamıştır.

## G3 kararı

Bağlayıcı G3 koşulları karşılandı: serbest tutar preview/commit PASS, account/history/report farkı `0` ve 390×844 temel akış gerçek E2E ile PASS. P0-A2 ancak bu kanıtın CI'da PASS olup main'e birleşmesinden sonra ilerletilecektir.
