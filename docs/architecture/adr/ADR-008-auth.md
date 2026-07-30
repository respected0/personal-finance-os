# ADR-008 — Auth

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Finans verisinde hesap ele geçirme etkisi yüksektir; özel parola altyapısı kurmak gereksiz güvenlik riski doğurur.

## Karar

Supabase Auth, kapalı kayıt/invite-only, e-posta ve parola, zorunlu TOTP AAL2 ve HttpOnly Secure cookie/BFF modeli kullanılacaktır.

## Sonuçlar

Yönetilen parola güvenliği, MFA, session rotation ve RLS entegrasyonu sağlanır. Normal finans write işlemleri geçerli AAL2 oturumunda yeniden TOTP istemez; 30 dakika idle, 12 saat mutlak yaş ve hassas eylemlerde 5 dakikalık step-up sözleşmesi geçerlidir.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-008 ve bölüm 22.1
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Veritabani_API_Guvenlik_Teknik_Eki_v1.1.1.docx`, bölüm 15.2
