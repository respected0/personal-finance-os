# ADR-010 — Senkronizasyon

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Muhasebe kayıtlarında sessiz CRDT birleşimi duplicate, sıralama ve çatışma riskini büyütür; çok cihaz için tek gerçek kaynak gerekir.

## Karar

Bulut-otoriter PostgreSQL kullanılacak; PWA yalnız cache ve açık etiketli yerel taslak tutacak, kesin finans kaydı çevrim içi commit sonrasında oluşacaktır.

## Sonuçlar

Çok cihazda tek kaynak ve merkezi backup/rapor sağlanır. P0’da çevrim dışı kesin kayıt yoktur; taslak bakiye veya rapora girmez.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-010
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-010
