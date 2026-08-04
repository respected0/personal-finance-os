# G6 — P0-B Yatırım Kapısı

- Sonuç: **PASS**
- Kapanış tarihi: 2026-08-04
- Bağlayıcı kapsam: B073–B082
- Son ürün main SHA: `4e680acb1e19845ee4de1b5a3f3af44cbe958ebb`

## Backlog ve teslim kanıtı

| Backlog | Uygulama ve kabul kanıtı                                                                                                                | PR / merge      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| B073    | Kullanıcı kapsamlı yatırım aracı ve append-only zaman damgalı manuel/reference fiyat registry; numeric(28,10), kaynak ve tahmin işareti | #24 / `b303736` |
| B074    | Alımda banka/nakit → yatırım varlığı; tüketim gideri ve normal gelir 0; ücret maliyete dahil; idempotent SERIALIZABLE commit            | #25 / `1633501` |
| B075    | Lot, açık miktar, ücret dahil maliyet ve exact ortalama birim maliyet                                                                   | #25 / `1633501` |
| B076    | FIFO satış, miktar sınırı, nakit gelirleri, maliyet ve gerçekleşen K/Z ayrımı; normal gelir 0                                           | #26 / `d0918ba` |
| B077    | As-of portföy miktarı, maliyet, fiyat/değer/K/Z; fiyat yok/tahmini etiketi ve cross-user 0                                              | #26 / `d0918ba` |
| B078    | Mobile-first alım/satım formu; miktar, birim fiyat, ücret, tarih ve exact dinamik nakit toplamı                                         | #27 / `4e680ac` |
| B079    | Dağılım yüzdesi, maliyet, piyasa değeri, gerçekleşmemiş K/Z ve fiyat kaynak/zaman görünürlüğü                                           | #27 / `4e680ac` |
| B080    | UAT-SYN-01'de aktif fiziksel altın 0; yalnız 1,31 g sentetik banka altını                                                               | #27 / `4e680ac` |
| B081    | Trade + ledger + lot tek transaction; FOR UPDATE/SERIALIZABLE iki eşzamanlı satışta tek kazanan ve reddedilen yolda partial state 0     | #27 / `4e680ac` |
| B082    | UAT-10 browser: serbest miktar/fiyat/ücret; nakit, portföy, rapor ve mobil devam tutarlılığı                                            | #27 / `4e680ac` |

## Finansal invariant kanıtı

- Para ve maliyet `numeric(19,4)`, miktar ve birim fiyat `numeric(28,10)`; istemci dinamik toplamı `Money.product` ile hesaplar, JavaScript floating-point kullanmaz.
- 1,3100000000 × 2875,1234567890 + 7,5000 alım maliyeti 3773,9117; lot birim maliyeti 2880,8486259542.
- 0,3100000000 satışta net nakit 927,00; maliyet 893,0631; gerçekleşen kazanç 33,9369; kişisel gider ve normal gelir 0.
- Yatırım alımı bankadan 1.320,00 TRY düşürürken aynı tutarı yatırım cost-basis net servetine taşır; rapor gideri değişmez.
- Satış miktarı açık lotu aşamaz. Eşzamanlı 0,75 + 0,75 satış yarışında yalnız biri tamamlanır; açık miktar 0,25 ve kaybeden transaction/trade/consumption sayıları 0 artar.
- Portföy dağılımı ve değer hesabı PostgreSQL exact numeric projection'dır; fiyatı olmayan pozisyon değer üretmeden açıkça `missing_price`/tahmini görünür.

## Test ve CI kanıtı

- PR #24, #25, #26 ve #27: her biri 10/10 zorunlu GitHub check PASS.
- PR #27 browser `auth / integration`: UAT-10 desktop ve 390×844 mobile PASS.
- PR #27 `database / migration-smoke`: investment PostgreSQL acceptance dahil PASS (9m49s).
- `pnpm check`: 28 test dosyası, 123 unit PASS; format, lint, typecheck, build, mimari/policy ve OpenAPI PASS.
- `pnpm investment:integration`: B073–B077 ve B081 gerçek PostgreSQL acceptance PASS.
- `pnpm db:smoke`: fresh migration PASS; iki reset checksum `4a233b3e282a588d5acff69e1402af1edbefd3c759f3041ab162b8b2b90d2644`; drift 0; PostgreSQL major 17; Supabase CLI 2.110.0.
- OpenAPI 3.1 lint/bundle/additive breaking diff PASS.
- RLS cross-user negatifleri, runtime credential, browser auth storage, gitleaks ve UAT-SYN-01 fixture taramaları PASS.

## Kapsam ve güvenlik

- SQL migration tek şema otoritesidir; `drizzle push` ve dashboard-only şema değişikliği yoktur.
- RLS kullanıcı sahipliği ve cross-user negatifleri korunur; client owner/user_id enjeksiyonu yoktur.
- Seed finans satırı 0; yalnız sentetik/reference test verisi kullanılmıştır.
- Aktif fiziksel altın kaydı 0, banka altını fixture miktarı tam `1.31` g'dır.
- Production secret, gerçek kullanıcı/finans verisi, remote Supabase/Vercel kaynağı veya production migration oluşturulmamıştır.

G6 kriterleri eksiksiz karşılanmıştır. P0-B3, P0-B1'in kanonik ve sürümlü yatırılabilir tutarını yeniden hesaplamadan tüketmek üzere başlayabilir.
