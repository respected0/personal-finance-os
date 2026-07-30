# Veri Sınıflandırması

## Amaç

Bu sınıflandırma; saklama, erişim, loglama, export, test verisi ve silme kurallarında uygulanacak ortak dili tanımlar. B006 yalnız sözleşmeyi kurar; şifreleme, RLS, logging veya silme kontrolünün uygulanmış olduğunu iddia etmez.

## Sınıflar

| Sınıf           | Örnekler                                                                                   | Saklama ve erişim sözleşmesi                                                                   | Log/telemetri sözleşmesi                                                              |
| --------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Çok hassas      | session/refresh, TOTP/MFA secret, anahtar materyali                                        | Auth/secret store veya KMS; uygulama DB’si, client bundle ve repository dışında; ortamlar ayrı | Asla loglanmaz; hata mesajına, fixture’a veya ekran görüntüsüne girmez                |
| Finansal hassas | tutar, bakiye, işlem, posting, hesap/kart tanımlayıcısı, yatırım miktarı/fiyatı            | TLS, sağlayıcı at-rest, RLS ve en az yetki; exact sayısal tip                                  | Ham değer loglanmaz; yalnız gerekli ve kişiselleştirilemeyen aggregate/redacted sonuç |
| Kişisel         | ad, e-posta, kişi/işletme, hesap adı ve serbest metin                                      | RLS; seçili ad/açıklama/not alanlarında AES-256-GCM; eşitlik araması gerekiyorsa blind hash    | Ham değer loglanmaz; yalnız redacted kimlik veya izinli hash                          |
| Operasyonel     | request ID, süre, engine/schema sürümü ve kişisel/finansal değer içermeyen teknik metadata | Structured log ve sınırlı operasyon erişimi                                                    | Loglanabilir; finansal/kişisel bağlamla birleştirilmez                                |

## Türemiş ve paketlenmiş veri

- Export veya backup, içindeki en yüksek veri sınıfını devralır; tipik olarak Çok hassas erişim kontrolü ve Finansal hassas içerik taşır.
- Audit `before/after` alanları kaynak verinin sınıfını devralır; redacted veya şifreli tutulur.
- Report snapshot ve recommendation evidence, finansal tutar içeriyorsa Finansal hassastır.
- Hash, ID veya ciphertext tek başına otomatik olarak Operasyonel sayılmaz; yeniden ilişkilendirilebiliyorsa kaynak sınıf korunur.

## Ortam ve test sınırı

- Local, test, preview ve staging yalnız sentetik veya açıkça anonim veri kullanır.
- Production credential, gerçek kullanıcı/finans verisi veya anahtar materyali fixture ve repository içine girmez.
- UAT verisi sentetiktir; production kullanıcı kaydı veya üretim secret’ı içermez.

## Yaşam döngüsü

- Toplama en az veri ilkesiyle yapılır.
- Saklama süresi iş ve kurtarma gereğiyle sınırlıdır.
- Silme; aktif DB, object storage, session ve backup expiry izini kapsar.
- Tamamlanma kanıtı kişisel olmayan asgari metadata ile tutulur.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, bölüm 8.1
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Veritabani_API_Guvenlik_Teknik_Eki_v1.1.1.docx`, şema genel kuralları ve güvenlik kontrol kataloğu
