# G4 — P0-A Complete Gate Kanıtı

- Tarih: 2026-08-04
- Kapsam: P0-A0 / P0-A1 / P0-A2 / P0-A3, B011–B061
- Sonuç: **PASS**
- Ön koşullar: G2, G3 ve G4 P0-A2 ön kontrolü PASS
- Değerlendirilen son ürün head'i: `c4cc9d56ed446d80b1740b8257de766cbd7ea7f6`
- Main merge SHA: `b3cf7ae4a0c2d3b7733d8bae9766d906d445f9b2`

## Bağlayıcı kapsam ve backlog kapanışı

P0-A0 B011–B024 için ledger kernel kanıtı
[`G2-ledger-kernel.md`](./G2-ledger-kernel.md), P0-A1 B025–B036 için günlük
çekirdek kanıtı [`G3-p0-a-daily.md`](./G3-p0-a-daily.md), P0-A2 B037–B050
için hassas akış kanıtı
[`G4-p0-a2-precheck.md`](./G4-p0-a2-precheck.md) içinde kayıtlıdır.

| Backlog | Formal G4'e giren P0-A3 davranışı                                                           | Son kabul kanıtı                                                                   |
| ------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| B051    | Exact hesap snapshot'ı, stated-calculated farkı ve immutable kanıt                          | PostgreSQL UAT-12, cross-user izolasyonu                                           |
| B052    | Accepted/adjustment/missing resolution, şifreli açıklama, atomik kapanış                    | DB/API/browser, `SERIALIZABLE` + `FOR UPDATE` concurrency                          |
| B053    | Hard delete olmadan exact void/revise, original+reverse+replacement izi                     | Ledger/DB/API negatif mutation testleri                                            |
| B054    | Income/gross/refund/net/outflow/savings kanonik ledger aggregate                            | UAT-13; transfer/kart ödeme/yatırım/tahsilat anaparası çift sayım `0`              |
| B055    | Aylık API/UI, hesap/kategori kırılımı ve trend; dashboard ile aynı projection               | DB/API/browser dashboard-report farkı `0`                                          |
| B056    | Watermark, engine/rule version, immutable eski sürüm, stale ve yeni sürüm                   | Backdated write ve old/live/new version testi                                      |
| B057    | İnsan okunur tablo bazlı UTF-8 CSV ve decimal string                                        | BOM/UTF-8 ve `42.5000` gerçek ZIP içeriği                                          |
| B058    | Tek snapshot tam sadakatli manifest+NDJSON ZIP, ciphertext checksum, passphrase encryption  | `REPEATABLE READ`, Argon2id 65536/3/1, AES-256-GCM, yanlış checksum/passphrase ret |
| B059    | Production'a yazmadan quarantine dry-run; manifest/FK/ledger/report karşılaştırması         | `pg_temp`, file/relationship/ledger/report farkı `0`                               |
| B060    | Taze TOTP, 7 günlük hold/cancel/write lock, aktif purge ve provider-backup expiry receipt   | Gerçek PostgreSQL purge; orphan user row `0`, minimal non-personal receipt         |
| B061    | UAT-01–09,12,13,15,16 + security/restore toplu P0-A QA paketi; kritik/yüksek açık bulgu `0` | Bu rapor ve aşağıdaki PR #19 toplu CI kanıtı                                       |

## UAT ve finansal invariant matrisi

| UAT    | Beklenen kanonik davranış                                                       | Kanıt ve sonuç                                    |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| UAT-01 | Normal gider; banka, kişisel gider ve net servet exact                          | Unit + DB + API + desktop/mobile browser **PASS** |
| UAT-02 | Transfer anaparası gelir/gider/NW etkisi `0`; ücret ayrı gider                  | Unit + DB + API + browser **PASS**                |
| UAT-03 | Kart harcaması gider ve kart borcu; banka aynı                                  | Unit + DB + browser **PASS**                      |
| UAT-04 | Kart ödemesi banka ve borcu azaltır; ikinci gider `0`                           | Unit + DB + browser **PASS**                      |
| UAT-05 | Subscription charge ve linked cashback; normal gelir `0`                        | Unit + DB + browser **PASS**                      |
| UAT-06 | Tek ortak ödeme ve exact toplamlı pay/alacaklar                                 | Deferred DB invariant + browser **PASS**          |
| UAT-07 | Kısmi tahsilat normal gelir üretmez; aşım ve concurrency fazlası reddedilir     | DB `FOR UPDATE`/`SERIALIZABLE` + browser **PASS** |
| UAT-08 | Şüpheli alacak nominal görünür; tanınan NW ve planlama etkisi `0`               | UAT-SYN-01 + DB/API/UI **PASS**                   |
| UAT-09 | Expected realization engine oracle: tek realization; gerçekleşmeden posting `0` | G2 unit/property/DB 16/16 **PASS**                |
| UAT-12 | Bakiye uzlaştırma exact fark ve kontrollü resolution                            | DB/API/desktop browser **PASS**                   |
| UAT-13 | Aylık ledger raporu ve dashboard aynı; çift sayım `0`                           | Unit + DB + API + desktop browser **PASS**        |
| UAT-15 | 390×844 hızlı gider girişi, 44 px hedef, yatay taşma `0`, süre `<20s`           | Gerçek Chromium **PASS**                          |
| UAT-16 | Dönem/hesap/tür/kategori geçmiş filtresi ve aggregate                           | DB/API/browser **PASS**                           |

UAT-09'un bu kapıdaki kapsamı B015/B024'teki kanonik ledger oracle ve INV-08
tek-realization sınırıdır. Persistent expected-payment CRUD/UI ve kanonik
investable-amount tüketimi, backlog bağımlılıklarına uygun olarak B068–B072
P0-B1'de kalır; G4 kapanışı bu sonraki ürün kapsamını erkenden uygulamaz.
Yüksek öncelikli üretim mimarisi G4 koşulu kart/cashback/shared/receivable/
reconciliation/report/audit/export çekirdeğidir ve tamamı yukarıda PASS'tir.

## Toplu CI kanıtı

PR [#19](https://github.com/respected0/personal-finance-os/pull/19) ürün head'i
`c4cc9d5` üzerinde 10/10 zorunlu kontrol PASS olduktan sonra main'e
birleştirildi.

| Workflow / job     | Sonuç | Kanıt                                                                                                         |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------- |
| Database migration | PASS  | [Run 30906601556](https://github.com/respected0/personal-finance-os/actions/runs/30906601556) — 8m17s         |
| Auth + browser     | PASS  | [Job 91983026435](https://github.com/respected0/personal-finance-os/actions/runs/30906601561/job/91983026435) |
| OpenAPI            | PASS  | [Job 91983026471](https://github.com/respected0/personal-finance-os/actions/runs/30906601561/job/91983026471) |
| RLS                | PASS  | [Job 91983026481](https://github.com/respected0/personal-finance-os/actions/runs/30906601561/job/91983026481) |
| Fixture contract   | PASS  | [Job 91983026494](https://github.com/respected0/personal-finance-os/actions/runs/30906601561/job/91983026494) |
| Unit               | PASS  | [Job 91983026518](https://github.com/respected0/personal-finance-os/actions/runs/30906601561/job/91983026518) |
| Lint               | PASS  | [Job 91983026530](https://github.com/respected0/personal-finance-os/actions/runs/30906601561/job/91983026530) |
| Format             | PASS  | [Job 91983026544](https://github.com/respected0/personal-finance-os/actions/runs/30906601561/job/91983026544) |
| Typecheck          | PASS  | [Job 91983026593](https://github.com/respected0/personal-finance-os/actions/runs/30906601561/job/91983026593) |
| Secret scan        | PASS  | [Job 91983026147](https://github.com/respected0/personal-finance-os/actions/runs/30906601583/job/91983026147) |

Database workflow aynı head üzerinde fresh migration, ledger coverage/invariant,
daily DB/API, card, subscription, sharing, reconciliation, report ve data
lifecycle kabul paketlerinin tamamını ardışık çalıştırdı. Log özeti:

- P0-A0 UAT engine+DB `16/16`; INV-01–INV-10 PASS.
- UAT-03/04/05/06/07/08/12/13 gerçek PostgreSQL PASS.
- B048 ve B052 concurrency PASS.
- Fresh migration PASS; PostgreSQL major `17`; Supabase CLI `2.110.0`.
- Reset checksum 1 = checksum 2 =
  `d1543af423b85834d9be298396be2db3dcb6c9baabafac569c74a992cb75349b`;
  schema drift `0`.
- B057–B060 export/restore/delete acceptance PASS.

Auth/browser workflow gerçek Chromium'da desktop ve 390×844 akışlarını çalıştırdı:
UAT-01/02/03/04/05/06/07/12/13/15/16 PASS; yatay overflow `0`, 44 px touch
target ve `<20s` mobil giriş PASS. Invite-only, TOTP AAL2 ve browser token
storage `0` PASS.

## Güvenlik ve veri sınırı

- Forced RLS/default-deny ve cross-user read/write/update/delete etkilenen satır
  `0`; composite owner mismatch ve client `user_id`/search_path kötüye kullanımı
  reddedildi.
- SECURITY DEFINER fonksiyonlarında sabit search_path ve dar EXECUTE grantleri
  doğrulandı. Normal BFF/browser yolunda service-role credential yoktur.
- Hassas export/restore/delete eylemleri gerçek TOTP challenge sonrası HttpOnly,
  server-signed ve en fazla 5 dakikalık proof ister. Provider token uygulama
  kaynaklarında okunmaz veya saklanmaz.
- Recovery passphrase, encryption key, nonce, auth tag, archive plaintext,
  cookie/token veya hassas finans değeri loglanmaz. Secret scan leak `0`.
- Yalnız sentetik `example.test` kullanıcı ve UAT fixture kullanıldı. Gerçek veri,
  production secret, remote Supabase/Vercel/object-storage kaynağı ve production
  migration oluşturulmadı.

## G4 kararı

B011–B061 için bağlayıcı finansal, runtime, browser, restore ve güvenlik kanıtları
tamamlanmıştır; kritik/yüksek açık bulgu `0` ve engelli kabul testi yoktur.
**Formal G4 P0-A complete: PASS.** P0-B1 B062 ancak bu gate kanıtı güncel PR
head'inde zorunlu CI kontrollerinden geçip main'e birleşince başlayabilir.
