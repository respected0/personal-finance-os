# Tehdit Modeli

## Durum ve kapsam

Bu belge B006 kapsamında tehditleri, güven sınırlarını, kontrol sahiplerini ve doğrulama sözleşmelerini sabitler. Kontrollerin kendisini uygulamaz. `T-01`–`T-16` kayıtlarının tamamı `threat-register.json` içinde yer alır ve durumları `Planlandı` olarak tutulur.

Kapsamdaki başlangıç topolojisi:

1. Kullanıcı, responsive PWA’yı tarayıcı veya kurulu uygulama kabuğunda kullanır.
2. PWA, HttpOnly Secure cookie taşıyan BFF/API sınırından geçer.
3. BFF, kullanıcı JWT’si ve `auth.uid()` bağlamıyla PostgreSQL/Supabase’e erişir.
4. Typed command, frameworkten bağımsız domain katmanında posting planına dönüşür.
5. Otoriter write; transaction header, postings, audit ve outbox kayıtlarını tek database transaction’ında üretir.
6. Log, export, backup ve ileride banka webhook’u ayrı güven sınırlarıdır.

## Korunan varlıklar

- Oturum ve yenileme belirteçleri, TOTP/MFA secret ve anahtar materyali
- Finansal tutar, bakiye, işlem, posting, hesap/kart ve yatırım tanımlayıcıları
- Ad, e-posta, kişi/işletme ve serbest metin
- Audit izi, idempotency sonucu, rapor sürümü, backup ve export arşivi
- Request ID, engine/schema sürümü ve hassas değer içermeyen operasyonel metadata

## Güven sınırları

| Sınır                                       | Güven varsayımı                                                             | Başlıca tehditler      |
| ------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| Tarayıcı/PWA ↔ BFF/Auth                     | İstemci girdisi ve cihaz güvenilir kabul edilmez                            | T-01, T-05, T-06, T-13 |
| BFF/API ↔ kullanıcı bağlamı                 | `user_id` istemciden alınmaz; JWT/RLS bağlamı otoriterdir                   | T-02, T-07             |
| Domain ↔ ledger persistence                 | Posting istemciden kabul edilmez; typed command sunucuda yeniden hesaplanır | T-03, T-04, T-10, T-11 |
| Uygulama ↔ log/monitoring                   | Finansal ve kişisel payload dış sisteme gönderilmez                         | T-09                   |
| Export/backup işi ↔ dosya/object storage    | Arşiv ve indirme bağlantısı ayrı sızıntı yüzeyidir                          | T-08, T-15             |
| Uygulama ↔ yönetilen sağlayıcı/admin        | RLS, ayrıcalıklı sağlayıcı erişimini ortadan kaldırmaz                      | T-14                   |
| Paket kaynağı ↔ build/CI                    | Registry ve build girdileri güvenilir kabul edilmez                         | T-12                   |
| Gelecek banka göndericisi ↔ webhook ingress | İmza, zaman ve replay kanıtı olmadan istek kabul edilmez                    | T-16                   |

## Tehdit belirleme ve önem

Tehditler Aşama 3 kaynaklarındaki bağlayıcı `T-01`–`T-16` listesidir. `Kritik`, kullanıcı hesabı veya finansal gerçeğin geniş ölçekte ele geçirilmesi/değişmesi, hassas arşiv sızıntısı ya da otoriter kayıt kabulü anlamına gelir. `Yüksek`, önemli gizlilik, bütünlük veya erişilebilirlik kaybı doğuran fakat ilave koşul veya daha dar etki taşıyan senaryodur.

Önem seviyeleri B006 sırasında yeniden puanlanmamıştır; kaynaklardaki seviyeler korunmuştur.

## Kritik tehdit kabul sözleşmesi

| Tehdit | Atanmış azaltım özeti                                                 | Sahip    | Doğrulama                                              |
| ------ | --------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| T-01   | TOTP AAL2, rate limit, session revoke ve login alarmı                 | Security | Auth/MFA/recovery E2E ve revoke testi                  |
| T-02   | RLS default-deny, composite ownership ve cross-user matrix            | Backend  | Başka kullanıcı read/write satır etkisi 0              |
| T-03   | Immutable posted kayıt, dar grant, reversal-only ve audit             | Backend  | Role/trigger testinde UPDATE/DELETE reddi              |
| T-05   | HttpOnly cookie, CSP, encoding ve unsafe HTML yasağı                  | Frontend | Browser güvenlik testi ve cookie incelemesi            |
| T-07   | Şema/domain doğrulama, parametreli sorgu ve allowlist sıralama        | Backend  | Injection fuzz ve SQL birleştirme taraması             |
| T-08   | Şifreli arşiv, kısa ömürlü indirme, checksum ve restore drill         | DevOps   | Yanlış anahtar/checksum/link expiry testi              |
| T-10   | PostgreSQL `NUMERIC`, Decimal, açık rounding posting ve property test | Domain   | Rastgele parasal değer ve denge property testleri      |
| T-16   | İmza, timestamp, nonce/idempotency ve quarantine sözleşmesi           | Security | Sahte imza, stale timestamp ve replay negatif testleri |

## Kalan riskler

- Sunucu raporlaması nedeniyle finansal tutarlar tam istemci tarafı E2EE değildir. Sağlayıcı/DB admin düzeyindeki ayrıcalıklı ihlal tutarları görebilir.
- T-16 gelecekteki banka entegrasyonu için kapıdır; bu dilimde webhook endpoint’i yoktur.
- B006, azaltımları uygulamaz. Backlog görevleri tamamlanıp belirtilen testler kanıt üretmeden tehdit durumu `Planlandı` kalır.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, bölüm 8 ve bölüm 22
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Veritabani_API_Guvenlik_Teknik_Eki_v1.1.1.docx`, bölüm 9 ve bölüm 15
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Backlog
