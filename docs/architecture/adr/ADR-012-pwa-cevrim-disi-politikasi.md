# ADR-012 — PWA çevrim dışı politikası

- Durum: Accepted
- Tarih: 2026-07-29

## Bağlam

Mobil hızlı açılış gerekir; fakat çevrim dışı bir işlemin kaydedilmiş gibi görünmesi finansal doğruluk ve senkronizasyon riski yaratır.

## Karar

Installable PWA, app shell ve son okunmuş özet cache’i kullanılacak; işlem write çevrim içi zorunlu olacak, yerel taslak açıkça etiketlenecektir.

## Sonuçlar

Ana ekrana ekleme ve hızlı başlangıç sağlanır. Uçak modunda kesin kayıt yapılamaz; service worker cache invalidation ve hassas API no-store/private politikaları test edilmelidir.

## Kaynak

- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Uretim_Teknik_Mimarisi_v1.1.1.docx`, ADR-012
- `Kisisel_Finans_Isletim_Sistemi_Asama_3_Backlog_Kabul_Maliyet_Matrisi_v1.1.1.xlsx`, Karar Kayıtları / ADR-012
