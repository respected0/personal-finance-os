# G4 Ön Kontrol — P0-A2 Kart ve Hassas Akışlar

- Tarih: 2026-08-04
- Kapsam: P0-A2 / B037–B050
- Sonuç: **PASS (G4 ön kontrolü)**
- Ön koşul: G3 P0-A Daily PASS
- Not: Bu belge formal G4 değildir. Bağlayıcı formal G4, P0-A3 / B051–B061
  tamamlandıktan sonra kapanır.

## Bağlayıcı kapsam

| Backlog | Uygulanan davranış                                                                                      | Kabul kanıtı                                                         |
| ------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| B037    | Kredi kartı profil, limit ve statement alanları; kart borcu net servette yükümlülük, limit servet değil | Migration, typed schema, forced RLS ve gerçek PostgreSQL kabulü PASS |
| B038    | Kart harcaması tek ledger işlemiyle gider ve kart borcu üretir                                          | UAT-03 DB/API/UI/browser PASS                                        |
| B039    | Kart ödemesi banka ile kart yükümlülüğü arasında transferdir; ikinci gider üretmez                      | UAT-04 DB/API/UI/browser PASS                                        |
| B040    | Ekstre dönemleri ve ödeme tahsisi; ödeme toplamı ekstre tutarını aşamaz                                 | Gerçek PostgreSQL invariant ve negatif test PASS                     |
| B041    | Taksitli işlemde ekonomik gider ile nakit planı ayrıdır; çift sayım yoktur                              | Ledger projection ve DB kabul testi PASS                             |
| B042    | Abonelik, dönem, yenileme tarihi ve beklenen brüt/cashback/net görünümü                                 | Migration, API, UI ve RLS testi PASS                                 |
| B043    | Charge ve bağlı cashback; cashback gider mahsuplaşmasıdır, normal gelir değildir                        | UAT-05 ve `cashback_for` link testi PASS                             |
| B044    | Ortak gider sahibi ve payları; pay toplamı ödeme tutarına exact eşittir                                 | Decimal/DB deferred invariant ve negatif toplam testi PASS           |
| B045    | Tek ödeme ile katılımcı paylarına bağlı alacakların atomik oluşması                                     | UAT-06 gerçek PostgreSQL ve browser PASS                             |
| B046    | Alacağın nominal/collectability ayrımı; şüpheli alacağın net servet ve planlama etkisi sıfır            | UAT-08 fixture, DB, API ve UI görünürlük testi PASS                  |
| B047    | Kısmi tahsilatta nakit artar, kalan alacak azalır, normal gelir sıfır; aşım reddedilir                  | UAT-07 gerçek PostgreSQL ve browser PASS                             |
| B048    | Eşzamanlı tahsilatta `SERIALIZABLE` + `FOR UPDATE`; tek geçerli final durum                             | Concurrency kabul ve aşım negatif testi PASS                         |
| B049    | Kart, abonelik, ortak gider ve alacak ekranlarında bağlı hareket/net maliyet görünümü                   | Desktop ve 390×844 browser akışları PASS                             |
| B050    | UAT-03–08 uçtan uca; bakiye, rapor ve hassas akış görünürlüğü tutarlı                                   | PR #11–#15 CI kabul zinciri PASS                                     |

## Finansal doğruluk kanıtı

- Kart limiti varlık veya net servet olarak sayılmadı.
- Kart ödemesi ve taksit anapara hareketi ikinci tüketim gideri üretmedi.
- Abonelik cashback'i normal gelir üretmeden bağlı gideri azalttı; brüt eksi
  cashback gerçek nete eşit kaldı.
- Ortak giderde bir ödeme yazıldı; her katılımcı payı ayrı alacağa bağlandı ve
  payların exact toplamı ödeme tutarına eşit tutuldu.
- Kısmi tahsilat normal gelir üretmedi. Yetkili bakiye kontrolü
  `SERIALIZABLE` transaction içinde kilitli alacak satırına dayanır; aşım `409`
  ile reddedilir.
- UAT-08 şüpheli `10.000,00 TRY` alacak nominal olarak görünürken tanınan net
  servet ve planlama etkisi `0,00 TRY` kaldı.
- Para ve oran hesaplarında JavaScript floating point kullanılmadı; kanonik
  decimal string ve `Money` sınırları korundu.

## Runtime, migration ve güvenlik kanıtı

- PR [#11](https://github.com/respected0/personal-finance-os/pull/11),
  [#12](https://github.com/respected0/personal-finance-os/pull/12),
  [#13](https://github.com/respected0/personal-finance-os/pull/13),
  [#14](https://github.com/respected0/personal-finance-os/pull/14) ve
  [#15](https://github.com/respected0/personal-finance-os/pull/15) main'e
  yalnız zorunlu kontroller PASS olduktan sonra birleştirildi.
- PR #14 ve #15 güncel head'lerinde 10/10 zorunlu CI kontrolü PASS:
  migration-smoke, format, lint, typecheck, unit, OpenAPI, Auth integration,
  RLS, fixture contract ve secret scan.
- PostgreSQL `17.6`; Supabase CLI `2.110.0`.
- Fresh migration, art arda iki reset, eşit schema checksum ve schema drift `0`
  PASS. SQL migration tek şema otoritesi olarak kaldı.
- Forced RLS/default-deny, cross-user negatifleri, client owner enjeksiyonu
  reddi, AAL2 finansal yazma koşulu ve Problem Details sözleşmesi PASS.
- Sentetik `example.test` fixture dışında kullanıcı/finans verisi yoktur.
  Production secret, remote Supabase/Vercel kaynağı veya production migration
  oluşturulmadı.

## Yerel doğrulama notu

Geçici Node `24.18.0` ve pnpm `11.18.0` araç zinciriyle frozen install ve
`pnpm check` PASS oldu. Yerel Linux imajında Chromium için `libnspr4.so`
bulunmadığından browser çalıştırıcısı başlatılamadı; işletim sistemi
değiştirilmedi. Aynı browser kabulü GitHub CI'ın izole Ubuntu runner'ında PR
#15 güncel head'i üzerinde PASS oldu. Bu ürün veya test beklentisi hatası değil,
yalnız yerel runner bağımlılığıdır.

## Karar

P0-A2 B037–B050 bağlayıcı kapsamı ve G4 ön kontrolü PASS'tir. Sonraki adım
P0-A3 B051–B061'i tamamlayıp formal G4 kapısını kapatmaktır.
