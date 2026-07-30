# ADR-016 — Anahtar yönetimi

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Seçili alan şifrelemesinde rotasyon, eski kayıt ve yedeklerin geri yüklenmesi ile ortam ayrımı açık bir anahtar yaşam döngüsü gerektirir.

## Karar

Production ana anahtarı yalnız KMS/secret manager’da tutulacak; seçili alanlar AES-256-GCM ile `key_id`, sürüm, 96-bit nonce, auth tag ve AAD metadata’sı kullanarak şifrelenecektir.

## Sonuçlar

Local, test, staging ve production ayrı anahtar namespace’leri kullanır. Yeni yazılar aktif anahtarla şifrelenir; eski anahtar ancak canlı kayıt, yedek ve restore kanıtı tamamlandıktan sonra emekli edilir. Eksik anahtarda restore fail-closed olur.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, bölüm 22.3
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Veritabani_API_Guvenlik_Teknik_Eki_v1.1.1.docx`, bölüm 15.4
